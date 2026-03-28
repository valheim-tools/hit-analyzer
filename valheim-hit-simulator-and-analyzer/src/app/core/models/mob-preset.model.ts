import { DamageTypeName } from './damage-map.model';

export interface MobAttack {
  attack_name: string;
  attack_type: string;
  Blunt?: number;
  Slash?: number;
  Pierce?: number;
  Fire?: number;
  Frost?: number;
  Lightning?: number;
  Poison?: number;
  Spirit?: number;
  _mobPrefab?: string;
  _mobIconFile?: string;
}

export interface MobEntry {
  mob_name: string;
  prefab: string;
  icon_file: string;
  attacks: MobAttack[];
}

export interface MobAttackData {
  [biome: string]: MobEntry[];
}

export interface FlatMobPreset extends MobAttack {
  _id: string;
  _label: string;
  _mobPrefab: string;
  _mobIconFile: string;
}

