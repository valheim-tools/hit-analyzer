import { DamageTypeName } from '../../../core/models';


// ── Shared types ──────────────────────────────────────────────────────────────

export interface DamageBadge {
  icon: string;
  value: number;
  cssClass: string;
}

export interface AnalysisSharedData {
  badges: DamageBadge[];
  total: number;
}

export interface TypeBreakdownEntry {
  typeName: DamageTypeName;
  icon: string;
  beforeValue: number;
  afterValue: number;
  outputVarPrefix: string;  // e.g. 'blockReduced', 'armorReduced'
  inputTotal: number;
  outputTotal: number;
  ratio: number;
  isStaggerType: boolean;
}

export interface TypeResistanceEntry {
  typeName: DamageTypeName;
  lowerTypeName: string;
  icon: string;
  beforeValue: number;
  afterValue: number;
  multiplier: number;
}

export interface TypeActiveSum {
  typeName: DamageTypeName;
  value: number;
}

export interface DotDisregardEntry {
  icon: string;
  total: number;
  hasThreshold: boolean;
  perTick: number | null;
  threshold: number | null;
}

export interface FormulaTermEntry {
  variableName: string;
  value: number;
}

export interface StaggerTermEntry {
  variableName: string;
  value: number;
}


// ── Per-step analysis interfaces ──────────────────────────────────────────────

export interface EffectiveDamageStepAnalysis {
  baseDamage: number;
  difficultyBonus: number;
  starLevelBonus: number;
  extraDamagePercent: number;
  totalMultiplier: number;
  effectiveDamage: number;
  hasRiskFactor: boolean;
  riskFactorValue: number;
  rngBasePercentile: number;  // (100 − riskFactorValue) / 100
  rngValue: number;
  rngFactor: number;
  scaledEffectiveDamage: number;
}

export interface EffectiveBlockArmorStepAnalysis {
  isSkipped: boolean;
  blockArmor: number;
  blockingSkill: number;
  skillFactor: number;
  isParry: boolean;
  parryMultiplier: number;
  effectiveBlockArmor: number;
}

export interface BlockReducedDamageStepAnalysis {
  isSkipped: boolean;
  effectiveBlockArmor: number;
  inputDamage: number;
  halfInputDamage: number;
  isLinear: boolean;
  isExactTie: boolean;
  afterBlockDamage: number;
  staggeredOnBlock: boolean;
  blockStaggerDamage: number;
  blockStaggerTerms: StaggerTermEntry[];
  staggerThreshold: number;
  maxHealth: number;
  typeBreakdowns: TypeBreakdownEntry[];
}

export interface ResistanceMultipliedDamageStepAnalysis {
  isSkipped: boolean;
  isNotAffecting: boolean;
  typeResistances: TypeResistanceEntry[];
  activeSums: TypeActiveSum[];
  afterResistanceDamage: number;
}

export interface ArmorReducedDamageStepAnalysis {
  armorInputDamage: number;
  armor: number;
  halfArmorInput: number;
  isLinear: boolean;
  isExactArmorThreshold: boolean;
  armorReducedDamage: number;
  staggerOccurred: boolean;
  isNoShieldScenario: boolean;
  isBlockBypassed: boolean;
  blockStaggerDamage: number;
  staggerBuildupValue: number;
  armorStaggerDamage: number;
  armorStaggerTerms: StaggerTermEntry[];
  totalStaggerAccumulation: number;
  staggerThreshold: number;
  maxHealth: number;
  typeBreakdowns: TypeBreakdownEntry[];
}

export interface AdjustedTotalDamageStepAnalysis {
  hasDisregardedDot: boolean;
  hasAnyDot: boolean;
  dotDisregardEntries: DotDisregardEntry[];
  disregardedTotal: number;
  armorReducedDamage: number;
  adjustedTotal: number;
}

export interface RemainingHealthStepAnalysis {
  maxHealth: number;
  adjustedTotal: number;
  adjustedInstantDamage: number;
  adjustedInstantDamageTerms: FormulaTermEntry[];
  adjustedDotDamage: number;
  adjustedDotDamageTerms: FormulaTermEntry[];
  remainingHealth: number;
  isDead: boolean;
}


// ── Scenario aggregate ────────────────────────────────────────────────────────

export interface ScenarioAnalysis {
  title: string;
  effectiveDamage: EffectiveDamageStepAnalysis;
  effectiveBlockArmor: EffectiveBlockArmorStepAnalysis;
  blockReducedDamage: BlockReducedDamageStepAnalysis;
  resistanceMultipliedDamage: ResistanceMultipliedDamageStepAnalysis;
  armorReducedDamage: ArmorReducedDamageStepAnalysis;
  adjustedTotalDamage: AdjustedTotalDamageStepAnalysis;
  remainingHealth: RemainingHealthStepAnalysis;
}

