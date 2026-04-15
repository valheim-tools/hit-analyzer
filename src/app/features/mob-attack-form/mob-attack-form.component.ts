import {
  Component, inject, signal, computed, DestroyRef, effect, untracked,
} from '@angular/core';
import {
  ReactiveFormsModule, FormGroup, FormArray, FormControl, Validators,
} from '@angular/forms';
import { Subscription } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { FormStateService } from '../../core/form-state.service';
import { MobPresetService } from './mob-preset.service';
import { AnalyticsService } from '../../core/analytics.service';
import { DamageTypeName, FormState, DamageTypeEntry, DifficultyKey } from '../../core/models';
import {
  DAMAGE_TYPE_NAMES, DAMAGE_TYPE_ICONS, INSTANT_DAMAGE_TYPE_NAMES, DOT_DAMAGE_TYPE_NAMES,
  DIFFICULTY_KEYS, DIFFICULTY_LABELS, DIFFICULTY_ENEMY_DAMAGE_RATE,
  STAR_LEVELS, STAR_LEVEL_LABELS, StarLevel,
} from '../../core/constants';
import { ToggleGroupComponent, ToggleOption } from '../../shared/components/toggle-group/toggle-group.component';
import { PresetDropdownComponent, PresetGroup, PresetSubGroup } from '../../shared/components/preset-dropdown/preset-dropdown.component';

// ── Typed form control interfaces ──────────────────────────────────────────

interface DamageTypeRowControls {
  type: FormControl<DamageTypeName | null>;
  value: FormControl<number | null>;
}

interface MobAttackFormControls {
  mobPreset: FormControl<string | null>;
  damageTypes: FormArray<FormGroup<DamageTypeRowControls>>;
  starLevel: FormControl<number | null>;
  difficulty: FormControl<DifficultyKey | null>;
  extraDamagePercent: FormControl<number | null>;
}

@Component({
  selector: 'app-mob-attack-form',
  imports: [ReactiveFormsModule, ToggleGroupComponent, PresetDropdownComponent],
  templateUrl: './mob-attack-form.component.html',
  styleUrls: ['./mob-attack-form.component.scss'],
})
export class MobAttackFormComponent {
  private readonly formStateService = inject(FormStateService);
  private readonly mobPresetService = inject(MobPresetService);
  private readonly analyticsService = inject(AnalyticsService);
  private readonly destroyRef = inject(DestroyRef);

  private valueChangesSubscription: Subscription | null = null;

  readonly DAMAGE_TYPE_ICONS = DAMAGE_TYPE_ICONS;
  readonly INSTANT_DAMAGE_TYPE_NAMES = INSTANT_DAMAGE_TYPE_NAMES;
  readonly DOT_DAMAGE_TYPE_NAMES = DOT_DAMAGE_TYPE_NAMES;

  readonly starLevelOptions: ToggleOption[] = STAR_LEVELS.map(level => ({
    value: level,
    label: STAR_LEVEL_LABELS[level],
  }));

  readonly difficultyOptions: ToggleOption[] = DIFFICULTY_KEYS.map(key => ({
    value: key,
    label: DIFFICULTY_LABELS[key],
  }));

  readonly difficultyBonusLabels: Record<DifficultyKey, string> = Object.fromEntries(
    DIFFICULTY_KEYS.map(key => {
      const rate = DIFFICULTY_ENEMY_DAMAGE_RATE[key];
      const label = rate < 1.0
        ? `${Math.round((1 - rate) * 100)}% less damage`
        : rate > 1.0
          ? `${Math.round((rate - 1) * 100)}% more damage`
          : 'baseline damage';
      return [key, label];
    })
  ) as Record<DifficultyKey, string>;

  readonly starLevelFactorLabels: Record<StarLevel, string> = {
    0: 'baseline damage',
    1: '50% more damage',
    2: '100% more damage',
  };

  readonly hasExtraDamage = signal(false);

  form!: FormGroup<MobAttackFormControls>;

  readonly mobPresetGroups = computed<PresetGroup[]>(() => {
    return this.mobPresetService.getGroupedData().map(({ biome, mobs }) => ({
      groupLabel: biome,
      subGroups: mobs.map(mob => {
        const normalizedIconSrc = mob.icon_file.startsWith('src/')
          ? mob.icon_file.slice(4)
          : mob.icon_file;
        return {
          subGroupLabel: mob.mob_name,
          iconSrc: normalizedIconSrc,
          items: mob.attacks.map(attack => {
            const typeEntries = DAMAGE_TYPE_NAMES
              .filter(typeName => (attack[typeName] ?? 0) > 0)
              .map(typeName => `${attack[typeName]} ${typeName}`);
            const typeSummary = typeEntries.join(' + ');
            return {
              id: `${mob.prefab}::${attack.attack_type}`,
              label: `${attack.attack_name} (${typeSummary})`,
              triggerLabel: `${mob.mob_name} — ${attack.attack_name} (${typeSummary})`,
            };
          }),
        } as PresetSubGroup;
      }),
    }));
  });

