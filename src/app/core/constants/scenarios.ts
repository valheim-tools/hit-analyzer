/** Canonical ordering of scenario keys. */
export const SIM_SCENARIO_KEYS = ['noShield', 'block', 'parry'] as const;

/** Union of all scenario key strings, derived from SIM_SCENARIO_KEYS. */
export type SimScenarioKey = typeof SIM_SCENARIO_KEYS[number];

/** Human-readable label for each scenario key. */
export const SIM_SCENARIO_LABELS: Record<SimScenarioKey, string> = {
  noShield: 'No Shield',
  block:    'Block',
  parry:    'Parry',
};

