import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { CompanyService } from '../../services/company.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { TranslationService } from '../../../cuadreEnv/services/translation.service';
import { AuthService } from '../../../cuadreEnv/services/auth.service';
import { PhoneMaskDirective, RncMaskDirective } from '../../../../app/shared/directives';
import type { CompanySettingsDto, CompanyBankAccountDto } from '../../../cuadreEnv/types/api';

@Component({
  selector: 'app-company-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, PhoneMaskDirective, RncMaskDirective],
  templateUrl: './company-settings.component.html',
  styleUrls: ['./company-settings.component.scss'],
})
export class CompanySettingsComponent implements OnInit {
  private fb = inject(FormBuilder);
  private companyService = inject(CompanyService);
  private notificationService = inject(NotificationService);
  public authService = inject(AuthService);
  readonly translationService = inject(TranslationService);

  form!: FormGroup;
  isLoading = signal<boolean>(false);
  isSaving = signal<boolean>(false);
  isReadOnly = signal<boolean>(false);
  logoPreview = signal<string | null>(null);

  // Bank accounts state
  bankAccounts = signal<CompanyBankAccountDto[]>([]);
  isAddingAccount = signal<boolean>(false);
  newBankName = signal<string>('');
  newBankAccount = signal<string>('');
  newBankType = signal<string>('Cta. Corriente');
  newBankHolder = signal<string>('');
  newBankRnc = signal<string>('');

  ngOnInit() {
    this.initForm();
    const canEdit =
      this.authService.isSuperUser() ||
      this.authService.hasRole(['Admin', 'SuperUser', 'Auditor', 'Audit']);
    this.isReadOnly.set(!canEdit);
    if (!canEdit) {
      this.form.disable();
    }
    this.loadSettings();
  }

  private initForm() {
    this.form = this.fb.group({
      companyName: ['', [Validators.required, Validators.minLength(3)]],
      commercialName: [''],
      rnc: ['', [Validators.required, Validators.minLength(9)]],
      phone: ['', [Validators.required, Validators.minLength(10)]],
      address: ['', [Validators.required, Validators.minLength(5)]],
      logoUrl: [''],
      invoiceFooterPhrase: [
        '¡Gracias por su preferencia! Garantía válida por 30 días presentando este comprobante.',
        [Validators.required],
      ],
      defaultTaxPercentage: [18, [Validators.required, Validators.min(0), Validators.max(100)]],
      currency: ['DOP', Validators.required],
      ticketInstagram: [''],
      ticketWhatsapp: [''],
      ticketShowQr: [true],
      ticketPaperSize: ['80mm'],
      allowNegativeStock: [false],
    });
  }

  async loadSettings() {
    this.isLoading.set(true);
    try {
      const settings = await this.companyService.getCompanySettings();
      if (settings) {
        this.form.patchValue({
          companyName: settings.companyName || 'CuadreEnv Dominicana SRL',
          commercialName: settings.commercialName || '',
          rnc: settings.rnc || '1-01-00000-0',
          phone: settings.phone || '(809) 555-0199',
          address: settings.address || 'Av. Winston Churchill #1099, Santo Domingo, D.N.',
          logoUrl: settings.logoUrl || '',
          invoiceFooterPhrase:
            settings.invoiceFooterPhrase ||
            '¡Gracias por su preferencia! Garantía válida por 30 días presentando este comprobante.',
          defaultTaxPercentage: settings.defaultTaxPercentage ?? 18,
          currency: settings.currency || 'DOP',
          ticketInstagram: settings.ticketInstagram || '',
          ticketWhatsapp: settings.ticketWhatsapp || '',
          ticketShowQr: settings.ticketShowQr !== false,
          ticketPaperSize: settings.ticketPaperSize || '80mm',
          allowNegativeStock: settings.allowNegativeStock === true,
        });
        if (settings.logoUrl) {
          this.logoPreview.set(settings.logoUrl);
        }

        const accounts =
          settings.bankAccounts && settings.bankAccounts.length > 0
            ? settings.bankAccounts
            : this.companyService.getBankAccounts();
        this.bankAccounts.set(accounts);
      } else {
        this.bankAccounts.set(this.companyService.getBankAccounts());
      }
    } catch {
      this.bankAccounts.set(this.companyService.getBankAccounts());
    } finally {
      this.isLoading.set(false);
    }
  }

  onLogoFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      if (file.size > 2 * 1024 * 1024) {
        this.notificationService.error('El logo no debe exceder 2 MB.');
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        this.logoPreview.set(base64);
        this.form.patchValue({ logoUrl: base64 });
      };
      reader.readAsDataURL(file);
    }
  }

  removeLogo() {
    this.logoPreview.set(null);
    this.form.patchValue({ logoUrl: '' });
  }

  // Bank accounts management
  startAddAccount() {
    this.newBankName.set('');
    this.newBankAccount.set('');
    this.newBankType.set('Cta. Corriente');
    this.newBankHolder.set(this.form.get('commercialName')?.value || this.form.get('companyName')?.value || '');
    this.newBankRnc.set(this.form.get('rnc')?.value || '');
    this.isAddingAccount.set(true);
  }

  cancelAddAccount() {
    this.isAddingAccount.set(false);
  }

  saveAccount() {
    const name = this.newBankName().trim();
    const acc = this.newBankAccount().trim();
    if (!name || !acc) {
      this.notificationService.warning('Ingresa el nombre del banco y el número de cuenta.');
      return;
    }

    const newAcc: CompanyBankAccountDto = {
      id: `BANK_${Date.now()}`,
      bankName: name,
      accountNumber: acc,
      accountType: this.newBankType(),
      holderName: this.newBankHolder().trim(),
      holderRnc: this.newBankRnc().trim(),
      currency: 'DOP',
      isDefault: this.bankAccounts().length === 0,
    };

    const updated = [...this.bankAccounts(), newAcc];
    this.bankAccounts.set(updated);
    this.isAddingAccount.set(false);
    this.notificationService.success(`Cuenta de ${name} agregada.`);
  }

  removeAccount(id: string) {
    const filtered = this.bankAccounts().filter((a) => a.id !== id);
    if (filtered.length > 0 && !filtered.some((a) => a.isDefault)) {
      filtered[0].isDefault = true;
    }
    this.bankAccounts.set(filtered);
    this.notificationService.info('Cuenta bancaria removida.');
  }

  setDefaultAccount(id: string) {
    const updated = this.bankAccounts().map((a) => ({
      ...a,
      isDefault: a.id === id,
    }));
    this.bankAccounts.set(updated);
  }

  async onSubmit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notificationService.error('Por favor complete los campos obligatorios requeridos.');
      return;
    }

    this.isSaving.set(true);
    try {
      const payload: CompanySettingsDto = {
        ...this.form.value,
        bankAccounts: this.bankAccounts(),
      };
      await this.companyService.updateCompanySettings(payload);
      this.notificationService.success('Configuración y cuentas de banco guardadas y sincronizadas correctamente.');
    } catch (e: any) {
      this.notificationService.error('Error al guardar la configuración de la empresa.');
    } finally {
      this.isSaving.set(false);
    }
  }
}
