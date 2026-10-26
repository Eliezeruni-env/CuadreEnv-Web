import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export function rejectWhitespaceValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (!control.value) return null;
    const isWhitespace = control.value.toString().trim().length === 0;
    return isWhitespace ? { whitespaceOnly: true } : null;
  };
}
