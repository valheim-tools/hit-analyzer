/**
 * All game math — single source of truth for damage calculations.
 * No external dependencies — vanilla ES module.
 *
 * Supports per-type damage maps: { Blunt: 40, Fire: 20 }
 * Pipeline: difficulty scaling → block/parry → resistance modifiers → body armor → DoT extraction
 */

/* ── Constants ── */

const DAMAGE_TYPE_NAMES = Object.freeze([
    'Blunt', 'Slash', 'Pierce',
    'Fire', 'Frost', 'Lightning',
    'Poison', 'Spirit',
]);

const BLOCKABLE_TYPES = Object.freeze([
    'Blunt', 'Slash', 'Pierce',
    'Fire', 'Frost', 'Lightning',
    'Poison', 'Spirit',
]);

const STAGGER_TYPES = Object.freeze([
    'Blunt', 'Slash', 'Pierce', 'Lightning',
]);

const DOT_TYPES = Object.freeze(['Fire', 'Poison', 'Spirit']);

const INSTANT_TYPES = Object.freeze([
    'Blunt', 'Slash', 'Pierce', 'Frost', 'Lightning',
]);

/* ── Difficulty ── */

const DIFFICULTY = Object.freeze({
    NORMAL:    { damageBonus: 0.0 },
    HARD:      { damageBonus: 0.5 },
    VERY_HARD: { damageBonus: 1.0 },
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

/* ── Resistance Presets (§3 — Damage Type Modifiers) ── */

export const RESISTANCE_PRESET = Object.freeze({
    VERY_WEAK:          { multiplier: 2.00, label: 'Very Weak',          percent: 200 },
    WEAK:               { multiplier: 1.50, label: 'Weak',               percent: 150 },
    SLIGHTLY_WEAK:      { multiplier: 1.25, label: 'Slightly Weak',      percent: 125 },
    NEUTRAL:            { multiplier: 1.00, label: 'Neutral',            percent: 100 },
    SLIGHTLY_RESISTANT: { multiplier: 0.75, label: 'Slightly Resistant', percent: 75 },
    RESISTANT:          { multiplier: 0.50, label: 'Resistant',          percent: 50 },
    VERY_RESISTANT:     { multiplier: 0.25, label: 'Very Resistant',     percent: 25 },
    IMMUNE:             { multiplier: 0.00, label: 'Immune',             percent: 0 },
});

/* ── DoT prefab constants ── */

const FIRE_DOT = Object.freeze({ totalDuration: 5.0, tickInterval: 1.0, minimumPerTick: 0.2 });
const SPIRIT_DOT = Object.freeze({ totalDuration: 3.0, tickInterval: 0.5, minimumPerTick: 0.2 });
const POISON_DOT = Object.freeze({ baseDuration: 1.0, durationPerDamagePlayer: 5.0, durationPower: 0.5, tickInterval: 1.0 });

/* ── RNG damage variance ── */

const RNG_MIN = 0.75;
const RNG_MAX = 1.0;

export function sampleRng() {
    return RNG_MIN + (RNG_MAX - RNG_MIN) * Math.random();
}

export function getPercentileRng(percentile) {
    return RNG_MIN + (RNG_MAX - RNG_MIN) * percentile;
}

/* ── Damage map helpers ── */

function createEmptyDamageMap() {
    const damageMap = {};
    for (const typeName of DAMAGE_TYPE_NAMES) {
        damageMap[typeName] = 0;
    }
    return damageMap;
}

function cloneDamageMap(damageMap) {
    return { ...damageMap };
}

function sumTypes(damageMap, typeList) {
    let total = 0;
    for (const typeName of typeList) {
        total += damageMap[typeName] || 0;
    }
    return total;
}

function sumAllTypes(damageMap) {
    return sumTypes(damageMap, DAMAGE_TYPE_NAMES);
}

function normalizeDamageTypes(input) {
    const damageMap = createEmptyDamageMap();
    if (input == null) return damageMap;
    if (typeof input === 'object') {
        for (const typeName of DAMAGE_TYPE_NAMES) {
            if (input[typeName] != null && Number.isFinite(Number(input[typeName]))) {
                damageMap[typeName] = Number(input[typeName]);
            }
        }
    }
    return damageMap;
}

/* ── Validation helpers ── */

function validateStarLevel(starLevel) {
    if (starLevel < 0 || starLevel > 2) {
        throw new Error('Star level must be between 0 and 2.');
    }
}

function validateExtraDamagePercent(extraDamagePercent) {
    if (!Number.isFinite(extraDamagePercent) || extraDamagePercent < 0) {
        throw new Error('Extra damage percent must be a non-negative number.');
    }
}

function validateParryMultiplier(parryMultiplier) {
    if (!Number.isFinite(parryMultiplier) || parryMultiplier <= 0) {
        throw new Error('Parry multiplier must be a positive number.');
    }
}

/* ── Effective damage (per-type scaling) ── */

function applyEffectiveScaling(damageMap, starLevel, extraDamagePercent, difficulty) {
    const starBonus = starLevel * 0.50;
    const extraBonus = extraDamagePercent / 100.0;
    const multiplier = 1.0 + difficulty.damageBonus + starBonus + extraBonus;
    const scaled = cloneDamageMap(damageMap);
    for (const typeName of DAMAGE_TYPE_NAMES) {
        scaled[typeName] *= multiplier;
    }
    return scaled;
}

/* ── Core armor formula (single value) ── */

function applyArmorSingle(damage, armor) {
    if (damage <= 0 || armor <= 0) return damage;
    if (armor < damage / 2.0) {
        return damage - armor;
    }
    return (damage * damage) / (armor * 4.0);
}

/* ── Armor reduction on a damage map (§4c — proportional ratio) ── */

function applyArmorToDamageMap(damageMap, armor) {
    if (armor <= 0) return cloneDamageMap(damageMap);
    const total = sumAllTypes(damageMap);
    if (total <= 0) return cloneDamageMap(damageMap);
    const reducedTotal = applyArmorSingle(total, armor);
    const ratio = reducedTotal / total;
    const result = cloneDamageMap(damageMap);
    for (const typeName of DAMAGE_TYPE_NAMES) {
        result[typeName] *= ratio;
    }
    return result;
}

/* ── Block helpers (§2f — block uses the armor formula) ── */

function getTotalBlockable(damageMap) {
    return sumTypes(damageMap, BLOCKABLE_TYPES);
}

function getTotalStagger(damageMap) {
    return sumTypes(damageMap, STAGGER_TYPES);
}

function applyBlockDamage(damageMap, actualBlocked) {
    const totalBlockable = getTotalBlockable(damageMap);
    if (totalBlockable <= 0) return cloneDamageMap(damageMap);
    const remaining = Math.max(0, totalBlockable - actualBlocked);
    const ratio = remaining / totalBlockable;
    const result = cloneDamageMap(damageMap);
    for (const typeName of BLOCKABLE_TYPES) {
        result[typeName] *= ratio;
    }
    return result;
}

/* ── Stagger bar ── */

function calculateStaggerThreshold(maxHealth) {
    return 0.40 * maxHealth;
}

/* ── Block power (§2c) ── */

function calculateBlockPower(blockingSkill, blockArmor, parryMultiplier) {
    const skillFactor = blockingSkill / 100.0;
    return blockArmor * (1.0 + skillFactor * 0.5) * parryMultiplier;
}

/* ── Shield block power from preset data (§2c) ── */

export function calculateShieldBlockArmor(baseBlockArmor, blockPerLevel, quality) {
    return baseBlockArmor + Math.max(0, quality - 1) * blockPerLevel;
}

/* ── DoT tick prediction ── */

export function predictFireTicks(fireValue) {
    if (fireValue <= 0) return [];
    const numberOfTicks = Math.floor(FIRE_DOT.totalDuration / FIRE_DOT.tickInterval);
    if (numberOfTicks < 1) return [];
    const damagePerTick = fireValue / numberOfTicks;
    if (damagePerTick < FIRE_DOT.minimumPerTick) return [];
    const ticks = [];
    for (let index = 0; index < numberOfTicks; index++) {
        ticks.push({ time: index * FIRE_DOT.tickInterval, damage: damagePerTick });
    }
    return ticks;
}

export function predictSpiritTicks(spiritValue) {
    if (spiritValue <= 0) return [];
    const numberOfTicks = Math.floor(SPIRIT_DOT.totalDuration / SPIRIT_DOT.tickInterval);
    if (numberOfTicks < 1) return [];
    const damagePerTick = spiritValue / numberOfTicks;
    if (damagePerTick < SPIRIT_DOT.minimumPerTick) return [];
    const ticks = [];
    for (let index = 0; index < numberOfTicks; index++) {
        ticks.push({ time: index * SPIRIT_DOT.tickInterval, damage: damagePerTick });
    }
    return ticks;
}

export function predictPoisonTicks(poisonValue) {
    if (poisonValue <= 0) return [];
    const totalDuration = POISON_DOT.baseDuration
        + Math.pow(poisonValue * POISON_DOT.durationPerDamagePlayer, POISON_DOT.durationPower);
    let numberOfTicks = Math.floor(totalDuration / POISON_DOT.tickInterval);
    if (numberOfTicks < 1) numberOfTicks = 1;
    const damagePerTick = poisonValue / numberOfTicks;
    const ticks = [];
    for (let index = 0; index < numberOfTicks; index++) {
        ticks.push({ time: index * POISON_DOT.tickInterval, damage: damagePerTick });
    }
    return ticks;
}

function buildDotBreakdown(damageMap) {
    const fireTotal = damageMap.Fire || 0;
    const spiritTotal = damageMap.Spirit || 0;
    const poisonTotal = damageMap.Poison || 0;
    return {
        fire:   { total: fireTotal,   ticks: predictFireTicks(fireTotal) },
        spirit: { total: spiritTotal, ticks: predictSpiritTicks(spiritTotal) },
        poison: { total: poisonTotal, ticks: predictPoisonTicks(poisonTotal) },
    };
}

/* ── DoT extraction (§5) — separate DoT types from instant damage ── */

function extractDotDamage(damageMap) {
    const instant = cloneDamageMap(damageMap);
    const dotValues = createEmptyDamageMap();
    for (const typeName of DOT_TYPES) {
        dotValues[typeName] = instant[typeName] || 0;
        instant[typeName] = 0;
    }
    return { instant, dotValues };
}

/* ── Resistance modifiers (§3 — per-type multiplier) ── */

function applyResistanceModifiers(damageMap, resistanceModifiers) {
    if (!resistanceModifiers || Object.keys(resistanceModifiers).length === 0) {
        return cloneDamageMap(damageMap);
    }
    const result = cloneDamageMap(damageMap);
    for (const typeName of DAMAGE_TYPE_NAMES) {
        if (resistanceModifiers[typeName] != null) {
            result[typeName] *= resistanceModifiers[typeName];
        }
    }
    return result;
}

/* ── Single-scenario calculation ── */

function calculateScenario(player, effectiveDamageMap, useShield, isParry) {
    const staggerThreshold = calculateStaggerThreshold(player.maxHealth);

    let currentDamageMap = cloneDamageMap(effectiveDamageMap);
    let staggeredOnBlock = false;
    let blockStaggerDamage = 0;

    // --- Block phase (§2) ---
    if (useShield) {
        const parryMultiplier = isParry ? player.parryMultiplier : 1.0;
        const blockPower = calculateBlockPower(
            player.blockingSkill, player.blockArmor, parryMultiplier);

        // §2f — Block uses the armor formula on total blockable damage
        const afterBlockMap = applyArmorToDamageMap(currentDamageMap, blockPower);
        const originalTotal = getTotalBlockable(currentDamageMap);
        const afterBlockTotal = getTotalBlockable(afterBlockMap);
        const actualBlocked = originalTotal - afterBlockTotal;

        // §2h — Stagger check (physical + lightning AFTER block reduction)
        blockStaggerDamage = getTotalStagger(afterBlockMap);

        if (blockStaggerDamage > staggerThreshold) {
            // Guard break — full damage passes through (§2j)
            staggeredOnBlock = true;
            // currentDamageMap stays unchanged (block did nothing)
        } else {
            // Successful block — reduce all blockable types proportionally (§2i)
            currentDamageMap = applyBlockDamage(currentDamageMap, actualBlocked);
        }
    }

    // Snapshot after block phase for reporting
    const blockReducedTotal = sumAllTypes(currentDamageMap);
    const afterBlockSnapshot = useShield ? cloneDamageMap(currentDamageMap) : null;

    // --- Resistance phase (§3) ---
    currentDamageMap = applyResistanceModifiers(currentDamageMap, player.resistanceModifiers);
    const resistanceReducedTotal = sumAllTypes(currentDamageMap);
    const afterResistanceSnapshot = cloneDamageMap(currentDamageMap);

    // --- Armor phase (§4) ---
    const afterArmorMap = applyArmorToDamageMap(currentDamageMap, player.armor);
    const afterArmorTotal = sumAllTypes(afterArmorMap);

    // --- Stagger from armor phase ---
    let armorStaggerDamage;
    if (!useShield) {
        armorStaggerDamage = getTotalStagger(afterArmorMap);
    } else {
        armorStaggerDamage = staggeredOnBlock ? 0 : getTotalStagger(afterArmorMap);
    }

    const stagger = (staggeredOnBlock || armorStaggerDamage > staggerThreshold) ? 'YES' : 'NO';

    // Min health to avoid stagger — binding stagger damage is the value that was compared
    const bindingStaggerDamage = useShield ? blockStaggerDamage : armorStaggerDamage;
    const minHealthForNoStagger = bindingStaggerDamage > 0
        ? Math.ceil(bindingStaggerDamage / 0.4)
        : 0;

    // --- DoT extraction (§5) ---
    const { instant: instantMap, dotValues } = extractDotDamage(afterArmorMap);
    const instantDamage = sumTypes(instantMap, INSTANT_TYPES);
    const dotBreakdown = buildDotBreakdown(dotValues);

    const totalDamage = afterArmorTotal;
    const remainingHealth = player.maxHealth - totalDamage;

    let scenarioName;
    if (!useShield) scenarioName = 'No Shield';
    else if (isParry) scenarioName = 'Parry';
    else scenarioName = 'Block';

    return {
        scenarioName,
        blockReducedDamage: blockReducedTotal,
        resistanceReducedDamage: resistanceReducedTotal,
        finalReducedDamage: totalDamage,
        remainingHealth,
        stagger,
        minHealthForNoStagger,
        instantDamage,
        dotBreakdown,
        damageBreakdown: {
            afterBlock: afterBlockSnapshot,
            afterResistance: afterResistanceSnapshot,
            afterArmor: cloneDamageMap(afterArmorMap),
        },
    };
}

/* ── Input resolution ── */

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
    const inputValue = inputs.extraDamagePercent != null ? inputs.extraDamagePercent : inputs.extraDamage;
    if (inputValue == null) return 0.0;
    const value = Number(inputValue);
    if (!Number.isFinite(value) || value < 0) {
        throw new Error('extraDamagePercent must be a non-negative number.');
    }
    return value;
}

function resolveDamageTypes(inputs) {
    if (inputs.damageTypes != null && typeof inputs.damageTypes === 'object') {
        return normalizeDamageTypes(inputs.damageTypes);
    }
    if (inputs.baseDamage != null) {
        const baseDamage = Number(inputs.baseDamage);
        if (!Number.isFinite(baseDamage)) {
            throw new Error('baseDamage must be a finite number.');
        }
        const damageMap = createEmptyDamageMap();
        damageMap.Blunt = baseDamage;
        return damageMap;
    }
    throw new Error('Either damageTypes or baseDamage is required.');
}

function resolveResistanceModifiers(inputs) {
    if (inputs.resistanceModifiers == null || typeof inputs.resistanceModifiers !== 'object') {
        return {};
    }
    const resolved = {};
    for (const typeName of DAMAGE_TYPE_NAMES) {
        if (inputs.resistanceModifiers[typeName] != null) {
            const value = Number(inputs.resistanceModifiers[typeName]);
            if (Number.isFinite(value)) {
                resolved[typeName] = Math.max(0, Math.min(2.0, value));
            }
        }
    }
    return resolved;
}

/* ── Public API ── */

/**
 * Runs the full damage pipeline for all three scenarios (No Shield, Block, Parry).
 *
 * @param {Object} inputs — form values (supports damageTypes map or legacy baseDamage)
 * @param {{ rng?: number }} [options] — optional RNG factor for percentile scaling
 * @returns {Object} full result with per-scenario data
 */
export function calculate(inputs, { rng = null } = {}) {
    const difficultyKey = String(inputs.difficulty);
    if (!(difficultyKey in DIFFICULTY)) {
        throw new Error(`Unknown difficulty: ${difficultyKey}`);
    }
    const difficulty = DIFFICULTY[difficultyKey];

    const baseDamageMap = resolveDamageTypes(inputs);
    const baseDamageTotal = sumAllTypes(baseDamageMap);

    const starLevel = Number(inputs.starLevel);
    const extraDamagePercent = resolveExtraDamagePercent(inputs);
    validateStarLevel(starLevel);
    validateExtraDamagePercent(extraDamagePercent);

    const effectiveDamageMap = applyEffectiveScaling(baseDamageMap, starLevel, extraDamagePercent, difficulty);
    const effectiveDamageTotal = sumAllTypes(effectiveDamageMap);

    let scaledDamageMap;
    let scaledEffectiveDamageTotal;
    if (rng !== null) {
        const rngFactor = Math.sqrt(rng);
        scaledDamageMap = cloneDamageMap(effectiveDamageMap);
        for (const typeName of DAMAGE_TYPE_NAMES) {
            scaledDamageMap[typeName] *= rngFactor;
        }
        scaledEffectiveDamageTotal = effectiveDamageTotal * rngFactor;
    } else {
        scaledDamageMap = cloneDamageMap(effectiveDamageMap);
        scaledEffectiveDamageTotal = effectiveDamageTotal;
    }

    const parryMultiplier = resolveParryMultiplier(inputs);
    const resistanceModifiers = resolveResistanceModifiers(inputs);
    const player = {
        maxHealth:     Number(inputs.maxHealth),
        blockingSkill: Number(inputs.blockingSkill),
        blockArmor:    Number(inputs.blockArmor),
        armor:         Number(inputs.armor),
        parryMultiplier,
        resistanceModifiers,
    };

    const noShield = calculateScenario(player, scaledDamageMap, false, false);
    const block    = calculateScenario(player, scaledDamageMap, true,  false);
    const parry    = calculateScenario(player, scaledDamageMap, true,  true);

    return {
        baseDamage: baseDamageTotal,
        baseDamageMap,
        effectiveDamage: effectiveDamageTotal,
        effectiveDamageMap,
        scaledEffectiveDamage: scaledEffectiveDamageTotal,
        scaledDamageMap,
        noShield,
        block,
        parry,
    };
}


