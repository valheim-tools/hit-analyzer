import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MobAttackData, MobEntry, FlatMobPreset, MobAttack } from './models';

const DAMAGE_TYPE_NAMES = ['Blunt', 'Slash', 'Pierce', 'Fire', 'Frost', 'Lightning', 'Poison', 'Spirit'] as const;

const BIOME_ORDER = [
  'Meadows', 'Black Forest', 'Ocean', 'Swamp', 'Mountain',
  'Plains', 'Mistlands', 'Ashlands', 'Boss', 'Miniboss', 'Passive',
];

@Injectable({ providedIn: 'root' })
export class MobPresetService {
  private readonly http = inject(HttpClient);

  private readonly allPresetsSignal = signal<FlatMobPreset[]>([]);
  private readonly rawDataSignal = signal<MobAttackData>({});
  private readonly isLoadedSignal = signal(false);

  readonly flatPresets = this.allPresetsSignal.asReadonly();
  readonly rawData = this.rawDataSignal.asReadonly();
  readonly isLoaded = this.isLoadedSignal.asReadonly();

  load(): void {
    this.http.get<MobAttackData>('assets/data/mob-attacks.json').subscribe({
      next: (data) => {
        this.rawDataSignal.set(data);
        this.allPresetsSignal.set(this.flattenPresets(data));
        this.isLoadedSignal.set(true);
      },
      error: (error) => {
        console.warn('Failed to load mob-attacks.json', error);
        this.isLoadedSignal.set(true);
      },
    });
  }

  filterPresets(query: string): FlatMobPreset[] {
    if (!query.trim()) return this.allPresetsSignal();
    const lowerQuery = query.toLowerCase().trim();
    return this.allPresetsSignal().filter(preset =>
      preset._label.toLowerCase().includes(lowerQuery)
    );
  }

  findById(id: string): FlatMobPreset | undefined {
    return this.allPresetsSignal().find(preset => preset._id === id);
  }

  getOrderedBiomes(): string[] {
    const data = this.rawDataSignal();
    return BIOME_ORDER.filter(biome => data[biome]);
  }

  getGroupedData(): { biome: string; mobs: MobEntry[] }[] {
    const data = this.rawDataSignal();
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
            .filter(typeName => (attack as any)[typeName] > 0)
            .map(typeName => `${(attack as any)[typeName]} ${typeName}`);
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

