import {
  Component, inject, signal, computed, ElementRef, viewChild, afterRenderEffect, effect,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { FormStateService } from '../../core/form-state.service';
import { ArmorPieceService, parseResistanceEffects } from './armor-piece.service';
import { ArmorPiece, ArmorSetPreset, EquippedSlot, ParsedResistanceEffect } from './armor-piece.model';
import { MeadPresetService } from './mead-preset.service';
import { MeadPreset, EquippedMeadSlot, MeadResistanceEntry } from './mead-preset.model';
import { ResistanceModifierEntry, DamageTypeName } from '../../core/models';
import { DAMAGE_TYPE_ICONS, DAMAGE_TYPE_CSS_CLASSES } from '../../core/constants';

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

const MAX_MEAD_SLOTS = 3;
const DEFAULT_MEAD_SLOT_COUNT = 3;

interface SavedSlotEntry {
  pieceName: string | null;
  slotType: string;
  quality: number;
}

interface SavedMeadSlotEntry {
  meadName: string | null;
}

interface SavedArmorBuilderState {
  armorSlots: Record<string, SavedSlotEntry>;
  meadSlots?: SavedMeadSlotEntry[];
}

const EMPTY_EQUIPPED_SLOTS: Record<string, EquippedSlot> = {
  helmet: { piece: null, quality: 1 },
  chest: { piece: null, quality: 1 },
  legs: { piece: null, quality: 1 },
  cape: { piece: null, quality: 1 },
};

function createEmptyMeadSlots(count: number): EquippedMeadSlot[] {
  return Array.from({ length: count }, () => ({ mead: null }));
}

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
  readonly meadPresetService = inject(MeadPresetService);

  readonly pickerListElement = viewChild<ElementRef>('pickerList');
  readonly pickerSearchElement = viewChild<ElementRef>('pickerSearchInput');

  readonly SLOT_CONFIGS = SLOT_CONFIGS;
  readonly DAMAGE_TYPE_ICONS = DAMAGE_TYPE_ICONS;
  readonly DAMAGE_TYPE_CSS_CLASSES = DAMAGE_TYPE_CSS_CLASSES;
  readonly MAX_MEAD_SLOTS = MAX_MEAD_SLOTS;

  readonly equippedSlots = signal<Record<string, EquippedSlot>>({ ...EMPTY_EQUIPPED_SLOTS });
  readonly equippedMeadSlots = signal<EquippedMeadSlot[]>(createEmptyMeadSlots(DEFAULT_MEAD_SLOT_COUNT));

  /** Which slot's picker is open, or null if closed. */
  readonly openPickerSlot = signal<string | null>(null);
  readonly pickerSearchQuery = signal('');

  /** Which mead slot index is being picked, or null if closed. */
  readonly openMeadPickerIndex = signal<number | null>(null);
  readonly meadPickerSearchQuery = signal('');

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

  readonly filteredMeadPickerItems = computed<MeadPreset[]>(() => {
    const index = this.openMeadPickerIndex();
    if (index === null) return [];

    // Collect names of meads already equipped in other slots (meads don't stack)
    const equippedMeadNames = new Set<string>();
    const meadSlots = this.equippedMeadSlots();
    for (let slotIndex = 0; slotIndex < meadSlots.length; slotIndex++) {
      if (slotIndex !== index && meadSlots[slotIndex].mead) {
        equippedMeadNames.add(meadSlots[slotIndex].mead!.name);
      }
    }

    let availableMeads = this.meadPresetService.allMeads()
      .filter(mead => !equippedMeadNames.has(mead.name));

    const query = this.meadPickerSearchQuery().toLowerCase().trim();
    if (query) {
      availableMeads = availableMeads.filter(mead => mead.name.toLowerCase().includes(query));
    }

    return availableMeads;
  });

  constructor() {
    // Restore saved armor state once armor data has loaded
    effect(() => {
      const isLoaded = this.armorPieceService.isLoaded();
      if (!isLoaded) return;
      const restored = this.loadFromStorage();
      if (restored) {
        this.equippedSlots.set(restored);
      }
    }, { allowSignalWrites: true });

    // Restore saved mead state once mead data has loaded
    effect(() => {
      const isLoaded = this.meadPresetService.isLoaded();
      if (!isLoaded) return;
      const restoredMeads = this.loadMeadSlotsFromStorage();
      if (restoredMeads) {
        this.equippedMeadSlots.set(restoredMeads);
      }
    }, { allowSignalWrites: true });

    // Persist to localStorage whenever equipped slots or mead slots change
    effect(() => {
      const slots = this.equippedSlots();
      const meadSlots = this.equippedMeadSlots();
      this.saveToStorage(slots, meadSlots);
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

    // Include mead resistances
    for (const meadSlot of this.equippedMeadSlots()) {
      if (meadSlot.mead) {
        for (const resistanceEntry of meadSlot.mead.resistances) {
          allEffects.push({
            type: resistanceEntry.type,
            multiplier: resistanceEntry.multiplier,
          });
        }
      }
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
      this.closeMeadPicker();
    }
  }

  getPickerSlotLabel(): string {
    const slotKey = this.openPickerSlot();
    if (!slotKey) return '';
    const config = SLOT_CONFIGS.find(slotConfig => slotConfig.key === slotKey);
    return config?.label ?? '';
  }

  // ── Mead Picker ─────────────────────────────────────────────────────────

  openMeadPicker(slotIndex: number): void {
    if (this.openMeadPickerIndex() === slotIndex) {
      this.closeMeadPicker();
      return;
    }
    this.meadPickerSearchQuery.set('');
    this.openMeadPickerIndex.set(slotIndex);
  }

  closeMeadPicker(): void {
    this.openMeadPickerIndex.set(null);
    this.meadPickerSearchQuery.set('');
  }

  onMeadPickerSearchInput(event: Event): void {
    this.meadPickerSearchQuery.set((event.target as HTMLInputElement).value);
  }

  selectMead(slotIndex: number, mead: MeadPreset | null): void {
    this.equippedMeadSlots.update(slots => {
      const updated = [...slots];
      updated[slotIndex] = { mead };
      return updated;
    });
    this.closeMeadPicker();
  }

  removeMead(slotIndex: number): void {
    this.equippedMeadSlots.update(slots => {
      const updated = [...slots];
      updated[slotIndex] = { mead: null };
      return updated;
    });
  }

  isSelectedMead(slotIndex: number, mead: MeadPreset): boolean {
    return this.equippedMeadSlots()[slotIndex]?.mead?.name === mead.name;
  }

  readonly hasAnyEquippedMead = computed(() =>
    this.equippedMeadSlots().some(slot => slot.mead !== null)
  );

  onMeadBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('picker-backdrop')) {
      this.closeMeadPicker();
    }
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

  getMeadResistancePercent(resistanceEntry: MeadResistanceEntry): number {
    return Math.round(resistanceEntry.multiplier * 100);
  }

  resetEquipment(): void {
    this.equippedSlots.set({
      helmet: { piece: null, quality: 1 },
      chest: { piece: null, quality: 1 },
      legs: { piece: null, quality: 1 },
      cape: { piece: null, quality: 1 },
    });
    this.equippedMeadSlots.set(createEmptyMeadSlots(DEFAULT_MEAD_SLOT_COUNT));
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

  private saveToStorage(slots: Record<string, EquippedSlot>, meadSlots: EquippedMeadSlot[]): void {
    try {
      const armorSlots: Record<string, SavedSlotEntry> = {};
      for (const slotConfig of SLOT_CONFIGS) {
        const slot = slots[slotConfig.key];
        armorSlots[slotConfig.key] = {
          pieceName: slot.piece?.name ?? null,
          slotType: slotConfig.slotType,
          quality: slot.quality,
        };
      }

      const savedMeadSlots: SavedMeadSlotEntry[] = meadSlots.map(meadSlot => ({
        meadName: meadSlot.mead?.name ?? null,
      }));

      const savedState: SavedArmorBuilderState = {
        armorSlots,
        meadSlots: savedMeadSlots,
      };
      localStorage.setItem(ARMOR_BUILDER_STORAGE_KEY, JSON.stringify(savedState));
    } catch {
      // localStorage not available — ignore
    }
  }

  private loadFromStorage(): Record<string, EquippedSlot> | null {
    try {
      const saved = localStorage.getItem(ARMOR_BUILDER_STORAGE_KEY);
      if (!saved) return null;
      const parsed = JSON.parse(saved) as SavedArmorBuilderState | Record<string, SavedSlotEntry>;

      // Support both new format (with armorSlots key) and legacy format (flat record)
      const armorEntries = ('armorSlots' in parsed && parsed.armorSlots)
        ? parsed.armorSlots as Record<string, SavedSlotEntry>
        : parsed as Record<string, SavedSlotEntry>;

      const restoredSlots: Record<string, EquippedSlot> = {};
      let hasAnyPiece = false;

      for (const slotConfig of SLOT_CONFIGS) {
        const entry = armorEntries[slotConfig.key] as SavedSlotEntry | undefined;
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

  private loadMeadSlotsFromStorage(): EquippedMeadSlot[] | null {
    try {
      const saved = localStorage.getItem(ARMOR_BUILDER_STORAGE_KEY);
      if (!saved) return null;
      const parsed = JSON.parse(saved) as SavedArmorBuilderState;

      if (!parsed.meadSlots || !Array.isArray(parsed.meadSlots)) return null;

      const restoredMeadSlots: EquippedMeadSlot[] = [];
      let hasAnyMead = false;

      for (const savedMeadSlot of parsed.meadSlots) {
        if (savedMeadSlot.meadName) {
          const mead = this.meadPresetService.findMeadByName(savedMeadSlot.meadName);
          if (mead) {
            restoredMeadSlots.push({ mead });
            hasAnyMead = true;
            continue;
          }
        }
        restoredMeadSlots.push({ mead: null });
      }

      // Always pad or trim to exactly MAX_MEAD_SLOTS
      while (restoredMeadSlots.length < MAX_MEAD_SLOTS) {
        restoredMeadSlots.push({ mead: null });
      }
      restoredMeadSlots.length = MAX_MEAD_SLOTS;

      return hasAnyMead ? restoredMeadSlots : null;
    } catch {
      return null;
    }
  }
}










