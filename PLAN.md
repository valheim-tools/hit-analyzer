# Plan: Multi-Damage-Type Calculator with Shield Presets, Extended Mob Presets & DoT

Overhaul the calculator to process per-type damage maps (`{ Blunt: 40, Fire: 20 }`) through the verified Valheim pipeline: difficulty scaling → block/parry (armor formula on total blockable) → body armor (sum all types → formula → proportional ratio) → DoT extraction (fire/poison/spirit become ticking damage). Adds shield presets from [`valheim_armor_stats.json`](output/valheim_armor_stats.json) (including `parry_bonus`), biome-grouped mob attacks from [`valheim_mob_damage.json`](output/valheim_mob_damage.json), and an animated DoT drain in the hit simulator with a user-adjustable speed slider placed below the hit buttons.

---

## Steps

### 1. Reorganize image assets and copy preset icons into `src/`

- Move the 6 existing animation images (`greydwarf.png`, `viking.png`, `projectile.png`, `blue-shield.png`, `yellow-shield.png`, `red-shield.png`) from `src/assets/images/` into `src/assets/images/animations/`.
- Copy the 15 shield icon PNGs from `output/icons/Shield*.png` into `src/assets/images/presets/shields/`.
- Copy the ~80 mob icon PNGs from `output/icons/mobs/*.png` into `src/assets/images/presets/mobs/`.
- Update all references in [`index.html`](index.html) (6 `<img>` `src` attributes) and [`index.js`](src/index.js) (`SHIELD_IMAGE_BLOCK`, `SHIELD_IMAGE_PARRY`, `SHIELD_IMAGE_BROKEN`) to use the new `src/assets/images/animations/` path.
- Update [`build.js`](build.js):
  - Replace the `'src/assets/images/' → './'` path rewrite with `'src/assets/images/animations/' → './animations/'` and add `'src/assets/images/presets/' → './presets/'`.
  - Replace the 6 explicit image entries in `DEPLOY_FILES` with their new `animations/` output paths.
  - Add a directory-copy helper using `readdir` + `copyFile` to bulk-copy `src/assets/images/presets/shields/` → `dist/presets/shields/` and `src/assets/images/presets/mobs/` → `dist/presets/mobs/` (avoiding 95+ explicit entries).

### 2. Copy data files into `src/data/`

- Copy [`output/valheim_armor_stats.json`](output/valheim_armor_stats.json) into `src/data/shields.json`.
- Copy [`output/valheim_mob_damage.json`](output/valheim_mob_damage.json) into `src/data/mob-attacks.json` (replaces [`mob-presets.json`](src/assets/data/mob-presets.json)).
- Add both new JSON files to the build in [`build.js`](build.js) (`DEPLOY_FILES` entries + corresponding `PATH_REWRITES`).

### 3. Refactor the core pipeline in [`damage-calculator.js`](src/damage-calculator.js) to accept a `damageTypes` map

- The `calculate()` input gains a `damageTypes` object keyed by type name (`Blunt`, `Slash`, `Pierce`, `Fire`, `Frost`, `Lightning`, `Poison`, `Spirit`).
- Per [DAMAGE_FORMULA.md §4c](DAMAGE_FORMULA.md), armor applies to the **sum** of all 8 types then distributes the reduction **proportionally** — so `applyArmorReduction` becomes a function that takes a damage map + armor value, computes `applyArmorSingle(total, armor)`, and scales every type by the resulting ratio.
- Block (§2f) works identically: block power is fed into the same armor formula on total blockable damage, yielding `actualBlocked`, then `blockDamage()` reduces all blockable types by the `remaining / totalBlockable` ratio.
- Stagger (§2h, §Stagger Bar) only sums `Blunt + Slash + Pierce + Lightning`.
- After armor, DoT extraction (§5) zeroes `Fire`, `Poison`, `Spirit` from the instant hit and returns them separately — `Frost` and `Lightning` stay in the instant hit.
- Difficulty/star/extra bonuses apply uniformly to all types (rename `physicalDamageBonus` to `damageBonus`).
- Backward-compat: if a plain `baseDamage` number is passed, treat it as `{ Blunt: baseDamage }`.
- Add DoT tick prediction functions:
  - `predictFireTicks(fireValue)` — 5 ticks, 1s interval, 5s TTL
  - `predictSpiritTicks(spiritValue)` — 6 ticks, 0.5s interval, 3s TTL
  - `predictPoisonTicks(poisonValue)` — dynamic TTL = `1 + √(dmg×5)`, 1s interval
