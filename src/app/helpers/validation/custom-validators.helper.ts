import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export class CustomValidationHelper {
  static rejectWhitespaceOnly(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const isWhitespace = (control.value || '').toString().trim().length === 0;
      const isValid = !isWhitespace;
      return isValid ? null : { whitespaceOnly: true };
    };
  }

  static positiveNumber(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const val = parseFloat(control.value);
      return !isNaN(val) && val > 0 ? null : { positiveNumber: true };
    };
  }

  static rncOrCedulaValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const raw = (control.value || '').toString().replace(/[^0-9]/g, '');
      if (!raw) return null;
      if (raw.length === 9 || raw.length === 11) return null;
      return { invalidRncCedula: true };
    };
  }
}
