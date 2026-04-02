import { Injectable, computed } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { MeadPreset } from './mead-preset.model';

@Injectable({ providedIn: 'root' })
export class MeadPresetService {
  private readonly meadResource = httpResource<MeadPreset[]>(() => 'data/meads.json');

  readonly isLoaded = computed<boolean>(() => this.meadResource.value() != null);

  readonly allMeads = computed<MeadPreset[]>(() => this.meadResource.value() ?? []);

  findMeadByName(name: string): MeadPreset | undefined {
    return this.allMeads().find(mead => mead.name === name);
  }
}
