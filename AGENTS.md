# AGENTS.md — Valheim Hit Simulator and Analyzer

## Architecture Overview

Angular single-page application — all calculation logic runs client-side in TypeScript. No backend required.

- **Frontend**: Angular app at the project root. Served via `ng serve` during development.
- All calculation logic lives in `src/app/core/damage-calculator.ts`. The UI components are organized by feature.

## File Structure

```
├── angular.json                                # Angular CLI configuration
├── package.json                                # npm scripts: start, build, test, test:calc
├── tsconfig.json                               # TypeScript configuration
├── src/
│   ├── index.html                              # Single-page entry point
│   ├── main.ts                                 # Angular bootstrap
│   ├── styles.scss                             # Global styles
│   ├── app/
│   │   ├── app.ts                              # Root component — tab navigation, calculation orchestration
│   │   ├── app.config.ts                       # App configuration (providers, HTTP, etc.)
│   │   ├── core/
│   │   │   ├── damage-calculator.ts            # All game math — single source of truth
│   │   │   ├── damage-calculator.service.ts    # Injectable wrapper around damage-calculator.ts
│   │   │   ├── form-state.service.ts           # Centralized form state management
│   │   │   ├── hit-simulator.service.ts        # Hit simulator state & DoT animation
│   │   │   ├── mob-preset.service.ts           # Mob attack preset data loading
│   │   │   ├── shield-preset.service.ts        # Shield preset data loading
│   │   │   ├── constants/                      # Shared constants (damage types, scenarios, etc.)
│   │   │   └── models/                         # TypeScript interfaces & types
│   │   ├── features/
│   │   │   ├── hit-analyzer/                   # Hit Analyzer tab (results table, step analysis)
│   │   │   ├── hit-simulator/                  # Hit Simulator tab (combat arena)
│   │   │   ├── mob-attack-form/                # Mob attack stats form
│   │   │   └── player-defense-form/            # Player defense stats form
│   │   └── shared/
│   │       ├── components/                     # Shared UI components (badges, dropdowns, toggles)
│   │       ├── directives/                     # Shared directives (tooltip)
│   │       └── pipes/                          # Shared pipes (formatNumber)
│   └── assets/
│       ├── data/
│       │   ├── mob-attacks.json                # Mob attack data
│       │   └── shields.json                    # Shield preset data
│       └── images/                             # All UI images (animations, creature/shield presets)
├── tests/
│   ├── damage-calculator.test.js               # Zero-dependency Node.js test runner
│   └── test-cases.json                         # Data-driven test fixtures
AGENTS.md                                       # This file
README.md                                       # Project documentation
DAMAGE_FORMULA.md                               # Damage formula documentation
STAGGER_MECHANICS.md                            # Stagger mechanics documentation
PLAN.md                                         # Migration plan notes
```

- `damage-calculator.ts` is a pure-function module with no DOM dependency — importable from both Angular services and Node.js tests.

## Developer Workflows

```powershell
# Serve the app locally
npm start

# Run Angular tests
npm test

# Run damage calculator unit tests
npm run test:calc
```

## Damage Pipeline

Every calculation produces **three scenarios in one call**: No Shield, Block, Parry (see `damage-calculator.ts → calculate()`).

```
effectiveDamage = baseDamage × (1 + difficultyBonus + starLevel × 0.5 + extraDamagePercent / 100)
                     ← bonuses are ADDITIVE, not multiplicative
```

Armor reduction formula (used for both block and body armor phases):
- If `armor < damage / 2` → `reduced = damage − armor`
- Else → `reduced = damage² / (armor × 4)`

Resistance modifiers (§3) — applied per damage type between block and body armor:
- Each type can have a multiplier (0.0–2.0) from the `RESISTANCE_PRESET` lookup
- Presets: Very Weak (200%), Weak (150%), Slightly Weak (125%), Neutral (100%), Slightly Resistant (75%), Resistant (50%), Very Resistant (25%), Immune (0%)
- The UI allows custom percentages as well

Stagger threshold = 40% of `maxHealth`. A player staggered on block cannot be double-staggered by armor (`staggeredOnBlock` gates armor stagger check).

