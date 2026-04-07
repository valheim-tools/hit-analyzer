import { DamageMap, DifficultyKey, SimScenarioKey } from '../constants';

export type { DifficultyKey };

export interface ResistanceModifiers {
  [key: string]: number;
}

export interface CalculationInputs {
  damageTypes: Partial<DamageMap>;
  starLevel: number;
  extraDamagePercent?: number;
  difficulty: DifficultyKey;
  maxHealth: number;
  blockingSkill: number;
  blockArmor: number;
  armor: number;
  parryMultiplier: number;
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
  scenario: SimScenarioKey;
  blockReducedDamage: number;
  resistanceMultipliedDamage: number;
  armorReducedDamage: number;
  remainingHealthBeforeDoT: number;
  remainingHealth: number;
  stagger: 'YES' | 'NO';
  staggeredOnBlock: boolean;
  blockStaggerDamage: number;
  armorStaggerDamage: number;
  totalStaggerAccumulation: number;
  minHealthForNoBlockStagger: number;
  minHealthToAvoidStagger: number;
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

export interface RangeDamageScenarioResult {
  instantDamageMin: number;
  instantDamageMax: number;
  instantMapMin: DamageMap;
  instantMapMax: DamageMap;
  dotDamageMin: number;
  dotDamageMax: number;
  dotBreakdownMin: DotBreakdown;
  dotBreakdownMax: DotBreakdown;
  remainingHealthBeforeDoTMin: number;
  remainingHealthBeforeDoTMax: number;
  remainingHealthMin: number;
  remainingHealthMax: number;
  staggerPercent: number;
  blockBypassPercent: number;
}

export interface RangeDamageResult {
  noShield: RangeDamageScenarioResult;
  block: RangeDamageScenarioResult;
  parry: RangeDamageScenarioResult;
}
