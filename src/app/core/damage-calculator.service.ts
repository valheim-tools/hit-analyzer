import { Injectable } from '@angular/core';
import { calculate, calculateRangeDamage, sampleRng, getPercentileRng } from './damage-calculator';
import { CalculationInputs, CalculationOptions, CalculationResult, RangeDamageResult } from './models';

@Injectable({ providedIn: 'root' })
export class DamageCalculatorService {

  calculate(inputs: CalculationInputs, options: CalculationOptions = {}): CalculationResult {
    return calculate(inputs, options);
  }

  calculateRangeDamage(inputs: CalculationInputs): RangeDamageResult {
    return calculateRangeDamage(inputs);
  }

  sampleRng(): number {
    return sampleRng();
  }

  getPercentileRng(percentile: number): number {
    return getPercentileRng(percentile);
  }
}

