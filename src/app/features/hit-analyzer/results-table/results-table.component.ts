import { Component, input, computed, signal } from '@angular/core';
import { CalculationResult, FormState, RangeDamageResult } from '../../../core/models';
import {
  DIFFICULTY_LABELS, DIFFICULTY_ENEMY_DAMAGE_RATE,
  SIM_SCENARIO_KEYS, SIM_SCENARIO_LABELS,
} from '../../../core/constants';
import { formatNumber } from '../../../shared/pipes/format-number.pipe';
import { MaxDamageTableComponent } from './max-damage-table/max-damage-table.component';
import { RangeDamageTableComponent } from './range-damage-table/range-damage-table.component';
import { ViewMode } from './results-table.models';

// ── Component ────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-results-table',
  imports: [MaxDamageTableComponent, RangeDamageTableComponent],
  templateUrl: './results-table.component.html',
  styleUrls: ['./results-table.component.scss'],
})
export class ResultsTableComponent {
  readonly result = input<CalculationResult | null>(null);
  readonly formState = input<FormState | null>(null);
  readonly riskFactor = input<number>(0);
  readonly rangeDamageResult = input<RangeDamageResult | null>(null);

  readonly viewMode = signal<ViewMode>('maxDamage');

  toggleViewMode(mode: ViewMode): void {
    this.viewMode.set(mode);
  }

  readonly columnHeaders = computed<string[]>(() => {
    const calculationResult = this.result();
    if (!calculationResult) return SIM_SCENARIO_KEYS.map(key => SIM_SCENARIO_LABELS[key]);
    return [
      SIM_SCENARIO_LABELS[calculationResult.noShield.scenario],
      SIM_SCENARIO_LABELS[calculationResult.block.scenario],
      SIM_SCENARIO_LABELS[calculationResult.parry.scenario],
    ];
  });

  // ── Damage summary ────────────────────────────────────────────────────────

  readonly damageSummary = computed<{ label: string; highlight: string | null } | null>(() => {
    const calculationResult = this.result();
    const formState = this.formState();
    if (!calculationResult || !formState) return null;

    const difficultyDamageRate = DIFFICULTY_ENEMY_DAMAGE_RATE[formState.difficulty] ?? 1.0;
    const starLevelFactor = 1 + formState.starLevel * 0.5;
    const extraDamagePercent = formState.extraDamagePercent ?? 0;
    const extraDamageFactor = 1 + extraDamagePercent / 100;
    const totalMultiplier = starLevelFactor * difficultyDamageRate * extraDamageFactor;

    const difficultyLabel = DIFFICULTY_LABELS[formState.difficulty] ?? 'Normal';

    const parts: string[] = [];
    if (difficultyDamageRate !== 1.0) {
      const difficultyPercent = Math.round(Math.abs(difficultyDamageRate - 1) * 100);
      parts.push(`${difficultyLabel} ${difficultyDamageRate < 1 ? `${difficultyPercent}% less` : `${difficultyPercent}% more`}`);
    }
    if (starLevelFactor !== 1.0) {
      const starPercent = Math.round((starLevelFactor - 1) * 100);
      parts.push(`${formState.starLevel}★ ${starPercent}% more`);
    }
    if (extraDamageFactor !== 1.0) {
      parts.push(`Extra +${extraDamagePercent}%`);
    }

    if (parts.length === 0) {
      return { label: 'No damage modifier', highlight: null };
    }

    const totalPercent = Math.round((totalMultiplier - 1) * 100);
    const totalSign = totalPercent >= 0 ? '+' : '';
    return {
      label: 'Damage modifier: ',
      highlight: `${parts.join(' | ')} (${totalSign}${totalPercent}% total, ×${formatNumber(totalMultiplier)})`,
    };
  });

  // ── Modifier line ─────────────────────────────────────────────────────────

  readonly modifierLine = computed<{ label: string; highlight: string; badgeText: string | null } | null>(() => {
    const calculationResult = this.result();
    if (!calculationResult) return null;

    const riskFactorValue = this.riskFactor();
    const hasRiskFactor = riskFactorValue > 0;
    const { baseDamage, effectiveDamage, scaledEffectiveDamage } = calculationResult;
    const hasEffectiveDamageStep = effectiveDamage !== baseDamage;

    if (hasRiskFactor) {
      const rngFactor = effectiveDamage > 0 ? scaledEffectiveDamage / effectiveDamage : 1;
      const label = hasEffectiveDamageStep
        ? `Scaled Effective Damage = ${formatNumber(baseDamage)} → ${formatNumber(effectiveDamage)} → `
        : `Scaled Effective Damage = ${formatNumber(baseDamage)} → `;
      return {
        label,
        highlight: formatNumber(scaledEffectiveDamage),
        badgeText: `${riskFactorValue}% risk (×${formatNumber(rngFactor)})`,
      };
    }

    if (hasEffectiveDamageStep) {
      return {
        label: `Effective Damage = ${formatNumber(baseDamage)} → `,
        highlight: formatNumber(effectiveDamage),
        badgeText: null,
      };
    }

    return {
      label: 'Effective Damage = ',
      highlight: formatNumber(baseDamage),
      badgeText: null,
    };
  });
}

