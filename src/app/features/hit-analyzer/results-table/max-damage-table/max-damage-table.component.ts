import { Component, input, computed } from '@angular/core';
import { CalculationResult, ScenarioResult, FormState, DamageTypeName, DotBreakdown } from '../../../../core/models';
import {
  INSTANT_DAMAGE_TYPE_NAMES, DAMAGE_TYPE_ICONS,
  DAMAGE_DISPLAY_THRESHOLD, DOT_TYPE_CONFIGS,
} from '../../../../core/constants';
import { formatNumber } from '../../../../shared/pipes/format-number.pipe';
import { TooltipDirective } from '../../../../shared/directives/tooltip.directive';
import { DamageDisplayLine, DOT_TYPE_DEFINITIONS } from '../results-table.models';

// ── View model ───────────────────────────────────────────────────────────────

export interface MaxDamageScenarioDisplay {
  instantDamageLines: DamageDisplayLine[];
  instantDamageSumText: string | null;

  dotDamageLines: DamageDisplayLine[];
  dotDamageSumText: string | null;

  dotTickLines: DamageDisplayLine[];

  remainingHealthBeforeDoTText: string;
  isRemainingHealthBeforeDoTLethal: boolean;

  remainingHealthText: string;
  isRemainingHealthLethal: boolean;

  staggeredText: string;
  staggeredCssClass: string;

  blockBypassedText: string;
  blockBypassedCssClass: string;

  minHealthBlockBypassText: string;
  minHealthBlockBypassCssClass: string;

  minHealthStaggerText: string;
  minHealthStaggerCssClass: string;
}

// ── Component ────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-max-damage-table',
  imports: [TooltipDirective],
  templateUrl: './max-damage-table.component.html',
  styleUrls: ['../results-table.component.scss'],
})
export class MaxDamageTableComponent {
  readonly result = input.required<CalculationResult>();
  readonly formState = input.required<FormState>();
  readonly columnHeaders = input.required<string[]>();

  // ── Conditional row flags ──────────────────────────────────────────────────

  private readonly scenarios = computed<ScenarioResult[]>(() => {
    const calculationResult = this.result();
    return [calculationResult.noShield, calculationResult.block, calculationResult.parry];
  });

  readonly hasInstantDamage = computed<boolean>(() => {
    const scenarios = this.scenarios();
    return INSTANT_DAMAGE_TYPE_NAMES.some(typeName =>
      scenarios.some(scenario => (scenario.instantMap[typeName] || 0) > DAMAGE_DISPLAY_THRESHOLD)
    );
  });

  readonly hasDoT = computed<boolean>(() => {
    const scenarios = this.scenarios();
    return scenarios.some(scenario =>
      DOT_TYPE_CONFIGS.some(dotConfig => scenario.dotBreakdown[dotConfig.key].total > 0.001)
    );
  });

  // ── Per-scenario display values ────────────────────────────────────────────

  readonly scenarioDisplayValues = computed<MaxDamageScenarioDisplay[]>(() => {
    const formState = this.formState();
    const scenarios = this.scenarios();

    const activeInstantTypes = INSTANT_DAMAGE_TYPE_NAMES
      .filter(typeName => scenarios.some(scenario => (scenario.instantMap[typeName] || 0) > DAMAGE_DISPLAY_THRESHOLD))
      .map(typeName => ({ key: typeName, icon: DAMAGE_TYPE_ICONS[typeName] }));

    const activeDotTypes = DOT_TYPE_DEFINITIONS.filter(dotType =>
      scenarios.some(scenario => scenario.dotBreakdown[dotType.key].total > DAMAGE_DISPLAY_THRESHOLD)
    );

    return scenarios.map(scenario => ({
      ...this.buildInstantDamageDisplay(scenario, activeInstantTypes),
      ...this.buildDotDamageDisplay(scenario, activeDotTypes),
      ...this.buildDotTickDisplay(scenario, activeDotTypes),
      ...this.buildHealthDisplay(scenario),
      ...this.buildStaggerDisplay(scenario),
      ...this.buildBlockBypassDisplay(scenario),
      ...this.buildMinHealthDisplays(scenario, formState.maxHealth),
    }));
  });

  // ── Display builders ───────────────────────────────────────────────────────

  private buildInstantDamageDisplay(
    scenario: ScenarioResult,
    activeInstantTypes: { key: DamageTypeName; icon: string }[],
  ): Pick<MaxDamageScenarioDisplay, 'instantDamageLines' | 'instantDamageSumText'> {
    const instantDamageLines: DamageDisplayLine[] = activeInstantTypes.map(instantType => {
      const value = scenario.instantMap[instantType.key] || 0;
      if (value > DAMAGE_DISPLAY_THRESHOLD) {
        return { text: `${instantType.icon} ${formatNumber(value)}`, cssClass: 'dot-line' };
      }
      return { text: `${instantType.icon} ≤ ${DAMAGE_DISPLAY_THRESHOLD}`, cssClass: 'dot-line stagger-no' };
    });
    const instantDamageSumText = activeInstantTypes.length > 1
      ? `∑ ${formatNumber(activeInstantTypes.reduce((acc, instantType) => acc + (scenario.instantMap[instantType.key] || 0), 0))}`
      : null;
    return { instantDamageLines, instantDamageSumText };
  }

