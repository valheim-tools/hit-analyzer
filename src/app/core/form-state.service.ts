import { Injectable, signal } from '@angular/core';
import { FormState } from './models';
import { DIFFICULTY_KEYS } from './constants';

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
  private readonly resetVersionSignal = signal(0);

  readonly state = this.stateSignal.asReadonly();
  readonly resetVersion = this.resetVersionSignal.asReadonly();

  patch(partial: Partial<FormState>): void {
    this.stateSignal.update(current => ({ ...current, ...partial }));
    this.saveToStorage();
  }

  reset(): void {
    this.stateSignal.set({ ...DEFAULTS });
    localStorage.removeItem(LS_KEY);
    this.resetVersionSignal.update(version => version + 1);
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
    if (!DIFFICULTY_KEYS.includes(merged.difficulty)) {
      merged.difficulty = DEFAULTS.difficulty;
    }

    // Validate star level
    if (merged.starLevel < 0 || merged.starLevel > 2) {
      merged.starLevel = DEFAULTS.starLevel;
    }

    return merged;
  }
}

