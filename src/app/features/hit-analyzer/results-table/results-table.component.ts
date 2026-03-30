import { Component, input, computed } from '@angular/core';
import { CalculationResult, ScenarioResult, FormState, DamageTypeName } from '../../../core/models';
import {
  INSTANT_DAMAGE_TYPE_NAMES, DAMAGE_TYPE_ICONS,
  DIFFICULTY_LABELS, DIFFICULTY_DAMAGE_BONUS_PERCENT,
  SIM_SCENARIO_LABELS, DAMAGE_DISPLAY_THRESHOLD,
} from '../../../core/constants';
import { DOT_TYPE_CONFIGS } from '../../../core/damage-calculator';
import { FormatNumberPipe } from '../../../shared/pipes/format-number.pipe';

// ── Constants ────────────────────────────────────────────────────────────────

const DOT_TYPE_DEFINITIONS = DOT_TYPE_CONFIGS.map(config => ({
  key: config.key,
  icon: DAMAGE_TYPE_ICONS[config.damageTypeName],
  fixedDuration: config.totalDuration,
}));


// ── Cell / row models ────────────────────────────────────────────────────────

export type CellKind = 'number' | 'skull' | 'stagger' | 'health-check' | 'damage-lines';
export type StaggerValue = 'yes' | 'no' | 'na';
export type HealthStatus = 'safe' | 'warning' | 'zero' | 'na';

export interface DamageLine {
  icon: string;
  /** null → render a dash */
  displayValue: number | null;
  /** when set, render `icon displayText` instead of a formatted number */
  displayText?: string;
}

/** Flat (non-discriminated) interface so Angular templates can access all
 *  fields without type-narrowing issues inside @switch cases. */
export interface TableCell {
  kind: CellKind;
  numericValue?: number;   // 'number' | 'skull'
  staggerValue?: StaggerValue;      // 'stagger'
  healthStatus?: HealthStatus;      // 'health-check'
  healthValue?: number;             // 'health-check'
  lines?: DamageLine[];             // 'damage-lines'
  linesSum?: number;                // 'damage-lines'
}

export interface TableRowData {
  labelText: string;
  labelTooltip?: string;
  rowClass: string;
  cells: TableCell[];
}

export interface ModifierLineData {
  hasRiskFactor: boolean;
  riskFactorValue: number;
  baseDamage: number;
  effectiveDamage: number;
  scaledEffectiveDamage: number;
  rngFactor: number;
  hasEffectiveDamageStep: boolean;
}

export interface DamageSummaryData {
  hasParts: boolean;
  parts: string[];
  totalBonus: number;
}

// ── Component ────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-results-table',
  imports: [FormatNumberPipe],
  templateUrl: './results-table.component.html',
  styleUrls: ['./results-table.component.scss'],
})
export class ResultsTableComponent {
  readonly result    = input<CalculationResult | null>(null);
  readonly formState = input<FormState | null>(null);
  readonly riskFactor = input<number>(0);

  readonly columnHeaders = computed<string[]>(() => {
    const calculationResult = this.result();
    if (!calculationResult) return ['No Shield', 'Block', 'Parry'];
    return [
      calculationResult.noShield.scenarioName,
      calculationResult.block.scenarioName,
      calculationResult.parry.scenarioName,
    ];
  });

  // ── Damage summary ────────────────────────────────────────────────────────

  readonly damageSummaryData = computed<DamageSummaryData | null>(() => {
    const calculationResult = this.result();
    const formState = this.formState();
    if (!calculationResult || !formState) return null;

    const difficultyBonus = DIFFICULTY_DAMAGE_BONUS_PERCENT[formState.difficulty] ?? 0;
    const starLevelBonus = formState.starLevel * 50;
    const extraDamagePercent = formState.extraDamagePercent ?? 0;
    const totalBonus = difficultyBonus + starLevelBonus + extraDamagePercent;

    const difficultyLabel = DIFFICULTY_LABELS[formState.difficulty] ?? 'Normal';

    const parts: string[] = [];
    if (difficultyBonus !== 0) parts.push(`${difficultyLabel} ${difficultyBonus > 0 ? '+' : ''}${difficultyBonus}%`);
    if (starLevelBonus)        parts.push(`${formState.starLevel}★ +${starLevelBonus}%`);
    if (extraDamagePercent) parts.push(`Extra +${extraDamagePercent}%`);

    return { hasParts: parts.length > 0, parts, totalBonus };
  });

