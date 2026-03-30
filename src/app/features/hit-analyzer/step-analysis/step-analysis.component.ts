import { Component, input, computed } from '@angular/core';
import {
  CalculationResult, FormState, DamageTypeName, ScenarioResult, SimScenarioKey,
} from '../../../core/models';
import {
  STAGGER_TYPES, getPercentileRng, DOT_TYPE_CONFIGS,
  calculateArmorReduction, calculateBlockPower, calculateBlockingSkillFactor, calculateStaggerThreshold,
} from '../../../core/damage-calculator';
import {
  DAMAGE_TYPE_NAMES, DAMAGE_TYPE_ICONS, DAMAGE_TYPE_CSS_CLASSES, DIFFICULTY_DAMAGE_BONUS_PERCENT,
  DAMAGE_DISPLAY_THRESHOLD,
} from '../../../core/constants';
import { FormatNumberPipe } from '../../../shared/pipes/format-number.pipe';


// ── Data interfaces ───────────────────────────────────────────────────────────

export interface DamageBadge {
  icon: string;
  value: number;
  cssClass: string;
}

export interface AnalysisSharedData {
  badges: DamageBadge[];
  total: number;
}

export interface TypeBreakdownEntry {
  typeName: DamageTypeName;
  icon: string;
  beforeValue: number;
  afterValue: number;
  outputVarPrefix: string;  // e.g. 'blockReduced', 'armorReduced'
  inputTotal: number;
  outputTotal: number;
  ratio: number;
  isStaggerType: boolean;
}

export interface TypeResistanceEntry {
  typeName: DamageTypeName;
  lowerTypeName: string;
  icon: string;
  beforeValue: number;
  afterValue: number;
  multiplier: number;
}

export interface TypeActiveSum {
  typeName: DamageTypeName;
  value: number;
}

export interface DotDisregardEntry {
  icon: string;
  total: number;
  hasThreshold: boolean;
  perTick: number | null;
  threshold: number | null;
}

export interface Step1Analysis {
  baseDamage: number;
  difficultyBonus: number;
  starLevelBonus: number;
  extraDamagePercent: number;
  totalMultiplier: number;
  effectiveDamage: number;
  hasRiskFactor: boolean;
  riskFactorValue: number;
  rngBasePercentile: number;  // (100 − riskFactorValue) / 100
  rngValue: number;
  rngFactor: number;
  scaledEffectiveDamage: number;
}

export interface Step2Analysis {
  isSkipped: boolean;
  blockArmor: number;
  blockingSkill: number;
  skillFactor: number;
  isParry: boolean;
  parryMultiplier: number;
  effectiveBlockArmor: number;
}

export interface Step3Analysis {
  isSkipped: boolean;
  effectiveBlockArmor: number;
  inputDamage: number;
  halfInputDamage: number;
  isLinear: boolean;
  isExactTie: boolean;
  afterBlockDamage: number;
  staggeredOnBlock: boolean;
  blockStaggerDamage: number;
  staggerThreshold: number;
  maxHealth: number;
  typeBreakdowns: TypeBreakdownEntry[];
}

export interface Step4Analysis {
  isSkipped: boolean;
  typeResistances: TypeResistanceEntry[];
  activeSums: TypeActiveSum[];
  afterResistanceDamage: number;
}

export interface Step5Analysis {
  armorInputDamage: number;
  armor: number;
  halfArmorInput: number;
  isLinear: boolean;
  isExactArmorThreshold: boolean;
  armorReducedDamage: number;
  staggerOccurred: boolean;
  isNoShieldScenario: boolean;
  blockStaggerDamage: number;
  armorStaggerDamage: number;
  totalStaggerAccumulation: number;
  staggerThreshold: number;
  maxHealth: number;
  typeBreakdowns: TypeBreakdownEntry[];
}

export interface Step6Analysis {
  hasDisregardedDot: boolean;
  hasAnyDot: boolean;
  dotDisregardEntries: DotDisregardEntry[];
  disregardedTotal: number;
  armorReducedDamage: number;
  adjustedTotal: number;
}

export interface Step7Analysis {
  maxHealth: number;
  adjustedTotal: number;
  remainingHealth: number;
  isDead: boolean;
}

export interface ScenarioAnalysis {
  title: string;
  step1: Step1Analysis;
  step2: Step2Analysis;
  step3: Step3Analysis;
  step4: Step4Analysis;
  step5: Step5Analysis;
  step6: Step6Analysis;
  step7: Step7Analysis;
}

