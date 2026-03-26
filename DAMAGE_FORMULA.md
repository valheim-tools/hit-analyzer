# Valheim Damage Taken Formula (Player ← Mob)

> **Source:** Decompiled from `assembly_valheim.dll` via IL bytecode analysis.
> All formulas verified against the actual game code (not wiki approximations).

---

## Pipeline Overview

When a mob attack hits a player, the damage flows through these steps **in order**:

```
Raw Mob Attack Damage
  │
  ├─ 1. Difficulty Scaling          (multiplayer + server settings)
  │
  ├─ 2. Block / Parry               (shield resistance → block-as-armor → stagger check → guard break?)
  │
  ├─ 3. Damage Type Modifiers       (resistances / weaknesses from gear + status effects)
  │
  ├─ 4. Armor Reduction             (sum of equipped armor values)
  │
  ├─ 5. DoT Separation              (poison/fire/spirit/frost/lightning → status effects)
  │
  ├─ 6. Health Subtraction          (remaining physical damage applied instantly)
  │
  └─ ⚡ Stagger Bar                  (physical+lightning damage fills bar → stun at 40% max HP)
```

---

## Step 1 — Difficulty & Global Scaling

Applied in `Character.RPC_Damage` when the attacker is a **non-player** hitting a **player**:

```python
# Multiplayer difficulty scaling
nearby_players = count_players_in_range(player.position, Game.m_difficultyScaleRange)
difficulty_scale = 1.0 + (nearby_players - 1) * Game.m_damageScalePerPlayer   # default +4% per extra player

all_damage_types *= difficulty_scale
all_damage_types *= Game.m_enemyDamageRate    # server difficulty modifier (default 1.0)
```

| Setting | Field | Default |
|---|---|---|
| Damage scale per extra player | `Game.m_damageScalePerPlayer` | 0.04 (4%) |
| Enemy damage rate | `Game.m_enemyDamageRate` | 1.0 |

---

## Step 2 — Block / Parry

Handled in `Humanoid.BlockAttack`. This is far more complex than a simple subtraction.

### 2a. Can the player block?

The block check requires ALL of the following:
- Hit is **blockable** (`m_blockable == true`)
- Player is **actively holding block** (`m_blocking == true`)
- Player is not attacking, dodging, staggering, in place mode, encumbered, or in a minor action
- Attack came from the **front** (`Vector3.Dot(hit.m_dir, transform.forward) <= 0`)
- Player has a **blocker** — the left-hand item (shield) or the current weapon

If any check fails, the hit skips blocking entirely and proceeds to Step 3.

### 2b. Parry detection

A **parry** (timed/perfect block) occurs when the player raised their block recently:

```python
parry_window = 0.25   # seconds — hardcoded in the IL

has_parry_bonus = blocker.m_shared.m_timedBlockBonus > 1.0

if has_parry_bonus:
    if m_blockTimer == -1.0:
        is_parry = False          # block hasn't started yet
    else:
        is_parry = m_blockTimer < parry_window   # raised block within 0.25s
else:
    is_parry = False              # weapon/shield has no parry bonus
```

> The `m_blockTimer` starts at `-1.0` (not blocking), resets to `0.0` when the player first raises the block, then counts upward each frame. A parry only triggers if you blocked less than **0.25 seconds** ago AND the shield/weapon has `m_timedBlockBonus > 1.0`.

### 2c. Calculate block power

```python
# ItemData.GetBlockPower
base_block = m_shared.m_blockPower + max(0, quality - 1) * m_shared.m_blockPowerPerLevel
skill_factor = player.GetSkillFactor(Skill.Blocking)   # 0.0 to 1.0
block_power = base_block + base_block * skill_factor * 0.5
#           = base_block * (1.0 + skill_factor * 0.5)
# At max blocking skill: block_power = base_block * 1.5
```

### 2d. Apply parry multiplier

If the hit is a successful parry:

```python
if is_parry:
    block_power *= blocker.m_shared.m_timedBlockBonus   # e.g. ×1.5 for most shields
    seman.ModifyTimedBlockBonus(ref block_power)         # status effects can further modify
```

> **This is the parry multiplier.** A shield with `m_timedBlockBonus = 1.5` and base block power 40 at max skill would have: `40 × 1.5 × 1.5 = 90` block power during a parry vs `40 × 1.5 = 60` for a normal block.

### 2e. Apply shield resistance modifiers

If the shield/weapon has its own damage type modifiers (e.g., a shield with fire resistance):

```python
if blocker.m_shared.m_damageModifiers.Count > 0:
    shield_mods = DamageModifiers()
    shield_mods.Apply(blocker.m_shared.m_damageModifiers)
    hit.ApplyResistance(shield_mods)    # modifies hit damage in-place
```

> Shield resistances are applied **before** player body resistances (Step 3). They stack **multiplicatively** — if the shield gives ×0.5 fire resistance and the player's armor also gives ×0.5 fire resistance, the result is ×0.25.

### 2f. Block uses the armor formula!

This is a key finding — blocking does **NOT** simply subtract block power from damage. Instead, block power is fed into the **same armor reduction formula** used by body armor:

```python
# Clone the damage and apply block power as "armor"
after_block = hit.m_damage.Clone()
after_block.ApplyArmor(block_power)     # uses the quadratic/linear armor formula!

# Calculate how much was absorbed
original_total = hit.GetTotalBlockableDamage()      # before block-as-armor
after_block_total = after_block.GetTotalBlockableDamage()   # after block-as-armor
actual_blocked = original_total - after_block_total          # damage absorbed by block
```

This means blocking follows the same two-regime curve:
- **Strong block** (`block_power >= damage/2`): absorbed = `damage - damage²/(4×block_power)` — very effective
- **Weak block** (`block_power < damage/2`): absorbed = `block_power` — just a flat subtraction

### 2g. Stamina cost

```python
stagger_ratio = Clamp01(actual_blocked / block_power)   # how much of block capacity was used

if is_parry:
    stamina_cost = m_perfectBlockStaminaDrain     # 0.0 for the player prefab! Parries are FREE
else:
    stamina_cost = m_blockStaminaDrain * stagger_ratio   # 10.0 × ratio for players

# Equipment and status effects can modify the cost
stamina_cost += stamina_cost * GetEquipmentBlockStaminaModifier()
seman.ModifyBlockStaminaUsage(stamina_cost, ref stamina_cost)
UseStamina(stamina_cost)
```

| Field | Player Default | Notes |
|---|---|---|
| `m_blockStaminaDrain` | 10.0 | Stamina per normal block (scaled by ratio) |
| `m_perfectBlockStaminaDrain` | **0.0** | Stamina per parry — **free!** |

### 2h. Stagger check during block

Even while blocking, the **remaining** damage (after the block-as-armor formula) contributes to the player's stagger bar:

```python
# Stagger damage = physical + lightning AFTER block reduction
stagger_dmg = after_block.GetTotalStaggerDamage()    # blunt + slash + pierce + lightning only
was_staggered = AddStaggerDamage(stagger_dmg, hit.m_dir, null)
```

The block succeeds only if the player has stamina AND was not staggered:

```python
successful_block = HaveStamina(0) and (not was_staggered)
```

### 2i. Successful block → reduce damage

If the block succeeds:

```python
if successful_block:
    hit.m_statusEffectHash = 0     # block prevents status effects from the hit
    hit.BlockDamage(actual_blocked)
    # BlockDamage reduces hit proportionally:
    #   remaining = max(0, totalBlockable - actual_blocked)
    #   ratio = remaining / totalBlockable
    #   all damage types *= ratio
```

### 2j. ⚠️ Block BROKEN (guard break) → full damage passes through

If the block **fails** (out of stamina or stagger bar overflowed):

```python
if not successful_block:
    # BlockDamage is NEVER called!
    # The hit continues to Step 3 with FULL damage (only shield resistances applied)
    # The player is also STAGGERED (can't act for ~2 seconds)
    pass
```

