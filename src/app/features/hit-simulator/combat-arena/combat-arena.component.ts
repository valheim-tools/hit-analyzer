import {
  Component, OnInit, OnDestroy, inject, signal, viewChild, ElementRef, afterRenderEffect,
} from '@angular/core';
import { HitSimulatorService } from '../../../core/hit-simulator.service';
import { DamageCalculatorService } from '../../../core/damage-calculator.service';
import { FormStateService } from '../../../core/form-state.service';
import {
  SimLogEntry, HitLogEntry, DotTickLogEntry, DotBreakdown, ScenarioResult,
  SimScenarioKey,
} from '../../../core/models';
import { DAMAGE_TYPE_ICONS, SIM_SCENARIO_KEYS, SIM_SCENARIO_LABELS } from '../../../core/constants';
import { DOT_TYPE_CONFIGS } from '../../../core/damage-calculator';
import { FormatNumberPipe } from '../../../shared/pipes/format-number.pipe';

@Component({
  selector: 'app-combat-arena',
  imports: [FormatNumberPipe],
  templateUrl: './combat-arena.component.html',
  styleUrls: ['./combat-arena.component.scss'],
})
export class CombatArenaComponent implements OnInit, OnDestroy {
  private readonly hitSimulatorService = inject(HitSimulatorService);
  private readonly damageCalculatorService = inject(DamageCalculatorService);
  private readonly formStateService = inject(FormStateService);

  readonly simulatorState = this.hitSimulatorService.state;
  readonly scenarioKeys: readonly SimScenarioKey[] = SIM_SCENARIO_KEYS;

  readonly arenaMobIconSrc = 'assets/images/animations/greydwarf.png';

  readonly selectedScenario = signal<SimScenarioKey>('noShield');
  readonly dotSpeed = signal<number>(3);
  readonly errorMessage = signal<string | null>(null);
  readonly lastDotBreakdown = signal<DotBreakdown | null>(null);

  // Arena animation state
  readonly arenaAnimationClass = signal<string>('');
  readonly arenaShieldSrc = signal<string>('assets/images/animations/blue-shield.png');
  readonly arenaIsStaggered = signal<boolean>(false);
  readonly arenaIsDead = signal<boolean>(false);
  readonly arenaIsAttacking = signal<boolean>(false);
  private arenaCleanupTimer: ReturnType<typeof setTimeout> | null = null;
  private vikingSkalTimer: ReturnType<typeof setTimeout> | null = null;
  readonly arenaIsVikingSkal = signal<boolean>(false);

  private readonly simLogListElement = viewChild<ElementRef<HTMLUListElement>>('simLog');

  constructor() {
    // Scroll the log list to the bottom whenever a new entry is appended.
    // earlyRead reads scrollHeight before Angular writes to the DOM (avoids reflow in write phase).
    // write phase sets scrollTop — no DOM reads allowed here.
    afterRenderEffect({
      earlyRead: () => {
        const log = this.simulatorState().log;
        if (log.length === 0) return null;
        const listElement = this.simLogListElement()?.nativeElement;
        if (!listElement) return null;
        return { element: listElement, scrollHeight: listElement.scrollHeight };
      },
      write: (readData) => {
        const data = readData();
        if (data) {
          data.element.scrollTop = data.scrollHeight;
        }
      },
    });
  }


  get isHitButtonsDisabled(): boolean {
    const state = this.simulatorState();
    return state.isDead || state.isDotAnimating;
  }

  get healthBarClass(): string {
    const state = this.simulatorState();
    if (state.isDotAnimating) {
      return this.getActiveDotBarClass(state.log);
    }
    if (state.isDead || state.healthPercent <= 0) return 'sim-bar-dead';
    if (state.healthPercent <= 20) return 'sim-bar-critical';
    if (state.healthPercent <= 50) return 'sim-bar-warning';
    return '';
  }

  ngOnInit(): void {
    const state = this.formStateService.state();
    this.hitSimulatorService.init(state.maxHealth);
  }

  ngOnDestroy(): void {
    this.clearArenaCleanupTimer();
  }

  onSelectScenario(scenarioKey: SimScenarioKey): void {
    this.selectedScenario.set(scenarioKey);
  }

  onBaseHit(): void {
    this.performHit(null);
  }

  onRandomHit(): void {
    const rng = this.damageCalculatorService.sampleRng();
    this.performHit(rng);
  }

  onResetHealth(): void {
    const state = this.formStateService.state();
    this.hitSimulatorService.reset(state.maxHealth);
    this.errorMessage.set(null);
    this.arenaIsDead.set(false);
    this.arenaIsStaggered.set(false);
    this.arenaAnimationClass.set('');
    this.clearArenaCleanupTimer();
  }

  onDotSpeedChange(event: Event): void {
    const value = parseFloat((event.target as HTMLInputElement).value);
    this.dotSpeed.set(value);
  }

  onVikingClick(): void {
    if (this.vikingSkalTimer) {
      clearTimeout(this.vikingSkalTimer);
      this.arenaIsVikingSkal.set(false);
    }
    this.arenaIsVikingSkal.set(true);
    this.vikingSkalTimer = setTimeout(() => {
      this.arenaIsVikingSkal.set(false);
      this.vikingSkalTimer = null;
    }, 1800);
  }

