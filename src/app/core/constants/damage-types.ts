import { DamageTypeName } from '../models';

/** All damage type names in canonical display order. */
export const DAMAGE_TYPE_NAMES: readonly DamageTypeName[] = [
  'Blunt', 'Slash', 'Pierce', 'Fire', 'Frost', 'Lightning', 'Poison', 'Spirit',
];

/** Physical, Frost and Lightning — applied instantly to health. */
export const INSTANT_DAMAGE_TYPE_NAMES: readonly DamageTypeName[] = [
  'Blunt', 'Slash', 'Pierce', 'Frost', 'Lightning',
];

/** Fire, Poison and Spirit — applied over time. */
export const DOT_DAMAGE_TYPE_NAMES: readonly DamageTypeName[] = [
  'Fire', 'Poison', 'Spirit',
];

/** Emoji icon for each damage type. */
export const DAMAGE_TYPE_ICONS: Record<DamageTypeName, string> = {
  Blunt: '🔨', Slash: '🗡️', Pierce: '🏹', Fire: '🔥',
  Frost: '❄️', Lightning: '⚡', Poison: '☣️', Spirit: '👻',
};

/** CSS modifier class for each damage type badge. */
export const DAMAGE_TYPE_CSS_CLASSES: Record<DamageTypeName, string> = {
  Blunt: 'dt-blunt', Slash: 'dt-slash', Pierce: 'dt-pierce', Fire: 'dt-fire',
  Frost: 'dt-frost', Lightning: 'dt-lightning', Poison: 'dt-poison', Spirit: 'dt-spirit',
};

