# Valheim Stagger Mechanics — Deep Dive

> Verified from `assembly_valheim.dll` IL disassembly. All code references point to
> `Character`, `Humanoid`, and `DamageTypes` methods in the game assembly.

---

## 1. The Stagger Bar

Every character (player and mob) has a hidden **stagger accumulator** (`m_staggerDamage`).
When the bar fills past a threshold, the character is **staggered** — stunned for ~2 seconds,
unable to act.

```
stagger_threshold = MaxHealth × m_staggerDamageFactor
```

| Field | Player value | Source |
|---|---|---|
| `m_staggerDamageFactor` | **0.40** | Player prefab (asset bundle) |

**Threshold = 40% of current max HP.** With 134 HP → threshold is **53.6**.

### Bar decay

The bar drains over time at a fixed rate relative to the threshold:

```
decay_rate = threshold / 5.0    # drains completely in 5 seconds
m_staggerDamage -= decay_rate × dt
```

| Max HP | Threshold | Decay rate |
|---|---|---|
| 100 | 40 | 8 / sec |
| 134 | 53.6 | 10.7 / sec |
| 200 | 80 | 16 / sec |

---

## 2. What Counts as Stagger Damage

**Only four damage types** contribute to the stagger bar:

```python
def GetTotalStaggerDamage():
    return m_blunt + m_slash + m_pierce + m_lightning
```

| Counts for stagger | Does NOT count |
|---|---|
| Blunt ✅ | Fire ❌ |
| Slash ✅ | Frost ❌ |
| Pierce ✅ | Poison ❌ |
| Lightning ✅ | Spirit ❌ |

This distinction is important — and as we'll see, misleading.

---

## 3. Double Stagger Accumulation (the hidden mechanic)

### Discovery

When a player **blocks** an attack, the stagger bar gets hit **twice** from the same
incoming attack. This was verified from the IL of `Character.RPC_Damage`:

```
Character.RPC_Damage:
  IL_027E: callvirt  Humanoid.BlockAttack     ← 1st stagger accumulation
  IL_03FF: call      Character.ApplyDamage    ← 2nd stagger accumulation
```

Both methods call `AddStaggerDamage` on the **same** `m_staggerDamage` field.

### Call site 1: BlockAttack (Step 2h)

During the block, **after** the block-as-armor formula reduces the damage:

```python
# In Humanoid.BlockAttack (IL_014D → IL_015E):
stagger_dmg = after_block.GetTotalStaggerDamage()   # physical+lightning AFTER block
AddStaggerDamage(stagger_dmg)                        # 1st addition to bar
```

If this overflows the bar → **guard break** (block fails, player takes full damage).

### Call site 2: ApplyDamage (Step 6)

After the full damage pipeline (block → resistances → body armor):

```python
# In Character.ApplyDamage (IL_0141 → IL_0157):
stagger_dmg = hit.m_damage.GetTotalStaggerDamage() * hit.m_staggerMultiplier
AddStaggerDamage(stagger_dmg)                        # 2nd addition to SAME bar
```

### The consequence

A successful block can still stagger you. You see "Blocked: X" on screen, the block
animation plays, damage is reduced — but the combined stagger from both call sites
exceeds the threshold and you get stunned anyway.

For **unblocked** hits (no shield, dodge failed, etc.), only call site 2 fires.
The double accumulation is specifically a **blocking penalty**.

---

## 4. Poison's Indirect Stagger Amplification

### The paradox

Poison does **not** count for `GetTotalStaggerDamage()` — it's excluded. You'd expect
adding poison to an attack wouldn't affect the stagger bar at all.

**Wrong.** Poison dramatically increases stagger chance through the block formula.

### How it works

The block-as-armor formula treats **all blockable damage as a single pool**:

```python
# What the block "sees":
total_blockable = blunt + slash + pierce + fire + frost + lightning + poison + spirit

# Block-as-armor (high regime):
after_block_total = total_blockable² / (4 × block_power)

# Remaining damage is distributed proportionally:
remaining_ratio = after_block_total / total_blockable
blunt_remaining = blunt × remaining_ratio
poison_remaining = poison × remaining_ratio    # reduced but irrelevant for stagger
```

When poison is present, `total_blockable` goes up. The quadratic formula becomes less
efficient. A larger fraction of **every** damage type — including blunt — survives the
block. That surviving blunt feeds into `GetTotalStaggerDamage()`.

### Concrete comparison: 80 Blunt with and without 50 Poison

Setup: Hard difficulty (×1.5), parry with 110 block power

#### With poison (80 Blunt + 50 Poison → 120 + 75 after difficulty)

```
Total blockable = 195
Block formula:   195² / (4 × 110) = 86.4 survives
Remaining ratio: 86.4 / 195 = 0.443 (only 55.7% blocked)
Blunt remaining: 120 × 0.443 = 53.2   ← feeds stagger bar
```

#### Without poison (80 Blunt only → 120 after difficulty)

```
Total blockable = 120
Block formula:   120² / (4 × 110) = 32.7 survives
Remaining ratio: 32.7 / 120 = 0.273 (72.7% blocked)
Blunt remaining: 120 × 0.273 = 32.7   ← feeds stagger bar
```

#### Result

| Scenario | Blunt after block | Stagger bar (53.6 threshold) | Staggered? |
|---|---|---|---|
| With 50 Poison | **53.2** | 53.2 (1st) + 17.9 (2nd) = **71.1** | ⚡ YES |
| Without Poison | **32.7** | 32.7 (1st) + 10.7 (2nd) = **43.4** | ❌ No |

**Same base blunt damage. Same shield. Same HP.** The poison turned a comfortable
margin into a stagger — without ever touching the stagger bar directly.

### The design inconsistency

The game has two conflicting philosophies:

1. **Stagger check says:** "Only blunt/slash/pierce/lightning matter for stagger"
2. **Block-as-armor says:** "I reduce ALL damage types as one pool, proportionally"

The block system doesn't know about the stagger system's type distinction. It treats
poison and blunt identically when distributing block effectiveness. Poison eats block
budget that could have gone toward reducing blunt.

This is likely an **oversight** — the block and stagger systems were designed
independently and nobody accounted for the indirect coupling. It makes mixed-type
attackers like Bonemass disproportionately dangerous for stagger, beyond what their
physical damage alone would suggest.

---

## 5. Worked Example: Bonemass Punch vs Parry

### Setup

| Parameter | Value |
|---|---|
| Attack | Bonemass Punch: 80 Blunt, 50 Poison, 1000 Chop, 1000 Pickaxe |
| Difficulty | Hard (×1.5 enemy damage) |
| Shield | 40 base block, skill 20 (factor 0.2) |
| Parry bonus | ×2.5 (`m_timedBlockBonus`) |
| Player HP | 134 |
| Body armor | 64 |

### Step-by-step

#### Step 0 — Random variance

```
damage *= sqrt(Random.Range(0.75, 1.0))
# Assuming worst case: rng = 1.0, multiplier = ×1.0
```

#### Step 1 — Difficulty scaling (×1.5)

```
Blunt:  80 × 1.5 = 120
Poison: 50 × 1.5 = 75
Total blockable: 195
```

#### Step 2c — Block power

```
Base:  40 × (1 + 0.2 × 0.5) = 44
Parry: 44 × 2.5 = 110
```

#### Step 2f — Block-as-armor

```
110 ≥ 195/2 = 97.5 → High regime
after_block = 195² / (4 × 110) = 86.4
blocked = 195 - 86.4 = 108.6       ← matches screen "Blocked: 108.4"
remaining_ratio = 86.4 / 195 = 0.443

Blunt after block:  120 × 0.443 = 53.2
Poison after block: 75 × 0.443 = 33.2
```

#### Step 2h — 1st Stagger Check (BlockAttack)

