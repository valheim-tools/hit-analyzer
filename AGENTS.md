# AGENTS.md — Valheim Hit Simulator and Analyzer

## Architecture Overview

Pure static-site application — all calculation logic runs client-side in vanilla JavaScript ES modules. No backend required.

- **Frontend**: `index.html` at the project root, source code in `src/`. Served as static files by any HTTP server (e.g., `serve.ps1` via Node.js).
- All calculation logic lives in `src/damage-calculator.js`. The UI (`src/index.js`) is a thin wrapper that collects form values and renders results.

## File Structure

```
index.html                              # Single-page UI (web root entry point)
src/
├── assets/
│   └── styles/
│       ├── index.css                   # Styles
│       └── mobile.css                  # Mobile-specific styles
├── data/
│   └── mob-attacks.json                # Mob attack data (synced from output/valheim_mob_damage.json)
├── damage-calculator.js                # All game math — single source of truth
├── index.js                            # UI logic — form handling, rendering, tab navigation, hit simulator
└── mobile.js                           # Mobile UI helpers
tests/
├── damage-calculator.test.js           # Zero-dependency Node.js test runner
└── test-cases.json                     # Data-driven test fixtures
build.js                                # Production build script (minifies to dist/)
serve.ps1                               # Static file server (Node.js, port 3001) — kills existing process on port before starting
package.json                            # npm test / npm run serve / npm run build
AGENTS.md                               # This file
README.md                               # Project documentation
```

- `damage-calculator.js` is a pure ES module with no DOM dependency — importable from both the browser and Node.js tests.
- `index.js` is browser-only (DOM access).

## Developer Workflows

```powershell
# Serve the app locally and open the browser
.\serve.ps1

# Serve on a custom port
.\serve.ps1 -Port 8080

# Run tests
npm test

# Or directly
node tests/damage-calculator.test.js
```

> `serve.ps1` must be run from the project root — it serves the project root directory.
> `serve.ps1` automatically kills any process already listening on the target port before starting.


## Damage Pipeline

Every calculation produces **three scenarios in one call**: No Shield, Block, Parry (see `damage-calculator.js → calculate()`).

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
- Fire/Spirit: if `perTickDamage < 0.2`, the damage is eliminated (set to 0)
- The result is the **Adjusted Total Damage** = `armorReducedDamage − eliminatedDotDamage`

## Key Conventions

**Naming — use explicit, unabbreviated variable and function names.** This is a hard rule for all new and modified code:
- **No abbreviations**: `effectiveBlockArmor` not `effBA`, `parryMultiplier` not `parryMult`, `formatNumber` not `fmt`, `riskFactor` not `rf`.
- **No single-letter or two-letter names**: `event` not `e`, `button` not `btn`, `element` not `el`, `viewportWidth` not `vw`.
- **Spell out `Health`**: `currentHealth` not `currentHp`, `simHealthCurrentEl` not `simHpCurrentEl`, `healthPercent` not `hpPct`.
- **Boolean prefixes**: use `is`/`has` — `isBlockLinear` not `blockLinear`, `hasPercentile` not `hasPct`.
- **Destructure aliases must also be explicit**: `{ isLinear: isBlockLinear }` not `{ isLinear: blockLinear }`.
- **Loop/callback parameters**: `testCase` not `tc`, `failure` not `f`, `error` not `e`.

When in doubt, prefer a longer descriptive name over a shorter ambiguous one.

**`damage-calculator.js`** is a static-function-only module — all exports are pure functions, no class instantiation.

**Difficulty** values: `NORMAL`, `HARD`, `VERY_HARD` — stored as keys in the `DIFFICULTY` frozen object.

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
| `src/damage-calculator.js` | All game math — single source of truth |
| `src/index.js` | UI logic — form state, rendering, calculation history |
| `index.html` | Single-page HTML |
| `src/assets/styles/index.css` | Styles |
| `tests/damage-calculator.test.js` | Zero-dependency Node.js test runner |
| `tests/test-cases.json` | All test fixtures — extend here first |
| `serve.ps1` | Static file server (Node.js) |
| `build.js` | Production build — minifies to dist/ |
| `package.json` | npm scripts for test, serve, and build |

## Git Workflow


**Never push without explicit permission.** Commits stay local until the user explicitly asks to push. Do not run `git push` on your own.
