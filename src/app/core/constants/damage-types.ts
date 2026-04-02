/** Physical, Frost and Lightning — applied instantly to health. */
export const INSTANT_DAMAGE_TYPE_NAMES = ['Blunt', 'Slash', 'Pierce', 'Frost', 'Lightning'] as const;

/** Fire, Poison and Spirit — applied over time. */
export const DOT_DAMAGE_TYPE_NAMES = ['Fire', 'Poison', 'Spirit'] as const;

/** Damage types that contribute to stagger accumulation (Blunt, Slash, Pierce, Lightning). */
export const STAGGER_DAMAGE_TYPE_NAMES = ['Blunt', 'Slash', 'Pierce', 'Lightning'] as const;

/** All damage type names in canonical display order (instant first, then DoT). */
export const DAMAGE_TYPE_NAMES = [...INSTANT_DAMAGE_TYPE_NAMES, ...DOT_DAMAGE_TYPE_NAMES] as const;

/** Union of all damage type name strings, derived from DAMAGE_TYPE_NAMES. */
export type DamageTypeName = typeof DAMAGE_TYPE_NAMES[number];

/** A numeric value for each damage type. */
export type DamageMap = Record<DamageTypeName, number>;


/** Emoji icon for each damage type. */
export const DAMAGE_TYPE_ICONS: Record<DamageTypeName, string> = {
  Blunt: '🔨', Slash: '⚔️', Pierce: '🏹', Fire: '🔥',
  Frost: '❄️', Lightning: '⚡', Poison: '☣️', Spirit: '👻',
};

/** CSS modifier class for each damage type badge. */
export const DAMAGE_TYPE_CSS_CLASSES: Record<DamageTypeName, string> = {
  Blunt: 'dt-blunt', Slash: 'dt-slash', Pierce: 'dt-pierce', Fire: 'dt-fire',
  Frost: 'dt-frost', Lightning: 'dt-lightning', Poison: 'dt-poison', Spirit: 'dt-spirit',
};

