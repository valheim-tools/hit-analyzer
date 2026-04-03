import { DamageMap } from '../../core/constants';

export interface MobAttack extends Partial<DamageMap> {
  attack_name: string;
  attack_type: string;
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
  _mobName: string;
  _mobPrefab: string;
  _mobIconFile: string;
}
