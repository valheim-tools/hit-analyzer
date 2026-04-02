import { DamageTypeName } from '../../core/constants';

export interface MeadResistanceEntry {
  type: DamageTypeName;
  multiplier: number;
}

export interface MeadPreset {
  name: string;
  duration: string;
  cooldown: string;
  resistances: MeadResistanceEntry[];
  image_file: string | null;
}

export interface EquippedMeadSlot {
  mead: MeadPreset | null;
}
