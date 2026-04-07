/**
 * All game math — single source of truth for damage calculations.
 * No external dependencies — pure TypeScript module.
 *
 * Supports per-type damage maps: { Blunt: 40, Fire: 20 }
 * Pipeline: multiplicative scaling (star level × difficulty × extra) → block/parry → resistance modifiers → body armor → DoT extraction
 */

import {
  DAMAGE_TYPE_NAMES,
  INSTANT_DAMAGE_TYPE_NAMES,
  DOT_DAMAGE_TYPE_NAMES,
  STAGGER_DAMAGE_TYPE_NAMES,
  DIFFICULTY_ENEMY_DAMAGE_RATE,
  FIRE_DOT,
  SPIRIT_DOT,
  POISON_DOT,
} from './constants';
import {
  DamageMap,
  DamageTypeName,
  DifficultyKey,
  SimScenarioKey,
  CalculationInputs,
  CalculationOptions,
  CalculationResult,
  ScenarioResult,
  DotTick,
  DotBreakdown,
  ResistanceModifiers,
  RangeDamageResult,
  RangeDamageScenarioResult,
} from './models';


/* ── RNG damage variance ── */

const RNG_MIN = 0.75;
const RNG_MAX = 1.0;

export function sampleRng(): number {
  return RNG_MIN + (RNG_MAX - RNG_MIN) * Math.random();
}

export function getPercentileRng(percentile: number): number {
  return RNG_MIN + (RNG_MAX - RNG_MIN) * percentile;
}

/* ── Damage map helpers ── */

function createEmptyDamageMap(): DamageMap {
  const damageMap = {} as DamageMap;
  for (const typeName of DAMAGE_TYPE_NAMES) {
    damageMap[typeName] = 0;
  }
  return damageMap;
}

function cloneDamageMap(damageMap: DamageMap): DamageMap {
  return { ...damageMap };
}

function sumTypes(damageMap: DamageMap, typeList: readonly DamageTypeName[]): number {
  let total = 0;
  for (const typeName of typeList) {
    total += damageMap[typeName] || 0;
  }
  return total;
}

function sumAllTypes(damageMap: DamageMap): number {
  return sumTypes(damageMap, DAMAGE_TYPE_NAMES);
}

function normalizeDamageTypes(input: Partial<DamageMap> | null | undefined): DamageMap {
  const damageMap = createEmptyDamageMap();
  if (input == null) return damageMap;
  for (const typeName of DAMAGE_TYPE_NAMES) {
    if (input[typeName] != null && Number.isFinite(Number(input[typeName]))) {
      damageMap[typeName] = Number(input[typeName]);
    }
  }
  return damageMap;
}

/* ── Validation helpers ── */

function validateStarLevel(starLevel: number): void {
  if (starLevel < 0 || starLevel > 2) {
    throw new Error('Star level must be between 0 and 2.');
  }
}

function validateExtraDamagePercent(extraDamagePercent: number): void {
  if (!Number.isFinite(extraDamagePercent) || extraDamagePercent < 0) {
    throw new Error('Extra damage percent must be a non-negative number.');
  }
}

function validateParryMultiplier(parryMultiplier: number): void {
  if (!Number.isFinite(parryMultiplier) || parryMultiplier <= 0) {
    throw new Error('Parry multiplier must be a positive number.');
  }
}

/* ── Effective damage (per-type scaling — multiplicative) ── */

function applyEffectiveScaling(
  damageMap: DamageMap,
  starLevel: number,
  extraDamagePercent: number,
  difficultyDamageRate: number,
): DamageMap {
  const starLevelFactor = 1.0 + starLevel * 0.50;
  const extraDamageFactor = 1.0 + extraDamagePercent / 100.0;
  const multiplier = starLevelFactor * difficultyDamageRate * extraDamageFactor;
  const scaled = cloneDamageMap(damageMap);
  for (const typeName of DAMAGE_TYPE_NAMES) {
    scaled[typeName] *= multiplier;
  }
  return scaled;
}

