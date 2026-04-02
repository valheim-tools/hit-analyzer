import { Injectable, computed } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { ArmorPiece, ArmorPiecesData, ArmorSetInfo, ArmorSetPreset } from './armor-piece.model';


@Injectable({ providedIn: 'root' })
export class ArmorPieceService {
  private readonly armorResource = httpResource<ArmorPiecesData>(() => 'data/armor-pieces.json');

  readonly helmets = computed<ArmorPiece[]>(() => this.armorResource.value()?.helmets ?? []);
  readonly chestArmor = computed<ArmorPiece[]>(() => this.armorResource.value()?.chest_armor ?? []);
  readonly legArmor = computed<ArmorPiece[]>(() => this.armorResource.value()?.leg_armor ?? []);
  readonly capes = computed<ArmorPiece[]>(() => this.armorResource.value()?.capes ?? []);
  readonly sets = computed<Record<string, ArmorSetInfo>>(() => this.armorResource.value()?.sets ?? {});

  readonly isLoaded = computed<boolean>(() => this.armorResource.value() != null);

  /** Ordered list of armor set presets for the set picker. */
  readonly armorSetPresets = computed<ArmorSetPreset[]>(() => {
    const setsMap = this.sets();
    const allCapes = this.capes();

    return Object.entries(setsMap).map(([setName, setInfo]) => {
      // Find the chest piece to use its icon as the set preview
      const chestPieceName = setInfo.pieces['chest'];
      const chestPiece = chestPieceName
        ? this.chestArmor().find(piece => piece.name === chestPieceName)
        : undefined;

      // Find associated cape
      const associatedCape = allCapes.find(cape => cape.associated_set === setName);

      return {
        setName,
        biome: setInfo.biome,
        type: setInfo.type,
        iconFile: chestPiece?.image_file ?? null,
        totalArmorByQuality: setInfo.total_armor_by_quality,
        hasHelmet: !!setInfo.pieces['helmet'],
        hasCape: !!associatedCape,
      };
    });
  });

  /**
   * Resolve all pieces for a named set, including the associated cape.
   * Returns a map of slotKey → ArmorPiece for each slot the set covers.
   */
  resolveSetPieces(setName: string): Record<string, ArmorPiece | null> {
    const setsMap = this.sets();
    const setInfo = setsMap[setName];

    const resolved: Record<string, ArmorPiece | null> = {
      helmet: null,
      chest: null,
      legs: null,
      cape: null,
    };

    if (!setInfo) return resolved;

    if (setInfo.pieces['helmet']) {
      resolved['helmet'] = this.helmets().find(
        piece => piece.name === setInfo.pieces['helmet']
      ) ?? null;
    }
    if (setInfo.pieces['chest']) {
      resolved['chest'] = this.chestArmor().find(
        piece => piece.name === setInfo.pieces['chest']
      ) ?? null;
    }
    if (setInfo.pieces['legs']) {
      resolved['legs'] = this.legArmor().find(
        piece => piece.name === setInfo.pieces['legs']
      ) ?? null;
    }

    // Find associated cape
    const associatedCape = this.capes().find(cape => cape.associated_set === setName);
    if (associatedCape) {
      resolved['cape'] = associatedCape;
    }

    return resolved;
  }

  findPieceByName(slot: string, name: string): ArmorPiece | undefined {
    const slotList = this.getPiecesForSlot(slot);
    return slotList().find(piece => piece.name === name);
  }

  getPiecesForSlot(slot: string) {
    switch (slot) {
      case 'Helmet': return this.helmets;
      case 'Chest': return this.chestArmor;
      case 'Legs': return this.legArmor;
      case 'Cape': return this.capes;
      default: return this.helmets;
    }
  }

  getArmorAtQuality(piece: ArmorPiece, quality: number): number {
    const index = Math.max(0, Math.min(quality - 1, piece.armor_by_quality.length - 1));
    return piece.armor_by_quality[index] ?? 0;
  }
}



