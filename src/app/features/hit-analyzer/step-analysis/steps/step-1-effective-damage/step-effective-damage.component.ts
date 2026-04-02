import { Component, input } from '@angular/core';
import { FormatNumberPipe } from '../../../../../shared/pipes/format-number.pipe';
import { EffectiveDamageStepAnalysis } from '../../step-analysis.models';

@Component({
  selector: 'app-step-effective-damage',
  imports: [FormatNumberPipe],
  templateUrl: './step-effective-damage.component.html',
  styleUrl: '../_step-shared.scss',
})
export class StepEffectiveDamageComponent {
  readonly data = input.required<EffectiveDamageStepAnalysis>();
}

