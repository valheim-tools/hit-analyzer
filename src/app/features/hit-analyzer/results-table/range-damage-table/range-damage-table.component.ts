import { Component, input, computed } from '@angular/core';
import { RangeDamageResult, RangeDamageScenarioResult, DamageTypeName, DotBreakdown } from '../../../../core/models';
import {
  INSTANT_DAMAGE_TYPE_NAMES, DAMAGE_TYPE_ICONS,
  DAMAGE_DISPLAY_THRESHOLD,
} from '../../../../core/constants';
import { formatNumber } from '../../../../shared/pipes/format-number.pipe';
import { TooltipDirective } from '../../../../shared/directives/tooltip.directive';
import { DamageDisplayLine, DOT_TYPE_DEFINITIONS } from '../results-table.models';

// ── View model ───────────────────────────────────────────────────────────────

export interface RangeDamageScenarioDisplay {
  instantDamageLines: DamageDisplayLine[];
  instantDamageSumText: string | null;

  dotDamageLines: DamageDisplayLine[];
  dotDamageSumText: string | null;

  remainingHealthBeforeDoTText: string;
  isRemainingHealthBeforeDoTLethal: boolean;
  remainingHealthText: string;
  isRemainingHealthLethal: boolean;
  staggerPercentText: string;
  staggerPercentCssClass: string;
  blockBypassPercentText: string;
  blockBypassPercentCssClass: string;
}

// ── Component ────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-range-damage-table',
  imports: [TooltipDirective],
  templateUrl: './range-damage-table.component.html',
  styleUrls: ['../results-table.component.scss'],
})
export class RangeDamageTableComponent {
  readonly rangeDamageResult = input.required<RangeDamageResult>();
  readonly columnHeaders = input.required<string[]>();

  // ── Conditional row flags ──────────────────────────────────────────────────

  private readonly rangeDamageScenarios = computed<RangeDamageScenarioResult[]>(() => {
    const rangeDamage = this.rangeDamageResult();
    return [rangeDamage.noShield, rangeDamage.block, rangeDamage.parry];
  });

  readonly hasInstantDamage = computed<boolean>(() => {
    const scenarios = this.rangeDamageScenarios();
    return INSTANT_DAMAGE_TYPE_NAMES.some(typeName =>
      scenarios.some(scenario => (scenario.instantMapMax[typeName] || 0) > DAMAGE_DISPLAY_THRESHOLD)
    );
  });

  readonly hasDoT = computed<boolean>(() => {
    const scenarios = this.rangeDamageScenarios();
    return scenarios.some(scenario => scenario.dotDamageMax > 0.001);
  });

  // ── Per-scenario display values ────────────────────────────────────────────

  readonly scenarioDisplayValues = computed<RangeDamageScenarioDisplay[]>(() => {
    const scenarios = this.rangeDamageScenarios();

    const activeInstantTypes = INSTANT_DAMAGE_TYPE_NAMES
      .filter(typeName => scenarios.some(scenario => (scenario.instantMapMax[typeName] || 0) > DAMAGE_DISPLAY_THRESHOLD))
      .map(typeName => ({ key: typeName, icon: DAMAGE_TYPE_ICONS[typeName] }));

    const activeDotTypes = DOT_TYPE_DEFINITIONS.filter(dotType =>
      scenarios.some(scenario => scenario.dotBreakdownMax[dotType.key].total > DAMAGE_DISPLAY_THRESHOLD)
    );

    return [
      this.buildScenarioDisplay(scenarios[0], true, activeInstantTypes, activeDotTypes),
      this.buildScenarioDisplay(scenarios[1], false, activeInstantTypes, activeDotTypes),
      this.buildScenarioDisplay(scenarios[2], false, activeInstantTypes, activeDotTypes),
    ];
  });

  // ── Display builder ────────────────────────────────────────────────────────

