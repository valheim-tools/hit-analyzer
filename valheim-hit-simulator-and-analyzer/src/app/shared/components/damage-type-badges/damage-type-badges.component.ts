import { Component, input } from '@angular/core';
import { DamageMap, DamageTypeName } from '../../../core/models';
import { FormatNumberPipe } from '../../pipes/format-number.pipe';

const DAMAGE_TYPE_NAMES: readonly DamageTypeName[] = [
  'Blunt', 'Slash', 'Pierce', 'Fire', 'Frost', 'Lightning', 'Poison', 'Spirit',
];

const DAMAGE_TYPE_ICONS: Record<DamageTypeName, string> = {
  Blunt: '🔨', Slash: '⚔️', Pierce: '🏹', Fire: '🔥',
  Frost: '❄️', Lightning: '⚡', Poison: '☣️', Spirit: '👻',
};

const DAMAGE_TYPE_CLASSES: Record<DamageTypeName, string> = {
  Blunt: 'dt-blunt', Slash: 'dt-slash', Pierce: 'dt-pierce', Fire: 'dt-fire',
  Frost: 'dt-frost', Lightning: 'dt-lightning', Poison: 'dt-poison', Spirit: 'dt-spirit',
};

interface BadgeEntry {
  typeName: DamageTypeName;
  icon: string;
  cssClass: string;
  value: number;
}

@Component({
  selector: 'app-damage-type-badges',
  standalone: true,
  imports: [FormatNumberPipe],
  template: `
    <span class="damage-type-badges">
      @for (badge of activeBadges(); track badge.typeName) {
        <span class="damage-type-badge {{ badge.cssClass }}">
          {{ badge.icon }} {{ badge.value | formatNumber }}
        </span>
      }
    </span>
  `,
})
export class DamageTypeBadgesComponent {
  readonly damageMap = input.required<DamageMap>();

  activeBadges(): BadgeEntry[] {
    const map = this.damageMap();
    return DAMAGE_TYPE_NAMES
      .filter(typeName => (map[typeName] || 0) > 0.01)
      .map(typeName => ({
        typeName,
        icon: DAMAGE_TYPE_ICONS[typeName],
        cssClass: DAMAGE_TYPE_CLASSES[typeName],
        value: map[typeName],
      }));
  }
}