> **This is the guard break mechanic.** When a hit is too powerful and fills the stagger bar during a block, the player takes the **entire unblocked damage** through the remaining pipeline (resistances + armor), AND gets staggered. The block effectively did nothing except drain stamina and apply shield resistance modifiers.

### 2k. Parry staggers the attacker

If the block was a successful parry AND the hit has `m_staggerWhenBlocked`:

```python
if is_parry and successful_block and attacker is not None:
    if hit.m_staggerWhenBlocked:
        attacker.Stagger(-hit.m_dir)    # stagger the MOB!
    
    # Apply perfect block status effect, stamina regen, adrenaline, etc.
```

### 2l. After block — damage continues through the pipeline

Regardless of whether the block succeeded or failed, the hit data continues through Steps 3–6. The difference:
- **Block succeeded:** `hit.m_damage` was reduced by `BlockDamage`
- **Block failed (guard break):** `hit.m_damage` is at full strength (only shield resistances applied)

Both paths then go through player resistance modifiers → body armor → DoT separation → health subtraction.

---

## Step 3 — Damage Type Modifiers (Resistances)

Called in `HitData.ApplyResistance`. Each damage type is **independently** multiplied by its own modifier. This is fundamentally different from the armor formula (Step 4), which sums all types together.

> **Resistance vs Armor — how they treat multi-type attacks:**
> - **Resistance (this step):** Each type is multiplied by its own modifier independently. A hit with 50 Blunt + 20 Lightning, where you have Lightning Resistant, reduces the lightning to 10 while the blunt stays at 50.
> - **Armor (Step 4):** All types are summed into one total, one formula is applied, and the resulting ratio scales every type proportionally. Armor doesn't care which types you have — it sees "60 total damage" regardless of the mix.

### 3a. Modifier sources (merged with "best wins")

The player's effective `DamageModifiers` are built from three layers:

| Source | Method | Example |
|---|---|---|
| Base character mods | `Character.m_damageModifiers` | Players have no innate resistances |
| Armor piece mods | `Player.ApplyArmorDamageMods` | Wolf chest → Frost Resistant; Fenris set → Fire Resistant |
| Status effect mods | `SEMan.ApplyDamageMods` | Bonemass power → physical Resistant; Frost/Fire resist mead |

When multiple sources set a modifier for the same damage type, `DamageModifiers.ApplyIfBetter` keeps the **more protective** one (e.g., VeryResistant beats Resistant).

#### ApplyIfBetter merge rules (verified from IL — `ShouldOverride`)

The `ShouldOverride(existing, candidate)` logic determines whether the candidate should replace the existing modifier:

- If existing = **Ignore** → never override (Ignore is permanent/structural)
- If candidate = **Immune** → always override (Immune beats everything)
- **VeryResistant** is never downgraded to Resistant, SlightlyResistant to Normal, etc.
- A **resistance** modifier (Resistant, VeryResistant, SlightlyResistant, Immune) is **never** overwritten by a **weakness** modifier (Weak, VeryWeak, SlightlyWeak)
- Otherwise → override (candidate is more protective or equally protective)

> **In practice:** You can't double-stack the same resistance from two body armor pieces or two status effects. Wolf Chest gives Frost Resistant (×0.5), Frost Resistance Mead also gives Frost Resistant (×0.5) — the result is just Frost Resistant (×0.5), **not** ×0.25. The "best wins" rule means you only benefit from the single strongest source per damage type within the body resistance layer.

### 3b. Modifier multipliers

| DamageModifier | Enum Value | Multiplier | Effect |
|---|---|---|---|
| **Normal** | 0 | ×1.00 | Full damage |
| **Resistant** | 1 | ×0.50 | Half damage |
| **Weak** | 2 | ×1.50 | 50% extra damage |
| **Immune** | 3 | ×0.00 | No damage |
| **Ignore** | 4 | ×0.00 | Damage type not applicable |
| **VeryResistant** | 5 | ×0.25 | Quarter damage |
| **VeryWeak** | 6 | ×2.00 | Double damage |
| **SlightlyResistant** | 7 | ×0.75* | Mild reduction |
| **SlightlyWeak** | 8 | ×1.25 | Mild vulnerability |

> \*SlightlyResistant multiplier inferred from the symmetry pattern (0.25 / 0.5 / **0.75** / 1.0 / 1.25 / 1.5 / 2.0). The IL confirms ×1.25 for SlightlyWeak and ×0.25/0.5 for VeryResistant/Resistant.

```python
# Per damage type:
for damage_type in [blunt, slash, pierce, chop, pickaxe, fire, frost, lightning, poison, spirit]:
    modifier = merged_modifiers.get(damage_type)  # DamageModifier enum
    damage[type] *= MULTIPLIER[modifier]
```

### 3c. Resistance × Armor synergy (ordering matters!)

Because resistance is applied **before** armor, it reduces the input to the quadratic armor formula, making armor disproportionately more effective. This is a key gameplay insight.

#### Worked example: 50 Blunt + 20 Pierce + 20 Lightning, player has Lightning Resistant (×0.5), 60 body armor

**Step 3 — Resistance (per-type independently):**

| Type | Before | Modifier | After |
|---|---|---|---|
| Blunt | 50 | Normal (×1.0) | **50** |
| Pierce | 20 | Normal (×1.0) | **20** |
| Lightning | 20 | Resistant (×0.5) | **10** |
| **Sum** | 90 | | **80** |

**Step 4 — Armor (sum → formula → proportional ratio):**

```
total = 80, armor = 60
60 >= 80/2 (40) → High regime
reduced = 80²/(4×60) = 26.67
ratio = 26.67 / 80 = 0.333
```

| Type | Before Armor | × 0.333 | After Armor |
|---|---|---|---|
| Blunt | 50 | × 0.333 | **16.67** |
| Pierce | 20 | × 0.333 | **6.67** |
| Lightning | 10 | × 0.333 | **3.33** |
| **Total** | 80 | | **26.67** |

Compare with NO resistance (same hit, same armor):

```
total = 90, armor = 60 → reduced = 90²/240 = 33.75
```

> Resistance alone would save 10 damage (90 → 80). But because armor then applies its quadratic formula to the reduced input, the **actual** saving is 33.75 − 26.67 = **7.08 HP** — and the total reduction is 90 → 26.67 = **70.4%** instead of 90 → 33.75 = 62.5%.

#### Extreme example: parry + resistance + armor

With a parry (block power 112.5) on the same 90-damage hit:

| Stage | Total |
|---|---|
| Raw | **90.0** |
| After parry (×0.2 ratio) | **18.0** |
| After Lightning Resistant | **16.0** |
| After 60 armor (16²/240) | **1.07** |

The quadratic armor formula crushes small inputs. 16 total damage into 60 armor = 93.3% reduction from armor alone. The full pipeline: 90 → 1.07 = **98.8% total reduction**.

### 3d. Shield resistance vs body resistance — two separate layers

> ⚠️ **In practice, Step 2e (shield resistance) is almost always skipped.** The code checks `blocker.m_shared.m_damageModifiers.Count > 0`, but current Valheim shields have empty damage modifier lists. The code path exists as a framework feature, but shields provide protection through **block power** (the armor formula in Step 2f), not through damage type resistance.

If a shield DID have damage modifiers, it would work as follows:

1. **Shield layer** (Step 2e): `hit.ApplyResistance(shield_modifiers)` — during block, before block-as-armor
2. **Body layer** (Step 3): `hit.ApplyResistance(player_modifiers)` — always applies, after block

These are two separate `ApplyResistance` calls, so they stack **multiplicatively** across layers. But within the body layer itself, multiple sources (armor pieces + status effects) merge via "best wins" — they do NOT stack.

---

## Step 4 — Armor Reduction

