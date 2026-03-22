# ⚔ Valheim Damage Calculator

A tool for calculating physical damage in Valheim, accounting for difficulty scaling, star levels, blocking, parrying, and body armor — across three scenarios simultaneously.

---

## Features

- **Three scenarios in one calculation** — No Shield, Block, and Parry results side by side
- **Damage pipeline** — Step-by-step breakdown: Effective Damage → Blocking-Reduced → Final/Armor-Reduced → Remaining Health
- **Stagger detection** — Shows whether the player is staggered on block or on armor, as a single unified result
- **Difficulty & star scaling** — Normal / Hard / Very Hard and 0–3 star mob bonuses (additive, not multiplicative)
- **Calculation history** — Last 10 results saved in localStorage, with optional custom labels and per-entry delete
- **Tooltips** — Inline `?` badges on key result rows explain each value

---

## Damage Pipeline

| Step | What happens |
|------|-------------|
| **1** | Raw damage is scaled by difficulty & star bonuses → **Effective Damage** |
| **2** | Effective damage is reduced by shield / blocking armor → **Blocking-Reduced Damage** |
| **3** | Remaining damage is reduced by body armor → **Final/Armor-Reduced Damage** |
| **4** | Final damage is subtracted from Max Health → **Remaining Health** |

Stagger threshold = **40% of Max Health**. A block-stagger prevents a second armor-stagger on the same hit.

---

## Tech Stack

- **Backend** — Java 21, JDK built-in `com.sun.net.httpserver.HttpServer` (no Spring / Jakarta EE), Lombok, Jackson
- **Frontend** — Plain HTML + vanilla JS ES module, no bundler
- **Build** — Maven (fat-jar via Maven Shade Plugin)
- **Tests** — JUnit 5, data-driven from `damage-calculator-test-cases.json`

---

## Getting Started

### Prerequisites

- Java 21+
- Maven 3.8+
- PowerShell (for the launch scripts)

### Build & Run

```powershell
# Build the fat-jar, start the server on port 8080, and open the browser
.\launch.ps1

# Skip Maven rebuild if the jar is already built
.\launch.ps1 -SkipBuild

# Stop the running server (kills the process on port 8080)
.\stop.ps1
```

> `launch.ps1` must be run from the project root — the server resolves `ui/` relative to the JVM working directory.

### Manual run

```powershell
# Server mode
java -jar target\valheim-damage-calculator-1.0-SNAPSHOT.jar --server

# Interactive console mode
java -jar target\valheim-damage-calculator-1.0-SNAPSHOT.jar
```

### Tests

```powershell
mvn test
```

Test cases live in `src/test/resources/damage-calculator-test-cases.json`. To add a scenario, append a JSON object — no Java changes needed.

---

## Project Structure

```
src/main/java/valheim/calculator/
├── Main.java                        # Entry point — server or console mode
├── console/
│   ├── InputReader.java             # Interactive console prompts
│   └── ResultPrinter.java          # Console results table
├── core/
│   ├── DamageCalculator.java        # All game math (static utility)
│   ├── DamageResult.java            # Per-scenario result record
│   ├── GameDifficulty.java          # NORMAL / HARD / VERY_HARD enum
│   ├── MobStats.java                # Raw damage + star level record
│   ├── ParryBonus.java              # Parry multiplier enum
│   ├── PlayerStats.java             # Player stats record
│   └── StaggerResult.java          # ON_BLOCK / ON_ARMOR / NONE enum
└── web/
    ├── WebServer.java               # HttpServer setup + static file serving
    ├── CalculateHandler.java        # POST /calculate
    ├── CalculateRequest.java        # Request DTO record
    ├── CalculateResponse.java       # Response DTO record
    └── HealthHandler.java           # GET /health

ui/
├── index.html                       # Single-page UI
└── calculator-core.js              # fetch wrapper (only file that knows about the backend)
```

---

## API

### `POST /calculate`

**Request**
```json
{
  "rawDamage": 60.0,
  "starLevel": 1,
  "difficulty": "HARD",
  "maxHealth": 100.0,
  "blockingSkill": 15.0,
  "blockingArmor": 28.0,
  "armor": 42.0,
  "parryBonus": "X2_5"
}
```

**Response**
```json
{
  "baseRawDamage": 60.0,
  "effectiveRawDamage": 120.0,
  "noShield": { "scenarioName": "No Shield", "blockingReducedDamage": 120.0, "finalReducedDamage": 47.8, "remainingHealth": 52.2, "stagger": "NONE" },
  "block":    { "scenarioName": "Block",     "blockingReducedDamage": 47.8,  "finalReducedDamage": 13.6, "remainingHealth": 86.4, "stagger": "NONE" },
  "parry":    { "scenarioName": "Parry",     "blockingReducedDamage": 11.9,  "finalReducedDamage": 3.4,  "remainingHealth": 96.6, "stagger": "NONE" }
}
```

Valid values:
- `difficulty`: `NORMAL` | `HARD` | `VERY_HARD`
- `starLevel`: `0` – `3`
- `parryBonus`: `X1` | `X1_5` | `X2` | `X2_5` | `X4` | `X6`
- `stagger`: `ON_BLOCK` | `ON_ARMOR` | `NONE`

