import { Directive, HostListener, ElementRef, inject } from '@angular/core';
import { NgControl } from '@angular/forms';

/**
 * Phone Mask Directive: (000) 000-0000 (Solo números, 10 dígitos)
 */
@Directive({
  selector: '[appPhoneMask]',
  standalone: true,
})
export class PhoneMaskDirective {
  private readonly el = inject(ElementRef) as ElementRef<HTMLInputElement>;
  private readonly ngControl = inject(NgControl, { optional: true });

  @HostListener('input', ['$event'])
  onInputChange(_event: Event) {
    let input = this.el.nativeElement.value.replace(/\D/g, '');
    if (input.length > 10) {
      input = input.substring(0, 10);
    }

    let formatted = '';
    if (input.length === 0) {
      formatted = '';
    } else if (input.length <= 3) {
      formatted = `(${input}`;
    } else if (input.length <= 6) {
      formatted = `(${input.slice(0, 3)}) ${input.slice(3)}`;
    } else {
      formatted = `(${input.slice(0, 3)}) ${input.slice(3, 6)}-${input.slice(6)}`;
    }

    this.el.nativeElement.value = formatted;
    if (this.ngControl?.control) {
      this.ngControl.control.setValue(formatted, { emitEvent: false });
    }
  }
}

/**
 * Cédula Mask Directive: 000-0000000-0 (11 dígitos, solo números)
 */
@Directive({
  selector: '[appCedulaMask]',
  standalone: true,
})
export class CedulaMaskDirective {
  private readonly el = inject(ElementRef) as ElementRef<HTMLInputElement>;
  private readonly ngControl = inject(NgControl, { optional: true });

  @HostListener('input', ['$event'])
  onInputChange(_event: Event) {
    let input = this.el.nativeElement.value.replace(/\D/g, '');
    if (input.length > 11) {
      input = input.substring(0, 11);
    }

    let formatted = '';
    if (input.length === 0) {
      formatted = '';
    } else if (input.length <= 3) {
      formatted = input;
    } else if (input.length <= 10) {
      formatted = `${input.slice(0, 3)}-${input.slice(3)}`;
    } else {
      formatted = `${input.slice(0, 3)}-${input.slice(3, 10)}-${input.slice(10)}`;
    }

    this.el.nativeElement.value = formatted;
    if (this.ngControl?.control) {
      this.ngControl.control.setValue(formatted, { emitEvent: false });
    }
  }
}

/**
 * RNC Mask Directive:
 * - Empresas (9 dígitos): 9-99-99999-9 (Ej. 1-01-01234-5)
 * - Personas Físicas (11 dígitos): 000-0000000-0 (Ej. 001-0123456-7)
 */
@Directive({
  selector: '[appRncMask]',
  standalone: true,
})
export class RncMaskDirective {
  private readonly el = inject(ElementRef) as ElementRef<HTMLInputElement>;
  private readonly ngControl = inject(NgControl, { optional: true });

  @HostListener('input', ['$event'])
  onInputChange(_event: Event) {
    let input = this.el.nativeElement.value.replace(/\D/g, '');
    if (input.length > 11) {
      input = input.substring(0, 11);
    }

    let formatted = '';
    if (input.length <= 9) {
      // Formato RNC Empresa (9 dígitos): 1-01-01234-5
      if (input.length <= 1) {
        formatted = input;
      } else if (input.length <= 3) {
        formatted = `${input.slice(0, 1)}-${input.slice(1)}`;
      } else if (input.length <= 8) {
        formatted = `${input.slice(0, 1)}-${input.slice(1, 3)}-${input.slice(3)}`;
      } else {
        formatted = `${input.slice(0, 1)}-${input.slice(1, 3)}-${input.slice(3, 8)}-${input.slice(8)}`;
      }
    } else {
      // Formato Persona Física / Cédula (11 dígitos): 001-0123456-7
      if (input.length <= 3) {
        formatted = input;
      } else if (input.length <= 10) {
        formatted = `${input.slice(0, 3)}-${input.slice(3)}`;
      } else {
        formatted = `${input.slice(0, 3)}-${input.slice(3, 10)}-${input.slice(10)}`;
      }
    }

    this.el.nativeElement.value = formatted;
    if (this.ngControl?.control) {
      this.ngControl.control.setValue(formatted, { emitEvent: false });
    }
  }
}

/**
 * Numbers Only Directive: bloquea cualquier carácter no numérico
 */
@Directive({
  selector: '[appNumbersOnly]',
  standalone: true,
})
export class NumbersOnlyDirective {
  private readonly el = inject(ElementRef) as ElementRef<HTMLInputElement>;
  private readonly ngControl = inject(NgControl, { optional: true });

  @HostListener('input', ['$event'])
  onInputChange(_event: Event) {
    const raw = this.el.nativeElement.value.replace(/\D/g, '');
    this.el.nativeElement.value = raw;
    if (this.ngControl?.control) {
      this.ngControl.control.setValue(raw, { emitEvent: false });
    }
  }
}

export * from './has-permission.directive';
