import { Component, input } from '@angular/core';
import { FormatNumberPipe } from '../../../../../shared/pipes/format-number.pipe';
import { RemainingHealthStepAnalysis } from '../../step-analysis.models';

@Component({
  selector: 'app-step-remaining-health',
  imports: [FormatNumberPipe],
  templateUrl: './step-remaining-health.component.html',
  styleUrl: '../_step-shared.scss',
})
export class StepRemainingHealthComponent {
  readonly data = input.required<RemainingHealthStepAnalysis>();
}

