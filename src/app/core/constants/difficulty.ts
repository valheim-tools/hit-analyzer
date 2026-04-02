/** Canonical ordering of difficulty keys. */
export const DIFFICULTY_KEYS = [
  'VERY_EASY', 'EASY', 'NORMAL', 'HARD', 'VERY_HARD',
] as const;

/** Union of all difficulty key strings, derived from DIFFICULTY_KEYS. */
export type DifficultyKey = typeof DIFFICULTY_KEYS[number];

/** Short human-readable label for each difficulty. */
export const DIFFICULTY_LABELS: Record<DifficultyKey, string> = {
  VERY_EASY: 'Very Easy',
  EASY:      'Easy',
  NORMAL:    'Normal',
  HARD:      'Hard',
  VERY_HARD: 'Very Hard',
};

/**
 * Damage bonus as an integer percentage offset.
 * e.g. VERY_EASY = -50 means 50 % less incoming damage.
 */
export const DIFFICULTY_DAMAGE_BONUS_PERCENT: Record<DifficultyKey, number> = {
  VERY_EASY: -50,
  EASY:      -25,
  NORMAL:      0,
  HARD:       50,
  VERY_HARD: 100,
};



