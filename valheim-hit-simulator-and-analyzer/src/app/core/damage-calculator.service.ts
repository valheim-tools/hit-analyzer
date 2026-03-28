import { Injectable } from '@angular/core';
import { calculate, sampleRng, getPercentileRng } from './damage-calculator';
import { CalculationInputs, CalculationOptions, CalculationResult } from './models';

@Injectable({ providedIn: 'root' })
export class DamageCalculatorService {
  calculate(inputs: CalculationInputs, options: CalculationOptions = {}): CalculationResult {
    return calculate(inputs, options);
  }

  sampleRng(): number {
    return sampleRng();
  }

  getPercentileRng(percentile: number): number {
    return getPercentileRng(percentile);
  }
}

