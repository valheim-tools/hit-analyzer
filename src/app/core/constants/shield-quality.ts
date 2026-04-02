/** Canonical ordering of shield quality levels. */
export const SHIELD_QUALITY_LEVELS = [1, 2, 3] as const;

/** Union of valid shield quality level values, derived from SHIELD_QUALITY_LEVELS. */
export type ShieldQualityLevel = typeof SHIELD_QUALITY_LEVELS[number];



