/**
 * Zero-dependency Node.js test runner for damage-calculator.js.
 *
 * Reads test-cases.json and verifies results within ±0.001 tolerance.
 *
 * Usage:  node tests/damage-calculator.test.js
 */

import { calculate } from '../src/damage-calculator.js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const casesPath = resolve(__dirname, 'test-cases.json');
const cases = JSON.parse(readFileSync(casesPath, 'utf-8'));

const TOLERANCE = 0.001;
let passed = 0;
let failed = 0;

function approxEqual(actual, expected, label) {
    if (Math.abs(actual - expected) > TOLERANCE) {
        return `  FAIL ${label}: expected ${expected}, got ${actual} (diff ${Math.abs(actual - expected).toFixed(6)})`;
    }
    return null;
}

for (const testCase of cases) {
    const errors = [];

    // Build inputs in the same shape the UI sends
    const inputs = {
        starLevel:          testCase.mob.starLevel,
        extraDamagePercent: testCase.mob.extraDamagePercent ?? 0,
        difficulty:         testCase.difficulty,
        maxHealth:          testCase.player.maxHealth,
        blockingSkill:      testCase.player.blockingSkill,
        blockArmor:         testCase.player.blockArmor,
        armor:              testCase.player.armor,
    };

    // Support both damageTypes map and legacy baseDamage
    if (testCase.mob.damageTypes != null) {
        inputs.damageTypes = testCase.mob.damageTypes;
    } else {
        inputs.baseDamage = testCase.mob.baseDamage;
    }

    // Resolve parry multiplier — prefer explicit, fall back to parryBonus enum
    if (testCase.player.parryMultiplier != null) {
        inputs.parryMultiplier = testCase.player.parryMultiplier;
    } else {
        inputs.parryBonus = testCase.player.parryBonus;
    }

    // Resistance modifiers (optional)
    if (testCase.player.resistanceModifiers != null) {
        inputs.resistanceModifiers = testCase.player.resistanceModifiers;
    }

    let data;
    try {
        data = calculate(inputs);
    } catch (error) {
        errors.push(`  EXCEPTION: ${error.message}`);
        console.log(`✗ ${testCase.name}`);
        errors.forEach(errorLine => console.log(errorLine));
        failed++;
        continue;
    }

    // Pick the scenario that the test case targets
    const result = !testCase.useShield ? data.noShield : testCase.isParry ? data.parry : data.block;
    const expected = testCase.expected;

    // Standard assertions
    const checks = [
        approxEqual(data.baseDamage,             expected.baseDamage,           'baseDamage'),
        approxEqual(data.effectiveDamage,        expected.effectiveDamage,      'effectiveDamage'),
        approxEqual(result.blockReducedDamage,   expected.blockReducedDamage,   'blockReducedDamage'),
        approxEqual(result.finalReducedDamage,   expected.finalReducedDamage,   'finalReducedDamage'),
        approxEqual(result.remainingHealth,      expected.remainingHealth,      'remainingHealth'),
    ];

    // Stagger (string comparison)
    if (result.stagger !== expected.stagger) {
        checks.push(`  FAIL stagger: expected ${expected.stagger}, got ${result.stagger}`);
    }
    // minHealthForNoStagger (exact int)
    if (result.minHealthForNoStagger !== expected.minHealthForNoStagger) {
        checks.push(`  FAIL minHealthForNoStagger: expected ${expected.minHealthForNoStagger}, got ${result.minHealthForNoStagger}`);
    }

    // Optional: instantDamage assertion (new multi-type tests)
    if (expected.instantDamage != null) {
        checks.push(approxEqual(result.instantDamage, expected.instantDamage, 'instantDamage'));
    }

    // Optional: resistanceReducedDamage assertion
    if (expected.resistanceReducedDamage != null) {
        checks.push(approxEqual(result.resistanceReducedDamage, expected.resistanceReducedDamage, 'resistanceReducedDamage'));
    }

    // Optional: dotBreakdown assertions
    if (expected.dotBreakdown != null) {
        for (const dotType of ['fire', 'spirit', 'poison']) {
            if (expected.dotBreakdown[dotType] != null) {
                const expectedDot = expected.dotBreakdown[dotType];
                const actualDot = result.dotBreakdown[dotType];
                if (expectedDot.total != null) {
                    checks.push(approxEqual(actualDot.total, expectedDot.total, `dotBreakdown.${dotType}.total`));
                }
                if (expectedDot.tickCount != null && actualDot.ticks.length !== expectedDot.tickCount) {
                    checks.push(`  FAIL dotBreakdown.${dotType}.tickCount: expected ${expectedDot.tickCount}, got ${actualDot.ticks.length}`);
                }
            }
        }
    }

    const failures = checks.filter(Boolean);
    if (failures.length) {
        console.log(`✗ ${testCase.name}`);
        failures.forEach(failure => console.log(failure));
        failed++;
    } else {
        console.log(`✓ ${testCase.name}`);
        passed++;
    }
}

console.log(`\n${passed} passed, ${failed} failed, ${cases.length} total`);
process.exit(failed > 0 ? 1 : 0);

