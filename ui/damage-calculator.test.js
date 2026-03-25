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

for (const testCase of cases) {
    const errors = [];

    // Build inputs in the same shape the UI sends
    const inputs = {
        rawDamage:          testCase.mob.rawDamage,
        starLevel:          testCase.mob.starLevel,
        extraDamagePercent: testCase.mob.extraDamagePercent ?? 0,
        difficulty:         testCase.difficulty,
        maxHealth:          testCase.player.maxHealth,
        blockingSkill:      testCase.player.blockingSkill,
        blockArmor:         testCase.player.blockArmor,
        armor:              testCase.player.armor,
    };

    // Resolve parry multiplier — prefer explicit, fall back to parryBonus enum
    if (testCase.player.parryMultiplier != null) {
        inputs.parryMultiplier = testCase.player.parryMultiplier;
    } else {
        inputs.parryBonus = testCase.player.parryBonus;
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

    // Assertions
    const checks = [
        approxEqual(data.baseRawDamage,             expected.baseRawDamage,           'baseRawDamage'),
        approxEqual(data.effectiveRawDamage,         expected.effectiveRawDamage,      'effectiveRawDamage'),
        approxEqual(result.blockReducedDamage,    expected.blockReducedDamage,   'blockReducedDamage'),
        approxEqual(result.finalReducedDamage,       expected.finalReducedDamage,      'finalReducedDamage'),
        approxEqual(result.remainingHealth,           expected.remainingHealth,         'remainingHealth'),
    ];

    // Stagger (string comparison)
    if (result.stagger !== expected.stagger) {
        checks.push(`  FAIL stagger: expected ${expected.stagger}, got ${result.stagger}`);
    }
    // minHealthForNoStagger (exact int)
    if (result.minHealthForNoStagger !== expected.minHealthForNoStagger) {
        checks.push(`  FAIL minHealthForNoStagger: expected ${expected.minHealthForNoStagger}, got ${result.minHealthForNoStagger}`);
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

