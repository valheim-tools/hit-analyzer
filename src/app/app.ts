import { Component, OnInit, inject, signal, effect, isDevMode } from '@angular/core';

import { FormStateService } from './core/form-state.service';
import { DamageCalculatorService } from './core/damage-calculator.service';
import { HitSimulatorService } from './core/hit-simulator.service';
import { AnalyticsService } from './core/analytics.service';
import { CalculationResult, FormState, RangeDamageResult } from './core/models';
import { getPercentileRng } from './core/damage-calculator';

import { MobAttackFormComponent } from './features/mob-attack-form/mob-attack-form.component';
import { PlayerDefenseFormComponent } from './features/player-defense-form/player-defense-form.component';
import { CombatArenaComponent } from './features/hit-simulator/combat-arena/combat-arena.component';
import { ResultsTableComponent } from './features/hit-analyzer/results-table/results-table.component';
import { StepAnalysisComponent } from './features/hit-analyzer/step-analysis/step-analysis.component';
import { DevTestCaseLoaderComponent } from './features/dev-test-case-loader/dev-test-case-loader.component';

type ActiveTab = 'simulator' | 'hit-analyzer';

@Component({
  selector: 'app-root',
  imports: [
    MobAttackFormComponent,
    PlayerDefenseFormComponent,
    CombatArenaComponent,
    ResultsTableComponent,
    StepAnalysisComponent,
    DevTestCaseLoaderComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  private readonly formStateService = inject(FormStateService);
  private readonly damageCalculatorService = inject(DamageCalculatorService);
  private readonly hitSimulatorService = inject(HitSimulatorService);
  private readonly analyticsService = inject(AnalyticsService);

  readonly isDevMode = isDevMode();
  readonly activeTab = signal<ActiveTab>('simulator');
  readonly calculationResult = signal<CalculationResult | null>(null);
  readonly rangeDamageResult = signal<RangeDamageResult | null>(null);
  readonly calculationFormState = signal<FormState | null>(null);
  readonly calculationError = signal<string | null>(null);
  readonly riskFactor = signal<number>(this.formStateService.state().riskFactor);
  private previousDifficulty = this.formStateService.state().difficulty;

  constructor() {
    effect(() => {
      const currentState = this.formStateService.state();
      const currentDifficulty = currentState.difficulty;
      if (currentDifficulty === this.previousDifficulty) return;

      this.previousDifficulty = currentDifficulty;
      this.hitSimulatorService.reset(currentState.maxHealth);
    });
  }

  ngOnInit(): void {
    this.hitSimulatorService.init(this.formStateService.state().maxHealth);
  }

  switchTab(tab: ActiveTab): void {
    this.activeTab.set(tab);
    this.analyticsService.trackTabSwitched({ tabName: tab });
  }

  onHit(): void {
    this.calculationError.set(null);
    const formState = this.formStateService.snapshot();
    const riskFactorValue = this.riskFactor();

    const damageTypes: Record<string, number> = {};
    for (const entry of formState.damageTypes) {
      damageTypes[entry.type] = entry.value;
    }
    const resistanceModifiers: Record<string, number> = {};
    for (const entry of formState.resistanceModifiers) {
      resistanceModifiers[entry.type] = entry.percent / 100;
    }

    let rngOption: number | null = null;
    if (riskFactorValue > 0) {
      rngOption = getPercentileRng((100 - riskFactorValue) / 100);
    }

    try {
      const calculationInputs = {
        damageTypes,
        starLevel: formState.starLevel,
        difficulty: formState.difficulty,
        extraDamagePercent: formState.extraDamagePercent,
        maxHealth: formState.maxHealth,
        blockingSkill: formState.blockingSkill,
        blockArmor: formState.blockArmor,
        armor: formState.armor,
        parryMultiplier: formState.parryMultiplier,
        resistanceModifiers,
      };
      const result = this.damageCalculatorService.calculate(calculationInputs, { rng: rngOption });
      const rangeDamage = this.damageCalculatorService.calculateRangeDamage(calculationInputs);
      this.calculationResult.set(result);
      this.rangeDamageResult.set(rangeDamage);
      this.calculationFormState.set(formState);
      this.hitSimulatorService.syncMaxHealth(formState.maxHealth);
      this.analyticsService.trackHitCalculated({
        difficulty: formState.difficulty,
        starLevel: formState.starLevel,
        blockArmor: formState.blockArmor,
        armor: formState.armor,
        hasRiskFactor: riskFactorValue > 0,
        riskFactorValue,
      });
    } catch (error) {
      this.calculationError.set((error as Error).message);
      this.calculationResult.set(null);
      this.rangeDamageResult.set(null);
    }
  }

  onReset(): void {
    this.formStateService.reset();
    this.calculationResult.set(null);
    this.rangeDamageResult.set(null);
    this.calculationError.set(null);
    this.calculationFormState.set(null);
    this.riskFactor.set(0);
  }

  onRiskFactorChange(event: Event): void {
    const value = parseFloat((event.target as HTMLInputElement).value);
    const riskFactorValue = Number.isFinite(value) && value >= 0 && value <= 100 ? value : 0;
    this.riskFactor.set(riskFactorValue);
    this.formStateService.patch({ riskFactor: riskFactorValue });
  }
}
