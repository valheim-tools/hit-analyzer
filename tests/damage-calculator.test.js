/**
 * Zero-dependency Node.js test runner for damage-calculator.js.
 *
 * Reads test-cases.json and verifies results within ±0.001 tolerance.
 *
 * Usage:  node tests/damage-calculator.test.js
 */

import { calculate } from '../dist-test/damage-calculator.js';
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
        damageTypes:        testCase.mob.damageTypes,
        starLevel:          testCase.mob.starLevel,
        extraDamagePercent: testCase.mob.extraDamagePercent ?? 0,
        difficulty:         testCase.difficulty,
        maxHealth:          testCase.player.maxHealth,
        blockingSkill:      testCase.player.blockingSkill,
        blockArmor:         testCase.player.blockArmor,
        armor:              testCase.player.armor,
        parryMultiplier:    testCase.player.parryMultiplier,
    };

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
        approxEqual(result.armorReducedDamage,   expected.armorReducedDamage,   'armorReducedDamage'),
        approxEqual(result.remainingHealth,      expected.remainingHealth,      'remainingHealth'),
    ];

    // Stagger (string comparison)
    if (result.stagger !== expected.stagger) {
        checks.push(`  FAIL stagger: expected ${expected.stagger}, got ${result.stagger}`);
    }
    // minHealthForNoBlockStagger (exact int)
    if (result.minHealthForNoBlockStagger !== expected.minHealthForNoBlockStagger) {
        checks.push(`  FAIL minHealthForNoBlockStagger: expected ${expected.minHealthForNoBlockStagger}, got ${result.minHealthForNoBlockStagger}`);
    }
    // minHealthToAvoidStagger (exact int)
    if (result.minHealthToAvoidStagger !== expected.minHealthToAvoidStagger) {
        checks.push(`  FAIL minHealthToAvoidStagger: expected ${expected.minHealthToAvoidStagger}, got ${result.minHealthToAvoidStagger}`);
    }

    // Optional: instantDamage assertion (new multi-type tests)
    if (expected.instantDamage != null) {
        checks.push(approxEqual(result.instantDamage, expected.instantDamage, 'instantDamage'));
    }

    // Optional: resistanceMultipliedDamage assertion
    if (expected.resistanceMultipliedDamage != null) {
        checks.push(approxEqual(result.resistanceMultipliedDamage, expected.resistanceMultipliedDamage, 'resistanceMultipliedDamage'));
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

