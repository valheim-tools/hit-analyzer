import {
  Component, input, forwardRef,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface ToggleOption {
  value: string | number;
  label: string;
}

@Component({
  selector: 'app-toggle-group',
  standalone: true,
  imports: [],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ToggleGroupComponent),
      multi: true,
    },
  ],
  template: `
    <div class="toggle-group" [class.disabled]="isDisabled">
      @for (option of options(); track option.value) {
        <label class="toggle-btn">
          <input
            type="radio"
            [name]="groupName()"
            [value]="option.value"
            [checked]="option.value == currentValue"
            [disabled]="isDisabled"
            (change)="onRadioChange(option.value)"
          >
          <span>{{ option.label }}</span>
        </label>
      }
    </div>
  `,
})
export class ToggleGroupComponent implements ControlValueAccessor {
  readonly options = input.required<ToggleOption[]>();
  readonly groupName = input<string>('toggle-group');

  currentValue: string | number | null = null;
  isDisabled = false;

  private onChange: (value: string | number) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: string | number): void {
    this.currentValue = value;
  }

  registerOnChange(fn: (value: string | number) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled = isDisabled;
  }

  onRadioChange(value: string | number): void {
    this.currentValue = value;
    this.onChange(value);
    this.onTouched();
  }
}

