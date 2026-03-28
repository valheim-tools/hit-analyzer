import { Injectable, signal, computed } from '@angular/core';
import { FormState, DamageTypeEntry, ResistanceModifierEntry, DifficultyKey, ParryMultiplierMode } from './models';

const LS_KEY = 'valheim-form';

const DEFAULTS: FormState = {
  mobPreset: '_manual_log_swing_v',
  damageTypes: [{ type: 'Blunt', value: 70 }],
  starLevel: 0,
  difficulty: 'NORMAL',
  extraDamagePercent: 0,
  maxHealth: 120,
  blockingSkill: 15,
  blockArmor: 28,
  armor: 45,
  parryMultiplier: 2.5,
  parryMultiplierMode: 'preset',
  resistanceModifiers: [],
  shieldPreset: 'ShieldBronzeBuckler',
  shieldQuality: 3,
  riskFactor: 0,
  dotSpeed: 3,
};

@Injectable({ providedIn: 'root' })
export class FormStateService {
  private readonly stateSignal = signal<FormState>(this.loadFromStorage());

  readonly state = this.stateSignal.asReadonly();

  get defaults(): FormState {
    return { ...DEFAULTS };
  }

  patch(partial: Partial<FormState>): void {
    this.stateSignal.update(current => ({ ...current, ...partial }));
    this.saveToStorage();
  }

  reset(): void {
    this.stateSignal.set({ ...DEFAULTS });
    localStorage.removeItem(LS_KEY);
  }

  snapshot(): FormState {
    return { ...this.stateSignal() };
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(this.stateSignal()));
    } catch {
      // localStorage not available — ignore
    }
  }

  private loadFromStorage(): FormState {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (!saved) return { ...DEFAULTS };
      const parsed = JSON.parse(saved) as Partial<FormState>;
      return this.mergeWithDefaults(parsed);
    } catch {
      return { ...DEFAULTS };
    }
  }

  private mergeWithDefaults(saved: Partial<FormState>): FormState {
    const merged: FormState = { ...DEFAULTS, ...saved };

    // Migrate legacy baseDamage → damageTypes
    if (!merged.damageTypes || merged.damageTypes.length === 0) {
      merged.damageTypes = [{ type: 'Blunt', value: 70 }];
    }

    // Validate difficulty key
    const validDifficulties: DifficultyKey[] = ['VERY_EASY', 'EASY', 'NORMAL', 'HARD', 'VERY_HARD'];
    if (!validDifficulties.includes(merged.difficulty)) {
      merged.difficulty = DEFAULTS.difficulty;
    }

    // Validate star level
    if (merged.starLevel < 0 || merged.starLevel > 2) {
      merged.starLevel = DEFAULTS.starLevel;
    }

    return merged;
  }
}

