import { DamageTypeName } from './damage-map.model';
import { DifficultyKey } from './calculation.model';

export type SimScenarioKey = 'noShield' | 'block' | 'parry';
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
}

