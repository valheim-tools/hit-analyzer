import {
  Component, inject, signal, computed, DestroyRef, effect, untracked,
} from '@angular/core';
import {
  ReactiveFormsModule, FormGroup, FormArray, FormControl, Validators,
} from '@angular/forms';
import { Subscription } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { FormStateService } from '../../core/form-state.service';
import { ShieldPresetService } from '../../core/shield-preset.service';
import { DamageTypeName, FormState, ResistanceModifierEntry, ParryMultiplierMode } from '../../core/models';
import {
  DAMAGE_TYPE_NAMES, DAMAGE_TYPE_ICONS, INSTANT_DAMAGE_TYPE_NAMES, DOT_DAMAGE_TYPE_NAMES,
} from '../../core/constants';
import { ToggleGroupComponent, ToggleOption } from '../../shared/components/toggle-group/toggle-group.component';
import { PresetDropdownComponent, PresetGroup } from '../../shared/components/preset-dropdown/preset-dropdown.component';
import { TooltipDirective } from '../../shared/directives/tooltip.directive';


const PARRY_MULTIPLIER_PRESETS = [1, 1.5, 2, 2.5, 4, 6];

// ── Typed form control interfaces ──────────────────────────────────────────

interface ResistanceRowControls {
  type: FormControl<DamageTypeName | null>;
  percent: FormControl<number | null>;
}

interface PlayerDefenseFormControls {
  maxHealth: FormControl<number | null>;
  resistanceModifiers: FormArray<FormGroup<ResistanceRowControls>>;
  shieldPreset: FormControl<string | null>;
  shieldQuality: FormControl<number | null>;
  blockArmor: FormControl<number | null>;
  parryMultiplierPreset: FormControl<string | null>;
  parryMultiplierCustom: FormControl<number | null>;
  blockingSkill: FormControl<number | null>;
  armor: FormControl<number | null>;
}

@Component({
  selector: 'app-player-defense-form',
  imports: [ReactiveFormsModule, ToggleGroupComponent, PresetDropdownComponent, TooltipDirective],
  templateUrl: './player-defense-form.component.html',
  styleUrls: ['./player-defense-form.component.scss'],
})
export class PlayerDefenseFormComponent {
  private readonly formStateService = inject(FormStateService);
  private readonly shieldPresetService = inject(ShieldPresetService);
  private readonly destroyRef = inject(DestroyRef);

  private formSubscriptions = new Subscription();

  readonly DAMAGE_TYPE_ICONS = DAMAGE_TYPE_ICONS;
  readonly INSTANT_DAMAGE_TYPE_NAMES = INSTANT_DAMAGE_TYPE_NAMES;
  readonly DOT_DAMAGE_TYPE_NAMES = DOT_DAMAGE_TYPE_NAMES;
  readonly PARRY_MULTIPLIER_PRESETS = PARRY_MULTIPLIER_PRESETS;

  readonly shieldQualityOptions: ToggleOption[] = [
    { value: 1, label: '⚒ 1' },
    { value: 2, label: '⚒ 2' },
    { value: 3, label: '⚒ 3' },
  ];

  form!: FormGroup<PlayerDefenseFormControls>;

  readonly isParryCustom = signal(false);

  readonly shieldPresetGroups = computed<PresetGroup[]>(() => {
    const shields = this.shieldPresetService.shields();
    if (shields.length === 0) return [];
    return [{
      groupLabel: 'Shields',
      items: shields.map(shield => ({
        id: shield.prefab,
        label: shield.item_name,
        iconSrc: `assets/images/presets/shields/${shield.prefab}.png`,
      })),
    }];
  });

  get resistanceModifiersArray(): FormArray<FormGroup<ResistanceRowControls>> {
    return this.form.controls.resistanceModifiers;
  }

  get hasShieldPreset(): boolean {
    return !!this.form.controls.shieldPreset.value;
  }

  get selectedShieldPresetId(): string {
    return this.form.controls.shieldPreset.value ?? '';
  }

  get usedResistanceTypes(): Set<DamageTypeName> {
    const used = new Set<DamageTypeName>();
    for (const control of this.resistanceModifiersArray.controls) {
      const typeValue = control.controls.type.value;
      if (typeValue) used.add(typeValue);
    }
    return used;
  }

  get allResistanceTypesUsed(): boolean {
    return this.usedResistanceTypes.size >= DAMAGE_TYPE_NAMES.length;
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
    this.formSubscriptions.unsubscribe();
    this.formSubscriptions = new Subscription();

    this.isParryCustom.set(state.parryMultiplierMode === 'custom');
    this.form = this.buildForm(state);

    this.formSubscriptions.add(
      this.form.controls.shieldQuality.valueChanges
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((quality: number | null) => {
          const shieldPreset = this.form.controls.shieldPreset.value;
          if (shieldPreset) {
            this.syncShieldFields(shieldPreset, quality ?? 3);
          }
        })
    );

    // Clear the shield preset when the user manually overrides block armor or parry values.
    // emitEvent: false in syncShieldFields prevents these from firing during programmatic preset sync.
    this.formSubscriptions.add(
      this.form.controls.blockArmor.valueChanges
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => this.clearShieldPreset())
    );