  private buildDotDamageDisplay(
    scenario: ScenarioResult,
    activeDotTypes: { key: keyof DotBreakdown; icon: string; fixedDuration: number | null }[],
  ): Pick<MaxDamageScenarioDisplay, 'dotDamageLines' | 'dotDamageSumText'> {
    const dotDamageLines: DamageDisplayLine[] = activeDotTypes.map(dotType => {
      const dotData = scenario.dotBreakdown[dotType.key];
      const value = dotData.ticks.length > 0 ? dotData.total : 0;
      return { text: `${dotType.icon} ${formatNumber(value)}`, cssClass: 'dot-line' };
    });
    const dotDamageSumText = activeDotTypes.length > 1
      ? `∑ ${formatNumber(activeDotTypes.reduce((acc, dotType) => {
          const dotData = scenario.dotBreakdown[dotType.key];
          return acc + (dotData.ticks.length > 0 ? dotData.total : 0);
        }, 0))}`
      : null;
    return { dotDamageLines, dotDamageSumText };
  }

  private buildDotTickDisplay(
    scenario: ScenarioResult,
    activeDotTypes: { key: keyof DotBreakdown; icon: string; fixedDuration: number | null }[],
  ): Pick<MaxDamageScenarioDisplay, 'dotTickLines'> {
    const dotTickLines: DamageDisplayLine[] = activeDotTypes.map(dotType => {
      const dotData = scenario.dotBreakdown[dotType.key];
      if (dotData.ticks.length === 0) {
        return { text: `${dotType.icon} ${formatNumber(0)}`, cssClass: 'dot-line' };
      }
      const duration = dotType.fixedDuration ??
        Math.round(dotData.ticks[dotData.ticks.length - 1].time + 1);
      return { text: `${dotType.icon} ${dotData.ticks.length} ticks over ${duration}s`, cssClass: 'dot-line' };
    });
    return { dotTickLines };
  }

  private buildHealthDisplay(
    scenario: ScenarioResult,
  ): Pick<MaxDamageScenarioDisplay, 'remainingHealthText' | 'isRemainingHealthLethal' | 'remainingHealthBeforeDoTText' | 'isRemainingHealthBeforeDoTLethal'> {
    return {
      remainingHealthBeforeDoTText: formatNumber(scenario.remainingHealthBeforeDoT),
      isRemainingHealthBeforeDoTLethal: scenario.remainingHealthBeforeDoT <= 0,
      remainingHealthText: formatNumber(scenario.remainingHealth),
      isRemainingHealthLethal: scenario.remainingHealth <= 0,
    };
  }

  private buildStaggerDisplay(
    scenario: ScenarioResult,
  ): Pick<MaxDamageScenarioDisplay, 'staggeredText' | 'staggeredCssClass'> {
    const isStaggered = scenario.stagger === 'YES';
    return {
      staggeredText: isStaggered ? 'yes' : 'no',
      staggeredCssClass: isStaggered ? 'stagger-yes' : 'stagger-no',
    };
  }

  private buildBlockBypassDisplay(
    scenario: ScenarioResult,
  ): Pick<MaxDamageScenarioDisplay, 'blockBypassedText' | 'blockBypassedCssClass'> {
    if (scenario.scenario === 'noShield') {
      return { blockBypassedText: 'N/A', blockBypassedCssClass: 'stagger-no' };
    }
    if (scenario.staggeredOnBlock) {
      return { blockBypassedText: 'yes', blockBypassedCssClass: 'stagger-yes' };
    }
    return { blockBypassedText: 'no', blockBypassedCssClass: 'stagger-no' };
  }

  private buildMinHealthDisplays(
    scenario: ScenarioResult,
    maxHealth: number,
  ): Pick<MaxDamageScenarioDisplay, 'minHealthBlockBypassText' | 'minHealthBlockBypassCssClass' | 'minHealthStaggerText' | 'minHealthStaggerCssClass'> {
    const isNoShield = scenario.scenario === 'noShield';

    let minHealthBlockBypassText: string;
    let minHealthBlockBypassCssClass: string;
    if (isNoShield) {
      minHealthBlockBypassText = 'N/A';
      minHealthBlockBypassCssClass = 'stagger-no';
    } else if (scenario.minHealthForNoBlockStagger === 0) {
      minHealthBlockBypassText = '0';
      minHealthBlockBypassCssClass = 'stagger-no';
    } else {
      minHealthBlockBypassText = String(scenario.minHealthForNoBlockStagger);
      minHealthBlockBypassCssClass = maxHealth >= scenario.minHealthForNoBlockStagger
        ? 'health-safe' : 'health-warning';
    }

    let minHealthStaggerText: string;
    let minHealthStaggerCssClass: string;
    if (scenario.minHealthToAvoidStagger === 0) {
      minHealthStaggerText = '0';
      minHealthStaggerCssClass = 'stagger-no';
    } else {
      minHealthStaggerText = String(scenario.minHealthToAvoidStagger);
      minHealthStaggerCssClass = maxHealth >= scenario.minHealthToAvoidStagger
        ? 'health-safe' : 'health-warning';
    }

    return {
      minHealthBlockBypassText,
      minHealthBlockBypassCssClass,
      minHealthStaggerText,
      minHealthStaggerCssClass,
    };
  }
}