  private performHit(rng: number | null): void {
    this.errorMessage.set(null);
    const formState = this.formStateService.snapshot();
    const scenarioKey = this.selectedScenario();

    // Build inputs
    const damageTypes: Record<string, number> = {};
    for (const entry of formState.damageTypes) {
      damageTypes[entry.type] = entry.value;
    }
    const resistanceModifiers: Record<string, number> = {};
    for (const entry of formState.resistanceModifiers) {
      resistanceModifiers[entry.type] = entry.percent / 100;
    }

    let calculationResult;
    try {
      calculationResult = this.damageCalculatorService.calculate({
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
      }, { rng });
    } catch (error) {
      this.errorMessage.set((error as Error).message);
      return;
    }

    const scenarioResult: ScenarioResult = calculationResult[scenarioKey];
    const instantDamage = scenarioResult.instantDamage;
    const isStaggered = scenarioResult.stagger === 'YES';
    const isDead = (this.simulatorState().currentHealth - instantDamage) <= 0;

    this.hitSimulatorService.applyInstantDamage(instantDamage, scenarioKey, isStaggered, rng);

    // Trigger arena animation
    this.triggerCombatAnimation(scenarioKey, isStaggered, isDead);

    // Play DoT if any
    const dotBreakdown = scenarioResult.dotBreakdown;
    const hasDoT = DOT_TYPE_CONFIGS.some(dotConfig => dotBreakdown[dotConfig.key].total > 0.001);
    if (hasDoT) {
      this.lastDotBreakdown.set(dotBreakdown);
      this.hitSimulatorService.playDotAnimation(dotBreakdown, this.dotSpeed());
    }
  }

  private triggerCombatAnimation(
    scenarioKey: SimScenarioKey,
    isStaggered: boolean,
    isDead: boolean,
  ): void {
    this.clearArenaCleanupTimer();
    this.arenaIsDead.set(false);
    this.arenaIsStaggered.set(false);
    this.arenaAnimationClass.set('');
    this.arenaIsAttacking.set(false);

    const isShieldScenario = scenarioKey === 'block' || scenarioKey === 'parry';
    if (isShieldScenario) {
      this.arenaShieldSrc.set(
        scenarioKey === 'parry'
          ? 'assets/images/animations/yellow-shield.png'
          : 'assets/images/animations/blue-shield.png'
      );
    }

    // Mob lunges and projectile flies immediately (next render frame after reset)
    setTimeout(() => {
      this.arenaIsAttacking.set(true);
    }, 0);

    // Player reacts after reaction delay
    const reactionDelay = 267;
    setTimeout(() => {
      if (isDead) {
        this.arenaAnimationClass.set('arena-death');
        this.arenaIsDead.set(true);
      } else if (isStaggered) {
        this.arenaAnimationClass.set(`arena-hit-${this.getScenarioClass(scenarioKey)} arena-stagger${isShieldScenario ? ' arena-shield-break' : ''}`);
        this.arenaIsStaggered.set(true);
      } else {
        this.arenaAnimationClass.set(`arena-hit-${this.getScenarioClass(scenarioKey)}`);
      }
    }, reactionDelay);

    const totalDuration = isDead ? 1600 : isStaggered ? 1733 : 1200;
    this.arenaCleanupTimer = setTimeout(() => {
      this.arenaAnimationClass.set('');
      this.arenaIsStaggered.set(false);
      this.arenaIsAttacking.set(false);
      this.arenaCleanupTimer = null;
    }, totalDuration);
  }

  private getScenarioClass(scenarioKey: SimScenarioKey): string {
    const classes: Record<SimScenarioKey, string> = {
      noShield: 'no-shield',
      block: 'block',
      parry: 'parry',
    };
    return classes[scenarioKey];
  }

  private getActiveDotBarClass(log: SimLogEntry[]): string {
    // Check the most recent log entry for active DoT type
    for (let index = log.length - 1; index >= 0; index--) {
      const entry = log[index];
      if (entry.kind === 'dot') {
        return `sim-dot-${entry.data.dotTypeName.toLowerCase()}`;
      }
    }
    // Fallback before first tick is logged: use first active DoT type
    const lastDot = this.lastDotBreakdown();
    if (!lastDot) return '';
    for (const dotConfig of DOT_TYPE_CONFIGS) {
      const dotData = lastDot[dotConfig.key];
      if (dotData.total > 0.001 && dotData.ticks.length > 0) {
        return `sim-dot-${dotConfig.key}`;
      }
    }
    return '';
  }

  private clearArenaCleanupTimer(): void {
    if (this.arenaCleanupTimer) {
      clearTimeout(this.arenaCleanupTimer);
      this.arenaCleanupTimer = null;
    }
  }

  // Template helpers
  getScenarioLabel(scenarioKey: SimScenarioKey): string {
    return SIM_SCENARIO_LABELS[scenarioKey];
  }

  isHitLogEntry(entry: SimLogEntry): entry is { kind: 'hit'; data: HitLogEntry } {
    return entry.kind === 'hit';
  }

  isDotLogEntry(entry: SimLogEntry): entry is { kind: 'dot'; data: DotTickLogEntry } {
    return entry.kind === 'dot';
  }

  getDotTypeIcon(dotTypeName: string): string {
    return (DAMAGE_TYPE_ICONS as Record<string, string>)[dotTypeName] ?? '⏱';
  }
}


