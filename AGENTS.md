# AGENTS.md — Valheim Damage Taken Calculator

## Architecture Overview

Pure static-site application — all calculation logic runs client-side in vanilla JavaScript ES modules. No backend required.

- **Frontend** (`ui/`): `index.html`, `damage-calculator.js`, `index.js`, `index.css`. Served as static files by any HTTP server (e.g., `serve.ps1` via Node.js).
- All calculation logic lives in `ui/damage-calculator.js`. The UI (`index.js`) is a thin wrapper that collects form values and renders results.

## File Structure

```
ui/
├── index.html                  # Single-page UI
├── index.css                   # Styles
├── index.js                    # UI logic — form handling, rendering, tab navigation, hit simulator
├── damage-calculator.js        # All game math — single source of truth
├── damage-calculator.test.js   # Zero-dependency Node.js test runner
└── test-cases.json             # Data-driven test fixtures
serve.ps1                       # Static file server (Node.js, port 3001) — kills existing process on port before starting
package.json                    # npm test / npm run serve
AGENTS.md                       # This file
README.md                       # Project documentation
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
node ui/damage-calculator.test.js
```

> `serve.ps1` must be run from the project root — it resolves `ui/` relative to the script directory.
> `serve.ps1` automatically kills any process already listening on the target port before starting.


## Damage Pipeline

Every calculation produces **three scenarios in one call**: No Shield, Block, Parry (see `damage-calculator.js → calculate()`).

```
effectiveRawDamage = rawDamage × (1 + difficultyBonus + starLevel × 0.5 + extraDamagePercent / 100)
                     ← bonuses are ADDITIVE, not multiplicative
```

Armor reduction formula (used for both block and body armor phases):
- If `armor < damage / 2` → `reduced = damage − armor`
- Else → `reduced = damage² / (armor × 4)`

Stagger threshold = 40% of `maxHealth`. A player staggered on block cannot be double-staggered by armor (`staggeredOnBlock` gates armor stagger check).

## Key Conventions

**Naming — use explicit, unabbreviated variable and function names.** This is a hard rule for all new and modified code:
- **No abbreviations**: `effectiveBlockArmor` not `effBA`, `parryMultiplier` not `parryMult`, `formatNumber` not `fmt`, `percentile` not `pct`.
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

Tests are data-driven via `ui/test-cases.json`. To add a new scenario, add a JSON object to that file — no code changes needed. Tolerance is `±0.001` for floating-point assertions.

```json
{
  "name": "descriptive label shown in test output",
  "mob":    { "rawDamage": 60.0, "starLevel": 1 },
  "player": { "maxHealth": 100.0, "blockingSkill": 0.0, "blockArmor": 20.0, "armor": 30.0, "parryMultiplier": 1.5 },
  "difficulty": "HARD",
  "useShield": true,
  "isParry": false,
  "expected": { ... }
}
```

## Key Files

| File | Purpose |
|---|---|
| `ui/damage-calculator.js` | All game math — single source of truth |
| `ui/index.js` | UI logic — form state, rendering, calculation history |
| `ui/index.html` | Single-page HTML |
| `ui/index.css` | Styles |
| `ui/damage-calculator.test.js` | Zero-dependency Node.js test runner |
| `ui/test-cases.json` | All test fixtures — extend here first |
| `serve.ps1` | Static file server (Node.js) |
| `package.json` | npm scripts for test and serve |