Applied in `DamageTypes.ApplyArmor`, called only for **player targets**.

### 4a. Body armor calculation

`Player.GetBodyArmor` sums armor from 4 equipment slots, then status effects can modify it:

```python
body_armor  = chest.GetArmor()       # each piece's armor scales with quality/upgrade level
body_armor += legs.GetArmor()
body_armor += helmet.GetArmor()
body_armor += cape.GetArmor()
body_armor  = seman.ApplyArmorMods(body_armor)   # status effects can buff/debuff armor
```

### 4b. The armor formula (verified from IL)

The core formula is a **static method** `DamageTypes.ApplyArmor(float damage, float armor)`:

```python
def apply_armor_single(damage, armor):
    """Core armor formula — two regimes depending on damage vs armor ratio."""
    
    # Regime 1: High armor (armor >= damage/2) — quadratic falloff
    result = damage * clamp01(damage / (armor * 4.0))
    #       = damage² / (4 × armor)     [when damage < 4×armor, i.e. always in practice]
    
    # Regime 2: Low armor (armor < damage/2) — linear subtraction
    if armor < damage / 2.0:
        result = damage - armor
    
    return result
```

#### Two-regime behavior:

| Condition | Formula | Intuition |
|---|---|---|
| `armor >= damage/2` | `damage² / (4 × armor)` | Armor is strong → quadratic reduction, very effective |
| `armor < damage/2` | `damage − armor` | Armor is overwhelmed → flat subtraction only |

#### Examples:

| Raw Damage | Armor | Regime | Damage After Armor | % Reduced |
|---|---|---|---|---|
| 20 | 60 | High | 20²/(4×60) = **1.67** | 91.7% |
| 50 | 60 | High | 50²/(4×60) = **10.42** | 79.2% |
| 100 | 60 | High | 100²/(4×60) = **41.67** | 58.3% |
| 100 | 40 | Low | 100 − 40 = **60.00** | 40.0% |
| 200 | 60 | Low | 200 − 60 = **140.00** | 30.0% |
| 10 | 100 | High | 10²/(4×100) = **0.25** | 97.5% |

### 4c. Instance method — proportional scaling

The instance `DamageTypes.ApplyArmor(float armor)` applies the formula to the **total** damage, then distributes the reduction proportionally:

```python
def apply_armor(damage_types, armor):
    """Instance method on the DamageTypes struct."""
    if armor <= 0:
        return
    
    total = (damage_types.blunt + damage_types.slash + damage_types.pierce +
             damage_types.fire  + damage_types.frost + damage_types.lightning +
             damage_types.poison + damage_types.spirit)
    
    if total <= 0:
        return
    
    reduced_total = apply_armor_single(total, armor)
    ratio = reduced_total / total
    
    # Scale each type proportionally
    damage_types.blunt     *= ratio
    damage_types.slash     *= ratio
    damage_types.pierce    *= ratio
    damage_types.fire      *= ratio
    damage_types.frost     *= ratio
    damage_types.lightning *= ratio
    damage_types.poison    *= ratio
    damage_types.spirit    *= ratio
```

> **Key insight:** Armor applies to the **sum** of all damage types. A mixed-type attack (e.g. 30 slash + 70 poison) uses the same armor calculation as a pure 100-damage attack. The ratio is then applied equally to all types.

---

## Step 5 — DoT Separation

After armor, the elemental damage types are extracted for separate damage-over-time handling:

```python
# In Character.RPC_Damage, after ApplyArmor:
poison_dmg    = hit.m_damage.m_poison       # → AddPoisonDamage (DoT)
fire_dmg      = hit.m_damage.m_fire         # → AddFireDamage (DoT)
spirit_dmg    = hit.m_damage.m_spirit       # → AddSpiritDamage (DoT)

hit.m_damage.m_poison = 0
hit.m_damage.m_fire   = 0
hit.m_damage.m_spirit = 0

# Main hit applies remaining damage (blunt/slash/pierce)
ApplyDamage(hit)

# Then apply DoTs separately
AddFireDamage(fire_dmg)
AddSpiritDamage(spirit_dmg)
AddPoisonDamage(poison_dmg)
AddFrostDamage(hit.m_damage.m_frost)         # frost stays in main hit AND triggers debuff
AddLightningDamage(hit.m_damage.m_lightning)  # same for lightning
```

> **Poison, fire, and spirit** are zeroed from the main hit and applied as status effects (ticking damage).
> **Frost and lightning** deal their damage in the main hit AND also apply a debuff.

### 5a. Damage type behavior summary

All damage types go through the same resistance (Step 3) and armor (Step 4) pipeline, but they diverge at Step 5:

| Type | Instant HP hit? | DoT / status effect? | Counts for stagger? |
|---|---|---|---|
| **Blunt** | ✅ Yes | — | ✅ Yes |
| **Slash** | ✅ Yes | — | ✅ Yes |
| **Pierce** | ✅ Yes | — | ✅ Yes |
| **Fire** | ❌ Extracted | 🔥 Fire DoT (ticking damage) | ❌ No |
| **Frost** | ✅ Yes (stays) | ❄️ Frost debuff (slow) | ❌ No |
| **Lightning** | ✅ Yes (stays) | ⚡ Lightning debuff (wet/stagger) | ✅ Yes |
| **Poison** | ❌ Extracted | ☠️ Poison DoT (ticking damage) | ❌ No |
| **Spirit** | ❌ Extracted | 👻 Spirit DoT (ticking damage) | ❌ No |

> **Key implication for resistance:** When you have Fire Resistant (×0.5), resistance reduces the fire portion at Step 3, armor further reduces it at Step 4, and then the remaining fire value is extracted as a DoT — so resistance reduces the tick damage, not the instant hit. Conversely, Lightning Resistant reduces lightning at Step 3, armor reduces it at Step 4, and the remaining value hits you **instantly** (plus applies the debuff). Same resistance math, different player experience.

### 5b. How DoT delivery works (after extraction)

> **The damage formula (Steps 1–4) does NOT change for fire, poison, or spirit.** They go through the exact same resistance → armor pipeline as every other type. The only difference is what happens at Step 5: these types are extracted from the main hit and delivered as ticking damage over time instead of an instant HP loss.

The value passed to `AddFireDamage(fire_dmg)` / `AddPoisonDamage(poison_dmg)` / `AddSpiritDamage(spirit_dmg)` is the **already-reduced** value — resistance and armor have already been applied once. The DoT ticks do NOT go through resistance or armor again; they apply damage directly to health.

#### Fire & Spirit DoT (SE_Burning status effect)

> **Source:** Verified from IL disassembly of `SE_Burning.AddFireDamage`, `SE_Burning.AddSpiritDamage`, and `SE_Burning.UpdateStatusEffect`.

Fire and Spirit are both handled by the **same C# class** (`SE_Burning`). They share one SE instance but track damage independently via separate fields.

**SE_Burning fields (from reflection):**

| Field | Type | Burning prefab | Spirit prefab | Purpose |
|---|---|---|---|---|
| `m_damageInterval` | float | **1.0** | **0.5** | Seconds between ticks |
| `m_timer` | float | (runtime) | (runtime) | Counts down to next tick |
| `m_fireDamageLeft` | float | (runtime) | (runtime) | Remaining fire damage pool |
| `m_fireDamagePerHit` | float | (runtime) | (runtime) | Fire damage per tick |
| `m_spiritDamageLeft` | float | (runtime) | (runtime) | Remaining spirit damage pool |
| `m_spiritDamagePerHit` | float | (runtime) | (runtime) | Spirit damage per tick |
| `m_minimumDamageTick` | float | (runtime) | (runtime) | Min damage to accept |

**Inherited from StatusEffect:**

| Field | Burning prefab | Spirit prefab | Purpose |
|---|---|---|---|
| `m_ttl` | **5.0** | **3.0** | Total SE duration (seconds) |
| `m_time` | (runtime) | (runtime) | Current elapsed time |

