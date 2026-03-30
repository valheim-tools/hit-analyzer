import { Injectable, computed } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { Shield } from './models';
import { calculateShieldBlockArmor } from './damage-calculator';

@Injectable({ providedIn: 'root' })
export class ShieldPresetService {
  private readonly shieldResource = httpResource<Shield[]>(() => 'assets/data/shields.json');

  readonly shields = computed<Shield[]>(() => this.shieldResource.value() ?? ([] as Shield[]));

  findByPrefab(prefab: string): Shield | undefined {
    return this.shields().find((shield) => shield.prefab === prefab);
  }

  getBlockArmor(prefab: string, quality: number): number {
    const shield = this.findByPrefab(prefab);
    if (!shield) return 0;
    return calculateShieldBlockArmor(shield.block_armor, shield.block_per_level, quality);
  }
}