DoT elimination — after armor reduction, DoT types (Fire, Spirit, Poison) are checked:
- Fire/Spirit: if `perTickDamage < 0.2`, the damage is disregarded (set to 0)
- The result is the **Adjusted Total Damage** = `armorReducedDamage − disregardedDotDamage`

## Key Conventions

**Naming — use explicit, unabbreviated variable and function names.** This is a hard rule for all new and modified code:
- **No abbreviations**: `effectiveBlockArmor` not `effBA`, `parryMultiplier` not `parryMult`, `formatNumber` not `fmt`, `riskFactor` not `rf`.
- **No single-letter or two-letter names**: `event` not `e`, `button` not `btn`, `element` not `el`, `viewportWidth` not `vw`.
- **Spell out `Health`**: `currentHealth` not `currentHp`, `simHealthCurrentEl` not `simHpCurrentEl`, `healthPercent` not `hpPct`.
- **Boolean prefixes**: use `is`/`has` — `isBlockLinear` not `blockLinear`, `hasPercentile` not `hasPct`.
- **Destructure aliases must also be explicit**: `{ isLinear: isBlockLinear }` not `{ isLinear: blockLinear }`.
- **Loop/callback parameters**: `testCase` not `tc`, `failure` not `f`, `error` not `e`.

When in doubt, prefer a longer descriptive name over a shorter ambiguous one.

**Angular Reactive Forms — never use string-based control access.** This is a hard rule for all Angular components:
- **Declare typed form control interfaces** (`FormGroup<T>`, `FormArray<T>`, `FormControl<T | null>`) for every form.
- **Access controls via `.controls.fieldName`** — `this.form.controls.parryMultiplierPreset.value`, not `this.form.get('parryMultiplierPreset')?.value`.
- **Build forms with `new FormGroup<T>({})`** and `new FormControl<T>(...)` directly — no `FormBuilder` injection needed.
- **Event handlers must not call `.get('string')`** in templates either. If a `(change)` handler previously passed `form.get('name')!.value`, remove the argument and read the control inside the method via `this.form.controls.fieldName`.
- `formControlName="..."` attribute binding in templates is unavoidable and fine — the ban applies only to TypeScript `.get(string)` calls.

**`damage-calculator.ts`** is a static-function-only module — all exports are pure functions, no class instantiation.

**Combat Difficulty** values: `VERY_EASY`, `EASY`, `NORMAL`, `HARD`, `VERY_HARD` — stored as keys in the `DIFFICULTY` frozen object. Enemy damage rates: 50% / 75% / 100% / 150% / 200%.

**Parry multiplier** can be supplied two ways:
- `parryMultiplier` — direct numeric value (preferred by the UI)
- `parryBonus` — legacy enum key (`X1`, `X1_5`, `X2`, `X2_5`, `X4`, `X6`) resolved via the `PARRY_BONUS` lookup

## Testing

Tests are data-driven via `tests/test-cases.json`. To add a new scenario, add a JSON object to that file — no code changes needed. Tolerance is `±0.001` for floating-point assertions.

```json
{
  "name": "descriptive label shown in test output",
  "mob":    { "baseDamage": 60.0, "starLevel": 1 },
  "player": { "maxHealth": 100.0, "blockingSkill": 0.0, "blockArmor": 20.0, "armor": 30.0, "parryMultiplier": 1.5, "resistanceModifiers": { "Fire": 0.5 } },
  "difficulty": "HARD",
  "useShield": true,
  "isParry": false,
  "expected": { ... }
}
```

## Key Files

| File | Purpose |
|---|---|
| `src/app/core/damage-calculator.ts` | All game math — single source of truth |
| `src/app/core/damage-calculator.service.ts` | Injectable Angular service wrapping the calculator |
| `src/app/core/form-state.service.ts` | Centralized form state with localStorage persistence |
| `src/app/app.ts` | Root component — tabs, calculation orchestration |
| `src/styles.scss` | Global styles |
| `tests/damage-calculator.test.js` | Node.js test runner |
| `tests/test-cases.json` | All test fixtures — extend here first |
| `package.json` | npm scripts: start, build, test, test:calc |

## Git Workflow

**Never push without explicit permission.** Commits stay local until the user explicitly asks to push. Do not run `git push` on your own.
