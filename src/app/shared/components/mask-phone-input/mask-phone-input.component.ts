import { Component, Input, Output, EventEmitter, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { IconDirective } from '@coreui/icons-angular';

@Component({
  selector: 'app-mask-phone-input',
  standalone: true,
  imports: [CommonModule, IconDirective],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => MaskPhoneInputComponent),
      multi: true,
    },
  ],
  templateUrl: './mask-phone-input.component.html',
  styleUrls: ['./mask-phone-input.component.scss'],
})
export class MaskPhoneInputComponent implements ControlValueAccessor {
  @Input() label = '';
  @Input() placeholder = '(809) 000-0000';
  @Input() disabled = false;
  @Output() valueChange = new EventEmitter<string>();

  rawValue = '';
  formattedValue = '';

  private onChange: (val: string) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(val: any): void {
    this.rawValue = (val || '').toString();
    this.formattedValue = this.applyMask(this.rawValue);
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onInput(event: Event) {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').substring(0, 10);
    this.rawValue = digits;
    this.formattedValue = this.applyMask(digits);
    input.value = this.formattedValue;

    this.onChange(digits);
    this.valueChange.emit(digits);
  }

  private applyMask(digits: string): string {
    if (!digits) return '';
    if (digits.length <= 3) return `(${digits}`;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  }
}
