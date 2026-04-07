import { DOT_TYPE_CONFIGS, DAMAGE_TYPE_ICONS } from '../../../core/constants';

// ── Shared constants ─────────────────────────────────────────────────────────

export const DOT_TYPE_DEFINITIONS = DOT_TYPE_CONFIGS.map(config => ({
  key: config.key,
  icon: DAMAGE_TYPE_ICONS[config.damageTypeName],
  fixedDuration: config.totalDuration,
}));

// ── View mode ────────────────────────────────────────────────────────────────

export type ViewMode = 'maxDamage' | 'rangeDamage';

// ── Shared display models ────────────────────────────────────────────────────

export interface DamageDisplayLine {
  text: string;
  cssClass: string;
}

