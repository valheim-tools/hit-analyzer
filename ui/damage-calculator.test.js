/**
 * Zero-dependency Node.js test runner for damage-calculator.js.
 *
 * Reads the same test-cases JSON used by the Java DamageCalculatorTest and
 * verifies that the JS port produces identical results (within ±0.001).
 *
 * Usage:  node --experimental-vm-modules ui/damage-calculator.test.js
 *    or:  node ui/damage-calculator.test.js          (Node 22+)
 */

import { calculate } from './damage-calculator.js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const casesPath = resolve(__dirname, 'test-cases.json');
const cases = JSON.parse(readFileSync(casesPath, 'utf-8'));

const TOLERANCE = 0.001;
let passed = 0;
let failed = 0;

function approxEqual(a, b, label) {
    if (Math.abs(a - b) > TOLERANCE) {
        return `  FAIL ${label}: expected ${b}, got ${a} (diff ${Math.abs(a - b).toFixed(6)})`;
    }
    return null;
}

for (const tc of cases) {
    const errors = [];

    // Build inputs in the same shape the UI sends
    const inputs = {
        rawDamage:          tc.mob.rawDamage,
        starLevel:          tc.mob.starLevel,
        extraDamagePercent: tc.mob.extraDamagePercent ?? 0,
        difficulty:         tc.difficulty,
        maxHealth:          tc.player.maxHealth,
        blockingSkill:      tc.player.blockingSkill,
        blockingArmor:      tc.player.blockingArmor,
        armor:              tc.player.armor,
    };

    // Resolve parry multiplier — prefer explicit, fall back to parryBonus enum
    if (tc.player.parryMultiplier != null) {
        inputs.parryMultiplier = tc.player.parryMultiplier;
    } else {
        inputs.parryBonus = tc.player.parryBonus;
    }

    let data;
    try {
        data = calculate(inputs);
    } catch (e) {
        errors.push(`  EXCEPTION: ${e.message}`);
        console.log(`✗ ${tc.name}`);
        errors.forEach(e => console.log(e));
        failed++;
        continue;
    }

    // Pick the scenario that the test case targets
    const result = !tc.useShield ? data.noShield : tc.isParry ? data.parry : data.block;
    const exp = tc.expected;

    // Assertions
    const checks = [
        approxEqual(data.baseRawDamage,             exp.baseRawDamage,           'baseRawDamage'),
        approxEqual(data.effectiveRawDamage,         exp.effectiveRawDamage,      'effectiveRawDamage'),
        approxEqual(result.blockingReducedDamage,    exp.blockingReducedDamage,   'blockingReducedDamage'),
        approxEqual(result.finalReducedDamage,       exp.finalReducedDamage,      'finalReducedDamage'),
        approxEqual(result.remainingHealth,           exp.remainingHealth,         'remainingHealth'),
    ];

    // Stagger (string comparison)
    if (result.stagger !== exp.stagger) {
        checks.push(`  FAIL stagger: expected ${exp.stagger}, got ${result.stagger}`);
    }
    // minHealthForNoStagger (exact int)
    if (result.minHealthForNoStagger !== exp.minHealthForNoStagger) {
        checks.push(`  FAIL minHealthForNoStagger: expected ${exp.minHealthForNoStagger}, got ${result.minHealthForNoStagger}`);
    }

    const failures = checks.filter(Boolean);
    if (failures.length) {
        console.log(`✗ ${tc.name}`);
        failures.forEach(f => console.log(f));
        failed++;
    } else {
        console.log(`✓ ${tc.name}`);
        passed++;
    }
}

console.log(`\n${passed} passed, ${failed} failed, ${cases.length} total`);
process.exit(failed > 0 ? 1 : 0);

