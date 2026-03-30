import { Injectable, computed } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { MobAttackData, MobEntry, FlatMobPreset } from './models';
import { DAMAGE_TYPE_NAMES } from './constants';

const BIOME_ORDER = [
  'Meadows', 'Black Forest', 'Ocean', 'Swamp', 'Mountain',
  'Plains', 'Mistlands', 'Ashlands', 'Boss', 'Miniboss', 'Passive',
];

@Injectable({ providedIn: 'root' })
export class MobPresetService {
  private readonly mobAttackResource = httpResource<MobAttackData>(() => 'assets/data/mob-attacks.json');

  readonly rawData = computed<MobAttackData>(() => this.mobAttackResource.value() ?? ({} as MobAttackData));
  readonly flatPresets = computed<FlatMobPreset[]>(() => this.flattenPresets(this.rawData()));

  findById(id: string): FlatMobPreset | undefined {
    return this.flatPresets().find(preset => preset._id === id);
  }


  getGroupedData(): { biome: string; mobs: MobEntry[] }[] {
    const data = this.rawData();
    return BIOME_ORDER
      .filter(biome => data[biome])
      .map(biome => ({ biome, mobs: data[biome] }));
  }

  private normalizeAssetPath(path: string): string {
    return path.startsWith('src/') ? path.slice(4) : path;
  }

  private flattenPresets(data: MobAttackData): FlatMobPreset[] {
    const result: FlatMobPreset[] = [];
    for (const biome of BIOME_ORDER) {
      const mobs = data[biome];
      if (!mobs) continue;
      for (const mob of mobs) {
        const normalizedIconFile = this.normalizeAssetPath(mob.icon_file);
        for (const attack of mob.attacks) {
          const typeEntries = DAMAGE_TYPE_NAMES
            .filter(typeName => (attack as any)[typeName] > 0)
            .map(typeName => `${(attack as any)[typeName]} ${typeName}`);
          const typeSummary = typeEntries.join(' + ');
          const label = `${mob.mob_name} — ${attack.attack_name} (${typeSummary})`;
          result.push({
            ...attack,
            _id: attack.attack_type,
            _label: label,
            _mobPrefab: mob.prefab,
            _mobIconFile: normalizedIconFile,
          });
        }
      }
    }
    return result;
  }
}

