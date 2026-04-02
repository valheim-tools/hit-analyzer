import { DecimalPipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { FormatNumberPipe } from '../../../../../shared/pipes/format-number.pipe';
import { ArmorReducedDamageStepAnalysis } from '../../step-analysis.models';

@Component({
  selector: 'app-step-armor-reduced-damage',
  imports: [DecimalPipe, FormatNumberPipe],
  templateUrl: './step-armor-reduced-damage.component.html',
  styleUrl: '../_step-shared.scss',
})
export class StepArmorReducedDamageComponent {
  readonly data = input.required<ArmorReducedDamageStepAnalysis>();

  readonly staggerBuildupPercentage = computed<number>(() => {
    const armorReducedDamageStepAnalysis = this.data();
    if (armorReducedDamageStepAnalysis.staggerThreshold <= 0) return 0;
    return (armorReducedDamageStepAnalysis.staggerBuildupValue / armorReducedDamageStepAnalysis.staggerThreshold) * 100;
  });
}

