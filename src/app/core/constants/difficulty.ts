import { DifficultyKey } from '../models';

/** Canonical ordering of difficulty keys. */
export const DIFFICULTY_KEYS: readonly DifficultyKey[] = [
  'VERY_EASY', 'EASY', 'NORMAL', 'HARD', 'VERY_HARD',
];

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

/** Long-form description shown in the mob-attack form label. */
export const DIFFICULTY_EFFECT_DESCRIPTIONS: Record<DifficultyKey, string> = {
  VERY_EASY: '50% less damage (flat)',
  EASY:      '25% less damage (flat)',
  NORMAL:    '0% additional damage bonus',
  HARD:      '50% additional damage bonus',
  VERY_HARD: '100% additional damage bonus',
};

