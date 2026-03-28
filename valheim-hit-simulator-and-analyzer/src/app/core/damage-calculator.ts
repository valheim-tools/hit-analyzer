/**
 * All game math — single source of truth for damage calculations.
 * No external dependencies — pure TypeScript module.
 *
 * Supports per-type damage maps: { Blunt: 40, Fire: 20 }
 * Pipeline: difficulty scaling → block/parry → resistance modifiers → body armor → DoT extraction
 */

import {
  DamageMap,
  DamageTypeName,
  DifficultyKey,
  ParryBonusKey,
  CalculationInputs,
  CalculationOptions,
  CalculationResult,
  ScenarioResult,
  DotData,
  DotTick,
  DotBreakdown,
  DamageBreakdownSnapshot,
  ResistanceModifiers,
} from './models';

/* ── Constants ── */

const DAMAGE_TYPE_NAMES: readonly DamageTypeName[] = Object.freeze([
  'Blunt', 'Slash', 'Pierce',
  'Fire', 'Frost', 'Lightning',
  'Poison', 'Spirit',
]);

const BLOCKABLE_TYPES: readonly DamageTypeName[] = Object.freeze([
  'Blunt', 'Slash', 'Pierce',
  'Fire', 'Frost', 'Lightning',
  'Poison', 'Spirit',
]);

export const STAGGER_TYPES: readonly DamageTypeName[] = Object.freeze([
  'Blunt', 'Slash', 'Pierce', 'Lightning',
]);

const DOT_TYPES: readonly DamageTypeName[] = Object.freeze(['Fire', 'Poison', 'Spirit']);

const INSTANT_TYPES: readonly DamageTypeName[] = Object.freeze([
  'Blunt', 'Slash', 'Pierce', 'Frost', 'Lightning',
]);

/* ── Difficulty ── */

interface DifficultyEntry {
  damageBonus: number;
}

const DIFFICULTY: Readonly<Record<DifficultyKey, DifficultyEntry>> = Object.freeze({
  VERY_EASY: { damageBonus: -0.50 },
  EASY:      { damageBonus: -0.25 },
  NORMAL:    { damageBonus:  0.0  },
  HARD:      { damageBonus:  0.5  },
  VERY_HARD: { damageBonus:  1.0  },
});

/* ── ParryBonus (legacy enum lookup) ── */

const PARRY_BONUS: Readonly<Record<ParryBonusKey, number>> = Object.freeze({
  X1:   1.0,
  X1_5: 1.5,
  X2:   2.0,
  X2_5: 2.5,
  X4:   4.0,
  X6:   6.0,
});

/* ── Resistance Presets ── */

export interface ResistancePresetEntry {
  multiplier: number;
  label: string;
  percent: number;
}

export const RESISTANCE_PRESET: Readonly<Record<string, ResistancePresetEntry>> = Object.freeze({
  VERY_WEAK:          { multiplier: 2.00, label: 'Very Weak',          percent: 200 },
  WEAK:               { multiplier: 1.50, label: 'Weak',               percent: 150 },
  SLIGHTLY_WEAK:      { multiplier: 1.25, label: 'Slightly Weak',      percent: 125 },
  NEUTRAL:            { multiplier: 1.00, label: 'Neutral',            percent: 100 },
  SLIGHTLY_RESISTANT: { multiplier: 0.75, label: 'Slightly Resistant', percent: 75  },
  RESISTANT:          { multiplier: 0.50, label: 'Resistant',          percent: 50  },
  VERY_RESISTANT:     { multiplier: 0.25, label: 'Very Resistant',     percent: 25  },
  IMMUNE:             { multiplier: 0.00, label: 'Immune',             percent: 0   },
});

/* ── DoT prefab constants ── */

const FIRE_DOT = Object.freeze({ totalDuration: 5.0, tickInterval: 1.0, minimumPerTick: 0.2 });
const SPIRIT_DOT = Object.freeze({ totalDuration: 3.0, tickInterval: 0.5, minimumPerTick: 0.2 });
const POISON_DOT = Object.freeze({
  baseDuration: 1.0,
  durationPerDamagePlayer: 5.0,
  durationPower: 0.5,
  tickInterval: 1.0,
});

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

/* ── Effective damage (per-type scaling) ── */

