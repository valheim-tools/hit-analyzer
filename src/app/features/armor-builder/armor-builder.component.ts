import {
  Component, inject, signal, computed, ElementRef, viewChild, afterRenderEffect, effect,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { FormStateService } from '../../core/form-state.service';
import { ArmorPieceService, parseResistanceEffects } from './armor-piece.service';
import { ArmorPiece, ArmorSetPreset, EquippedSlot, ParsedResistanceEffect } from './armor-piece.model';
import { ResistanceModifierEntry, DamageTypeName } from '../../core/models';
import { DAMAGE_TYPE_ICONS } from '../../core/constants';

interface SlotConfig {
  readonly key: string;
  readonly label: string;
  readonly slotType: string;
}

const SLOT_CONFIGS: readonly SlotConfig[] = [
  { key: 'helmet', label: 'Head', slotType: 'Helmet' },
  { key: 'chest', label: 'Chest', slotType: 'Chest' },
  { key: 'legs', label: 'Legs', slotType: 'Legs' },
  { key: 'cape', label: 'Cape', slotType: 'Cape' },
] as const;

const ARMOR_BUILDER_STORAGE_KEY = 'valheim-armor-builder';

interface SavedSlotEntry {
  pieceName: string | null;
  slotType: string;
  quality: number;
}

type SavedArmorBuilderState = Record<string, SavedSlotEntry>;

const EMPTY_EQUIPPED_SLOTS: Record<string, EquippedSlot> = {
  helmet: { piece: null, quality: 1 },
  chest: { piece: null, quality: 1 },
  legs: { piece: null, quality: 1 },
  cape: { piece: null, quality: 1 },
};

@Component({
  selector: 'app-armor-builder',
  imports: [RouterLink],
  templateUrl: './armor-builder.component.html',
  styleUrl: './armor-builder.component.scss',
})
export class ArmorBuilderComponent {
  private readonly router = inject(Router);
  private readonly formStateService = inject(FormStateService);
  private readonly elementRef = inject(ElementRef);
  readonly armorPieceService = inject(ArmorPieceService);

  readonly pickerListElement = viewChild<ElementRef>('pickerList');
  readonly pickerSearchElement = viewChild<ElementRef>('pickerSearchInput');

  readonly SLOT_CONFIGS = SLOT_CONFIGS;
  readonly DAMAGE_TYPE_ICONS = DAMAGE_TYPE_ICONS;

  readonly equippedSlots = signal<Record<string, EquippedSlot>>({ ...EMPTY_EQUIPPED_SLOTS });

  /** Which slot's picker is open, or null if closed. */
  readonly openPickerSlot = signal<string | null>(null);
  readonly pickerSearchQuery = signal('');

  readonly filteredPickerPieces = computed<ArmorPiece[]>(() => {
    const slotKey = this.openPickerSlot();
    if (!slotKey) return [];

    const slotConfig = SLOT_CONFIGS.find(config => config.key === slotKey);
    if (!slotConfig) return [];

    const allPieces = this.armorPieceService.getPiecesForSlot(slotConfig.slotType)();
    const query = this.pickerSearchQuery().toLowerCase().trim();
    if (!query) return allPieces;

    return allPieces.filter(piece => piece.name.toLowerCase().includes(query));
  });

  constructor() {
    // Restore saved state once armor data has loaded
    effect(() => {
      const isLoaded = this.armorPieceService.isLoaded();
      if (!isLoaded) return;
      const restored = this.loadFromStorage();
      if (restored) {
        this.equippedSlots.set(restored);
      }
    }, { allowSignalWrites: true });

    // Persist to localStorage whenever equipped slots change
    effect(() => {
      const slots = this.equippedSlots();
      this.saveToStorage(slots);
    });

    // Auto-scroll to selected item when picker opens
    afterRenderEffect({
      write: () => {
        const slotKey = this.openPickerSlot();
        const listElement = this.pickerListElement();
        if (!slotKey || !listElement) return;

        const selectedElement = listElement.nativeElement.querySelector('.picker-item.is-selected');
        if (selectedElement) {
          selectedElement.scrollIntoView({ block: 'center' });
        }

        const searchElement = this.pickerSearchElement();
        if (searchElement) {
          searchElement.nativeElement.focus();
        }
      },
    });
  }

  readonly totalArmor = computed(() => {
    const slots = this.equippedSlots();
    let total = 0;
    for (const slotKey of Object.keys(slots)) {
      const slot = slots[slotKey];
      if (slot.piece) {
        total += this.armorPieceService.getArmorAtQuality(slot.piece, slot.quality);
      }
    }
    return total;
  });

  readonly hasAnyEquippedPiece = computed(() => {
    const slots = this.equippedSlots();
    return Object.values(slots).some(slot => slot.piece !== null);
  });

  readonly activeSetName = computed<string | null>(() => {
    const slots = this.equippedSlots();
    const helmetSet = slots['helmet'].piece?.set_name;
    const chestSet = slots['chest'].piece?.set_name;
    const legsSet = slots['legs'].piece?.set_name;

    if (!helmetSet || !chestSet || !legsSet) return null;
    if (helmetSet === chestSet && chestSet === legsSet) return helmetSet;
    return null;
  });

  readonly activeSetBonus = computed<string | null>(() => {
    const setName = this.activeSetName();
    if (!setName) return null;
    const sets = this.armorPieceService.sets();
    const setInfo = sets[setName];
    return setInfo?.set_bonus ?? null;
  });

  readonly isCapeMatchingSet = computed<boolean>(() => {
    const setName = this.activeSetName();
    if (!setName) return false;
    const capeSlot = this.equippedSlots()['cape'];
    if (!capeSlot.piece) return false;
    return capeSlot.piece.associated_set === setName;
  });

  readonly aggregatedResistanceEffects = computed<ParsedResistanceEffect[]>(() => {
    const slots = this.equippedSlots();
    const allEffects: ParsedResistanceEffect[] = [];

    for (const slotKey of Object.keys(slots)) {
      const slot = slots[slotKey];
      if (slot.piece?.piece_effects) {
        allEffects.push(...parseResistanceEffects(slot.piece.piece_effects));
      }
    }

    const setBonus = this.activeSetBonus();
    if (setBonus) {
      allEffects.push(...parseResistanceEffects(setBonus));
    }

    return allEffects;
  });

  readonly mergedResistanceModifiers = computed<ResistanceModifierEntry[]>(() => {
    const effects = this.aggregatedResistanceEffects();
    if (effects.length === 0) return [];

    const byType = new Map<DamageTypeName, number>();
    for (const effectEntry of effects) {
      const existing = byType.get(effectEntry.type);
      if (existing === undefined) {
        byType.set(effectEntry.type, effectEntry.multiplier);
      } else {
        if (effectEntry.multiplier > 1 || existing > 1) {
          byType.set(effectEntry.type, Math.max(existing, effectEntry.multiplier));
        } else {
          byType.set(effectEntry.type, Math.min(existing, effectEntry.multiplier));
        }
      }
    }

    const modifiers: ResistanceModifierEntry[] = [];
    for (const [type, multiplier] of byType) {
      modifiers.push({ type, percent: Math.round(multiplier * 100) });
    }
    return modifiers;
  });

  readonly hasResistanceEffects = computed(() => this.mergedResistanceModifiers().length > 0);

  /** Currently active set preset name (if all slots were set by a preset). */
  readonly selectedSetPresetName = computed<string | null>(() => {
    const setName = this.activeSetName();
    if (!setName) return null;

    // Also check that the cape matches (or there's no cape equipped)
    const capeSlot = this.equippedSlots()['cape'];
    if (capeSlot.piece && capeSlot.piece.associated_set !== setName) return null;

    return setName;
  });

  equipSet(setName: string): void {
    const resolvedPieces = this.armorPieceService.resolveSetPieces(setName);

    this.equippedSlots.set({
      helmet: { piece: resolvedPieces['helmet'] ?? null, quality: 1 },
      chest: { piece: resolvedPieces['chest'] ?? null, quality: 1 },
      legs: { piece: resolvedPieces['legs'] ?? null, quality: 1 },
      cape: { piece: resolvedPieces['cape'] ?? null, quality: 1 },
    });
  }

  onPresetsWheel(event: WheelEvent): void {
    const container = event.currentTarget as HTMLElement;
    if (!container) return;

    // Only hijack vertical scroll when the list is horizontally scrollable
    if (container.scrollWidth <= container.clientWidth) return;

    event.preventDefault();
    container.scrollLeft += event.deltaY;
  }

  getSlotArmor(slotKey: string): number {
    const slot = this.equippedSlots()[slotKey];
    if (!slot.piece) return 0;
    return this.armorPieceService.getArmorAtQuality(slot.piece, slot.quality);
  }

  getQualityLevels(slotKey: string): number[] {
    const slot = this.equippedSlots()[slotKey];
    if (!slot.piece) return [];
    const maxQuality = slot.piece.max_quality;
    return Array.from({ length: maxQuality }, (_, index) => index + 1);
  }

  setAllQuality(targetQuality: number): void {
    this.equippedSlots.update(slots => {
      const updated: Record<string, EquippedSlot> = {};
      for (const slotKey of Object.keys(slots)) {
        const slot = slots[slotKey];
        if (slot.piece) {
          const clampedQuality = Math.min(targetQuality, slot.piece.max_quality);
          updated[slotKey] = { ...slot, quality: clampedQuality };
        } else {
          updated[slotKey] = slot;
        }
      }
      return updated;
    });
  }

  // ── Picker ──────────────────────────────────────────────────────────────

  openPicker(slotKey: string): void {
    if (this.openPickerSlot() === slotKey) {
      this.closePicker();
      return;
    }
    this.pickerSearchQuery.set('');
    this.openPickerSlot.set(slotKey);
  }

  closePicker(): void {
    this.openPickerSlot.set(null);
    this.pickerSearchQuery.set('');
  }

  onPickerSearchInput(event: Event): void {
    this.pickerSearchQuery.set((event.target as HTMLInputElement).value);
  }

  selectPiece(slotKey: string, piece: ArmorPiece | null): void {
    this.equippedSlots.update(slots => ({
      ...slots,
      [slotKey]: { piece, quality: piece ? 1 : 1 },
    }));
    this.closePicker();
  }

  onQualityChanged(slotKey: string, quality: number): void {
    this.equippedSlots.update(slots => ({
      ...slots,
      [slotKey]: { ...slots[slotKey], quality },
    }));
  }

  isSelectedPiece(slotKey: string, piece: ArmorPiece): boolean {
    return this.equippedSlots()[slotKey].piece?.name === piece.name;
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('picker-backdrop')) {
      this.closePicker();
    }
  }

  getPickerSlotLabel(): string {
    const slotKey = this.openPickerSlot();
    if (!slotKey) return '';
    const config = SLOT_CONFIGS.find(slotConfig => slotConfig.key === slotKey);
    return config?.label ?? '';
  }

  getResistanceLabel(multiplier: number): string {
    const percent = Math.round(multiplier * 100);
    if (percent === 0) return 'Immune';
    if (percent === 25) return 'Very Resistant';
    if (percent === 50) return 'Resistant';
    if (percent === 75) return 'Slightly Resistant';
    if (percent === 100) return 'Neutral';
    if (percent === 125) return 'Slightly Weak';
    if (percent === 150) return 'Weak';
    if (percent === 200) return 'Very Weak';
    return `${percent}%`;
  }

  resetEquipment(): void {
    this.equippedSlots.set({
      helmet: { piece: null, quality: 1 },
      chest: { piece: null, quality: 1 },
      legs: { piece: null, quality: 1 },
      cape: { piece: null, quality: 1 },
    });
  }

  applyArmorAndNavigateBack(): void {
    this.formStateService.patch({ armor: this.totalArmor() });
    this.router.navigate(['/']);
  }

  applyEffectsAndNavigateBack(): void {
    const resistanceModifiers = this.mergedResistanceModifiers();
    if (resistanceModifiers.length > 0) {
      this.formStateService.patch({ resistanceModifiers });
    }
    this.router.navigate(['/']);
  }

  applyAllAndNavigateBack(): void {
    const patchData: { armor: number; resistanceModifiers?: ResistanceModifierEntry[] } = {
      armor: this.totalArmor(),
    };

    const resistanceModifiers = this.mergedResistanceModifiers();
    if (resistanceModifiers.length > 0) {
      patchData.resistanceModifiers = resistanceModifiers;
    }

    this.formStateService.patch(patchData);
    this.router.navigate(['/']);
  }

  // ── LocalStorage persistence ────────────────────────────────────────────

  private saveToStorage(slots: Record<string, EquippedSlot>): void {
    try {
      const savedState: SavedArmorBuilderState = {};
      for (const slotConfig of SLOT_CONFIGS) {
        const slot = slots[slotConfig.key];
        savedState[slotConfig.key] = {
          pieceName: slot.piece?.name ?? null,
          slotType: slotConfig.slotType,
          quality: slot.quality,
        };
      }
      localStorage.setItem(ARMOR_BUILDER_STORAGE_KEY, JSON.stringify(savedState));
    } catch {
      // localStorage not available — ignore
    }
  }

  private loadFromStorage(): Record<string, EquippedSlot> | null {
    try {
      const saved = localStorage.getItem(ARMOR_BUILDER_STORAGE_KEY);
      if (!saved) return null;
      const parsed = JSON.parse(saved) as SavedArmorBuilderState;

      const restoredSlots: Record<string, EquippedSlot> = {};
      let hasAnyPiece = false;

      for (const slotConfig of SLOT_CONFIGS) {
        const entry = parsed[slotConfig.key];
        if (entry?.pieceName) {
          const piece = this.armorPieceService.findPieceByName(slotConfig.slotType, entry.pieceName);
          if (piece) {
            const quality = Math.max(1, Math.min(entry.quality ?? 1, piece.max_quality));
            restoredSlots[slotConfig.key] = { piece, quality };
            hasAnyPiece = true;
            continue;
          }
        }
        restoredSlots[slotConfig.key] = { piece: null, quality: 1 };
      }

      return hasAnyPiece ? restoredSlots : null;
    } catch {
      return null;
    }
  }
}










