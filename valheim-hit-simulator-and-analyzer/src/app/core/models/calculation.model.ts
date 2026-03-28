import { DamageMap, DamageTypeName } from './damage-map.model';

export type DifficultyKey = 'VERY_EASY' | 'EASY' | 'NORMAL' | 'HARD' | 'VERY_HARD';
export type ParryBonusKey = 'X1' | 'X1_5' | 'X2' | 'X2_5' | 'X4' | 'X6';
export type ResistancePresetKey =
  | 'VERY_WEAK'
  | 'WEAK'
  | 'SLIGHTLY_WEAK'
  | 'NEUTRAL'
  | 'SLIGHTLY_RESISTANT'
  | 'RESISTANT'
  | 'VERY_RESISTANT'
  | 'IMMUNE';

export interface ResistanceModifiers {
  [key: string]: number;
}

export interface CalculationInputs {
  damageTypes?: Partial<DamageMap>;
  /** @deprecated use damageTypes instead */
  baseDamage?: number;
  starLevel: number;
  extraDamagePercent?: number;
  /** @deprecated use extraDamagePercent instead */
  extraDamage?: number;
  difficulty: DifficultyKey;
  maxHealth: number;
  blockingSkill: number;
  blockArmor: number;
  armor: number;
  parryMultiplier?: number;
  /** @deprecated use parryMultiplier instead */
  parryBonus?: ParryBonusKey;
  resistanceModifiers?: ResistanceModifiers;
}

export interface CalculationOptions {
  rng?: number | null;
}

export interface DotTick {
  time: number;
  damage: number;
}

export interface DotData {
  total: number;
  ticks: DotTick[];
}

export interface DotBreakdown {
  fire: DotData;
  spirit: DotData;
  poison: DotData;
}

export interface DamageBreakdownSnapshot {
  afterBlock: DamageMap;
  afterResistance: DamageMap;
  afterArmor: DamageMap;
}

export interface ScenarioResult {
  scenarioName: string;
  blockReducedDamage: number;
  resistanceMultipliedDamage: number;
  armorReducedDamage: number;
  remainingHealth: number;
  stagger: 'YES' | 'NO';
  staggeredOnBlock: boolean;
  blockStaggerDamage: number;
  armorStaggerDamage: number;
  minHealthForNoBlockStagger: number;
  minHealthForNoArmorStagger: number;
  instantDamage: number;
  instantMap: DamageMap;
  dotBreakdown: DotBreakdown;
  damageBreakdown: DamageBreakdownSnapshot;
}

export interface CalculationResult {
  baseDamage: number;
  baseDamageMap: DamageMap;
  effectiveDamage: number;
  effectiveDamageMap: DamageMap;
  scaledEffectiveDamage: number;
  scaledDamageMap: DamageMap;
  noShield: ScenarioResult;
  block: ScenarioResult;
  parry: ScenarioResult;
}

export interface ResistancePresetEntry {
  multiplier: number;
  label: string;
  percent: number;
}

