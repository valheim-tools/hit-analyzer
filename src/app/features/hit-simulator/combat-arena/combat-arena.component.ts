import {
  Component, OnInit, OnDestroy, inject, signal, computed, viewChild, ElementRef, afterRenderEffect, effect,
} from '@angular/core';
import { HitSimulatorService } from '../../../core/hit-simulator.service';
import { DamageCalculatorService } from '../../../core/damage-calculator.service';
import { FormStateService } from '../../../core/form-state.service';
import { AnalyticsService } from '../../../core/analytics.service';
import {
  SimLogEntry, HitLogEntry, DotTickLogEntry, DotBreakdown, ScenarioResult,
  SimScenarioKey,
} from '../../../core/models';
import { DAMAGE_TYPE_ICONS, SIM_SCENARIO_KEYS, SIM_SCENARIO_LABELS, DOT_TYPE_CONFIGS } from '../../../core/constants';
import { FormatNumberPipe } from '../../../shared/pipes/format-number.pipe';

const DOT_SPEED_OPTIONS: readonly number[] = [0.5, 1, 2, 3, 4, 5];
const ANIMATION_SPEED_OPTIONS: readonly number[] = [0.5, 1, 2, 3, 4, 5];

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
  private readonly analyticsService = inject(AnalyticsService);

  readonly simulatorState = this.hitSimulatorService.state;
  readonly scenarioKeys: readonly SimScenarioKey[] = SIM_SCENARIO_KEYS;
  readonly dotSpeedOptions: readonly number[] = DOT_SPEED_OPTIONS;

  readonly arenaMobIconSrc = 'images/animations/greydwarf.png';

  readonly selectedScenario = signal<SimScenarioKey>('noShield');
  readonly dotSpeed = signal<number>(this.formStateService.state().dotSpeed);
  readonly animationSpeed = signal<number>(this.formStateService.state().animationSpeed);
  readonly errorMessage = signal<string | null>(null);
  readonly lastDotBreakdown = signal<DotBreakdown | null>(null);

  // Base animation slowdown factor — all durations multiplied by 1.35 for a more cinematic feel
  readonly animationDurationFactor = computed<number>(() => 1.35 / this.animationSpeed());

  // Arena animation state
  readonly arenaAnimationClass = signal<string>('');
  readonly arenaIsStaggered = signal<boolean>(false);
  readonly arenaIsDead = signal<boolean>(false);
  readonly arenaIsAttacking = signal<boolean>(false);
  private arenaCleanupTimer: ReturnType<typeof setTimeout> | null = null;
  private arenaReactionTimer: ReturnType<typeof setTimeout> | null = null;
  private arenaAttackTimer: ReturnType<typeof setTimeout> | null = null;
  private vikingSkalTimer: ReturnType<typeof setTimeout> | null = null;
  readonly arenaIsVikingSkal = signal<boolean>(false);

  private readonly simLogListElement = viewChild<ElementRef<HTMLUListElement>>('simLog');

  constructor() {
    // Sync slider signals when the form is reset
    effect(() => {
      this.formStateService.resetVersion(); // track reset
      const formState = this.formStateService.state();
      this.dotSpeed.set(formState.dotSpeed);
      this.animationSpeed.set(formState.animationSpeed);
    });

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

  // Disable hit buttons during arena animation, DoT animation, or death
  get isHitButtonsDisabled(): boolean {
    const state = this.simulatorState();
    return state.isDead || state.isDotAnimating || this.arenaIsAttacking();
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
    this.clearAllArenaTimers();
  }

  onSelectScenario(scenarioKey: SimScenarioKey): void {
    this.selectedScenario.set(scenarioKey);
  }

  onBaseHit(): void {
    this.analyticsService.trackSimulatorHit({ hitType: 'base', scenarioKey: this.selectedScenario() });
    this.performHit(null);
  }

  onRandomHit(): void {
    const rng = this.damageCalculatorService.sampleRng();
    this.analyticsService.trackSimulatorHit({ hitType: 'random', scenarioKey: this.selectedScenario() });
    this.performHit(rng);
  }

  onResetHealth(): void {
    const state = this.formStateService.state();
    this.clearAllArenaTimers();
    this.hitSimulatorService.reset(state.maxHealth);
    this.errorMessage.set(null);
    this.arenaIsDead.set(false);
    this.arenaIsStaggered.set(false);
    this.arenaIsAttacking.set(false);
    this.arenaIsVikingSkal.set(false);
    this.arenaAnimationClass.set('');
    this.lastDotBreakdown.set(null);
  }

  onDotSpeedChange(event: Event): void {
    const sliderIndex = parseInt((event.target as HTMLInputElement).value, 10);
    const selectedDotSpeed = this.dotSpeedOptions[sliderIndex] ?? this.dotSpeedOptions[0];
    this.dotSpeed.set(selectedDotSpeed);
    this.formStateService.patch({ dotSpeed: selectedDotSpeed });
  }

  dotSpeedSliderIndex(): number {
    const selectedDotSpeed = this.dotSpeed();
    const matchedIndex = this.dotSpeedOptions.findIndex(speedOption => speedOption === selectedDotSpeed);
    return matchedIndex >= 0 ? matchedIndex : 0;
  }

  onAnimationSpeedChange(event: Event): void {
    const sliderIndex = parseInt((event.target as HTMLInputElement).value, 10);
    const selectedAnimationSpeed = ANIMATION_SPEED_OPTIONS[sliderIndex] ?? ANIMATION_SPEED_OPTIONS[1];
    this.animationSpeed.set(selectedAnimationSpeed);
    this.formStateService.patch({ animationSpeed: selectedAnimationSpeed });
  }

  animationSpeedSliderIndex(): number {
    const selectedAnimationSpeed = this.animationSpeed();
    const matchedIndex = ANIMATION_SPEED_OPTIONS.findIndex(speedOption => speedOption === selectedAnimationSpeed);
    return matchedIndex >= 0 ? matchedIndex : 1;
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
    const isStaggeredOnBlock = scenarioResult.staggeredOnBlock;
    const isDead = (this.simulatorState().currentHealth - instantDamage) <= 0;

    // Pass isStaggeredOnBlock to the service for the hit log
    this.hitSimulatorService.applyInstantDamage(instantDamage, scenarioKey, isStaggered, isStaggeredOnBlock, rng);

    // Trigger arena animation
    this.triggerCombatAnimation(scenarioKey, isStaggered, isStaggeredOnBlock, isDead);

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
    isStaggeredOnBlock: boolean,
    isDead: boolean,
  ): void {
    this.clearAllArenaTimers();
    this.arenaIsDead.set(false);
    this.arenaIsStaggered.set(false);
    this.arenaAnimationClass.set('');
    this.arenaIsAttacking.set(false);

    const isShieldScenario = scenarioKey === 'block' || scenarioKey === 'parry';

    const durationFactor = this.animationDurationFactor();

    // Mob lunges and projectile flies immediately (next render frame after reset)
    this.arenaAttackTimer = setTimeout(() => {
      this.arenaIsAttacking.set(true);
      this.arenaAttackTimer = null;
    }, 0);

    // Player reacts just before the projectile arrives (~65% of its 0.8s flight = 520ms).
    // Shield animations ramp to full opacity 67–120ms after the class is applied,
    // so a 400ms delay makes the shield visually appear at ~467–520ms — right as the stone hits.
    const reactionDelay = 400 * durationFactor;
    this.arenaReactionTimer = setTimeout(() => {
      if (isDead) {
        this.arenaAnimationClass.set('arena-death');
        this.arenaIsDead.set(true);
      } else if (isStaggered) {
        const isShieldBroken = isShieldScenario && isStaggeredOnBlock;
        this.arenaAnimationClass.set(`arena-hit-${this.getScenarioClass(scenarioKey)} arena-stagger${isShieldBroken ? ' arena-shield-break' : ''}`);
        this.arenaIsStaggered.set(true);
      } else {
        this.arenaAnimationClass.set(`arena-hit-${this.getScenarioClass(scenarioKey)}`);
      }
      this.arenaReactionTimer = null;
    }, reactionDelay);

    const baseTotalDuration = isDead ? 1730 : isStaggered ? 1870 : 1330;
    const totalDuration = baseTotalDuration * durationFactor;
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

  private clearAllArenaTimers(): void {
    if (this.arenaCleanupTimer) {
      clearTimeout(this.arenaCleanupTimer);
      this.arenaCleanupTimer = null;
    }
    if (this.arenaReactionTimer) {
      clearTimeout(this.arenaReactionTimer);
      this.arenaReactionTimer = null;
    }
    if (this.arenaAttackTimer) {
      clearTimeout(this.arenaAttackTimer);
      this.arenaAttackTimer = null;
    }
    if (this.vikingSkalTimer) {
      clearTimeout(this.vikingSkalTimer);
      this.vikingSkalTimer = null;
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