##### AddFireDamage (verified IL)

```python
def AddFireDamage(fire_dmg):
    num_ticks = int(m_ttl / m_damageInterval)         # 5.0 / 1.0 = 5
    damage_per_tick = fire_dmg / num_ticks             # e.g. 20 / 5 = 4.0

    if damage_per_tick < 0.2 and m_fireDamageLeft == 0:
        return False                                   # too small, no existing fire → reject

    m_fireDamageLeft += fire_dmg                       # ACCUMULATE (fire stacks!)
    m_fireDamagePerHit = m_fireDamageLeft / num_ticks  # redistribute ALL remaining across 5 ticks
    ResetTime()                                        # m_time = 0 → full TTL restarts
    return True
```

> **Fire stacking:** Fire **accumulates**. If you have 12 fire remaining and get hit with 15 more, `m_fireDamageLeft = 27` and `m_fireDamagePerHit = 27/5 = 5.4`. The TTL resets, so all 27 damage is redistributed across 5 fresh ticks. AddSpiritDamage works identically for `m_spiritDamageLeft` / `m_spiritDamagePerHit`.

##### UpdateStatusEffect (verified IL) — tick logic

```python
def UpdateStatusEffect(dt):
    base.UpdateStatusEffect(dt)          # m_time += dt

    # Wet targets burn out faster! Fire damage left > 0 and character is wet:
    if m_fireDamageLeft > 0:
        if m_character.GetSEMan().HaveStatusEffect(s_statusEffectWet):
            m_time += dt * 5             # 6× total time advancement → SE expires ~6× faster

    m_timer -= dt                         # count down to next tick
    if m_timer > 0:
        return                            # not time yet

    # === TICK ===
    m_timer = m_damageInterval            # reset timer (1.0s for fire, 0.5s for spirit)

    hit = HitData()
    hit.m_point = m_character.GetCenterPoint()
    hit.m_damage.m_fire = m_fireDamagePerHit
    hit.m_damage.m_spirit = m_spiritDamagePerHit
    hit.m_hitType = 5                     # StatusEffect hit type

    m_fireDamageLeft   = max(0, m_fireDamageLeft   - m_fireDamagePerHit)
    m_spiritDamageLeft = max(0, m_spiritDamageLeft - m_spiritDamagePerHit)

    m_character.ApplyDamage(hit, showDamage=True, triggerEffects=False, ...)
    m_tickEffect.Create(...)              # visual effect
```

##### First tick timing

