import { Component, input } from '@angular/core';
import { FormatNumberPipe } from '../../../../../shared/pipes/format-number.pipe';
import { ResistanceMultipliedDamageStepAnalysis } from '../../step-analysis.models';

@Component({
  selector: 'app-step-resistance-multiplied-damage',
  imports: [FormatNumberPipe],
  templateUrl: './step-resistance-multiplied-damage.component.html',
  styleUrl: '../_step-shared.scss',
})
export class StepResistanceMultipliedDamageComponent {
  readonly data = input.required<ResistanceMultipliedDamageStepAnalysis>();
  readonly hasRiskFactor = input.required<boolean>();
  readonly isShielded = input.required<boolean>();
}

