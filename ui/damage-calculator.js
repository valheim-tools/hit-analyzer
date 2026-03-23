/**
 * Pure client-side port of the Java core package.
 *
 * Mirrors:
 *   - core/GameDifficulty.java
 *   - core/MobStats.java
 *   - core/PlayerStats.java
 *   - core/DamageCalculator.java
 *   - core/DamageResult.java
 *   - core/StaggerResult.java
 *   - web/CalculateHandler.java  (input resolution logic)
 *
 * No external dependencies — vanilla ES module.
 */

/* ── GameDifficulty ── */

const DIFFICULTY = Object.freeze({
    NORMAL:    { displayName: 'Normal',    physicalDamageBonus: 0.0 },
    HARD:      { displayName: 'Hard',      physicalDamageBonus: 0.5 },
    VERY_HARD: { displayName: 'Very Hard', physicalDamageBonus: 1.0 },
});

/* ── ParryBonus (legacy enum lookup) ── */

const PARRY_BONUS = Object.freeze({
    X1:   1.0,
    X1_5: 1.5,
    X2:   2.0,
    X2_5: 2.5,
    X4:   4.0,
    X6:   6.0,
});

/* ── Validation helpers ── */

function validateMob(rawDamage, starLevel, extraDamagePercent) {
    if (starLevel < 0 || starLevel > 3) {
        throw new Error('Star level must be between 0 and 3.');
    }
    if (!Number.isFinite(extraDamagePercent) || extraDamagePercent < 0) {
        throw new Error('Extra damage percent must be a non-negative number.');
    }
    if (!Number.isFinite(rawDamage)) {
        throw new Error('Raw damage must be a finite number.');
    }
}

function validateParryMultiplier(parryMultiplier) {
    if (!Number.isFinite(parryMultiplier) || parryMultiplier <= 0) {
        throw new Error('Parry multiplier must be a positive number.');
    }
}

/* ── Effective raw damage (MobStats.getEffectiveRawDamage) ── */

function getEffectiveRawDamage(rawDamage, starLevel, extraDamagePercent, difficulty) {
    const starBonus = starLevel * 0.50;
    const extraBonus = extraDamagePercent / 100.0;
    return rawDamage * (1.0 + difficulty.physicalDamageBonus + starBonus + extraBonus);
}

/* ── DamageCalculator static methods ── */

function calculateStaggerBar(maxHealth) {
    return 0.40 * maxHealth;
}

function calculateBlockArmor(blockingSkill, blockArmor, parryMultiplier) {
    return (blockingSkill * 0.005 * blockArmor + blockArmor) * parryMultiplier;
}

function applyArmorReduction(damage, armor) {
    if (armor < damage / 2.0) {
        return damage - armor;
    }
    return (damage * damage) / (armor * 4.0);
}

/* ── Single-scenario calculation (DamageCalculator.calculate) ── */

function calculateScenario(player, mob, difficulty, useShield, isParry) {
    const effectiveRawDamage = mob.effectiveRawDamage;
    const staggerBar = calculateStaggerBar(player.maxHealth);

    // --- Block phase ---
    let blockReducedDamage = effectiveRawDamage;
    let staggeredOnBlock = false;
    let bindingStaggerDamage = 0;

    if (useShield) {
        const parryMultiplier = isParry ? player.parryMultiplier : 1.0;
        const effectiveBlockArmor = calculateBlockArmor(
            player.blockingSkill, player.blockArmor, parryMultiplier);

        const afterBlock = applyArmorReduction(effectiveRawDamage, effectiveBlockArmor);
        bindingStaggerDamage = afterBlock;

        if (afterBlock > staggerBar) {
            blockReducedDamage = effectiveRawDamage;
            staggeredOnBlock = true;
        } else {
            blockReducedDamage = afterBlock;
        }
    }

    // --- Armor phase ---
    const afterArmor = applyArmorReduction(blockReducedDamage, player.armor);
    if (!useShield) {
        bindingStaggerDamage = afterArmor;
    }

    const minHealthForNoStagger = Math.ceil(bindingStaggerDamage / 0.4);

    const stagger = (staggeredOnBlock || afterArmor > staggerBar) ? 'YES' : 'NO';

    const remainingHealth = player.maxHealth - afterArmor;

    let scenarioName;
    if (!useShield) {
        scenarioName = 'No Shield';
    } else if (isParry) {
        scenarioName = 'Parry';
    } else {
        scenarioName = 'Block';
    }

    return {
        scenarioName,
        blockReducedDamage,
        finalReducedDamage: afterArmor,
        remainingHealth,
        stagger,
        minHealthForNoStagger,
    };
}

/* ── Input resolution (mirrors CalculateHandler) ── */

function resolveParryMultiplier(inputs) {
    if (inputs.parryMultiplier != null && inputs.parryMultiplier !== '') {
        const multiplier = Number(inputs.parryMultiplier);
        validateParryMultiplier(multiplier);
        return multiplier;
    }
    if (inputs.parryBonus != null && String(inputs.parryBonus).trim() !== '') {
        const key = String(inputs.parryBonus);
        if (!(key in PARRY_BONUS)) {
            throw new Error(`Unknown parryBonus: ${key}`);
        }
        return PARRY_BONUS[key];
    }
    throw new Error('parryMultiplier is required.');
}

function resolveExtraDamagePercent(inputs) {
    const raw = inputs.extraDamagePercent != null ? inputs.extraDamagePercent : inputs.extraDamage;
    if (raw == null) return 0.0;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
        throw new Error('extraDamagePercent must be a non-negative number.');
    }
    return value;
}

/* ── Public API ── */

/**
 * Drop-in replacement for the old fetch-based calculate().
 *
 * Accepts the same input shape that the Java CalculateHandler expects and
 * returns the same response shape as CalculateResponse:
 *   { baseRawDamage, effectiveRawDamage, noShield, block, parry }
 *
 * @param {Object} inputs  — form values (same keys as the old POST body)
 * @returns {{ baseRawDamage: number, effectiveRawDamage: number,
 *             noShield: Object, block: Object, parry: Object }}
 */
export function calculate(inputs) {
    // Resolve difficulty
    const diffKey = String(inputs.difficulty);
    if (!(diffKey in DIFFICULTY)) {
        throw new Error(`Unknown difficulty: ${diffKey}`);
    }
    const difficulty = DIFFICULTY[diffKey];

    // Resolve mob stats
    const rawDamage = Number(inputs.rawDamage);
    const starLevel = Number(inputs.starLevel);
    const extraDamagePercent = resolveExtraDamagePercent(inputs);
    validateMob(rawDamage, starLevel, extraDamagePercent);

    const effectiveRawDamage = getEffectiveRawDamage(rawDamage, starLevel, extraDamagePercent, difficulty);

    const mob = { rawDamage, starLevel, extraDamagePercent, effectiveRawDamage };

    // Resolve player stats
    const parryMultiplier = resolveParryMultiplier(inputs);
    const player = {
        maxHealth:     Number(inputs.maxHealth),
        blockingSkill: Number(inputs.blockingSkill),
        blockArmor: Number(inputs.blockArmor),
        armor:         Number(inputs.armor),
        parryMultiplier,
    };

    // Run three scenarios
    const noShield = calculateScenario(player, mob, difficulty, false, false);
    const block    = calculateScenario(player, mob, difficulty, true,  false);
    const parry    = calculateScenario(player, mob, difficulty, true,  true);

    return {
        baseRawDamage: rawDamage,
        effectiveRawDamage,
        noShield,
        block,
        parry,
    };
}
