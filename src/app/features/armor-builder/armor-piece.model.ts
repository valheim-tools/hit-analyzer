import { DamageTypeName } from '../../core/constants';

export interface ArmorPiece {
  name: string;
  slot: string;
  armor_by_quality: (number | null)[];
  max_quality: number;
  set_bonus: string | null;
  piece_effects: string | null;
  set_name: string | null;
  set_biome: string | null;
  set_type: string | null;
  image_file: string | null;
  /** Only present on capes — links cape to an armor set. */
  associated_set?: string | null;
}

export interface ArmorSetInfo {
  biome: string;
  type: string;
  set_bonus: string | null;
  pieces: Record<string, string>;
  total_armor_by_quality: (number | null)[];
}

export interface ArmorPiecesData {
  helmets: ArmorPiece[];
  chest_armor: ArmorPiece[];
  leg_armor: ArmorPiece[];
  capes: ArmorPiece[];
  sets: Record<string, ArmorSetInfo>;
}

export interface ParsedResistanceEffect {
  type: DamageTypeName;
  multiplier: number;
}

export interface EquippedSlot {
  piece: ArmorPiece | null;
  quality: number;
}

export interface ArmorSetPreset {
  setName: string;
  biome: string;
  type: string;
  setBonus: string | null;
  iconFile: string | null;
  totalArmorByQuality: (number | null)[];
  hasHelmet: boolean;
  hasCape: boolean;
}