  private buildScenarioDisplay(
    rangeDamageScenario: RangeDamageScenarioResult,
    isNoShield: boolean,
    activeInstantTypes: { key: DamageTypeName; icon: string }[],
    activeDotTypes: { key: keyof DotBreakdown; icon: string; fixedDuration: number | null }[],
  ): RangeDamageScenarioDisplay {
    const instantDamageLines: DamageDisplayLine[] = activeInstantTypes.map(instantType => {
      const minValue = rangeDamageScenario.instantMapMin[instantType.key] || 0;
      const maxValue = rangeDamageScenario.instantMapMax[instantType.key] || 0;
      if (maxValue > DAMAGE_DISPLAY_THRESHOLD) {
        return { text: `${instantType.icon} ${this.formatRange(minValue, maxValue)}`, cssClass: 'dot-line' };
      }
      return { text: `${instantType.icon} ≤ ${DAMAGE_DISPLAY_THRESHOLD}`, cssClass: 'dot-line stagger-no' };
    });
    const instantDamageSumText = activeInstantTypes.length > 1
      ? `∑ ${this.formatRange(rangeDamageScenario.instantDamageMin, rangeDamageScenario.instantDamageMax)}`
      : null;

    const dotDamageLines: DamageDisplayLine[] = activeDotTypes.map(dotType => {
      const minData = rangeDamageScenario.dotBreakdownMin[dotType.key];
      const maxData = rangeDamageScenario.dotBreakdownMax[dotType.key];
      const minTotal = minData.ticks.length > 0 ? minData.total : 0;
      const maxTotal = maxData.ticks.length > 0 ? maxData.total : 0;
      return { text: `${dotType.icon} ${this.formatRange(minTotal, maxTotal)}`, cssClass: 'dot-line' };
    });
    const dotDamageSumText = activeDotTypes.length > 1
      ? `∑ ${this.formatRange(rangeDamageScenario.dotDamageMin, rangeDamageScenario.dotDamageMax)}`
      : null;

    const remainingHealthBeforeDoTText = this.formatRange(
      rangeDamageScenario.remainingHealthBeforeDoTMin, rangeDamageScenario.remainingHealthBeforeDoTMax,
    );
    const isRemainingHealthBeforeDoTLethal = rangeDamageScenario.remainingHealthBeforeDoTMax <= 0;

    const remainingHealthText = this.formatRange(
      rangeDamageScenario.remainingHealthMin, rangeDamageScenario.remainingHealthMax,
    );
    const isRemainingHealthLethal = rangeDamageScenario.remainingHealthMax <= 0;

    const staggerPercentText = `${formatNumber(rangeDamageScenario.staggerPercent, 1)}%`;
    const staggerPercentCssClass = this.getPercentCssClass(rangeDamageScenario.staggerPercent);

    let blockBypassPercentText: string;
    let blockBypassPercentCssClass: string;
    if (isNoShield) {
      blockBypassPercentText = 'N/A';
      blockBypassPercentCssClass = 'stagger-no';
    } else {
      blockBypassPercentText = `${formatNumber(rangeDamageScenario.blockBypassPercent, 1)}%`;
      blockBypassPercentCssClass = this.getPercentCssClass(rangeDamageScenario.blockBypassPercent);
    }

    return {
      instantDamageLines,
      instantDamageSumText,
      dotDamageLines,
      dotDamageSumText,
      remainingHealthBeforeDoTText,
      isRemainingHealthBeforeDoTLethal,
      remainingHealthText,
      isRemainingHealthLethal,
      staggerPercentText,
      staggerPercentCssClass,
      blockBypassPercentText,
      blockBypassPercentCssClass,
    };
  }

  private formatRange(minValue: number, maxValue: number): string {
    if (Math.abs(minValue - maxValue) < 0.01) {
      return formatNumber(maxValue);
    }
    return `${formatNumber(minValue)} – ${formatNumber(maxValue)}`;
  }

  private getPercentCssClass(percent: number): string {
    if (percent >= 100) return 'range-percent-high';
    if (percent > 0) return 'range-percent-mid';
    return 'range-percent-low';
  }
}


