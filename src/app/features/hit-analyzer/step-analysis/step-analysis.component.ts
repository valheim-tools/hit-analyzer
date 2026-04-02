import { Component, input, computed } from '@angular/core';
import {
  CalculationResult, FormState, ScenarioResult, SimScenarioKey,
} from '../../../core/models';
import {
  getPercentileRng,
  calculateArmorReduction, calculateBlockPower, calculateBlockingSkillFactor, calculateStaggerThreshold,
} from '../../../core/damage-calculator';
import {
  DAMAGE_TYPE_NAMES, DAMAGE_TYPE_ICONS, DAMAGE_TYPE_CSS_CLASSES, DIFFICULTY_DAMAGE_BONUS_PERCENT,
  STAGGER_DAMAGE_TYPE_NAMES, DOT_TYPE_CONFIGS, INSTANT_DAMAGE_TYPE_NAMES, DOT_DAMAGE_TYPE_NAMES,
  DAMAGE_DISPLAY_THRESHOLD, SIM_SCENARIO_LABELS,
} from '../../../core/constants';
import { FormatNumberPipe } from '../../../shared/pipes/format-number.pipe';

import {
  AnalysisSharedData, ScenarioAnalysis,
  EffectiveDamageStepAnalysis, EffectiveBlockArmorStepAnalysis,
  BlockReducedDamageStepAnalysis, ResistanceMultipliedDamageStepAnalysis,
  ArmorReducedDamageStepAnalysis, AdjustedTotalDamageStepAnalysis,
  RemainingHealthStepAnalysis, TypeBreakdownEntry, TypeResistanceEntry,
  TypeActiveSum, DotDisregardEntry, StaggerTermEntry, FormulaTermEntry,
} from './step-analysis.models';

import { StepEffectiveDamageComponent } from './steps/step-1-effective-damage/step-effective-damage.component';
import { StepEffectiveBlockArmorComponent } from './steps/step-2-effective-block-armor/step-effective-block-armor.component';
import { StepBlockReducedDamageComponent } from './steps/step-3-block-reduced-damage/step-block-reduced-damage.component';
import { StepResistanceMultipliedDamageComponent } from './steps/step-4-resistance-multiplied-damage/step-resistance-multiplied-damage.component';
import { StepArmorReducedDamageComponent } from './steps/step-5-armor-reduced-damage/step-armor-reduced-damage.component';
import { StepAdjustedTotalDamageComponent } from './steps/step-6-adjusted-total-damage/step-adjusted-total-damage.component';
import { StepRemainingHealthComponent } from './steps/step-7-remaining-health/step-remaining-health.component';


// ── Component ─────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-step-analysis',
  imports: [
    FormatNumberPipe,
    StepEffectiveDamageComponent,
    StepEffectiveBlockArmorComponent,
    StepBlockReducedDamageComponent,
    StepResistanceMultipliedDamageComponent,
    StepArmorReducedDamageComponent,
    StepAdjustedTotalDamageComponent,
    StepRemainingHealthComponent,
  ],
  templateUrl: './step-analysis.component.html',
  styleUrls: ['./step-analysis.component.scss'],
})
export class StepAnalysisComponent {
  readonly result    = input<CalculationResult | null>(null);
  readonly formState = input<FormState | null>(null);
  readonly riskFactor = input<number>(0);


  // ── Shared data (base damage badges) ──────────────────────────────────────

  readonly analysisSharedData = computed<AnalysisSharedData | null>(() => {
    const calculationResult = this.result();
    if (!calculationResult) return null;
    const baseDamageMap = calculationResult.baseDamageMap;
    const badges = DAMAGE_TYPE_NAMES
      .filter(typeName => (baseDamageMap[typeName] || 0) > DAMAGE_DISPLAY_THRESHOLD)
      .map(typeName => ({
        icon: DAMAGE_TYPE_ICONS[typeName],
        value: baseDamageMap[typeName],
        cssClass: DAMAGE_TYPE_CSS_CLASSES[typeName],
      }));
    if (badges.length === 0) return null;
    const total = Object.values(baseDamageMap).reduce((sum, value) => sum + value, 0);
    return { badges, total };
  });

  // ── Three scenario columns ─────────────────────────────────────────────────

  readonly scenarioAnalyses = computed<ScenarioAnalysis[]>(() => {
    const calculationResult = this.result();
    const formState = this.formState();
    if (!calculationResult || !formState) return [];
    return [
      this.buildScenario('noShield', calculationResult.noShield, calculationResult, formState),
      this.buildScenario('block',    calculationResult.block,    calculationResult, formState),
      this.buildScenario('parry',    calculationResult.parry,    calculationResult, formState),
    ];
  });

