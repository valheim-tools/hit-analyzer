# ⚔ Valheim Damage Taken Calculator

A tool for calculating physical damage taken in Valheim, accounting for difficulty scaling, star levels, blocking, parrying, and body armor — across three scenarios simultaneously.

Runs entirely in the browser as a static site — no backend required.

---

## Features

- **Three scenarios in one calculation** — No Shield, Block, and Parry results side by side
- **Damage pipeline** — Step-by-step breakdown: Effective Damage → Block-Reduced → Final Damage → Remaining Health
- **Stagger detection** — Shows whether the player is staggered on block or on armor, as a single unified result
- **Difficulty & star scaling** — Normal / Hard / Very Hard and 0–3 star mob bonuses (additive, not multiplicative)
- **Calculation history** — Last 10 results saved in localStorage, with optional custom labels and per-entry delete
- **Tooltips** — Inline `?` badges on key result rows explain each value
- **Zero dependencies** — Pure vanilla JS ES modules, no build step

---

## Damage Pipeline

| Step | What happens |
|------|-------------|
 **1**  Base damage is scaled by difficulty, star & extra damage bonuses → **Effective Damage**
| **2** | Effective damage is reduced by shield / block armor → **Block-Reduced Damage** |
| **3** | Remaining damage is reduced by body armor → **Final Damage Damage** |
| **4** | Final damage is subtracted from Max Health → **Remaining Health** |

Stagger threshold = **40% of Max Health**. A block-stagger prevents a second armor-stagger on the same hit.

---

## Tech Stack

- **Frontend** — Plain HTML + vanilla JS ES modules, no bundler, no framework
- **Tests** — Zero-dependency Node.js test runner, data-driven from `test-cases.json`
- **Dev server** — PowerShell script using Node.js built-in `http` module

---

## Getting Started

### Prerequisites

- Node.js 18+ (for running tests and the dev server)
- PowerShell (for `serve.ps1`)

### Serve locally

```powershell
# Start local server on port 3000 and open the browser
.\serve.ps1

# Or on a custom port
.\serve.ps1 -Port 8080
```

### Run tests

```powershell
npm test
```

Test cases live in `ui/test-cases.json`. To add a scenario, append a JSON object — no code changes needed.

---

## Project Structure

```
ui/
├── index.html                  # Single-page UI
├── index.css                   # Styles
├── index.js                    # UI logic — form handling, rendering, history
├── damage-calculator.js        # All game math — single source of truth
├── damage-calculator.test.js   # Zero-dependency Node.js test runner
└── test-cases.json             # Data-driven test fixtures
serve.ps1                       # Static file server (Node.js, port 3000)
package.json                    # npm scripts for test and serve
```

---

## Hosting

The `ui/` directory is a self-contained static site. Deploy its contents to any static host:

- **GitHub Pages** — point to the `ui/` folder
- **Netlify / Vercel** — set publish directory to `ui/`
- **Any HTTP server** — serve the `ui/` folder as the document root