- The return value gains:
  - `damageBreakdown` — per-type values at each pipeline stage
  - `instantDamage` — total instant HP loss
  - `dotBreakdown: { fire: { total, ticks[] }, spirit: { total, ticks[] }, poison: { total, ticks[] } }`

### 4. Add shield preset system using `src/data/shields.json`

- Add `calculateShieldBlockPower(blockArmor, blockPerLevel, quality)` as a pure function: `base = blockArmor + max(0, quality - 1) * blockPerLevel` per §2c.
- In [`index.html`](index.html), add a "Shield" dropdown above the Block Armor field listing all 15 shields + "Custom", plus a quality selector (1–3).
- Selecting a shield auto-fills both the Block Armor field (computed base at selected quality) and the Parry Multiplier (from the shield's `parry_bonus` field).
- Show the shield icon from `src/assets/images/presets/shields/{prefab}.png` next to the dropdown.
- Wire up in [`index.js`](src/index.js): `syncShieldUi()`, persist in `collectFormState()`/`applyForm()`, keep manual Block Armor / Parry Multiplier override when "Custom" is selected.

### 5. Replace mob presets with biome-grouped multi-attack data from `src/data/mob-attacks.json`

- Rewrite `populateMobPresets()` in [`index.js`](src/index.js) to render `<optgroup label="Meadows">`, etc., with `<option>` per attack showing `"Mob — Attack (types)"` (e.g., `"Surtling — Fireball (10 Blunt + 40 Fire)"`).
- Update `extractMobFields()` to return the full `damageTypes` map (extract non-metadata keys).
- Replace the single "Base Damage" input with a damage-type input area: when a preset is selected, show read-only per-type color-coded badges; when "Custom", show an add-type-row form.
- Swap the arena mob icon to `src/assets/images/presets/mobs/{prefab}.png`.

### 6. Extend the detailed calculator tab to show per-type breakdown and DoT

- In the results table, add rows:
  - "Damage Breakdown" — color-coded per-type badges
  - "Instant Damage" — sum of blunt + slash + pierce + frost + lightning
  - "DoT Damage" — fire/spirit/poison totals with tick info (e.g., `"🔥 4.0 × 5 ticks over 5s"`)
- In `renderFormula()`:
  - Show per-type values at Step 1
  - Show the proportional ratio applied to each type at Step 4
  - Add a new Step 5 for DoT extraction + tick timeline

### 7. Integrate DoT into the hit simulator with a speed slider below the hit buttons

- After instant damage in `performHit()`, if `dotBreakdown` has ticks, start an animated DoT drain.
- Add a **"DoT Speed" slider** (`<input type="range" min="1" max="10" value="3" step="0.5">`) in the simulator UI **below the hit buttons** (below `div.sim-hit-row`).
- During playback:
  - Disable hit buttons
  - Iterate ticks via `setTimeout(interval / speedMultiplier)`
  - Subtract each tick from `simState.currentHealth`
  - Update health bar with a pulsing CSS class (fire → orange `sim-dot-fire`, poison → green `sim-dot-poison`, spirit → purple `sim-dot-spirit`)
  - Log each tick as a sub-entry
- Re-enable buttons when all ticks complete.
- No DoT stacking across hits.

### 8. Update styles and tests

- In [`index.css`](src/assets/styles/index.css):
  - Add damage-type badge colors (Blunt grey, Slash silver, Pierce brown, Fire orange, Frost cyan, Lightning yellow, Poison green, Spirit purple)
  - Add DoT pulse animations (`@keyframes`)
  - Add DoT speed slider styling
- In [`test-cases.json`](tests/test-cases.json):
  - Add multi-type test cases (e.g., Surtling `{ Blunt: 10, Fire: 40 }`, Bonemass punch `{ Blunt: 80, Poison: 50 }`, pure poison Blob `{ Poison: 90 }`, mixed parry scenario)
  - Assert on `instantDamage`, `dotBreakdown`, and per-type values
  - Add backward-compat tests for plain `baseDamage`
- Update [`damage-calculator.test.js`](tests/damage-calculator.test.js) to handle the new output shape.

---

## UI Fixes (Angular port)

### Fix 1 — Mob preset search shows mob header but no attacks

**File:** `src/app/shared/components/preset-dropdown/preset-dropdown.component.ts`

In `filteredGroups` computed, when a subgroup's `subGroupLabel` matches the query but none of its items' `label` fields contain the query (attack labels are `"Log Swing V (70 Blunt)"` — they do NOT embed the mob name), the subgroup is retained with an **empty items array**. The mob header row renders but zero attack rows appear beneath it.

**Fix:** When `subGroup.subGroupLabel.toLowerCase().includes(query)` is true, keep **all** of the subgroup's original items (not the filtered-to-zero list).

```typescript
// Before
const matchingSubGroups = group.subGroups
  .map(subGroup => ({
    ...subGroup,
    items: subGroup.items.filter(item => item.label.toLowerCase().includes(query)),
  }))
  .filter(subGroup => subGroup.items.length > 0 || subGroup.subGroupLabel.toLowerCase().includes(query));

// After
const matchingSubGroups = group.subGroups
  .map(subGroup => {
    const subGroupNameMatches = subGroup.subGroupLabel.toLowerCase().includes(query);
    const matchingItems = subGroup.items.filter(item => item.label.toLowerCase().includes(query));
    return {
      ...subGroup,
      items: subGroupNameMatches ? subGroup.items : matchingItems,
    };
  })
  .filter(subGroup => subGroup.items.length > 0);
```

---

### Fix 2 — Mob header text not bold

**File:** `src/app/shared/components/preset-dropdown/preset-dropdown.component.scss`

Add `font-weight: 700;` and a slightly brighter colour to `.preset-dropdown-subgroup-header`.

---

### Fix 3 — Dropdown option text too large

**File:** `src/app/shared/components/preset-dropdown/preset-dropdown.component.scss`

Reduce `.preset-dropdown-option { font-size }` from `0.8rem` → `0.72rem`.  
Icon size (`width/height: 30px`) and button/trigger dimensions stay unchanged.

---

### Fix 4 — HP bar too bright

**File:** `src/styles.scss`

Change `.sim-bar-fill { background-color: $color-gold }` (`#ccaf5e`) to a darker, less saturated gold (`#7a6e38`).

---

### Fix 5 — Dropdown images not pre-loaded

**File:** `src/app/shared/components/preset-dropdown/preset-dropdown.component.ts`

`getSubgroupImageLoading` currently returns `'eager'` only for the first 2 groups; `getOptionImageLoading` only for the first 8 items.  
Change both to always return `'eager'` so all preset icons are fetched as soon as the component mounts (dropdown hidden state does not block eager loading in Chrome/Firefox).

---

### Fix 6 — +Add Resistance / +Add Extra Damage Bonus buttons hard to see

**Files:**
- `src/app/features/player-defense-form/player-defense-form.component.scss` (`.add-resistance-type-btn`)
- `src/app/features/mob-attack-form/mob-attack-form.component.scss` (`.add-extra-damage-btn`)

Both use `border: 1px dashed $color-gold-darker` (`#544828`) on a `#2d2a1e` background — very low contrast.

**Fix:** Raise border to `#8a7040`, text colour to `#b8a060`, add `background: rgba(84, 72, 40, 0.25)` at rest and `rgba(84, 72, 40, 0.4)` on hover.
