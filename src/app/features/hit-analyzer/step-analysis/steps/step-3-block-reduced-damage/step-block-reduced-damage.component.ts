import { DecimalPipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { FormatNumberPipe } from '../../../../../shared/pipes/format-number.pipe';
import { BlockReducedDamageStepAnalysis } from '../../step-analysis.models';

@Component({
  selector: 'app-step-block-reduced-damage',
  imports: [DecimalPipe, FormatNumberPipe],
  templateUrl: './step-block-reduced-damage.component.html',
  styleUrl: '../_step-shared.scss',
})
export class StepBlockReducedDamageComponent {
  readonly data = input.required<BlockReducedDamageStepAnalysis>();
  readonly hasRiskFactor = input.required<boolean>();

  readonly staggerBuildupPercentage = computed<number>(() => {
    const blockReducedDamageStepAnalysis = this.data();
    if (blockReducedDamageStepAnalysis.staggerThreshold <= 0) return 0;
    return (blockReducedDamageStepAnalysis.blockStaggerDamage / blockReducedDamageStepAnalysis.staggerThreshold) * 100;
  });
}

