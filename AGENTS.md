# AGENTS.md — Valheim Damage Calculator

## Architecture Overview

Two-layer application sharing a single damage model:

- **Backend** (`src/main/java/valheim/calculator/`): Java 21 fat-jar with **two runtime modes**:
  - `--server` flag → `web.WebServer` starts a `com.sun.net.httpserver.HttpServer` on port 8080 (no Spring, no Jakarta EE — JDK built-in only)
  - No flag → interactive console via `InputReader`
- **Frontend** (`ui/`): Plain HTML + vanilla JS/CSS (`index.html`, `index.js`, `index.css`, `calculator-core.js`). Served as static files from the `ui/` directory by `WebServer`. Uses ES module `export` — no bundler.

All calculation logic lives exclusively in `core/DamageCalculator.java`. The web handler (`web/CalculateHandler`) and console (`Main`) are thin wrappers around it.

## Package Structure

```
valheim.calculator          ← entry point (Main)
valheim.calculator.console  ← console/interactive-mode utilities
valheim.calculator.core     ← domain model, pure game logic (no HTTP)
valheim.calculator.web      ← HTTP layer (handlers, DTOs, server setup)
```

- Add new domain types to `core`, new HTTP concerns to `web`, new console utilities to `console`.
- `core` must not import from `web` or `console`; `web` and `console` both import from `core`.

## Developer Workflows

```powershell
# Build + start server + open browser
.\launch.ps1

# Skip Maven rebuild (jar already built)
.\launch.ps1 -SkipBuild

# Stop the running server (finds process by port 8080)
.\stop.ps1

# Run tests
mvn test

# Console (interactive) mode
java -jar target\valheim-damage-calculator-1.0-SNAPSHOT.jar

# Server mode manually
java -jar target\valheim-damage-calculator-1.0-SNAPSHOT.jar --server
```

> `launch.ps1` **must be run from the project root** — `WebServer` resolves static files relative to `ui/` from the JVM working directory.

> Be pragmatic: do not overthink straightforward changes. Make the sensible edit, stage the relevant files, use a simple commit message, and push once the change is verified.

## Damage Pipeline

Every calculation always produces **three scenarios in one call**: No Shield, Block, Parry (see `DamageCalculator.calculate`).

```
effectiveRawDamage = rawDamage × (1 + difficultyBonus + starLevel × 0.5)
                     ← bonuses are ADDITIVE, not multiplicative
```

Armor reduction formula (used for both blocking and body armor phases):
- If `armor < damage / 2` → `reduced = damage − armor`
- Else → `reduced = damage² / (armor × 4)`

Stagger threshold = 40% of `maxHealth`. A player staggered on block cannot be double-staggered by armor (`staggeredOnBlocking` gates `staggeredOnArmor`).

## Key Conventions

**Use Java records for all POJOs** — data-only types with no mutable state must be records, not classes:
- Domain objects in `core`: `MobStats`, `PlayerStats`, `DamageResult` — records with Lombok `@Builder`
- HTTP DTOs in `web`: `CalculateRequest`, `CalculateResponse` — plain records, no Lombok, no Jackson annotations
- Jackson 2.12+ deserializes records natively via `Class.getRecordComponents()` — no `@JsonCreator` needed

**Construct domain records via `.builder()...build()`** (Lombok `@Builder`). Do not use the canonical constructor directly.

**`DamageCalculator`** is a static-methods-only utility class — never instantiate it.

**`GameDifficulty`** enum values are `NORMAL`, `HARD`, `VERY_HARD`. The string form is used directly in JSON (`difficulty` field). Validate new difficulty values against `GameDifficulty.valueOf()` in `CalculateHandler`.

**`ParryBonus`** enum values are `X1`, `X1_5`, `X2`, `X2_5`, `X4`, `X6` (the fixed set of parry multipliers available in-game). The string form is sent in JSON (`parryBonus` field) and resolved via `ParryBonus.valueOf()` in `CalculateHandler`. `PlayerStats` stores a `ParryBonus` and exposes a `parryMultiplier()` bridge method so `DamageCalculator` is unaware of the enum.

## Testing

Tests are data-driven via `src/test/resources/damage-calculator-test-cases.json`. To add a new scenario, add a JSON object to that file — no Java code changes needed. Use tolerance `0.001` for `assertEquals` on doubles (matches existing assertions in `DamageCalculatorTest`).

```json
{
  "name": "descriptive label shown in test output",
  "mob":    { "rawDamage": 60.0, "starLevel": 1 },
  "player": { "maxHealth": 100.0, "blockingSkill": 0.0, "blockingArmor": 20.0, "armor": 30.0, "parryBonus": "X1_5" },
  "difficulty": "HARD",
  "useShield": true,
  "isParry": false,
  "expected": { ... }
}
```

## Key Files

| File | Purpose |
|---|---|
| `core/DamageCalculator.java` | All game math — single source of truth |
| `core/DamageResult.java` | Output record (Lombok `@Builder`) |
| `core/MobStats.java` | Validates starLevel 0–3; computes effective damage |
| `core/PlayerStats.java` | Player stats record (Lombok `@Builder`) |
| `core/GameDifficulty.java` | Difficulty enum with `physicalDamageBonus` |
| `web/WebServer.java` | HTTP server setup; static file serving from `ui/` |
| `web/CalculateHandler.java` | `POST /calculate` — parses JSON, calls calculator, returns 3 scenarios |
| `web/CalculateRequest.java` | HTTP request record (plain record, no Lombok) |
| `web/CalculateResponse.java` | HTTP response record wrapping 3 `DamageResult`s |
| `console/InputReader.java` | Prompts + validation for interactive console mode |
| `console/ResultPrinter.java` | Formats and logs the three-scenario results table |
| `ui/index.html` | Main static UI markup |
| `ui/index.css` | Calculator page styling |
| `ui/index.js` | Calculator page behavior and rendering |
| `ui/calculator-core.js` | Sole frontend-to-backend bridge (`fetch` POST to `/calculate`) |
| `damage-calculator-test-cases.json` | All test fixtures — extend here first |