`m_timer` initializes to **0.0** (C# default). On the very first frame, `m_timer -= dt` makes it negative → the tick condition fires **immediately**. The first tick is essentially **instant** (frame 0, at t ≈ 0). After that, `m_timer` is reset to `m_damageInterval` and subsequent ticks fire every interval.

##### Fire timeline (20 fire damage, single hit)

| Time | Event | Tick damage | Pool remaining |
|---|---|---|---|
| **t ≈ 0** | Tick 1 (instant, first frame) | **4.0** | 16.0 |
| **t ≈ 1s** | Tick 2 | **4.0** | 12.0 |
| **t ≈ 2s** | Tick 3 | **4.0** | 8.0 |
| **t ≈ 3s** | Tick 4 | **4.0** | 4.0 |
| **t ≈ 4s** | Tick 5 | **4.0** | 0.0 |
| **t = 5s** | SE expires (`m_time ≥ m_ttl`) | — | — |
| | **Total HP lost** | **20.0** | |

##### Spirit timeline (20 spirit damage, single hit)

| Time | Event | Tick damage | Pool remaining |
|---|---|---|---|
| **t ≈ 0** | Tick 1 (instant) | **3.33** | 16.67 |
| **t ≈ 0.5s** | Tick 2 | **3.33** | 13.33 |
| **t ≈ 1.0s** | Tick 3 | **3.33** | 10.00 |
| **t ≈ 1.5s** | Tick 4 | **3.33** | 6.67 |
| **t ≈ 2.0s** | Tick 5 | **3.33** | 3.33 |
| **t ≈ 2.5s** | Tick 6 | **3.33** | 0.00 |
| **t = 3.0s** | SE expires | — | — |
| | **Total HP lost** | **20.0** | |

##### Wet interaction

If the target has the Wet status effect while fire damage is ticking, `m_time` advances at **6× speed** (normal `dt` + extra `dt * 5`). The SE_Burning expires in ~0.83 seconds instead of 5. Only ~1 tick fires instead of 5, meaning **~80% of fire damage is lost** on wet targets. This is why swimming or rain is a powerful fire defense.

#### Poison DoT (SE_Poison status effect)

> **Source:** Verified from IL disassembly of `SE_Poison.AddDamage` and `SE_Poison.UpdateStatusEffect`.

Poison is fundamentally different from fire/spirit:

**SE_Poison fields (from reflection):**

| Field | Prefab value | Purpose |
|---|---|---|
| `m_damageInterval` | **1.0** | Seconds between ticks |
| `m_baseTTL` | **1.0** | Base duration before damage scaling |
| `m_TTLPerDamagePlayer` | **5.0** | TTL scaling factor for player targets |
| `m_TTLPerDamage` | **1.0** | TTL scaling factor for mob targets |
| `m_TTLPower` | **0.5** | Exponent for TTL calculation (√ = sublinear) |
| `m_timer` | (runtime) | Counts down to next tick |
| `m_damageLeft` | (runtime) | Remaining poison damage pool |
| `m_damagePerHit` | (runtime) | Poison damage per tick |

##### AddDamage (verified IL)

```python
def AddDamage(poison_dmg):
    if poison_dmg < m_damageLeft:
        return                            # WEAKER poison is REJECTED — does NOT stack!

    m_damageLeft = poison_dmg             # REPLACE (not accumulate!)

    ttl_per_dmg = m_TTLPerDamagePlayer if m_character.IsPlayer() else m_TTLPerDamage

    m_ttl = m_baseTTL + pow(m_damageLeft * ttl_per_dmg, m_TTLPower)
    #     = 1.0 + sqrt(poison_dmg * 5.0)      # for players

    num_ticks = int(m_ttl / m_damageInterval)
    m_damagePerHit = m_damageLeft / num_ticks

    # Debug log: "Poison dmgLeft=X ttl=Y ticks=Z perHit=W"

    ResetTime()                            # m_time = 0 → full TTL restarts
```

> **Poison does NOT stack.** If you're poisoned with 20 and get hit with 15 poison, the 15 is **silently ignored** (`15 < 20 → return`). Only a **stronger** poison replaces the existing one (the pool is replaced, not added to). This is the opposite of fire which accumulates.

##### Poison TTL scaling (player targets)

The formula `m_ttl = 1.0 + sqrt(damage * 5.0)` means bigger poisons last longer, but **sublinearly** — you get higher per-tick damage, not just more time.

| Post-armor poison | TTL calculation | Duration | Ticks | Per tick |
|---|---|---|---|---|
| 5 | 1 + √25 = **6.0s** | 6s | 6 | 0.83 |
| 10 | 1 + √50 = **8.07s** | 8s | 8 | 1.25 |
| 20 | 1 + √100 = **11.0s** | 11s | 11 | 1.82 |
| 50 | 1 + √250 = **16.8s** | 16s | 16 | 3.13 |

##### Poison timeline (20 poison on player)

| Time | Tick | Damage | Pool remaining |
|---|---|---|---|
| **t ≈ 0** | 1 (instant) | **1.82** | 18.18 |
| **t ≈ 1s** | 2 | **1.82** | 16.36 |
| **t ≈ 2s** | 3 | **1.82** | 14.55 |
| ... | ... | ... | ... |
| **t ≈ 10s** | 11 | **1.82** | 0.0 |
| **t = 11s** | SE expires | — | — |
| | **Total HP lost** | **20.0** | |

#### Summary: DoT comparison

| Property | 🔥 Fire | 👻 Spirit | ☠️ Poison |
|---|---|---|---|
| **Class** | SE_Burning | SE_Burning (same!) | SE_Poison |
| **Tick interval** | 1.0s | 0.5s | 1.0s |
| **Total duration** | 5.0s (fixed) | 3.0s (fixed) | Dynamic (1 + √(dmg×5)) |
| **Number of ticks** | 5 | 6 | Varies (6–16+) |
| **First tick** | Instant (frame 0) | Instant (frame 0) | Instant (frame 0) |
| **Stacking** | ✅ Accumulates | ✅ Accumulates | ❌ Stronger replaces |
| **Re-hit behavior** | Pool grows, per-tick recalculated, TTL resets | Same as fire | Rejected if weaker; replaced if stronger |
| **Wet interaction** | 6× faster expiry (~80% dmg lost) | 6× faster expiry | None |
| **Total HP lost** | = post-armor value | = post-armor value | = post-armor value |
| **Minimum threshold** | `dmg/5 < 0.2` AND no existing fire → reject | Same (dmg/6 < 0.2) | None |

> **The total HP lost is the same regardless of delivery method** (assuming the SE runs its full course). A mob that does 50 Blunt + 20 Fire will cost you 70 HP through the pipeline (reduced by resistance and armor). The blunt portion hits instantly while the fire ticks over 5 seconds. This matters for food regen (which heals between ticks) and for survivability (DoT can't one-shot you).

> ⚠️ **Wet exception:** Fire on a wet target loses ~80% of its damage because the SE expires before all ticks fire. This is the only case where total HP lost differs from the post-armor value.

#### Worked example: Parry + Fire DoT (50 Blunt + 30 Fire, Fire Resistant, 60 armor)

Shield: base block 60, parry bonus ×1.5, skill 50%. Block power = 60 × 1.25 × 1.5 = **112.5**.

| Stage | How types are handled | Blunt | Fire | Total |
|---|---|---|---|---|
| **Raw** | Mob attack | 50.0 | 30.0 | **80.0** |
| **Parry block** | Sum→formula→ratio (×0.178) | 8.89 | 5.33 | **14.22** |
| **Body resistance** | Per-type: Fire Resistant ×0.5 | 8.89 | **2.67** | **11.56** |
| **Body armor (60)** | Sum→formula→ratio (×0.048) | **0.428** | **0.128** | **0.557** |
| **DoT split** | Fire extracted from main hit | 0.428 | → SE_Burning | — |
| **Instant HP loss** | Blunt only, frame 0 | **−0.428** | — | — |
| **Fire ticks** | 5 ticks × 0.0256 over 5 seconds | — | **−0.128 total** | — |
| **Total HP lost** | | | | **−0.557** |

Fire tick breakdown: 0.128 fire enters SE_Burning → `numTicks = 5`, `perHit = 0.128/5 = 0.0256`. Five ticks of 0.0256 damage at t≈0, 1, 2, 3, 4 seconds. Food regen easily absorbs it.

Key observations:
- **The shield blocks fire.** `GetTotalBlockableDamage` includes fire — the parry reduces it from 30 → 5.33 before resistance even sees it.
- **Fire does NOT stagger.** During the block stagger check, only blunt contributed (8.89). Fire was invisible.
- **Fire becomes a DoT at Step 5**, after the full pipeline has already crushed it from 30 → 0.128.
- The 0.128 fire damage is spread across **5 ticks** (first tick instant, then every 1s). Each tick deals only 0.026 HP.

---

## Step 6 — Final Health Subtraction

In `Character.ApplyDamage`:

```python
# Additional player-specific scaling
if is_player:
    all_damage_types *= Game.m_localDamageTakenRate    # client-side damage modifier (default 1.0)

total = hit.GetTotalDamage()

if total <= 0.1:
    return   # damage too small, ignored

health -= total

if health <= 0 and (god_mode or ghost_mode):
    health = 1.0   # prevent death in god/ghost mode
```

---

## Complete Pseudocode

### Constants and data types

```python
# ── Damage Modifier enum and multiplier table ──────────────────────────
MODIFIER_TABLE = {
    "Normal":            1.00,
    "Resistant":         0.50,
    "Weak":              1.50,
    "Immune":            0.00,
    "Ignore":            0.00,
    "VeryResistant":     0.25,
    "VeryWeak":          2.00,
    "SlightlyResistant": 0.75,
    "SlightlyWeak":      1.25,
}

# ── DamageTypes struct ─────────────────────────────────────────────────
# All 10 damage fields. The first field (m_damage) is "generic" / true damage.
DAMAGE_FIELDS = [
    "m_damage",     # generic / true damage
    "m_blunt",
    "m_slash",
    "m_pierce",
    "m_chop",
    "m_pickaxe",
    "m_fire",
    "m_frost",
    "m_lightning",
    "m_poison",
    "m_spirit",
]

# Blockable = everything except chop, pickaxe, and generic m_damage
BLOCKABLE_FIELDS = [
    "m_blunt", "m_slash", "m_pierce",
    "m_fire", "m_frost", "m_lightning", "m_poison", "m_spirit",
]

# Stagger = physical + lightning only
STAGGER_FIELDS = ["m_blunt", "m_slash", "m_pierce", "m_lightning"]

# Fields that go through the armor formula (instance method sums these 8)
ARMOR_FIELDS = [
    "m_blunt", "m_slash", "m_pierce",
    "m_fire", "m_frost", "m_lightning", "m_poison", "m_spirit",
]

# Fields extracted as DoT at Step 5
DOT_FIELDS = {"m_fire", "m_poison", "m_spirit"}

# Fields that deal instant damage AND apply a debuff
DEBUFF_FIELDS = {"m_frost", "m_lightning"}
```

### Armor formula (core)

```python
def apply_armor_single(damage: float, armor: float) -> float:
    """Core armor formula — two regimes. Verified from IL."""
    # Regime 1: High armor (armor >= damage/2) — quadratic falloff
    result = damage * clamp01(damage / (armor * 4.0))
    #       = damage² / (4 × armor)     when damage < 4×armor

    # Regime 2: Low armor (armor < damage/2) — linear subtraction
    if armor < damage / 2.0:
        result = damage - armor

    return result


def apply_armor_to_damage_types(dmg: dict, armor: float):
    """Instance method — sum → formula → proportional ratio. Verified from IL."""
    if armor <= 0:
        return
    total = sum(dmg[f] for f in ARMOR_FIELDS)
    if total <= 0:
        return
    reduced_total = apply_armor_single(total, armor)
    ratio = reduced_total / total
    for f in ARMOR_FIELDS:
        dmg[f] *= ratio
```

### Resistance application

```python
def apply_resistance(dmg: dict, modifiers: dict):
    """Apply per-type resistance modifiers independently. Verified from IL.

    modifiers: dict of {field_name: DamageModifier_string}
               e.g. {"m_fire": "Resistant", "m_frost": "Immune"}
    """
    for field in ARMOR_FIELDS:
        mod_name = modifiers.get(field, "Normal")
        dmg[field] *= MODIFIER_TABLE[mod_name]
```

### Block / Parry helpers

```python
def get_total_blockable(dmg: dict) -> float:
    return sum(dmg[f] for f in BLOCKABLE_FIELDS)


def get_total_stagger(dmg: dict) -> float:
    return sum(dmg[f] for f in STAGGER_FIELDS)


def block_damage(dmg: dict, actual_blocked: float):
    """Reduce all blockable types proportionally by actual_blocked amount."""
    total_blockable = get_total_blockable(dmg)
    if total_blockable <= 0:
        return
    remaining = max(0, total_blockable - actual_blocked)
    ratio = remaining / total_blockable
    for f in BLOCKABLE_FIELDS:
        dmg[f] *= ratio
```

### Main damage pipeline

```python
def calculate_player_damage_taken(
    mob_attack,        # dict of {field: float} — raw DamageTypes from mob's weapon/attack
    nearby_players,    # int, players in difficulty range
    is_blocking,       # bool
    is_parry,          # bool — block raised within 0.25s
    blocker,           # shield/weapon ItemData (or None)
    shield_modifiers,  # dict of {field: modifier_name} — shield resistance mods (usually empty)
    body_modifiers,    # dict of {field: modifier_name} — merged from armor + status effects
    body_armor,        # float, sum of 4 armor piece values (after status mods)
    max_health,        # float, current max HP (with food)
    stagger_bar,       # float, current stagger accumulator (mutable)
    is_wet,            # bool, whether the player has the Wet status effect
    enemy_damage_rate, # float, server difficulty modifier (default 1.0)
    stagger_multiplier,# float, hit.m_staggerMultiplier (usually 1.0)
):
    """
    Returns a dict with:
        instant_damage:   float — HP lost immediately (blunt/slash/pierce + frost + lightning)
        fire_dot:         float — total fire damage entering SE_Burning
        spirit_dot:       float — total spirit damage entering SE_Burning
        poison_dot:       float — total poison damage entering SE_Poison
        frost_debuff:     float — frost value (instant damage + slow debuff)
        lightning_debuff: float — lightning value (instant damage + wet debuff)
        block_succeeded:  bool
        was_staggered:    bool
        stagger_bar:      float — updated stagger accumulator
        fire_ticks:       list of (time, damage) — predicted tick timeline
        spirit_ticks:     list of (time, damage) — predicted tick timeline
        poison_ticks:     list of (time, damage) — predicted tick timeline
    """
    dmg = dict(mob_attack)   # clone

    # ── 1. Difficulty scaling ──────────────────────────────────────────
    diff_scale = 1.0 + (nearby_players - 1) * 0.04
    for f in DAMAGE_FIELDS:
        dmg[f] *= diff_scale * enemy_damage_rate

    # ── 2. Block / Parry ──────────────────────────────────────────────
    block_succeeded = False
    was_staggered = False
    if is_blocking and blocker:
        # 2c. Block power
        base_bp = blocker["m_blockPower"] + max(0, blocker["quality"] - 1) * blocker["m_blockPowerPerLevel"]
        skill = blocker["blocking_skill_factor"]    # 0.0 to 1.0
        block_power = base_bp * (1.0 + skill * 0.5)

        # 2d. Parry multiplier
        if is_parry:
            block_power *= blocker["m_timedBlockBonus"]

        # 2e. Shield resistance modifiers (applied BEFORE player body resistances)
        # In practice almost always empty — current shields have no damage modifiers.
        if shield_modifiers:
            apply_resistance(dmg, shield_modifiers)

        # 2f. Block uses the armor formula!
        after_block = dict(dmg)
        apply_armor_to_damage_types(after_block, block_power)
        original_total = get_total_blockable(dmg)
        after_block_total = get_total_blockable(after_block)
        actual_blocked = original_total - after_block_total

        # 2g. Stamina cost
        if original_total > 0 and block_power > 0:
            stagger_ratio = clamp01(actual_blocked / block_power)
        else:
            stagger_ratio = 0
        if is_parry:
            stamina_cost = 0.0       # m_perfectBlockStaminaDrain = 0 — parries are FREE
        else:
            stamina_cost = 10.0 * stagger_ratio   # m_blockStaminaDrain = 10

        # 2h. Stagger check (physical+lightning AFTER block reduction)
        block_stagger = get_total_stagger(after_block)
        stagger_bar += block_stagger
        stagger_threshold = max_health * 0.4     # m_staggerDamageFactor = 0.40
        was_staggered = stagger_bar >= stagger_threshold

        # 2i/2j. Block success or guard break
        have_stamina = True   # assume player has stamina for calculation purposes
        block_succeeded = have_stamina and not was_staggered

        if block_succeeded:
            block_damage(dmg, actual_blocked)
            # Successful block: status effects from the hit are prevented
        else:
            # GUARD BREAK — dmg is unchanged (only shield resistance applied above)
            # Player is staggered (~2 seconds stun)
            pass

    # ── 3. Resistance modifiers ───────────────────────────────────────
    # body_modifiers is the merged "best wins" from all armor pieces + status effects.
    apply_resistance(dmg, body_modifiers)

    # ── 4. Armor reduction ────────────────────────────────────────────
    apply_armor_to_damage_types(dmg, body_armor)

    # ── 5. DoT separation ─────────────────────────────────────────────
    fire_val   = dmg["m_fire"];    dmg["m_fire"]   = 0
    poison_val = dmg["m_poison"];  dmg["m_poison"] = 0
    spirit_val = dmg["m_spirit"];  dmg["m_spirit"] = 0

    # ── 6. Instant damage + stagger ───────────────────────────────────
    instant = sum(dmg[f] for f in ARMOR_FIELDS)   # remaining after DoT extraction
    if instant > 0.1:
        # Stagger bar accumulates from final physical+lightning damage
        stagger_dmg = get_total_stagger(dmg) * stagger_multiplier
        stagger_bar += stagger_dmg

    # ── 7. DoT delivery ───────────────────────────────────────────────
    fire_ticks   = simulate_burning_ticks(fire_val,   dmg_type="fire",   is_wet=is_wet)
    spirit_ticks = simulate_burning_ticks(spirit_val, dmg_type="spirit", is_wet=is_wet)
    poison_ticks = simulate_poison_ticks(poison_val, is_player=True)

    return {
        "instant_damage":   instant if instant > 0.1 else 0,
        "fire_dot":         fire_val,
        "spirit_dot":       spirit_val,
        "poison_dot":       poison_val,
        "frost_debuff":     dmg["m_frost"],
        "lightning_debuff": dmg["m_lightning"],
        "block_succeeded":  block_succeeded,
        "was_staggered":    was_staggered,
        "stagger_bar":      stagger_bar,
        "fire_ticks":       fire_ticks,
        "spirit_ticks":     spirit_ticks,
        "poison_ticks":     poison_ticks,
    }


def clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))
```

### SE_Burning — Fire & Spirit DoT simulation

> **Source:** Verified from IL disassembly of `SE_Burning.AddFireDamage`, `SE_Burning.AddSpiritDamage`, `SE_Burning.UpdateStatusEffect`, `StatusEffect.UpdateStatusEffect`, and `StatusEffect.ResetTime`.

```python
# ── SE_Burning prefab constants ────────────────────────────────────────
# Both the Burning and Spirit SE prefabs use the SAME C# class (SE_Burning).
# They differ only in these serialized values:
SE_BURNING_PREFAB = {
    "m_ttl":            5.0,    # total SE duration (seconds)
    "m_damageInterval": 1.0,    # seconds between ticks
}
SE_SPIRIT_PREFAB = {
    "m_ttl":            3.0,
    "m_damageInterval": 0.5,
}

class SE_Burning:
    """
    Simulates the SE_Burning status effect.
    Handles BOTH fire and spirit damage in a single instance.
    Verified from IL disassembly.
    """
    def __init__(self, prefab: dict):
        # From prefab (serialized)
        self.m_ttl = prefab["m_ttl"]
        self.m_damageInterval = prefab["m_damageInterval"]

        # Runtime state (C# default = 0.0)
        self.m_time = 0.0               # inherited from StatusEffect
        self.m_timer = 0.0              # counts down to next tick
        self.m_fireDamageLeft = 0.0     # remaining fire damage pool
        self.m_fireDamagePerHit = 0.0   # fire damage per tick
        self.m_spiritDamageLeft = 0.0   # remaining spirit damage pool
        self.m_spiritDamagePerHit = 0.0 # spirit damage per tick

    def reset_time(self):
        """StatusEffect.ResetTime — verified from IL."""
        self.m_time = 0.0

    def add_fire_damage(self, damage: float) -> bool:
        """SE_Burning.AddFireDamage — verified from IL."""
        num_ticks = int(self.m_ttl / self.m_damageInterval)   # 5 for fire
        damage_per_tick = damage / num_ticks

        if damage_per_tick < 0.2 and self.m_fireDamageLeft == 0:
            return False   # too small and no existing fire → reject

        self.m_fireDamageLeft += damage                                   # ACCUMULATE
        self.m_fireDamagePerHit = self.m_fireDamageLeft / num_ticks       # redistribute
        self.reset_time()                                                 # TTL restarts
        return True

    def add_spirit_damage(self, damage: float) -> bool:
        """SE_Burning.AddSpiritDamage — verified from IL. Identical structure."""
        num_ticks = int(self.m_ttl / self.m_damageInterval)   # 6 for spirit
        damage_per_tick = damage / num_ticks

        if damage_per_tick < 0.2 and self.m_spiritDamageLeft == 0:
            return False

        self.m_spiritDamageLeft += damage
        self.m_spiritDamagePerHit = self.m_spiritDamageLeft / num_ticks
        self.reset_time()
        return True

    def update(self, dt: float, is_wet: bool) -> list:
        """
        SE_Burning.UpdateStatusEffect — verified from IL.
        Returns list of (fire_tick, spirit_tick) tuples for ticks that fired this frame.
        """
        ticks = []

        # base.UpdateStatusEffect(dt) — increments m_time
        self.m_time += dt

        # Wet interaction: fire damage left > 0 and character is wet → 6× time speed
        if self.m_fireDamageLeft > 0 and is_wet:
            self.m_time += dt * 5   # total advancement = dt + dt*5 = 6×dt

        # Tick timer
        self.m_timer -= dt
        if self.m_timer > 0:
            return ticks   # not time yet

        # === TICK ===
        self.m_timer = self.m_damageInterval   # reset (1.0s fire, 0.5s spirit)

        fire_tick = self.m_fireDamagePerHit
        spirit_tick = self.m_spiritDamagePerHit

        self.m_fireDamageLeft   = max(0, self.m_fireDamageLeft   - self.m_fireDamagePerHit)
        self.m_spiritDamageLeft = max(0, self.m_spiritDamageLeft - self.m_spiritDamagePerHit)

        ticks.append((fire_tick, spirit_tick))
        return ticks

    def is_expired(self) -> bool:
        """SE expires when m_time >= m_ttl (checked by SEMan after each update)."""
        return self.m_ttl > 0 and self.m_time >= self.m_ttl

    def has_damage(self) -> bool:
        return self.m_fireDamageLeft > 0 or self.m_spiritDamageLeft > 0


def simulate_burning_ticks(
    damage: float,
    dmg_type: str,        # "fire" or "spirit"
    is_wet: bool = False,
    dt: float = 1/60,     # frame time (60 fps default)
) -> list:
    """
    Simulate SE_Burning from initial damage to expiry.
    Returns list of (time_seconds, tick_damage) tuples.

    This is a convenience function for predicting the full tick timeline
    without running a real game loop.
    """
    if damage <= 0:
        return []

    prefab = SE_BURNING_PREFAB if dmg_type == "fire" else SE_SPIRIT_PREFAB
    se = SE_Burning(prefab)

    if dmg_type == "fire":
        accepted = se.add_fire_damage(damage)
    else:
        accepted = se.add_spirit_damage(damage)

    if not accepted:
        return []

    ticks = []
    time = 0.0
    max_time = prefab["m_ttl"] + 1.0   # safety limit

    while time < max_time and not se.is_expired():
        fired = se.update(dt, is_wet)
        for fire_tick, spirit_tick in fired:
            tick_val = fire_tick if dmg_type == "fire" else spirit_tick
            if tick_val > 0:
                ticks.append((round(time, 3), round(tick_val, 6)))
        time += dt

    return ticks
```

### SE_Poison — Poison DoT simulation

> **Source:** Verified from IL disassembly of `SE_Poison.AddDamage` and `SE_Poison.UpdateStatusEffect`.

```python
class SE_Poison:
    """
    Simulates the SE_Poison status effect.
    Verified from IL disassembly.
    """
    # From prefab (serialized)
    M_DAMAGE_INTERVAL = 1.0       # ticks every 1 second
    M_BASE_TTL = 1.0              # base duration before damage scaling
    M_TTL_PER_DAMAGE_PLAYER = 5.0 # TTL scaling factor for players
    M_TTL_PER_DAMAGE = 1.0        # TTL scaling factor for mobs
    M_TTL_POWER = 0.5             # exponent (sqrt = sublinear scaling)

    def __init__(self):
        self.m_ttl = 0.0               # dynamic — calculated from damage
        self.m_time = 0.0              # inherited from StatusEffect
        self.m_timer = 0.0             # counts down to next tick
        self.m_damageLeft = 0.0        # remaining poison damage pool
        self.m_damagePerHit = 0.0      # poison damage per tick

    def reset_time(self):
        self.m_time = 0.0

    def add_damage(self, damage: float, is_player: bool = True):
        """
        SE_Poison.AddDamage — verified from IL.

        Key difference from fire: poison does NOT stack.
        - If damage < m_damageLeft → REJECTED (weaker poison ignored)
        - Otherwise → REPLACES the existing poison entirely
        """
        if damage < self.m_damageLeft:
            return   # weaker poison is silently ignored

        self.m_damageLeft = damage   # REPLACE, not accumulate!

        ttl_per_dmg = self.M_TTL_PER_DAMAGE_PLAYER if is_player else self.M_TTL_PER_DAMAGE

        # TTL formula: baseTTL + pow(damage * ttlPerDmg, ttlPower)
        # For players: 1.0 + sqrt(damage * 5.0)
        import math
        self.m_ttl = self.M_BASE_TTL + math.pow(self.m_damageLeft * ttl_per_dmg, self.M_TTL_POWER)

        num_ticks = int(self.m_ttl / self.M_DAMAGE_INTERVAL)
        if num_ticks < 1:
            num_ticks = 1
        self.m_damagePerHit = self.m_damageLeft / num_ticks

        self.reset_time()

    def update(self, dt: float) -> float:
        """
        SE_Poison.UpdateStatusEffect — verified from IL.
        Returns the tick damage if a tick fired this frame, else 0.
        """
        # base.UpdateStatusEffect(dt)
        self.m_time += dt

        # Tick timer
        self.m_timer -= dt
        if self.m_timer > 0:
            return 0

        # === TICK ===
        self.m_timer = self.M_DAMAGE_INTERVAL   # reset (1.0s)

        tick = self.m_damagePerHit
        self.m_damageLeft -= self.m_damagePerHit  # note: can go slightly negative (no clamp)

        return tick

    def is_expired(self) -> bool:
        return self.m_ttl > 0 and self.m_time >= self.m_ttl


def simulate_poison_ticks(
    damage: float,
    is_player: bool = True,
    dt: float = 1/60,
) -> list:
    """
    Simulate SE_Poison from initial damage to expiry.
    Returns list of (time_seconds, tick_damage) tuples.
    """
    if damage <= 0:
        return []

    se = SE_Poison()
    se.add_damage(damage, is_player)

    ticks = []
    time = 0.0
    max_time = se.m_ttl + 1.0

    while time < max_time and not se.is_expired():
        tick = se.update(dt)
        if tick > 0:
            ticks.append((round(time, 3), round(tick, 6)))
        time += dt

    return ticks
```

### Quick-reference: predicting DoT ticks without simulation

For cases where you just need the numbers without running the simulation loop:

```python
import math

def predict_fire_ticks(fire_damage: float) -> list:
    """Predict fire tick timeline (no stacking, no wet, single hit)."""
    TTL, INTERVAL = 5.0, 1.0
    num_ticks = int(TTL / INTERVAL)                  # 5
    if num_ticks < 1 or fire_damage <= 0:
        return []
    per_tick = fire_damage / num_ticks               # e.g. 20/5 = 4.0
    if per_tick < 0.2:
        return []                                     # below minimum threshold
    # First tick at t≈0 (instant), then every INTERVAL seconds
    return [(i * INTERVAL, per_tick) for i in range(num_ticks)]


def predict_spirit_ticks(spirit_damage: float) -> list:
    """Predict spirit tick timeline (no stacking, single hit)."""
    TTL, INTERVAL = 3.0, 0.5
    num_ticks = int(TTL / INTERVAL)                  # 6
    if num_ticks < 1 or spirit_damage <= 0:
        return []
    per_tick = spirit_damage / num_ticks             # e.g. 20/6 = 3.33
    if per_tick < 0.2:
        return []
    return [(i * INTERVAL, per_tick) for i in range(num_ticks)]


def predict_poison_ticks(poison_damage: float, is_player: bool = True) -> list:
    """Predict poison tick timeline (single application, no re-poisoning)."""
    if poison_damage <= 0:
        return []
    ttl_per_dmg = 5.0 if is_player else 1.0
    ttl = 1.0 + math.pow(poison_damage * ttl_per_dmg, 0.5)
    num_ticks = int(ttl / 1.0)                       # interval = 1.0s
    if num_ticks < 1:
        num_ticks = 1
    per_tick = poison_damage / num_ticks
    return [(i * 1.0, per_tick) for i in range(num_ticks)]


# ── Examples ───────────────────────────────────────────────────────────
# predict_fire_ticks(20)
#   → [(0.0, 4.0), (1.0, 4.0), (2.0, 4.0), (3.0, 4.0), (4.0, 4.0)]
#   Total: 20.0 over 5 ticks

# predict_spirit_ticks(20)
#   → [(0.0, 3.33), (0.5, 3.33), (1.0, 3.33), (1.5, 3.33), (2.0, 3.33), (2.5, 3.33)]
#   Total: 20.0 over 6 ticks

# predict_poison_ticks(20)
#   → [(0.0, 1.818), (1.0, 1.818), ..., (10.0, 1.818)]
#   Total: 20.0 over 11 ticks in 11 seconds
```

---

## Modifier Multiplier Table (quick reference)

| Modifier | Multiplier | Color in game |
|---|---|---|
| VeryWeak | ×2.00 | 🟡 Yellow |
| Weak | ×1.50 | 🟡 Yellow |
| SlightlyWeak | ×1.25 | 🟡 Yellow |
| Normal | ×1.00 | ⚪ White/Grey |
| SlightlyResistant | ×0.75 | 🟤 Grey |
| Resistant | ×0.50 | 🟤 Grey |
| VeryResistant | ×0.25 | 🟤 Grey |
| Immune | ×0.00 | — (no damage) |

---

## Stagger Bar Mechanics

The stagger bar is a hidden accumulator (`m_staggerDamage`) that fills up when the player takes physical damage. When it overflows, the player is staggered (stunned, can't act).

### Stagger threshold (confirmed from Player prefab)

```python
stagger_threshold = GetMaxHealth() * m_staggerDamageFactor
# For player: maxHealth * 0.4 = 40% of max HP
```

| Field | Player Value | Notes |
|---|---|---|
| `m_staggerDamageFactor` | **0.40** | Confirmed from asset bundle |
| `m_health` (base) | 100.0 | Before food buffs |

So at base 100 HP, the stagger threshold is **40 HP**. With food giving 200 HP, it would be **80 HP**.

### What counts as stagger damage

**Only physical + lightning** damage contributes to the stagger bar:

```python
def GetTotalStaggerDamage():
    return m_blunt + m_slash + m_pierce + m_lightning
    # Fire, frost, poison, spirit do NOT contribute!
```

This is different from blockable damage which includes all combat types.

### Stagger damage accumulation

```python
def AddStaggerDamage(damage, direction, hitData):
    if m_staggerDamageFactor <= 0:
        return 0   # can't be staggered
    
    seman.ModifyStagger(damage, ref damage)   # status effects can modify
    m_staggerDamage += damage
    
    threshold = GetMaxHealth() * m_staggerDamageFactor   # 40% of max HP
    
    if m_staggerDamage >= threshold:
        m_staggerDamage = threshold   # cap at threshold
        Stagger(direction)            # PLAYER IS STAGGERED!
        return 1                      # staggered = true
    
    return 0                          # not staggered
```

### Stagger bar decay

The stagger bar naturally decays over time:

```python
def UpdateStagger(dt):
    threshold = GetMaxHealth() * m_staggerDamageFactor
    decay_rate = threshold / 5.0   # decays by 1/5 of threshold per second
    m_staggerDamage -= decay_rate * dt
    if m_staggerDamage < 0:
        m_staggerDamage = 0
```

> At 100 HP base, the stagger bar decays at **8 HP/sec** (40/5). It takes **5 seconds** to fully decay from full. With 200 HP from food, decay is **16 HP/sec** and still takes 5 seconds from full.

### Stagger context: unblocked hits vs blocked hits

Stagger damage is added in **two places**:

1. **During a block** (Step 2h): stagger damage = remaining physical damage AFTER block-as-armor
2. **After the full pipeline** (Step 6, in `ApplyDamage`): stagger damage = physical damage after all reductions

```python
# In ApplyDamage (after resistances + armor):
stagger_dmg = hit.m_damage.GetTotalStaggerDamage() * hit.m_staggerMultiplier
AddStaggerDamage(stagger_dmg, hit.m_dir, hit)
```

> **Key implication:** If a block fails due to stagger, the player gets staggered during the block AND then takes full damage through the regular pipeline. The stagger from the unblocked hit could also contribute again in ApplyDamage (the bar is already at max so it doesn't re-trigger, but it's worth understanding the flow).

---

## Notes

- **Chop and Pickaxe** damage from mobs is generally not relevant against players (players have no chop/pickaxe resistance system, but these damage types do exist in mob attacks and pass through the armor formula).
- **World Level scaling** (`Game.m_worldLevel`) adds base damage and base AC to enemies but is typically 0 in normal gameplay.
- **Stagger bonus (×2.0)** and **backstab bonus** only apply when a **player attacks a mob**, not when mobs attack players.
- The armor formula has **no minimum damage floor** — very high armor can reduce damage to near-zero (e.g., 0.25 damage from a 10-damage hit against 100 armor).
- Status effects like the **Bonemass** forsaken power apply `Resistant` (×0.5) to all physical damage types (blunt/slash/pierce).
- **Blocking uses the armor formula**, not simple subtraction. Block power is treated as "armor" in the same quadratic/linear formula used for body armor.
- **Parries are free** — the player prefab has `m_perfectBlockStaminaDrain = 0.0`.
- **Shield resistances (Step 2e) are almost always skipped** — the code checks for `m_damageModifiers` on the shield, but current Valheim shields have empty modifier lists. Shields protect through **block power** (the armor formula), not through damage type resistance. The code path exists but doesn't fire in practice. If it did fire, shield and body resistances would stack **multiplicatively** (separate `ApplyResistance` calls).
- `GetTotalBlockableDamage` = blunt + slash + pierce + fire + frost + lightning + poison + spirit (everything except chop/pickaxe/generic `m_damage`).
- `GetTotalStaggerDamage` = blunt + slash + pierce + lightning **only** (fire/frost/poison/spirit do NOT stagger).
- The **parry window** is a hardcoded **0.25 seconds** after raising the block.
- Block **skill** scales block power: `blockPower = base × (1 + skillFactor × 0.5)` — at max skill, 50% more block power.
- A successful **parry** raises the Block skill at **2× rate** compared to a normal block (1× rate).