  get damageTypesArray(): FormArray<FormGroup<DamageTypeRowControls>> {
    return this.form.controls.damageTypes;
  }

  get currentStarLevel(): StarLevel {
    return Number(this.form.controls.starLevel.value ?? 0) as StarLevel;
  }

  get currentDifficulty(): DifficultyKey {
    return this.form.controls.difficulty.value ?? 'NORMAL';
  }

  constructor() {
    this.setupForm(this.formStateService.snapshot());

    effect(() => {
      const version = this.formStateService.resetVersion();
      if (version === 0) return;
      const state = untracked(() => this.formStateService.snapshot());
      this.setupForm(state);
    });
  }

  private setupForm(state: FormState): void {
    this.valueChangesSubscription?.unsubscribe();
    this.hasExtraDamage.set(state.extraDamagePercent > 0);
    this.form = this.buildForm(state);

    this.valueChangesSubscription = this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.syncToService());
  }

  private buildForm(state: FormState): FormGroup<MobAttackFormControls> {
    return new FormGroup<MobAttackFormControls>({
      mobPreset: new FormControl(state.mobPreset),
      damageTypes: new FormArray(
        state.damageTypes.map(entry => this.buildDamageTypeRow(entry.type, entry.value))
      ),
      starLevel: new FormControl(state.starLevel),
      difficulty: new FormControl<DifficultyKey | null>(state.difficulty),
      extraDamagePercent: new FormControl(state.extraDamagePercent, [Validators.min(0)]),
    });
  }

  private buildDamageTypeRow(type: DamageTypeName, value: number): FormGroup<DamageTypeRowControls> {
    return new FormGroup<DamageTypeRowControls>({
      type: new FormControl<DamageTypeName | null>(type),
      value: new FormControl(value, [Validators.min(0), Validators.max(1000)]),
    });
  }

  addDamageTypeRow(type: DamageTypeName = 'Blunt', value = 0): void {
    this.damageTypesArray.push(this.buildDamageTypeRow(type, value));
    this.clearMobPreset();
  }

  removeDamageTypeRow(index: number): void {
    this.damageTypesArray.removeAt(index);
    this.clearMobPreset();
    this.syncToService();
  }

  onDamageTypeChange(): void {
    this.clearMobPreset();
  }

  addExtraDamageRow(): void {
    this.hasExtraDamage.set(true);
    this.form.patchValue({ extraDamagePercent: 0 });
  }

  removeExtraDamageRow(): void {
    this.hasExtraDamage.set(false);
    this.form.patchValue({ extraDamagePercent: 0 });
    this.syncToService();
  }

  onMobPresetSelected(presetId: string): void {
    this.form.patchValue({ mobPreset: presetId });

    if (!presetId) {
      this.syncToService();
      return;
    }

    const preset = this.mobPresetService.findById(presetId);
    if (!preset) return;

    const damageTypes: DamageTypeEntry[] = DAMAGE_TYPE_NAMES
      .filter(typeName => (preset[typeName] ?? 0) > 0)
      .map(typeName => ({ type: typeName, value: preset[typeName] as number }));

    // Rebuild the FormArray from preset damage types
    while (this.damageTypesArray.length > 0) this.damageTypesArray.removeAt(0);
    for (const entry of damageTypes) {
      this.damageTypesArray.push(this.buildDamageTypeRow(entry.type, entry.value));
    }
    this.analyticsService.trackMobPresetSelected({ presetId, mobName: preset._mobName });
    this.syncToService();
  }

  private clearMobPreset(): void {
    if (this.form.controls.mobPreset.value) {
      this.form.patchValue({ mobPreset: '' }, { emitEvent: false });
    }
  }

  private syncToService(): void {
    const raw = this.form.getRawValue();
    const damageTypes: DamageTypeEntry[] = (raw.damageTypes as { type: DamageTypeName; value: number }[])
      .filter(entry => entry.value > 0)
      .map(entry => ({ type: entry.type, value: Number(entry.value) }));

    this.formStateService.patch({
      mobPreset: raw.mobPreset ?? '',
      damageTypes,
      starLevel: Number(raw.starLevel),
      difficulty: raw.difficulty as DifficultyKey,
      extraDamagePercent: this.hasExtraDamage() ? Number(raw.extraDamagePercent) || 0 : 0,
    });
  }

  get selectedMobPresetId(): string {
    return this.form.controls.mobPreset.value ?? '';
  }
}

