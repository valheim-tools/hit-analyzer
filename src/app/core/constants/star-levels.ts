/** Canonical ordering of star levels. */
export const STAR_LEVELS = [0, 1, 2] as const;

/** Union of valid star level values, derived from STAR_LEVELS. */
export type StarLevel = typeof STAR_LEVELS[number];

/** Short human-readable label for each star level. */
export const STAR_LEVEL_LABELS: Record<StarLevel, string> = {
  0: '0★',
  1: '1★',
  2: '2★',
};

/**
 * Damage bonus as an integer percentage offset per star level.
 * e.g. 1★ = 50 means +50 % incoming damage.
 */
export const STAR_LEVEL_DAMAGE_BONUS_PERCENT: Record<StarLevel, number> = {
  0:   0,
  1:  50,
  2: 100,
};