  // ── Modifier line ─────────────────────────────────────────────────────────

  readonly modifierLineData = computed<ModifierLineData | null>(() => {
    const calculationResult = this.result();
    if (!calculationResult) return null;

    const riskFactorValue = this.riskFactor();
    const hasRiskFactor = riskFactorValue > 0;
    const { baseDamage, effectiveDamage, scaledEffectiveDamage } = calculationResult;
    const rngFactor = hasRiskFactor && effectiveDamage > 0
      ? scaledEffectiveDamage / effectiveDamage
      : 1;

    return {
      hasRiskFactor,
      riskFactorValue,
      baseDamage,
      effectiveDamage,
      scaledEffectiveDamage,
      rngFactor,
      hasEffectiveDamageStep: effectiveDamage !== baseDamage,
    };
  });

  // ── Table rows ────────────────────────────────────────────────────────────

  readonly tableRows = computed<TableRowData[]>(() => {
    const calculationResult = this.result();
    const formState = this.formState();
    if (!calculationResult || !formState) return [];

    const scenarios: ScenarioResult[] = [
      calculationResult.noShield,
      calculationResult.block,
      calculationResult.parry,
    ];

    const rows: TableRowData[] = [];

    // ── Instant Damage ────────────────────────────────────────────────────
    const activeInstantTypes = INSTANT_DAMAGE_TYPE_NAMES
      .filter(typeName => scenarios.some(scenario => (scenario.instantMap[typeName] || 0) > DAMAGE_DISPLAY_THRESHOLD))
      .map(typeName => ({ key: typeName, icon: DAMAGE_TYPE_ICONS[typeName] }));

    if (activeInstantTypes.length > 0) {
      rows.push({
        labelText: 'Instant damage',
        labelTooltip: 'Physical, Frost and Lightning damage applied immediately to health.',
        rowClass: '',
        cells: scenarios.map(scenario => {
          const lines: DamageLine[] = activeInstantTypes.map(instantType => {
            const value = scenario.instantMap[instantType.key] || 0;
            return { icon: instantType.icon, displayValue: value > DAMAGE_DISPLAY_THRESHOLD ? value : null };
          });
          const linesSum = activeInstantTypes.length > 1
            ? activeInstantTypes.reduce((acc, instantType) => acc + (scenario.instantMap[instantType.key] || 0), 0)
            : undefined;
          return { kind: 'damage-lines' as CellKind, lines, linesSum };
        }),
      });
    }

    // ── DoT Damage & Ticks ────────────────────────────────────────────────
    const hasDoT = scenarios.some(scenario =>
      DOT_TYPE_CONFIGS.some(dotConfig => scenario.dotBreakdown[dotConfig.key].total > 0.001)
    );

    if (hasDoT) {
      const activeDotTypes = DOT_TYPE_DEFINITIONS.filter(dotType =>
        scenarios.some(scenario => scenario.dotBreakdown[dotType.key].total > DAMAGE_DISPLAY_THRESHOLD)
      );

      rows.push({
        labelText: 'DoT damage',
        rowClass: '',
        cells: scenarios.map(scenario => {
          const lines: DamageLine[] = activeDotTypes.map(dotType => {
            const dotData = scenario.dotBreakdown[dotType.key];
            if (dotData.total <= DAMAGE_DISPLAY_THRESHOLD) return { icon: dotType.icon, displayValue: null };
            return { icon: dotType.icon, displayValue: dotData.ticks.length > 0 ? dotData.total : 0 };
          });
          const linesSum = activeDotTypes.length > 1
            ? activeDotTypes.reduce((acc, dotType) => {
                const dotData = scenario.dotBreakdown[dotType.key];
                return acc + (dotData.ticks.length > 0 ? dotData.total : 0);
              }, 0)
            : undefined;
          return { kind: 'damage-lines' as CellKind, lines, linesSum };
        }),
      });

      rows.push({
        labelText: 'DoT ticks',
        rowClass: '',
        cells: scenarios.map(scenario => {
          const lines: DamageLine[] = activeDotTypes.map(dotType => {
            const dotData = scenario.dotBreakdown[dotType.key];
            if (dotData.total <= DAMAGE_DISPLAY_THRESHOLD) return { icon: dotType.icon, displayValue: null };
            if (dotData.ticks.length === 0) return { icon: dotType.icon, displayValue: 0 };
            const duration = dotType.fixedDuration ??
              Math.round(dotData.ticks[dotData.ticks.length - 1].time + 1);
            return { icon: dotType.icon, displayValue: null, displayText: `${dotData.ticks.length} ticks over ${duration}s` };
          });
          return { kind: 'damage-lines' as CellKind, lines };
        }),
      });
    }

    // ── Remaining Health Before DoT ───────────────────────────────────────
    if (hasDoT) {
      rows.push({
        labelText: 'Remaining health before DoT',
        rowClass: 'row-key-result',
        cells: scenarios.map(scenario =>
          scenario.remainingHealthBeforeDoT <= 0
            ? { kind: 'skull'  as CellKind, numericValue: scenario.remainingHealthBeforeDoT }
            : { kind: 'number' as CellKind, numericValue: scenario.remainingHealthBeforeDoT }
        ),
      });
    }

    // ── Remaining Health ──────────────────────────────────────────────────
    rows.push({
      labelText: 'Remaining health',
      rowClass: 'row-key-result',
      cells: scenarios.map(scenario =>
        scenario.remainingHealth <= 0
          ? { kind: 'skull'  as CellKind, numericValue: scenario.remainingHealth }
          : { kind: 'number' as CellKind, numericValue: scenario.remainingHealth }
      ),
    });

    // ── Staggered ─────────────────────────────────────────────────────────
    rows.push({
      labelText: 'Staggered',
      rowClass: 'row-secondary',
      cells: scenarios.map(scenario => ({
        kind: 'stagger' as CellKind,
        staggerValue: (scenario.stagger === 'YES' ? 'yes' : 'no') as StaggerValue,
      })),
    });

    // ── Block Bypassed ──────────────────────────────────────────────────
    rows.push({
      labelText: 'Block bypassed',
      rowClass: 'row-secondary',
      cells: scenarios.map(scenario => ({
        kind: 'stagger' as CellKind,
        staggerValue: (
          scenario.scenarioName === SIM_SCENARIO_LABELS.noShield ? 'na' :
          scenario.staggeredOnBlock             ? 'yes' : 'no'
        ) as StaggerValue,
      })),
    });

    // ── Min Health to Avoid Block Bypass ──────────────────────────────────
    rows.push({
      labelText: 'Min health to avoid block bypass',
      rowClass: 'row-secondary',
      cells: scenarios.map(scenario => {
        if (scenario.scenarioName === SIM_SCENARIO_LABELS.noShield) return { kind: 'health-check' as CellKind, healthStatus: 'na'   as HealthStatus, healthValue: 0 };
        if (scenario.minHealthForNoBlockStagger === 0) return { kind: 'health-check' as CellKind, healthStatus: 'zero' as HealthStatus, healthValue: 0 };
        return {
          kind: 'health-check' as CellKind,
          healthValue: scenario.minHealthForNoBlockStagger,
          healthStatus: (formState.maxHealth >= scenario.minHealthForNoBlockStagger ? 'safe' : 'warning') as HealthStatus,
        };
      }),
    });

    // ── Min Health to Avoid Stagger ───────────────────────────────────────
    rows.push({
      labelText: 'Min health to avoid stagger',
      rowClass: 'row-secondary',
      cells: scenarios.map(scenario => {
        if (scenario.minHealthForNoArmorStagger === 0) return { kind: 'health-check' as CellKind, healthStatus: 'zero' as HealthStatus, healthValue: 0 };
        return {
          kind: 'health-check' as CellKind,
          healthValue: scenario.minHealthForNoArmorStagger,
          healthStatus: (formState.maxHealth >= scenario.minHealthForNoArmorStagger ? 'safe' : 'warning') as HealthStatus,
        };
      }),
    });

    return rows;
  });
}