function applyEffectiveScaling(
  damageMap: DamageMap,
  starLevel: number,
  extraDamagePercent: number,
  difficulty: DifficultyEntry,
): DamageMap {
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

function applyArmorSingle(damage: number, armor: number): number {
  if (damage <= 0 || armor <= 0) return damage;
  if (armor < damage / 2.0) {
    return damage - armor;
  }
  return (damage * damage) / (armor * 4.0);
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
  return sumTypes(damageMap, BLOCKABLE_TYPES);
}

function getTotalStagger(damageMap: DamageMap): number {
  return sumTypes(damageMap, STAGGER_TYPES);
}

function applyBlockDamage(damageMap: DamageMap, actualBlocked: number): DamageMap {
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

function calculateStaggerThreshold(maxHealth: number): number {
  return 0.40 * maxHealth;
}

/* ── Block power ── */

function calculateBlockPower(
  blockingSkill: number,
  blockArmor: number,
  parryMultiplier: number,
): number {
  const skillFactor = blockingSkill / 100.0;
  return blockArmor * (1.0 + skillFactor * 0.5) * parryMultiplier;
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
  for (const typeName of DOT_TYPES) {
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

    if (blockStaggerDamage > staggerThreshold) {
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

  // --- Stagger from armor phase ---
  let armorStaggerDamage: number;
  if (!useShield) {
    armorStaggerDamage = getTotalStagger(afterArmorMap);
  } else {
    armorStaggerDamage = staggeredOnBlock ? 0 : getTotalStagger(afterArmorMap);
  }

  const stagger: 'YES' | 'NO' =
    staggeredOnBlock || armorStaggerDamage > staggerThreshold ? 'YES' : 'NO';

  const minHealthForNoBlockStagger = blockStaggerDamage > 0 ? Math.ceil(blockStaggerDamage / 0.4) : 0;
  const minHealthForNoArmorStagger = armorStaggerDamage > 0 ? Math.ceil(armorStaggerDamage / 0.4) : 0;

  // --- DoT extraction ---
  const { instant: instantMap, dotValues } = extractDotDamage(afterArmorMap);
  const instantDamage = sumTypes(instantMap, INSTANT_TYPES);
  const dotBreakdown = buildDotBreakdown(dotValues);

  const totalDamage = afterArmorTotal;
  const remainingHealth = player.maxHealth - totalDamage;

  let scenarioName: string;
  if (!useShield) scenarioName = 'No Shield';
  else if (isParry) scenarioName = 'Parry';
  else scenarioName = 'Block';

  return {
    scenarioName,
    blockReducedDamage: blockReducedTotal,
    resistanceMultipliedDamage: resistanceMultipliedTotal,
    armorReducedDamage: totalDamage,
    remainingHealth,
    stagger,
    staggeredOnBlock,
    blockStaggerDamage,
    armorStaggerDamage,
    minHealthForNoBlockStagger,
    minHealthForNoArmorStagger,
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

function resolveParryMultiplier(inputs: CalculationInputs): number {
  if (inputs.parryMultiplier != null && inputs.parryMultiplier !== (undefined as any)) {
    const multiplier = Number(inputs.parryMultiplier);
    validateParryMultiplier(multiplier);
    return multiplier;
  }
  if (inputs.parryBonus != null && String(inputs.parryBonus).trim() !== '') {
    const key = String(inputs.parryBonus) as ParryBonusKey;
    if (!(key in PARRY_BONUS)) {
      throw new Error(`Unknown parryBonus: ${key}`);
    }
    return PARRY_BONUS[key];
  }
  throw new Error('parryMultiplier is required.');
}

function resolveExtraDamagePercent(inputs: CalculationInputs): number {
  const inputValue = inputs.extraDamagePercent != null ? inputs.extraDamagePercent : inputs.extraDamage;
  if (inputValue == null) return 0.0;
  const value = Number(inputValue);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('extraDamagePercent must be a non-negative number.');
  }
  return value;
}

function resolveDamageTypes(inputs: CalculationInputs): DamageMap {
  if (inputs.damageTypes != null && typeof inputs.damageTypes === 'object') {
    return normalizeDamageTypes(inputs.damageTypes as Partial<DamageMap>);
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

  const effectiveDamageMap = applyEffectiveScaling(
    baseDamageMap, starLevel, extraDamagePercent, difficulty,
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

  const parryMultiplier = resolveParryMultiplier(inputs);
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

