import { Pipe, PipeTransform } from '@angular/core';
import { DISPLAY_PRECISION } from '../../core/constants';

/** Format a numeric value to fixed decimal places for display. */
export function formatNumber(value: number | null | undefined, precision: number = DISPLAY_PRECISION): string {
  if (value == null || !Number.isFinite(value)) return (0).toFixed(precision);
  return Number(value).toFixed(precision);
}

@Pipe({ name: 'formatNumber' })
export class FormatNumberPipe implements PipeTransform {
  transform(value: number | null | undefined, precision: number = DISPLAY_PRECISION): string {
    return formatNumber(value, precision);
  }
}

