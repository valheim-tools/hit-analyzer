import { Injectable, computed } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { MobAttackData, MobEntry, FlatMobPreset } from './mob-preset.model';
import { DAMAGE_TYPE_NAMES, BIOME_ORDER } from '../../core/constants';

@Injectable({ providedIn: 'root' })
export class MobPresetService {
  private readonly mobAttackResource = httpResource<MobAttackData>(() => 'data/mob-attacks.json');

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

  private flattenPresets(data: MobAttackData): FlatMobPreset[] {
    const result: FlatMobPreset[] = [];
    for (const biome of BIOME_ORDER) {
      const mobs = data[biome];
      if (!mobs) continue;
      for (const mob of mobs) {
        for (const attack of mob.attacks) {
          const typeEntries = DAMAGE_TYPE_NAMES
            .filter(typeName => (attack[typeName] ?? 0) > 0)
            .map(typeName => `${attack[typeName]} ${typeName}`);
          const typeSummary = typeEntries.join(' + ');
          const label = `${mob.mob_name} — ${attack.attack_name} (${typeSummary})`;
          result.push({
            ...attack,
            _id: attack.attack_type,
            _label: label,
            _mobPrefab: mob.prefab,
            _mobIconFile: mob.icon_file,
          });
        }
      }
    }
    return result;
  }
}