  // ── Scenario builder ───────────────────────────────────────────────────────

  private buildScenario(
    scenario: SimScenarioKey,
    scenarioData: ScenarioResult,
    calculationResult: CalculationResult,
    formState: FormState,
  ): ScenarioAnalysis {
    const isShield = scenario !== 'noShield';
    const isParry  = scenario === 'parry';

    const riskFactorValue   = this.riskFactor();
    const hasRiskFactor     = riskFactorValue > 0;
    const rngBasePercentile = (100 - riskFactorValue) / 100;
    const rngValue  = hasRiskFactor ? getPercentileRng(rngBasePercentile) : 0;
    const rngFactor = hasRiskFactor ? Math.sqrt(rngValue) : 0;

    const difficultyBonus    = (DIFFICULTY_DAMAGE_BONUS_PERCENT[formState.difficulty] ?? 0) / 100;
    const starLevelBonus     = formState.starLevel * 0.5;
    const extraDamagePercent = formState.extraDamagePercent ?? 0;
    const totalMultiplier    = 1 + difficultyBonus + starLevelBonus + extraDamagePercent / 100;
    const staggerThreshold   = calculateStaggerThreshold(formState.maxHealth);
    const parryMultiplier    = formState.parryMultiplier;
    const skillFactor        = calculateBlockingSkillFactor(formState.blockingSkill);

    const { baseDamage, effectiveDamage } = calculationResult;
    const scaledEffectiveDamage = hasRiskFactor ? calculationResult.scaledEffectiveDamage : effectiveDamage;
    const inputDamageMap        = hasRiskFactor ? calculationResult.scaledDamageMap : calculationResult.effectiveDamageMap;

    // ── Effective Damage ────────────────────────────────────────────────────

    const effectiveDamageStep: EffectiveDamageStepAnalysis = {
      baseDamage,
      difficultyBonus,
      starLevelBonus,
      extraDamagePercent,
      totalMultiplier,
      effectiveDamage,
      hasRiskFactor,
      riskFactorValue,
      rngBasePercentile,
      rngValue,
      rngFactor,
      scaledEffectiveDamage,
    };

    // ── Effective Block Armor ───────────────────────────────────────────────

    const effectiveBlockArmorValue = isShield
      ? calculateBlockPower(formState.blockingSkill, formState.blockArmor, isParry ? parryMultiplier : 1)
      : 0;

    const effectiveBlockArmorStep: EffectiveBlockArmorStepAnalysis = {
      isSkipped: !isShield,
      blockArmor: formState.blockArmor,
      blockingSkill: formState.blockingSkill,
      skillFactor,
      isParry,
      parryMultiplier,
      effectiveBlockArmor: effectiveBlockArmorValue,
    };

    // ── Block Reduced Damage ────────────────────────────────────────────────

    const { isLinear: isBlockLinear, reducedDamage: afterBlockDamage } = calculateArmorReduction(scaledEffectiveDamage, effectiveBlockArmorValue);
    const afterBlockMap = scenarioData.damageBreakdown.afterBlock;

    const blockTypeBreakdowns: TypeBreakdownEntry[] = [];
    if (isShield && afterBlockMap) {
      const activeTypes = DAMAGE_TYPE_NAMES.filter(typeName => (inputDamageMap[typeName] || 0) > DAMAGE_DISPLAY_THRESHOLD);
      if (activeTypes.length > 1) {
        const blockDamageRatio = scaledEffectiveDamage > 0 ? afterBlockDamage / scaledEffectiveDamage : 0;
        for (const typeName of activeTypes) {
          const beforeValue = inputDamageMap[typeName] || 0;
          blockTypeBreakdowns.push({
            typeName,
            icon: DAMAGE_TYPE_ICONS[typeName] || '',
            beforeValue,
            // Show theoretical post-block values even when guard break bypasses final damage replacement.
            afterValue: beforeValue * blockDamageRatio,
            outputVarPrefix: 'blockReduced',
            inputTotal: scaledEffectiveDamage,
            outputTotal: afterBlockDamage,
            ratio: blockDamageRatio,
            isStaggerType: (STAGGER_DAMAGE_TYPE_NAMES as readonly string[]).includes(typeName),
          });
        }
      }
    }

    const blockReducedDamageStep: BlockReducedDamageStepAnalysis = {
      isSkipped: !isShield,
      effectiveBlockArmor: effectiveBlockArmorValue,
      inputDamage: scaledEffectiveDamage,
      halfInputDamage: scaledEffectiveDamage / 2,
      isLinear: isBlockLinear,
      isExactTie: Math.abs(effectiveBlockArmorValue - scaledEffectiveDamage / 2) < 1e-9,
      afterBlockDamage,
      staggeredOnBlock: scenarioData.staggeredOnBlock,
      blockStaggerDamage: scenarioData.blockStaggerDamage,
      blockStaggerTerms: blockTypeBreakdowns
        .filter(typeBreakdown => typeBreakdown.isStaggerType)
        .map(typeBreakdown => ({
          variableName: `block${typeBreakdown.typeName}StaggerDamage`,
          value: typeBreakdown.afterValue,
        } as StaggerTermEntry)),
      staggerThreshold,
      maxHealth: formState.maxHealth,
      typeBreakdowns: blockTypeBreakdowns,
    };

    // ── Resistance-Multiplied Damage ────────────────────────────────────────

    const resistanceModifiers: Record<string, number> = {};
    for (const entry of formState.resistanceModifiers) resistanceModifiers[entry.type] = entry.percent / 100;

    const beforeResMap = isShield && scenarioData.damageBreakdown.afterBlock
      ? scenarioData.damageBreakdown.afterBlock : inputDamageMap;
    const afterResMap  = scenarioData.damageBreakdown.afterResistance;

    const typeResistances: TypeResistanceEntry[] = [];
    for (const typeName of DAMAGE_TYPE_NAMES) {
      const beforeValue = beforeResMap[typeName] || 0;
      if (beforeValue < 0.001) continue;
      const multiplier = resistanceModifiers[typeName];
      if (multiplier == null) continue;
      typeResistances.push({
        typeName,
        lowerTypeName: typeName.charAt(0).toLowerCase() + typeName.slice(1),
        icon: DAMAGE_TYPE_ICONS[typeName] || '',
        beforeValue,
        afterValue: afterResMap[typeName] || 0,
        multiplier,
      });
    }

    const activeSums: TypeActiveSum[] = DAMAGE_TYPE_NAMES
      .filter(typeName => (afterResMap[typeName] || 0) > 0.001)
      .map(typeName => ({ typeName, value: afterResMap[typeName] || 0 }));

    const hasResistanceModifiers = formState.resistanceModifiers.length > 0;
    const isResistanceNotAffecting = hasResistanceModifiers && typeResistances.length === 0;

    const resistanceMultipliedDamageStep: ResistanceMultipliedDamageStepAnalysis = {
      isSkipped: !hasResistanceModifiers || isResistanceNotAffecting,
      isNotAffecting: isResistanceNotAffecting,
      typeResistances,
      activeSums,
      afterResistanceDamage: scenarioData.resistanceMultipliedDamage,
    };

    // ── Armor Reduced Damage ────────────────────────────────────────────────

    const armorInputDamage = scenarioData.resistanceMultipliedDamage;
    const armorInputMap    = scenarioData.damageBreakdown.afterResistance;
    const afterArmorMap    = scenarioData.damageBreakdown.afterArmor;
    const { isLinear: isArmorLinear } = calculateArmorReduction(armorInputDamage, formState.armor);

    const staggerOccurred = scenarioData.stagger === 'YES' && !scenarioData.staggeredOnBlock;

    const armorTypeBreakdowns: TypeBreakdownEntry[] = [];
    const activeArmorTypes = DAMAGE_TYPE_NAMES.filter(typeName => (armorInputMap[typeName] || 0) > DAMAGE_DISPLAY_THRESHOLD);
    if (activeArmorTypes.length > 1) {
      const ratio = armorInputDamage > 0 ? scenarioData.armorReducedDamage / armorInputDamage : 0;
      for (const typeName of activeArmorTypes) {
        armorTypeBreakdowns.push({
          typeName,
          icon: DAMAGE_TYPE_ICONS[typeName] || '',
          beforeValue: armorInputMap[typeName] || 0,
          afterValue:  afterArmorMap[typeName] || 0,
          outputVarPrefix: 'armorReduced',
          inputTotal: armorInputDamage,
          outputTotal: scenarioData.armorReducedDamage,
          ratio,
          isStaggerType: (STAGGER_DAMAGE_TYPE_NAMES as readonly string[]).includes(typeName),
        });
      }
    }

    const armorStaggerTerms: StaggerTermEntry[] = armorTypeBreakdowns
      .filter(typeBreakdown => typeBreakdown.isStaggerType)
      .map(typeBreakdown => ({
        variableName: `armor${typeBreakdown.typeName}StaggerDamage`,
        value: typeBreakdown.afterValue,
      } as StaggerTermEntry));

    const armorReducedDamageStep: ArmorReducedDamageStepAnalysis = {
      armorInputDamage,
      armor: formState.armor,
      halfArmorInput: armorInputDamage / 2,
      isLinear: isArmorLinear,
      isExactArmorThreshold: Math.abs(formState.armor - armorInputDamage / 2) < 1e-9,
      armorReducedDamage: scenarioData.armorReducedDamage,
      staggerOccurred,
      isNoShieldScenario: !isShield,
      isBlockBypassed: scenarioData.staggeredOnBlock,
      blockStaggerDamage: scenarioData.blockStaggerDamage,
      staggerBuildupValue: scenarioData.staggeredOnBlock ? scenarioData.armorStaggerDamage : scenarioData.totalStaggerAccumulation,
      armorStaggerDamage: scenarioData.armorStaggerDamage,
      armorStaggerTerms,
      totalStaggerAccumulation: scenarioData.totalStaggerAccumulation,
      staggerThreshold,
      maxHealth: formState.maxHealth,
      typeBreakdowns: armorTypeBreakdowns,
    };

    // ── Adjusted Total Damage ───────────────────────────────────────────────

    let disregardedTotal = 0;
    const dotDisregardEntries: DotDisregardEntry[] = [];
    for (const dotConfig of DOT_TYPE_CONFIGS) {
      const dotData = scenarioData.dotBreakdown[dotConfig.key];
      if (dotData.total > 0.001 && dotData.ticks.length === 0) {
        disregardedTotal += dotData.total;
        dotDisregardEntries.push({
          icon: DAMAGE_TYPE_ICONS[dotConfig.damageTypeName],
          total: dotData.total,
          hasThreshold: dotConfig.minimumPerTick != null,
          perTick: dotConfig.tickCount != null ? dotData.total / dotConfig.tickCount : null,
          threshold: dotConfig.minimumPerTick,
        });
      }
    }

    const adjustedTotal = scenarioData.armorReducedDamage - disregardedTotal;
    const hasAnyDot = DOT_TYPE_CONFIGS.some(dotConfig => scenarioData.dotBreakdown[dotConfig.key].total > 0.001);

    const adjustedTotalDamageStep: AdjustedTotalDamageStepAnalysis = {
      hasDisregardedDot: disregardedTotal > 0.001,
      hasAnyDot,
      dotDisregardEntries,
      disregardedTotal,
      armorReducedDamage: scenarioData.armorReducedDamage,
      adjustedTotal,
    };

    // ── Remaining Health ────────────────────────────────────────────────────

    const adjustedInstantDamageTerms: FormulaTermEntry[] = INSTANT_DAMAGE_TYPE_NAMES
      .map(typeName => ({
        variableName: `adjusted${typeName}Damage`,
        value: scenarioData.damageBreakdown.afterArmor[typeName] || 0,
      }))
      .filter(termEntry => termEntry.value > DAMAGE_DISPLAY_THRESHOLD);

    const adjustedDotDamageTerms: FormulaTermEntry[] = DOT_DAMAGE_TYPE_NAMES
      .map(typeName => {
        const matchingDotConfig = DOT_TYPE_CONFIGS.find(dotConfig => dotConfig.damageTypeName === typeName);
        if (!matchingDotConfig) {
          return {
            variableName: `adjusted${typeName}Damage`,
            value: 0,
          } as FormulaTermEntry;
        }
        const dotData = scenarioData.dotBreakdown[matchingDotConfig.key];
        return {
          variableName: `adjusted${typeName}Damage`,
          value: dotData.ticks.length > 0 ? dotData.total : 0,
        } as FormulaTermEntry;
      })
      .filter(termEntry => termEntry.value > DAMAGE_DISPLAY_THRESHOLD);

    const adjustedInstantDamage = adjustedInstantDamageTerms
      .reduce((damageSum, termEntry) => damageSum + termEntry.value, 0);

    const adjustedDotDamage = adjustedDotDamageTerms
      .reduce((damageSum, termEntry) => damageSum + termEntry.value, 0);

    const remainingHealthValue = formState.maxHealth - adjustedTotal;
    const remainingHealthStep: RemainingHealthStepAnalysis = {
      maxHealth: formState.maxHealth,
      adjustedTotal,
      adjustedInstantDamage,
      adjustedInstantDamageTerms,
      adjustedDotDamage,
      adjustedDotDamageTerms,
      remainingHealth: remainingHealthValue,
      isDead: remainingHealthValue <= 0,
    };

    return {
      title: SIM_SCENARIO_LABELS[scenarioData.scenario],
      effectiveDamage: effectiveDamageStep,
      effectiveBlockArmor: effectiveBlockArmorStep,
      blockReducedDamage: blockReducedDamageStep,
      resistanceMultipliedDamage: resistanceMultipliedDamageStep,
      armorReducedDamage: armorReducedDamageStep,
      adjustedTotalDamage: adjustedTotalDamageStep,
      remainingHealth: remainingHealthStep,
    };
  }
}
