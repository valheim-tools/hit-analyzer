import { Pipe, PipeTransform } from '@angular/core';
import { DISPLAY_PRECISION } from '../../core/constants';

@Pipe({ name: 'formatNumber' })
export class FormatNumberPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return (0).toFixed(DISPLAY_PRECISION);
    return Number(value).toFixed(DISPLAY_PRECISION);
  }
}

