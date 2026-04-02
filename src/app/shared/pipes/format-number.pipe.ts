import { Pipe, PipeTransform } from '@angular/core';
import { DISPLAY_PRECISION } from '../../core/constants';

/** Format a numeric value to fixed decimal places for display. */
export function formatNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return (0).toFixed(DISPLAY_PRECISION);
  return Number(value).toFixed(DISPLAY_PRECISION);
}

@Pipe({ name: 'formatNumber' })
export class FormatNumberPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    return formatNumber(value);
  }
}