    this.formSubscriptions.add(
      this.form.controls.parryMultiplierCustom.valueChanges
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => this.clearShieldPreset())
    );

    this.formSubscriptions.add(
      this.form.valueChanges
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => this.syncToService())
    );
  }

  private buildForm(state: FormState): FormGroup<PlayerDefenseFormControls> {
    return new FormGroup<PlayerDefenseFormControls>({
      maxHealth: new FormControl(state.maxHealth, [Validators.min(0), Validators.max(1000)]),
      resistanceModifiers: new FormArray(
        state.resistanceModifiers.map(entry =>
          this.buildResistanceRow(entry.type, entry.percent)
        )
      ),
      shieldPreset: new FormControl(state.shieldPreset),
      shieldQuality: new FormControl(state.shieldQuality),
      blockArmor: new FormControl(state.blockArmor, [Validators.min(0), Validators.max(500)]),
      parryMultiplierPreset: new FormControl(
        this.resolveParryPreset(state.parryMultiplier, state.parryMultiplierMode)
      ),
      parryMultiplierCustom: new FormControl(state.parryMultiplier, [Validators.min(0.1)]),
      blockingSkill: new FormControl(state.blockingSkill, [Validators.min(0), Validators.max(100)]),
      armor: new FormControl(state.armor, [Validators.min(0), Validators.max(500)]),
    });
  }

  private buildResistanceRow(type: DamageTypeName, percent: number): FormGroup<ResistanceRowControls> {
    return new FormGroup<ResistanceRowControls>({
      type: new FormControl<DamageTypeName | null>(type),
      percent: new FormControl(percent, [Validators.min(0), Validators.max(200)]),
    });
  }

  private resolveParryPreset(multiplier: number, mode: ParryMultiplierMode): string {
    if (mode === 'custom') return 'custom';
    if (PARRY_MULTIPLIER_PRESETS.some(preset => Math.abs(preset - multiplier) < 1e-9)) {
      return String(multiplier);
    }
    return 'custom';
  }

  onShieldPresetSelected(presetId: string): void {
    this.form.patchValue({ shieldPreset: presetId }, { emitEvent: false });

    if (!presetId) {
      this.form.controls.shieldQuality.disable({ emitEvent: false });
      this.syncToService();
      return;
    }

    this.form.controls.shieldQuality.enable({ emitEvent: false });
    const quality = Number(this.form.controls.shieldQuality.value ?? 3);
    this.syncShieldFields(presetId, quality);
  }

  private syncShieldFields(presetId: string, quality: number): void {
    const shield = this.shieldPresetService.findByPrefab(presetId);
    if (!shield) return;

    const blockArmor = this.shieldPresetService.getBlockArmor(presetId, quality);
    const parryBonus = shield.parry_bonus ?? 1.0;

    this.form.patchValue({ blockArmor }, { emitEvent: false });

    if (PARRY_MULTIPLIER_PRESETS.some(preset => Math.abs(preset - parryBonus) < 1e-9)) {
      this.form.patchValue({ parryMultiplierPreset: String(parryBonus) }, { emitEvent: false });
      this.isParryCustom.set(false);
    } else {
      this.form.patchValue({
        parryMultiplierPreset: 'custom',
        parryMultiplierCustom: parryBonus,
      }, { emitEvent: false });
      this.isParryCustom.set(true);
    }

    this.syncToService();
  }

  onParryPresetChange(): void {
    const isCustom = this.form.controls.parryMultiplierPreset.value === 'custom';
    this.isParryCustom.set(isCustom);
    this.clearShieldPreset();
    this.syncToService();
  }

  private clearShieldPreset(): void {
    if (this.form.controls.shieldPreset.value) {
      this.form.controls.shieldQuality.disable({ emitEvent: false });
      this.form.patchValue({ shieldPreset: '' }, { emitEvent: false });
    }
  }

  addResistanceRow(): void {
    const availableType = DAMAGE_TYPE_NAMES.find(type => !this.usedResistanceTypes.has(type));
    if (!availableType) return;
    this.resistanceModifiersArray.push(this.buildResistanceRow(availableType, 100));
  }

  removeResistanceRow(index: number): void {
    this.resistanceModifiersArray.removeAt(index);
    this.syncToService();
  }

  onResistanceTypeChange(): void {
    this.syncToService();
  }

  getAvailableTypesForRow(rowIndex: number): DamageTypeName[] {
    const currentType = this.resistanceModifiersArray.at(rowIndex)?.controls.type.value;
    const used = this.usedResistanceTypes;
    return DAMAGE_TYPE_NAMES.filter(type => type === currentType || !used.has(type));
  }

  private getParryMultiplier(): number {
    const presetValue = this.form.controls.parryMultiplierPreset.value;
    if (presetValue === 'custom') {
      return Number(this.form.controls.parryMultiplierCustom.value) || 1.5;
    }
    return Number(presetValue) || 1.5;
  }

  private syncToService(): void {
    const raw = this.form.getRawValue();

    const resistanceModifiers: ResistanceModifierEntry[] = (
      raw.resistanceModifiers as { type: DamageTypeName; percent: number }[]
    ).map(entry => ({ type: entry.type, percent: Number(entry.percent) }));

    const parryMultiplier = this.getParryMultiplier();
    const isCustom = this.form.controls.parryMultiplierPreset.value === 'custom';

    this.formStateService.patch({
      maxHealth: Number(raw.maxHealth),
      resistanceModifiers,
      shieldPreset: raw.shieldPreset ?? '',
      shieldQuality: Number(raw.shieldQuality),
      blockArmor: Number(raw.blockArmor),
      parryMultiplier,
      parryMultiplierMode: isCustom ? 'custom' : 'preset',
      blockingSkill: Number(raw.blockingSkill),
      armor: Number(raw.armor),
    });
  }
}