// ── Component ─────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-step-analysis',
  imports: [FormatNumberPipe],
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

    // ── Step 1 ────────────────────────────────────────────────────────────

    const step1: Step1Analysis = {
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

    // ── Step 2 ────────────────────────────────────────────────────────────

    const effectiveBlockArmor = isShield
      ? calculateBlockPower(formState.blockingSkill, formState.blockArmor, isParry ? parryMultiplier : 1)
      : 0;

    const step2: Step2Analysis = {
      isSkipped: !isShield,
      blockArmor: formState.blockArmor,
      blockingSkill: formState.blockingSkill,
      skillFactor,
      isParry,
      parryMultiplier,
      effectiveBlockArmor,
    };

    // ── Step 3 ────────────────────────────────────────────────────────────

    const { isLinear: isBlockLinear, reducedDamage: afterBlockDamage } = calculateArmorReduction(scaledEffectiveDamage, effectiveBlockArmor);
    const afterBlockMap = scenarioData.damageBreakdown.afterBlock;

    const step3TypeBreakdowns: TypeBreakdownEntry[] = [];
    if (isShield && !scenarioData.staggeredOnBlock && afterBlockMap) {
      const activeTypes = DAMAGE_TYPE_NAMES.filter(typeName => (inputDamageMap[typeName] || 0) > DAMAGE_DISPLAY_THRESHOLD);
      if (activeTypes.length > 1) {
        const ratio = scaledEffectiveDamage > 0 ? scenarioData.blockReducedDamage / scaledEffectiveDamage : 0;
        for (const typeName of activeTypes) {
          step3TypeBreakdowns.push({
            typeName,
            icon: DAMAGE_TYPE_ICONS[typeName] || '',
            beforeValue: inputDamageMap[typeName] || 0,
            afterValue:  afterBlockMap[typeName]  || 0,
            outputVarPrefix: 'blockReduced',
            inputTotal: scaledEffectiveDamage,
            outputTotal: scenarioData.blockReducedDamage,
            ratio,
            isStaggerType: false,
          });
        }
      }
    }

    const step3: Step3Analysis = {
      isSkipped: !isShield,
      effectiveBlockArmor,
      inputDamage: scaledEffectiveDamage,
      halfInputDamage: scaledEffectiveDamage / 2,
      isLinear: isBlockLinear,
      isExactTie: Math.abs(effectiveBlockArmor - scaledEffectiveDamage / 2) < 1e-9,
      afterBlockDamage,
      staggeredOnBlock: scenarioData.staggeredOnBlock,
      blockStaggerDamage: scenarioData.blockStaggerDamage,
      staggerThreshold,
      maxHealth: formState.maxHealth,
      typeBreakdowns: step3TypeBreakdowns,
    };

    // ── Step 4 ────────────────────────────────────────────────────────────

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

    const step4: Step4Analysis = {
      isSkipped: formState.resistanceModifiers.length === 0,
      typeResistances,
      activeSums,
      afterResistanceDamage: scenarioData.resistanceMultipliedDamage,
    };

    // ── Step 5 ────────────────────────────────────────────────────────────

    const armorInputDamage = scenarioData.resistanceMultipliedDamage;
    const armorInputMap    = scenarioData.damageBreakdown.afterResistance;
    const afterArmorMap    = scenarioData.damageBreakdown.afterArmor;
    const { isLinear: isArmorLinear } = calculateArmorReduction(armorInputDamage, formState.armor);

    const staggerOccurred = scenarioData.stagger === 'YES' && !scenarioData.staggeredOnBlock;

    const step5TypeBreakdowns: TypeBreakdownEntry[] = [];
    const activeArmorTypes = DAMAGE_TYPE_NAMES.filter(typeName => (armorInputMap[typeName] || 0) > DAMAGE_DISPLAY_THRESHOLD);
    if (activeArmorTypes.length > 1) {
      const ratio = armorInputDamage > 0 ? scenarioData.armorReducedDamage / armorInputDamage : 0;
      for (const typeName of activeArmorTypes) {
        step5TypeBreakdowns.push({
          typeName,
          icon: DAMAGE_TYPE_ICONS[typeName] || '',
          beforeValue: armorInputMap[typeName] || 0,
          afterValue:  afterArmorMap[typeName] || 0,
          outputVarPrefix: 'armorReduced',
          inputTotal: armorInputDamage,
          outputTotal: scenarioData.armorReducedDamage,
          ratio,
          isStaggerType: staggerOccurred && (STAGGER_TYPES as readonly string[]).includes(typeName),
        });
      }
    }

    const step5: Step5Analysis = {
      armorInputDamage,
      armor: formState.armor,
      halfArmorInput: armorInputDamage / 2,
      isLinear: isArmorLinear,
      isExactArmorThreshold: Math.abs(formState.armor - armorInputDamage / 2) < 1e-9,
      armorReducedDamage: scenarioData.armorReducedDamage,
      staggerOccurred,
      isNoShieldScenario: !isShield,
      blockStaggerDamage: scenarioData.blockStaggerDamage,
      armorStaggerDamage: scenarioData.armorStaggerDamage,
      totalStaggerAccumulation: scenarioData.totalStaggerAccumulation,
      staggerThreshold,
      maxHealth: formState.maxHealth,
      typeBreakdowns: step5TypeBreakdowns,
    };

    // ── Step 6 ────────────────────────────────────────────────────────────

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

    const step6: Step6Analysis = {
      hasDisregardedDot: disregardedTotal > 0.001,
      hasAnyDot,
      dotDisregardEntries,
      disregardedTotal,
      armorReducedDamage: scenarioData.armorReducedDamage,
      adjustedTotal,
    };

    // ── Step 7 ────────────────────────────────────────────────────────────

    const remainingHealth = formState.maxHealth - adjustedTotal;
    const step7: Step7Analysis = {
      maxHealth: formState.maxHealth,
      adjustedTotal,
      remainingHealth,
      isDead: remainingHealth <= 0,
    };

    return { title: scenarioData.scenarioName, step1, step2, step3, step4, step5, step6, step7 };
  }
}
