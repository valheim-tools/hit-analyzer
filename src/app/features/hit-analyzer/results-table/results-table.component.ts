import { Component, input, computed } from '@angular/core';
import { CalculationResult, ScenarioResult, FormState, DamageTypeName, DotBreakdown } from '../../../core/models';
import {
  INSTANT_DAMAGE_TYPE_NAMES, DAMAGE_TYPE_ICONS,
  DIFFICULTY_LABELS, DIFFICULTY_DAMAGE_BONUS_PERCENT,
  SIM_SCENARIO_KEYS, SIM_SCENARIO_LABELS, DAMAGE_DISPLAY_THRESHOLD, DOT_TYPE_CONFIGS,
} from '../../../core/constants';
import { formatNumber } from '../../../shared/pipes/format-number.pipe';

// ── Constants ────────────────────────────────────────────────────────────────

const DOT_TYPE_DEFINITIONS = DOT_TYPE_CONFIGS.map(config => ({
  key: config.key,
  icon: DAMAGE_TYPE_ICONS[config.damageTypeName],
  fixedDuration: config.totalDuration,
}));

// ── View models ──────────────────────────────────────────────────────────────

export interface DamageDisplayLine {
  text: string;
  cssClass: string;
}

export interface ScenarioDisplay {
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
  selector: 'app-results-table',
  templateUrl: './results-table.component.html',
  styleUrls: ['./results-table.component.scss'],
})
export class ResultsTableComponent {
  readonly result    = input<CalculationResult | null>(null);
  readonly formState = input<FormState | null>(null);
  readonly riskFactor = input<number>(0);

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

    const difficultyBonus = DIFFICULTY_DAMAGE_BONUS_PERCENT[formState.difficulty] ?? 0;
    const starLevelBonus = formState.starLevel * 50;
    const extraDamagePercent = formState.extraDamagePercent ?? 0;
    const totalBonus = difficultyBonus + starLevelBonus + extraDamagePercent;

    const difficultyLabel = DIFFICULTY_LABELS[formState.difficulty] ?? 'Normal';

    const parts: string[] = [];
    if (difficultyBonus !== 0) parts.push(`${difficultyLabel} ${difficultyBonus > 0 ? '+' : ''}${difficultyBonus}%`);
    if (starLevelBonus)        parts.push(`${formState.starLevel}★ +${starLevelBonus}%`);
    if (extraDamagePercent)    parts.push(`Extra +${extraDamagePercent}%`);

    if (parts.length === 0) {
      return { label: 'No damage modifier', highlight: null };
    }

    const sign = totalBonus >= 0 ? '+' : '';
    return {
      label: 'Damage modifier: ',
      highlight: `${parts.join(' | ')} (${sign}${totalBonus}% total)`,
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

  // ── Conditional row flags ─────────────────────────────────────────────────

  private readonly scenarios = computed<ScenarioResult[]>(() => {
    const calculationResult = this.result();
    if (!calculationResult) return [];
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

  // ── Per-scenario display values ───────────────────────────────────────────

  readonly scenarioDisplayValues = computed<ScenarioDisplay[]>(() => {
    const calculationResult = this.result();
    const formState = this.formState();
    if (!calculationResult || !formState) return [];

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

  // ── Display builders ──────────────────────────────────────────────────────

  private buildInstantDamageDisplay(
    scenario: ScenarioResult,
    activeInstantTypes: { key: DamageTypeName; icon: string }[],
  ): Pick<ScenarioDisplay, 'instantDamageLines' | 'instantDamageSumText'> {
    const instantDamageLines: DamageDisplayLine[] = activeInstantTypes.map(instantType => {
      const value = scenario.instantMap[instantType.key] || 0;
      if (value > DAMAGE_DISPLAY_THRESHOLD) {
        return { text: `${instantType.icon} ${formatNumber(value)}`, cssClass: 'dot-line' };
      }
      return { text: '—', cssClass: 'dot-line stagger-no' };
    });
    const instantDamageSumText = activeInstantTypes.length > 1
      ? `∑ ${formatNumber(activeInstantTypes.reduce((acc, instantType) => acc + (scenario.instantMap[instantType.key] || 0), 0))}`
      : null;
    return { instantDamageLines, instantDamageSumText };
  }

  private buildDotDamageDisplay(
    scenario: ScenarioResult,
    activeDotTypes: { key: keyof DotBreakdown; icon: string; fixedDuration: number | null }[],
  ): Pick<ScenarioDisplay, 'dotDamageLines' | 'dotDamageSumText'> {
    const dotDamageLines: DamageDisplayLine[] = activeDotTypes.map(dotType => {
      const dotData = scenario.dotBreakdown[dotType.key];
      if (dotData.total <= DAMAGE_DISPLAY_THRESHOLD) {
        return { text: '—', cssClass: 'dot-line stagger-no' };
      }
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
  ): Pick<ScenarioDisplay, 'dotTickLines'> {
    const dotTickLines: DamageDisplayLine[] = activeDotTypes.map(dotType => {
      const dotData = scenario.dotBreakdown[dotType.key];
      if (dotData.total <= DAMAGE_DISPLAY_THRESHOLD) {
        return { text: '—', cssClass: 'dot-line stagger-no' };
      }
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
  ): Pick<ScenarioDisplay, 'remainingHealthText' | 'isRemainingHealthLethal' | 'remainingHealthBeforeDoTText' | 'isRemainingHealthBeforeDoTLethal'> {
    return {
      remainingHealthBeforeDoTText: formatNumber(scenario.remainingHealthBeforeDoT),
      isRemainingHealthBeforeDoTLethal: scenario.remainingHealthBeforeDoT <= 0,
      remainingHealthText: formatNumber(scenario.remainingHealth),
      isRemainingHealthLethal: scenario.remainingHealth <= 0,
    };
  }

  private buildStaggerDisplay(
    scenario: ScenarioResult,
  ): Pick<ScenarioDisplay, 'staggeredText' | 'staggeredCssClass'> {
    const isStaggered = scenario.stagger === 'YES';
    return {
      staggeredText: isStaggered ? 'yes' : 'no',
      staggeredCssClass: isStaggered ? 'stagger-yes' : 'stagger-no',
    };
  }

  private buildBlockBypassDisplay(
    scenario: ScenarioResult,
  ): Pick<ScenarioDisplay, 'blockBypassedText' | 'blockBypassedCssClass'> {
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
  ): Pick<ScenarioDisplay, 'minHealthBlockBypassText' | 'minHealthBlockBypassCssClass' | 'minHealthStaggerText' | 'minHealthStaggerCssClass'> {
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

