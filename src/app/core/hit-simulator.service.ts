import { Injectable, signal, inject, NgZone } from '@angular/core';
import {
  SimulatorState, SimLogEntry,
  SimScenarioKey, DotBreakdown,
} from './models';
import { DOT_TYPE_CONFIGS } from './constants';

function makeInitialState(maxHealth: number): SimulatorState {
  return {
    maxHealth,
    currentHealth: maxHealth,
    hitCount: 0,
    isDead: false,
    isDotAnimating: false,
    healthPercent: 100,
    log: [],
    arenaScenarioKey: null,
    arenaIsStaggered: false,
    arenaIsDead: false,
    arenaIsAnimating: false,
  };
}

@Injectable({ providedIn: 'root' })
export class HitSimulatorService {
  private readonly ngZone = inject(NgZone);

  private readonly stateSignal = signal<SimulatorState>(makeInitialState(100));
  readonly state = this.stateSignal.asReadonly();

  private dotAnimationTimer: ReturnType<typeof setTimeout> | null = null;

  init(maxHealth: number): void {
    this.cancelDotAnimation();
    this.stateSignal.set(makeInitialState(maxHealth));
  }

  syncMaxHealth(newMaxHealth: number): void {
    this.stateSignal.update(current => {
      if (current.hitCount === 0) {
        return { ...current, maxHealth: newMaxHealth, currentHealth: newMaxHealth, healthPercent: 100 };
      }
      const healthPercent = newMaxHealth > 0
        ? Math.max(0, (current.currentHealth / newMaxHealth) * 100)
        : 0;
      return { ...current, maxHealth: newMaxHealth, healthPercent };
    });
  }

  applyInstantDamage(
    instantDamage: number,
    scenarioKey: SimScenarioKey,
    isStaggered: boolean,
    isStaggeredOnBlock: boolean,
    rngFactor: number | null,
  ): void {
    this.stateSignal.update(current => {
      const exactRemainingHealth = current.currentHealth - instantDamage;
      const currentHealth = Math.max(0, exactRemainingHealth);
      const isDead = currentHealth <= 0;
      const healthPercent = current.maxHealth > 0
        ? Math.max(0, (currentHealth / current.maxHealth) * 100)
        : 0;
      const hitNumber = current.hitCount + 1;

      const logEntry: SimLogEntry = {
        kind: 'hit',
        data: {
          hitNumber,
          scenarioKey,
          damage: instantDamage,
          remainingHealth: currentHealth,
          exactRemainingHealth,
          isStaggered,
          isStaggeredOnBlock,
          rngFactor,
          isDead,
        },
      };

      return {
        ...current,
        currentHealth,
        hitCount: hitNumber,
        isDead,
        healthPercent,
        log: [...current.log, logEntry],
        arenaScenarioKey: scenarioKey,
        arenaIsStaggered: isStaggered,
        arenaIsDead: isDead,
        arenaIsAnimating: true,
      };
    });
  }

  playDotAnimation(dotBreakdown: DotBreakdown, dotSpeed: number): void {
    interface TickEvent {
      dotKey: keyof DotBreakdown;
      dotTypeName: string;
      tickIndex: number;
      totalTicks: number;
      tickDamage: number;
      gameTime: number;
    }

    const allTicks: TickEvent[] = [];
    for (const [dotKey, dotData] of Object.entries(dotBreakdown) as [keyof DotBreakdown, typeof dotBreakdown[keyof DotBreakdown]][]) {
      if (dotData.total <= 0 || dotData.ticks.length === 0) continue;
      const dotConfig = DOT_TYPE_CONFIGS.find(config => config.key === dotKey)!;
      const dotTypeName = dotConfig.damageTypeName;
      dotData.ticks.forEach((tick, index) => {
        allTicks.push({
          dotKey,
          dotTypeName,
          tickIndex: index,
          totalTicks: dotData.ticks.length,
          tickDamage: tick.damage,
          gameTime: tick.time,
        });
      });
    }
    if (allTicks.length === 0) return;
    allTicks.sort((a, b) => a.gameTime - b.gameTime);

    this.stateSignal.update(current => ({ ...current, isDotAnimating: true }));

    let tickIndex = 0;

    const applyNextTick = (): void => {
      this.ngZone.run(() => {
        const current = this.stateSignal();
        if (tickIndex >= allTicks.length || current.currentHealth <= 0) {
          this.cancelDotAnimation();
          return;
        }

        const tick = allTicks[tickIndex];
        const currentHealth = Math.max(0, current.currentHealth - tick.tickDamage);
        const isDead = currentHealth <= 0;
        const healthPercent = current.maxHealth > 0
          ? Math.max(0, (currentHealth / current.maxHealth) * 100)
          : 0;

        const logEntry: SimLogEntry = {
          kind: 'dot',
          data: {
            dotTypeName: tick.dotTypeName,
            tickIndex: tick.tickIndex,
            totalTicks: tick.totalTicks,
            tickDamage: tick.tickDamage,
            remainingHealth: currentHealth,
            isDead,
          },
        };

        this.stateSignal.update(state => ({
          ...state,
          currentHealth,
          isDead,
          healthPercent,
          log: [...state.log, logEntry],
        }));

        tickIndex++;

        if (tickIndex < allTicks.length && currentHealth > 0) {
          const nextTick = allTicks[tickIndex];
          const delay = ((nextTick.gameTime - tick.gameTime) / dotSpeed) * 1000;
          this.ngZone.runOutsideAngular(() => {
            this.dotAnimationTimer = setTimeout(applyNextTick, Math.max(delay, 50));
          });
        } else {
          this.stateSignal.update(state => ({ ...state, isDotAnimating: false }));
        }
      });
    };

    this.ngZone.runOutsideAngular(() => {
      this.dotAnimationTimer = setTimeout(applyNextTick, 0);
    });
  }

  cancelDotAnimation(): void {
    if (this.dotAnimationTimer !== null) {
      clearTimeout(this.dotAnimationTimer);
      this.dotAnimationTimer = null;
    }
    this.stateSignal.update(current => ({ ...current, isDotAnimating: false }));
  }

  reset(maxHealth: number): void {
    this.cancelDotAnimation();
    this.stateSignal.set(makeInitialState(maxHealth));
  }
}
