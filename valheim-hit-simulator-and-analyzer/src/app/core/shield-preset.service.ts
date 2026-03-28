import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Shield } from './models';
import { calculateShieldBlockArmor } from './damage-calculator';

@Injectable({ providedIn: 'root' })
export class ShieldPresetService {
  private readonly http = inject(HttpClient);

  private readonly shieldsSignal = signal<Shield[]>([]);
  private readonly isLoadedSignal = signal(false);

  readonly shields = this.shieldsSignal.asReadonly();
  readonly isLoaded = this.isLoadedSignal.asReadonly();

  load(): void {
    this.http.get<Shield[]>('assets/data/shields.json').subscribe({
      next: (shields) => {
        this.shieldsSignal.set(shields);
        this.isLoadedSignal.set(true);
      },
      error: (error) => {
        console.warn('Failed to load shields.json', error);
        this.isLoadedSignal.set(true);
      },
    });
  }

  findByPrefab(prefab: string): Shield | undefined {
    return this.shieldsSignal().find(shield => shield.prefab === prefab);
  }

  getBlockArmor(prefab: string, quality: number): number {
    const shield = this.findByPrefab(prefab);
    if (!shield) return 0;
    return calculateShieldBlockArmor(shield.block_armor, shield.block_per_level, quality);
  }

  getParryBonus(prefab: string): number {
    return this.findByPrefab(prefab)?.parry_bonus ?? 1.0;
  }
}

