import { SimScenarioKey } from '../models';

/** Canonical ordering of scenario keys. */
export const SIM_SCENARIO_KEYS: readonly SimScenarioKey[] = Object.freeze(['noShield', 'block', 'parry']);

/** Human-readable label for each scenario key. */
export const SIM_SCENARIO_LABELS: Readonly<Record<SimScenarioKey, string>> = Object.freeze({
  noShield: 'No Shield',
  block:    'Block',
  parry:    'Parry',
});

