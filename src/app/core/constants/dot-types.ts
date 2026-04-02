import { DamageTypeName } from './damage-types';
import { DotBreakdown } from '../models';

/* ── DoT prefab constants ── */

export const FIRE_DOT = { totalDuration: 5.0, tickInterval: 1.0, minimumPerTick: 0.2 };
export const SPIRIT_DOT = { totalDuration: 3.0, tickInterval: 0.5, minimumPerTick: 0.2 };
export const POISON_DOT = {
  baseDuration: 1.0,
  durationPerDamagePlayer: 5.0,
  durationPower: 0.5,
  tickInterval: 1.0,
};

/** Per-type metadata derived from DoT game constants. Shared by analysis and simulator. */
export interface DotTypeConfig {
  /** Key used in `DotBreakdown` (lowercase). */
  readonly key: keyof DotBreakdown;
  /** Corresponding `DamageTypeName` (capitalized, for icon / CSS lookups). */
  readonly damageTypeName: DamageTypeName;
  /** Total DoT duration in seconds. `null` for Poison (variable). */
  readonly totalDuration: number | null;
  /** Per-tick minimum — ticks below this value are disregarded. `null` for Poison (no minimum). */
  readonly minimumPerTick: number | null;
  /** Fixed tick count. `null` for Poison (variable). */
  readonly tickCount: number | null;
}

export const DOT_TYPE_CONFIGS: readonly DotTypeConfig[] = [
  {
    key: 'fire' as const,
    damageTypeName: 'Fire',
    totalDuration: FIRE_DOT.totalDuration,
    minimumPerTick: FIRE_DOT.minimumPerTick,
    tickCount: Math.floor(FIRE_DOT.totalDuration / FIRE_DOT.tickInterval),
  },
  {
    key: 'spirit' as const,
    damageTypeName: 'Spirit',
    totalDuration: SPIRIT_DOT.totalDuration,
    minimumPerTick: SPIRIT_DOT.minimumPerTick,
    tickCount: Math.floor(SPIRIT_DOT.totalDuration / SPIRIT_DOT.tickInterval),
  },
  {
    key: 'poison' as const,
    damageTypeName: 'Poison',
    totalDuration: null,
    minimumPerTick: null,
    tickCount: null,
  },
];


