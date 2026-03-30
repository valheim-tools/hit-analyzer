import { Component, input, computed } from '@angular/core';
import { DamageMap, DamageTypeName } from '../../../core/models';
import { DAMAGE_TYPE_NAMES, DAMAGE_TYPE_ICONS, DAMAGE_TYPE_CSS_CLASSES, DAMAGE_DISPLAY_THRESHOLD } from '../../../core/constants';
import { FormatNumberPipe } from '../../pipes/format-number.pipe';


interface BadgeEntry {
  typeName: DamageTypeName;
  icon: string;
  cssClass: string;
  value: number;
}

@Component({
  selector: 'app-damage-type-badges',
  imports: [FormatNumberPipe],
  templateUrl: './damage-type-badges.component.html',
})
export class DamageTypeBadgesComponent {
  readonly damageMap = input.required<DamageMap>();

  readonly activeBadges = computed<BadgeEntry[]>(() => {
    const map = this.damageMap();
    return DAMAGE_TYPE_NAMES
      .filter(typeName => (map[typeName] || 0) > DAMAGE_DISPLAY_THRESHOLD)
      .map(typeName => ({
        typeName,
        icon: DAMAGE_TYPE_ICONS[typeName],
        cssClass: DAMAGE_TYPE_CSS_CLASSES[typeName],
        value: map[typeName],
      }));
  });
}


