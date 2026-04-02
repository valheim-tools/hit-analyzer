import { DamageTypeName } from '../constants';
import { DifficultyKey } from './calculation.model';
import { SimScenarioKey } from '../constants/scenarios';

export type { SimScenarioKey };
export type ParryMultiplierMode = 'preset' | 'custom';

export interface DamageTypeEntry {
  type: DamageTypeName;
  value: number;
}

export interface ResistanceModifierEntry {
  type: DamageTypeName;
  percent: number;
}

export interface FormState {
  mobPreset: string;
  damageTypes: DamageTypeEntry[];
  starLevel: number;
  difficulty: DifficultyKey;
  extraDamagePercent: number;
  maxHealth: number;
  blockingSkill: number;
  blockArmor: number;
  armor: number;
  parryMultiplier: number;
  parryMultiplierMode: ParryMultiplierMode;
  resistanceModifiers: ResistanceModifierEntry[];
  shieldPreset: string;
  shieldQuality: number;
  riskFactor: number;
  dotSpeed: number;
  animationSpeed: number;
}