```
stagger_dmg = GetTotalStaggerDamage(after_block)
            = 53.2  (blunt only, poison excluded)

Bar: 0 + 53.2 = 53.2
Threshold: 134 × 0.4 = 53.6

53.2 < 53.6 → Block SUCCEEDS ✓  (0.4 HP headroom!)
```

#### Step 2i — Block reduces hit damage

```
hit.blunt  = 53.2
hit.poison = 33.2
```

#### Steps 3–4 — Resistances + Body Armor

```
Resistances: Blunt Normal (×1.0), Poison Normal (×1.0) → no change

Body armor (64):
  Total in: 53.2 + 33.2 = 86.4
  86.4 ≥ 128 (2 × 64)? No → Low regime
  Wait: 86.4/2 = 43.2 < 64 → Low regime
  after_armor = 86.4 - 64 = 22.4? No...

  Actually: 86.4, armor 64
  86.4/2 = 43.2 < 64 → High regime (block_power ≥ damage/2)
  after_armor = 86.4² / (4 × 64) = 7464.96 / 256 = 29.2
  ratio = 29.2 / 86.4 = 0.338

  Blunt final:  53.2 × 0.338 = 17.9
  Poison final: 33.2 × 0.338 = 11.2 → DoT (removed from instant)
```

#### Step 6 — 2nd Stagger Check (ApplyDamage)

```
stagger_dmg = GetTotalStaggerDamage(final)
            = 17.9  (blunt only)

Bar: 53.2 + 17.9 = 71.1
Threshold: 53.6

71.1 ≥ 53.6 → ⚡ STAGGERED!  (exceeded by 17.5)
```

### Summary

```
1st stagger (block):       53.2   bar = 53.2 / 53.6  — passes by 0.4
2nd stagger (apply damage): +17.9  bar = 71.1 / 53.6  — STAGGER!

The block succeeded. The damage was reduced. But the player is still staggered.
```

---

## 6. How to Survive: HP Requirements

To avoid stagger, you need the combined bar (1st + 2nd check) to stay below threshold:

```
bar_total = stagger_1st + stagger_2nd < maxHP × 0.4
```

For the Bonemass scenario above:

| Body armor | Min HP to not stagger | Notes |
|---|---|---|
| 46 | ~198 HP | Stagger₁ = 53.2, Stagger₂ ≈ 25.0 |
| 64 | ~178 HP | Stagger₁ = 53.2, Stagger₂ ≈ 17.9 |
| 80 | ~166 HP | Higher armor reduces the 2nd check more |
| 100 | ~155 HP | Diminishing returns on armor |

### RNG can help

The random variance `sqrt(Random.Range(0.75, 1.0))` means multiplier ranges from
×0.866 to ×1.0. At 140 HP with 64 armor, you need rng ≤ 0.82 (multiplier ≤ ×0.906)
for a lucky no-stagger. That's roughly a **28% chance** per hit.

---

## 7. Practical Takeaways

1. **HP is your best stagger defense.** The threshold scales linearly with max HP.
   More HP = more headroom for the double accumulation.

2. **Mixed-type attackers are deceptively dangerous.** Poison/fire/frost inflate the
   block pool, reducing block effectiveness against physical damage. Bonemass's poison
   doesn't stagger you directly, but it makes his blunt damage much harder to block.

3. **Body armor matters for stagger.** It reduces the 2nd stagger check (ApplyDamage).
   Higher armor shrinks the gap between "block passes" and "total bar overflows."

4. **Parry doesn't guarantee no-stagger.** Even a perfect parry with high block power
   can still stagger if the remaining physical damage (after both block and armor) pushes
   the bar over. This is unintuitive — the game rewards the parry (damage reduction,
   stamina refund, attacker stagger) but still punishes the player with stagger.

5. **Bonemass forsaken power helps enormously.** It gives `Resistant` (×0.5) to all
   physical types (blunt/slash/pierce), applied at the resistance step. This halves the
   physical damage before the 2nd stagger check, dramatically reducing total stagger.
