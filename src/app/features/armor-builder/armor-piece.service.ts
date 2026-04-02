import { Injectable, computed } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { ArmorPiece, ArmorPiecesData, ArmorSetInfo, ArmorSetPreset, ParsedResistanceEffect } from './armor-piece.model';
import { DAMAGE_TYPE_NAMES, DamageTypeName } from '../../core/constants';

/**
 * Resistance pattern in piece_effects / set_bonus strings:
 *   "Resistant(0.5x) VS Poison"
 *   "Weak(1.5x) VS Fire"
 *   "Very Weak (2x) vs. Fire"
 *   "Slightly weak (+25%) vs Blunt, Slash and Pierce"
 */
const RESISTANCE_MULTIPLIER_REGEX =
  /(?:Very Weak|Weak|Resistant|Slightly (?:weak|Resistant))\s*\(([^)]+)\)\s*(?:VS\.?|vs\.?)\s+([\w\s,]+)/gi;

/**
 * Parse a multiplier string like "0.5x", "2x", "+25%" into a decimal multiplier.
 */
function parseMultiplierToken(token: string): number {
  const trimmed = token.trim();
  if (trimmed.endsWith('x')) {
    return parseFloat(trimmed.slice(0, -1));
  }
  if (trimmed.endsWith('%')) {
    // "+25%" means "slightly weak" → 1.25x multiplier
    const percentValue = parseFloat(trimmed.replace('+', ''));
    return 1 + percentValue / 100;
  }
  return parseFloat(trimmed) || 1;
}

/**
 * Parse a damage type list string like "Poison", "Blunt, Slash and Pierce"
 * into an array of valid DamageTypeName values.
 */
function parseDamageTypeList(typeString: string): DamageTypeName[] {
  const damageTypeSet = new Set<string>(DAMAGE_TYPE_NAMES);
  return typeString
    .split(/[,]|\band\b/i)
    .map(segment => segment.trim())
    .filter((segment): segment is DamageTypeName => damageTypeSet.has(segment));
}

/**
 * Parse resistance effects from a piece_effects or set_bonus string.
 * Returns an array of { type, multiplier } for each damage type affected.
 */
export function parseResistanceEffects(effectsString: string | null): ParsedResistanceEffect[] {
  if (!effectsString) return [];

  const results: ParsedResistanceEffect[] = [];
  let match: RegExpExecArray | null;

  // Reset regex state
  RESISTANCE_MULTIPLIER_REGEX.lastIndex = 0;

  while ((match = RESISTANCE_MULTIPLIER_REGEX.exec(effectsString)) !== null) {
    const multiplier = parseMultiplierToken(match[1]);
    const damageTypes = parseDamageTypeList(match[2]);

    for (const damageType of damageTypes) {
      results.push({ type: damageType, multiplier });
    }
  }

  return results;
}


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
        setBonus: setInfo.set_bonus,
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



