import { Component, OnInit, inject, signal } from '@angular/core';

import { FormStateService } from './core/form-state.service';
import { DamageCalculatorService } from './core/damage-calculator.service';
import { HitSimulatorService } from './core/hit-simulator.service';
import { CalculationResult, FormState } from './core/models';
import { getPercentileRng } from './core/damage-calculator';

import { MobAttackFormComponent } from './features/mob-attack-form/mob-attack-form.component';
import { PlayerDefenseFormComponent } from './features/player-defense-form/player-defense-form.component';
import { CombatArenaComponent } from './features/hit-simulator/combat-arena/combat-arena.component';
import { ResultsTableComponent } from './features/hit-analyzer/results-table/results-table.component';
import { StepAnalysisComponent } from './features/hit-analyzer/step-analysis/step-analysis.component';

type ActiveTab = 'simulator' | 'hit-analyzer';

@Component({
  selector: 'app-root',
  imports: [
    MobAttackFormComponent,
    PlayerDefenseFormComponent,
    CombatArenaComponent,
    ResultsTableComponent,
    StepAnalysisComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  private readonly formStateService = inject(FormStateService);
  private readonly damageCalculatorService = inject(DamageCalculatorService);
  private readonly hitSimulatorService = inject(HitSimulatorService);

  readonly activeTab = signal<ActiveTab>('simulator');
  readonly calculationResult = signal<CalculationResult | null>(null);
  readonly calculationFormState = signal<FormState | null>(null);
  readonly calculationError = signal<string | null>(null);
  readonly riskFactor = signal<number>(0);

  ngOnInit(): void {
    this.hitSimulatorService.init(this.formStateService.state().maxHealth);
  }

  switchTab(tab: ActiveTab): void {
    this.activeTab.set(tab);
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
      const result = this.damageCalculatorService.calculate(
        {
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
        },
        { rng: rngOption },
      );
      this.calculationResult.set(result);
      this.calculationFormState.set(formState);
      this.hitSimulatorService.syncMaxHealth(formState.maxHealth);
    } catch (error) {
      this.calculationError.set((error as Error).message);
      this.calculationResult.set(null);
    }
  }

  onReset(): void {
    this.formStateService.reset();
    this.calculationResult.set(null);
    this.calculationError.set(null);
    this.calculationFormState.set(null);
    this.riskFactor.set(0);
    const state = this.formStateService.state();
    this.hitSimulatorService.reset(state.maxHealth);
  }

  onRiskFactorChange(event: Event): void {
    const value = parseFloat((event.target as HTMLInputElement).value);
    this.riskFactor.set(Number.isFinite(value) && value >= 0 && value <= 100 ? value : 0);
  }
}
