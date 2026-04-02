import { SimScenarioKey } from './form-state.model';

export interface HitLogEntry {
  hitNumber: number;
  scenarioKey: SimScenarioKey;
  damage: number;
  remainingHealth: number;
  exactRemainingHealth: number;
  isStaggered: boolean;
  isStaggeredOnBlock: boolean;
  rngFactor: number | null;
  isDead: boolean;
}

export interface DotTickLogEntry {
  dotTypeName: string;
  tickIndex: number;
  totalTicks: number;
  tickDamage: number;
  remainingHealth: number;
  isDead: boolean;
}

export type SimLogEntry = { kind: 'hit'; data: HitLogEntry } | { kind: 'dot'; data: DotTickLogEntry };

export interface SimulatorState {
  maxHealth: number;
  currentHealth: number;
  hitCount: number;
  isDead: boolean;
  isDotAnimating: boolean;
  healthPercent: number;
  log: SimLogEntry[];
  arenaScenarioKey: SimScenarioKey | null;
  arenaIsStaggered: boolean;
  arenaIsDead: boolean;
  arenaIsAnimating: boolean;
}