/* ── Core armor formula (single value) ── */

/**
 * Applies the Valheim armor reduction formula to a single damage value.
 * Returns both the reduced damage and which formula branch was taken (linear vs quadratic).
 *
 * - Linear branch  (armor < damage / 2): reducedDamage = damage − armor
 * - Quadratic branch (armor ≥ damage / 2): reducedDamage = damage² / (armor × 4)
 */
export function calculateArmorReduction(
  damage: number,
  armor: number,
): { isLinear: boolean; reducedDamage: number } {
  const isLinear = armor < damage / 2.0;
  const reducedDamage = isLinear
    ? damage - armor
    : (damage * damage) / (armor * 4.0);
  return { isLinear, reducedDamage };
}

function applyArmorSingle(damage: number, armor: number): number {
  if (damage <= 0 || armor <= 0) return damage;
  return calculateArmorReduction(damage, armor).reducedDamage;
}

/* ── Armor reduction on a damage map (§4c — proportional ratio) ── */

function applyArmorToDamageMap(damageMap: DamageMap, armor: number): DamageMap {
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

/* ── Block helpers ── */

function getTotalBlockable(damageMap: DamageMap): number {
  return sumTypes(damageMap, DAMAGE_TYPE_NAMES);
}

function getTotalStagger(damageMap: DamageMap): number {
  return sumTypes(damageMap, STAGGER_DAMAGE_TYPE_NAMES);
}

function applyBlockDamage(damageMap: DamageMap, actualBlocked: number): DamageMap {
  const totalBlockable = getTotalBlockable(damageMap);
  if (totalBlockable <= 0) return cloneDamageMap(damageMap);
  const remaining = Math.max(0, totalBlockable - actualBlocked);
  const ratio = remaining / totalBlockable;
  const result = cloneDamageMap(damageMap);
  for (const typeName of DAMAGE_TYPE_NAMES) {
    result[typeName] *= ratio;
  }
  return result;
}

/* ── Stagger bar ── */

/** Stagger threshold = 40 % of the player's maximum health. */
export function calculateStaggerThreshold(maxHealth: number): number {
  return 0.40 * maxHealth;
}

/* ── Block power ── */

/**
 * Skill multiplier applied to block armor.
 * skillFactor = 1 + (blockingSkill / 100) × 0.5
 */
export function calculateBlockingSkillFactor(blockingSkill: number): number {
  return 1.0 + (blockingSkill / 100.0) * 0.5;
}

/**
 * Effective block power after skill and optional parry bonus are applied.
 * blockPower = blockArmor × skillFactor × parryMultiplier
 */
export function calculateBlockPower(
  blockingSkill: number,
  blockArmor: number,
  parryMultiplier: number,
): number {
  return blockArmor * calculateBlockingSkillFactor(blockingSkill) * parryMultiplier;
}

/* ── Shield block armor from preset data ── */

export function calculateShieldBlockArmor(
  baseBlockArmor: number,
  blockPerLevel: number,
  quality: number,
): number {
  return baseBlockArmor + Math.max(0, quality - 1) * blockPerLevel;
}

/* ── DoT tick prediction ── */

export function predictFireTicks(fireValue: number): DotTick[] {
  if (fireValue <= 0) return [];
  const numberOfTicks = Math.floor(FIRE_DOT.totalDuration / FIRE_DOT.tickInterval);
  if (numberOfTicks < 1) return [];
  const damagePerTick = fireValue / numberOfTicks;
  if (damagePerTick < FIRE_DOT.minimumPerTick) return [];
  const ticks: DotTick[] = [];
  for (let index = 0; index < numberOfTicks; index++) {
    ticks.push({ time: index * FIRE_DOT.tickInterval, damage: damagePerTick });
  }
  return ticks;
}

export function predictSpiritTicks(spiritValue: number): DotTick[] {
  if (spiritValue <= 0) return [];
  const numberOfTicks = Math.floor(SPIRIT_DOT.totalDuration / SPIRIT_DOT.tickInterval);
  if (numberOfTicks < 1) return [];
  const damagePerTick = spiritValue / numberOfTicks;
  if (damagePerTick < SPIRIT_DOT.minimumPerTick) return [];
  const ticks: DotTick[] = [];
  for (let index = 0; index < numberOfTicks; index++) {
    ticks.push({ time: index * SPIRIT_DOT.tickInterval, damage: damagePerTick });
  }
  return ticks;
}

export function predictPoisonTicks(poisonValue: number): DotTick[] {
  if (poisonValue <= 0) return [];
  const totalDuration =
    POISON_DOT.baseDuration +
    Math.pow(poisonValue * POISON_DOT.durationPerDamagePlayer, POISON_DOT.durationPower);
  let numberOfTicks = Math.floor(totalDuration / POISON_DOT.tickInterval);
  if (numberOfTicks < 1) numberOfTicks = 1;
  const damagePerTick = poisonValue / numberOfTicks;
  const ticks: DotTick[] = [];
  for (let index = 0; index < numberOfTicks; index++) {
    ticks.push({ time: index * POISON_DOT.tickInterval, damage: damagePerTick });
  }
  return ticks;
}

function buildDotBreakdown(damageMap: DamageMap): DotBreakdown {
  const fireTotal = damageMap.Fire || 0;
  const spiritTotal = damageMap.Spirit || 0;
  const poisonTotal = damageMap.Poison || 0;
  return {
    fire:   { total: fireTotal,   ticks: predictFireTicks(fireTotal)   },
    spirit: { total: spiritTotal, ticks: predictSpiritTicks(spiritTotal) },
    poison: { total: poisonTotal, ticks: predictPoisonTicks(poisonTotal) },
  };
}

/* ── DoT extraction ── */

function extractDotDamage(damageMap: DamageMap): { instant: DamageMap; dotValues: DamageMap } {
  const instant = cloneDamageMap(damageMap);
  const dotValues = createEmptyDamageMap();
  for (const typeName of DOT_DAMAGE_TYPE_NAMES) {
    dotValues[typeName] = instant[typeName] || 0;
    instant[typeName] = 0;
  }
  return { instant, dotValues };
}

/* ── Resistance modifiers ── */

function applyResistanceModifiers(
  damageMap: DamageMap,
  resistanceModifiers: ResistanceModifiers,
): DamageMap {
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

interface PlayerState {
  maxHealth: number;
  blockingSkill: number;
  blockArmor: number;
  armor: number;
  parryMultiplier: number;
  resistanceModifiers: ResistanceModifiers;
}

function calculateScenario(
  player: PlayerState,
  effectiveDamageMap: DamageMap,
  useShield: boolean,
  isParry: boolean,
): ScenarioResult {
  const staggerThreshold = calculateStaggerThreshold(player.maxHealth);

  let currentDamageMap = cloneDamageMap(effectiveDamageMap);
  let staggeredOnBlock = false;
  let blockStaggerDamage = 0;

  // --- Block phase ---
  if (useShield) {
    const parryMultiplier = isParry ? player.parryMultiplier : 1.0;
    const blockPower = calculateBlockPower(player.blockingSkill, player.blockArmor, parryMultiplier);

    const afterBlockMap = applyArmorToDamageMap(currentDamageMap, blockPower);
    const originalTotal = getTotalBlockable(currentDamageMap);
    const afterBlockTotal = getTotalBlockable(afterBlockMap);
    const actualBlocked = originalTotal - afterBlockTotal;

    blockStaggerDamage = getTotalStagger(afterBlockMap);

    if (blockStaggerDamage >= staggerThreshold) {
      staggeredOnBlock = true;
    } else {
      currentDamageMap = applyBlockDamage(currentDamageMap, actualBlocked);
    }
  }

  const blockReducedTotal = sumAllTypes(currentDamageMap);
  const afterBlockSnapshot = cloneDamageMap(currentDamageMap);

  // --- Resistance phase ---
  currentDamageMap = applyResistanceModifiers(currentDamageMap, player.resistanceModifiers);
  const resistanceMultipliedTotal = sumAllTypes(currentDamageMap);
  const afterResistanceSnapshot = cloneDamageMap(currentDamageMap);

  // --- Armor phase ---
  const afterArmorMap = applyArmorToDamageMap(currentDamageMap, player.armor);
  const afterArmorTotal = sumAllTypes(afterArmorMap);

  // --- Stagger from armor phase (2nd ApplyDamage check, always fires) ---
  // Both BlockAttack (1st check) and ApplyDamage (2nd check) add stagger damage to the SAME bar.
  // A successful block does NOT prevent the 2nd check from running — the bar accumulates.
  const armorStaggerDamage = getTotalStagger(afterArmorMap);

  // Combined stagger accumulation across both checks
  let totalStaggerAccumulation: number;
  let stagger: 'YES' | 'NO';
  if (!useShield) {
    // No shield: only ApplyDamage (2nd check) fires
    totalStaggerAccumulation = armorStaggerDamage;
    stagger = totalStaggerAccumulation >= staggerThreshold ? 'YES' : 'NO';
  } else if (staggeredOnBlock) {
    // Guard break: 1st check already overflowed bar → block fails, stagger is YES
    // ApplyDamage 2nd check still fires on the full-damage (un-blocked) path, but outcome is moot
    totalStaggerAccumulation = blockStaggerDamage;
    stagger = 'YES';
  } else {
    // Successful block: BOTH checks accumulate in the SAME stagger bar (double accumulation)
    totalStaggerAccumulation = blockStaggerDamage + armorStaggerDamage;
    stagger = totalStaggerAccumulation >= staggerThreshold ? 'YES' : 'NO';
  }

  // Min health to avoid guard break (block stagger 1st check alone).
  // "Not staggered" requires staggerDamage < threshold (strict), so minHealth = floor(damage/0.4) + 1.
  const minHealthForNoBlockStagger = blockStaggerDamage > 0 ? Math.floor(blockStaggerDamage / 0.4) + 1 : 0;
  // Min health to avoid stagger:
  //   no shield → avoid armor-phase stagger
  //   shield + successful block → avoid combined (block + armor) stagger
  //   shield + guard break → avoid block-phase stagger (same value as minHealthForNoBlockStagger)
  let minHealthToAvoidStagger: number;
  if (!useShield) {
    minHealthToAvoidStagger = armorStaggerDamage > 0 ? Math.floor(armorStaggerDamage / 0.4) + 1 : 0;
  } else if (staggeredOnBlock) {
    minHealthToAvoidStagger = minHealthForNoBlockStagger;
  } else {
    minHealthToAvoidStagger = totalStaggerAccumulation > 0 ? Math.floor(totalStaggerAccumulation / 0.4) + 1 : 0;
  }

  // --- DoT extraction ---
  const { instant: instantMap, dotValues } = extractDotDamage(afterArmorMap);
  const instantDamage = sumTypes(instantMap, INSTANT_DAMAGE_TYPE_NAMES);
  const dotBreakdown = buildDotBreakdown(dotValues);

  const totalDamage = afterArmorTotal;
  const remainingHealthBeforeDoT = player.maxHealth - instantDamage;
  const remainingHealth = player.maxHealth - totalDamage;
  let scenario: SimScenarioKey;
  if (!useShield) scenario = 'noShield';
  else if (isParry) scenario = 'parry';
  else scenario = 'block';

  return {
    scenario,
    blockReducedDamage: blockReducedTotal,
    resistanceMultipliedDamage: resistanceMultipliedTotal,
    armorReducedDamage: totalDamage,
    remainingHealthBeforeDoT,
    remainingHealth,
    stagger,
    staggeredOnBlock,
    blockStaggerDamage,
    armorStaggerDamage,
    totalStaggerAccumulation,
    minHealthForNoBlockStagger,
    minHealthToAvoidStagger,
    instantDamage,
    instantMap,
    dotBreakdown,
    damageBreakdown: {
      afterBlock: afterBlockSnapshot,
      afterResistance: afterResistanceSnapshot,
      afterArmor: cloneDamageMap(afterArmorMap),
    },
  };
}

/* ── Input resolution ── */

function resolveExtraDamagePercent(inputs: CalculationInputs): number {
  if (inputs.extraDamagePercent == null) return 0.0;
  const value = Number(inputs.extraDamagePercent);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('extraDamagePercent must be a non-negative number.');
  }
  return value;
}

function resolveDamageTypes(inputs: CalculationInputs): DamageMap {
  return normalizeDamageTypes(inputs.damageTypes as Partial<DamageMap>);
}

function resolveResistanceModifiers(inputs: CalculationInputs): ResistanceModifiers {
  if (inputs.resistanceModifiers == null || typeof inputs.resistanceModifiers !== 'object') {
    return {};
  }
  const resolved: ResistanceModifiers = {};
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
 */
export function calculate(
  inputs: CalculationInputs,
  { rng = null }: CalculationOptions = {},
): CalculationResult {
  const difficultyKey = String(inputs.difficulty) as DifficultyKey;
  if (!(difficultyKey in DIFFICULTY_ENEMY_DAMAGE_RATE)) {
    throw new Error(`Unknown difficulty: ${difficultyKey}`);
  }
  const difficultyDamageRate = DIFFICULTY_ENEMY_DAMAGE_RATE[difficultyKey];

  const baseDamageMap = resolveDamageTypes(inputs);
  const baseDamageTotal = sumAllTypes(baseDamageMap);

  const starLevel = Number(inputs.starLevel);
  const extraDamagePercent = resolveExtraDamagePercent(inputs);
  validateStarLevel(starLevel);
  validateExtraDamagePercent(extraDamagePercent);

  const effectiveDamageMap = applyEffectiveScaling(
    baseDamageMap, starLevel, extraDamagePercent, difficultyDamageRate,
  );
  const effectiveDamageTotal = sumAllTypes(effectiveDamageMap);

  let scaledDamageMap: DamageMap;
  let scaledEffectiveDamageTotal: number;
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

  const parryMultiplier = Number(inputs.parryMultiplier);
  validateParryMultiplier(parryMultiplier);
  const resistanceModifiers = resolveResistanceModifiers(inputs);
  const player: PlayerState = {
    maxHealth:          Number(inputs.maxHealth),
    blockingSkill:      Number(inputs.blockingSkill),
    blockArmor:         Number(inputs.blockArmor),
    armor:              Number(inputs.armor),
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

/* ── Range damage — damage ranges & stagger/block-bypass probabilities ── */

type ScenarioKey = 'noShield' | 'block' | 'parry';

const BINARY_SEARCH_ITERATIONS = 40;

/**
 * Binary-searches for the RNG threshold where `predicate` flips from false to true.
 * Returns the critical RNG value. The predicate should return true for "bad outcome"
 * (e.g. staggered) and false for "safe outcome".
 *
 * Assumes the predicate is monotonic: false for low RNG, true for high RNG.
 */
function findThresholdRng(
  inputs: CalculationInputs,
  scenarioKey: ScenarioKey,
  predicate: (scenario: ScenarioResult) => boolean,
): number {
  let low = RNG_MIN;
  let high = RNG_MAX;
  for (let iteration = 0; iteration < BINARY_SEARCH_ITERATIONS; iteration++) {
    const midpoint = (low + high) / 2;
    const result = calculate(inputs, { rng: midpoint });
    if (predicate(result[scenarioKey])) {
      high = midpoint;
    } else {
      low = midpoint;
    }
  }
  return (low + high) / 2;
}

function computeRangeDamageScenarioPercent(
  inputs: CalculationInputs,
  scenarioKey: ScenarioKey,
  predicate: (scenario: ScenarioResult) => boolean,
  isActiveAtMin: boolean,
  isActiveAtMax: boolean,
): number {
  if (isActiveAtMin && isActiveAtMax) return 100;
  if (!isActiveAtMin && !isActiveAtMax) return 0;
  const thresholdRng = findThresholdRng(inputs, scenarioKey, predicate);
  return Math.max(0, Math.min(100, (RNG_MAX - thresholdRng) / (RNG_MAX - RNG_MIN) * 100));
}

function sumDotTotals(dotBreakdown: DotBreakdown): number {
  let total = 0;
  for (const key of ['fire', 'spirit', 'poison'] as const) {
    const dotData = dotBreakdown[key];
    if (dotData.ticks.length > 0) {
      total += dotData.total;
    }
  }
  return total;
}

function buildRangeDamageScenario(
  inputs: CalculationInputs,
  scenarioAtMin: ScenarioResult,
  scenarioAtMax: ScenarioResult,
  scenarioKey: ScenarioKey,
): RangeDamageScenarioResult {
  const isStaggeredAtMin = scenarioAtMin.stagger === 'YES';
  const isStaggeredAtMax = scenarioAtMax.stagger === 'YES';
  const isBlockBypassedAtMin = scenarioAtMin.staggeredOnBlock;
  const isBlockBypassedAtMax = scenarioAtMax.staggeredOnBlock;

  const staggerPercent = computeRangeDamageScenarioPercent(
    inputs, scenarioKey,
    (scenario) => scenario.stagger === 'YES',
    isStaggeredAtMin, isStaggeredAtMax,
  );

  const blockBypassPercent = scenarioKey === 'noShield'
    ? 0
    : computeRangeDamageScenarioPercent(
        inputs, scenarioKey,
        (scenario) => scenario.staggeredOnBlock,
        isBlockBypassedAtMin, isBlockBypassedAtMax,
      );

  const dotDamageMin = sumDotTotals(scenarioAtMin.dotBreakdown);
  const dotDamageMax = sumDotTotals(scenarioAtMax.dotBreakdown);

  return {
    instantDamageMin: scenarioAtMin.instantDamage,
    instantDamageMax: scenarioAtMax.instantDamage,
    instantMapMin: scenarioAtMin.instantMap,
    instantMapMax: scenarioAtMax.instantMap,
    dotDamageMin,
    dotDamageMax,
    dotBreakdownMin: scenarioAtMin.dotBreakdown,
    dotBreakdownMax: scenarioAtMax.dotBreakdown,
    remainingHealthBeforeDoTMin: scenarioAtMax.remainingHealthBeforeDoT,
    remainingHealthBeforeDoTMax: scenarioAtMin.remainingHealthBeforeDoT,
    remainingHealthMin: scenarioAtMax.remainingHealth,
    remainingHealthMax: scenarioAtMin.remainingHealth,
    staggerPercent,
    blockBypassPercent,
  };
}

/**
 * Computes range-damage data: damage ranges and stagger/block-bypass probabilities
 * across the full RNG range [0.75, 1.0].
 */
export function calculateRangeDamage(inputs: CalculationInputs): RangeDamageResult {
  const resultAtMin = calculate(inputs, { rng: RNG_MIN });
  const resultAtMax = calculate(inputs, { rng: RNG_MAX });

  return {
    noShield: buildRangeDamageScenario(inputs, resultAtMin.noShield, resultAtMax.noShield, 'noShield'),
    block:    buildRangeDamageScenario(inputs, resultAtMin.block,    resultAtMax.block,    'block'),
    parry:    buildRangeDamageScenario(inputs, resultAtMin.parry,    resultAtMax.parry,    'parry'),
  };
}
