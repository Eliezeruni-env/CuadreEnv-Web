import { Injectable, inject, signal } from '@angular/core';
import { ApiClientService } from '../../cuadreEnv/services/apiClient';
import type {
  Company,
  CompanySettingsDto,
  CompanyBankAccountDto,
  CreateCompanyRequest,
  TokenResponseDto,
  ApiResponse,
} from '../../cuadreEnv/types/api';

export interface CreateCompanyResult {
  company: Company;
  tokens?: TokenResponseDto;
}

const SETTINGS_STORAGE_KEY = 'cuadre_company_settings';

export const DEFAULT_BANK_ACCOUNTS: CompanyBankAccountDto[] = [
  { id: 'POPULAR', bankName: 'Banco Popular', accountNumber: '792019481', accountType: 'Cta. Corriente', currency: 'DOP', holderName: 'CuadreEnv Soluciones', holderRnc: '132-94812-1', isDefault: true },
  { id: 'BANRESERVAS', bankName: 'Banreservas', accountNumber: '960192841', accountType: 'Cta. Corriente', currency: 'DOP', holderName: 'CuadreEnv Soluciones', holderRnc: '132-94812-1', isDefault: false },
  { id: 'BHD', bankName: 'Banco BHD', accountNumber: '284918239', accountType: 'Cta. Ahorros', currency: 'DOP', holderName: 'CuadreEnv Soluciones', holderRnc: '132-94812-1', isDefault: false },
  { id: 'QIK', bankName: 'Qik Banco Digital', accountNumber: '109284192', accountType: 'Cta. Instantánea QR', currency: 'DOP', holderName: 'CuadreEnv Soluciones', holderRnc: '132-94812-1', isDefault: false },
  { id: 'ACH', bankName: 'Transferencia ACH', accountNumber: 'Interbancaria RNC 132-94812-1', accountType: 'ACH Inmediato', currency: 'DOP', holderName: 'CuadreEnv Soluciones', holderRnc: '132-94812-1', isDefault: false },
];

const DEFAULT_COMPANY_SETTINGS: CompanySettingsDto = {
  companyName: '',
  commercialName: '',
  rnc: '',
  address: '',
  phone: '',
  logoUrl: '',
  invoiceFooterPhrase: '',
  currency: 'DOP',
  defaultTaxPercentage: 18,
  ticketInstagram: '',
  ticketWhatsapp: '',
  ticketShowQr: true,
  ticketPaperSize: '80mm',
  allowNegativeStock: false,
  cashToleranceAmount: 50,
  bankAccounts: DEFAULT_BANK_ACCOUNTS,
};

@Injectable({
  providedIn: 'root',
})
export class CompanyService {
  private readonly api = inject(ApiClientService);

  readonly currentSettings = signal<CompanySettingsDto>(this.getInitialSettings());
  readonly activeCompanyId = signal<number | null>(this.getInitialCompanyId());

  constructor() {
    if (typeof window !== 'undefined') {
      this.getCompanySettings().catch(() => {});
    }
  }

  private getInitialCompanyId(): number | null {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const stored = window.sessionStorage.getItem('active_company_id');
        return stored ? parseInt(stored, 10) : null;
      }
    } catch {}
    return null;
  }

  setActiveCompany(companyId: number | null): void {
    this.activeCompanyId.set(companyId);
    try {
      if (typeof window !== 'undefined') {
        if (companyId) {
          window.sessionStorage?.setItem('active_company_id', String(companyId));
          window.sessionStorage?.setItem('auth_company_id', String(companyId));
        } else {
          window.sessionStorage?.removeItem('active_company_id');
          window.sessionStorage?.removeItem('auth_company_id');
        }
        window.sessionStorage?.removeItem(SETTINGS_STORAGE_KEY);
      }
    } catch {}
    this.getCompanySettings().catch(() => {});
  }

  clearState(): void {
    this.activeCompanyId.set(null);
    this.currentSettings.set(DEFAULT_COMPANY_SETTINGS);
    try {
      if (typeof window !== 'undefined') {
        window.sessionStorage?.removeItem('active_company_id');
        window.sessionStorage?.removeItem('auth_company_id');
        window.sessionStorage?.removeItem(SETTINGS_STORAGE_KEY);
        window.localStorage?.removeItem(SETTINGS_STORAGE_KEY);
      }
    } catch {}
  }

  private getStorageKey(): string {
    try {
      const cid =
        this.activeCompanyId() ||
        (typeof window !== 'undefined'
          ? sessionStorage?.getItem('currentCompanyId') ||
            localStorage?.getItem('currentCompanyId') ||
            sessionStorage?.getItem('auth_company_id')
          : null);
      return cid ? `${SETTINGS_STORAGE_KEY}_${cid}` : SETTINGS_STORAGE_KEY;
    } catch {
      return SETTINGS_STORAGE_KEY;
    }
  }

  private getInitialSettings(): CompanySettingsDto {
    try {
      if (typeof window !== 'undefined') {
        const specificKey = this.getStorageKey();
        const stored =
          localStorage.getItem(specificKey) ||
          localStorage.getItem(SETTINGS_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (!parsed.bankAccounts || parsed.bankAccounts.length === 0) {
            parsed.bankAccounts = DEFAULT_BANK_ACCOUNTS;
          }
          return { ...DEFAULT_COMPANY_SETTINGS, ...parsed };
        }
      }
    } catch {
      // ignore
    }
    return DEFAULT_COMPANY_SETTINGS;
  }

  async getCompanies(): Promise<ApiResponse<Company[]>> {
    const res = await this.api.get<any, any>('/Company');
    if (Array.isArray(res)) {
      return { success: true, data: res };
    }
    return res;
  }

  async getCompany(id: number): Promise<Company> {
    const res = await this.api.get<any, any>(`/Company/${id}`);
    if (res && typeof res === 'object') {
      if (res.id) return res as Company;
      if (res.data) return res.data as Company;
    }
    throw new Error('Unable to load company.');
  }

  async getCompanySettings(): Promise<CompanySettingsDto> {
    try {
      const res = await this.api.get<any, any>('/CompanySettings/settings');
      if (res && typeof res === 'object') {
        const payload = (res.data ?? res.Data ?? res) as CompanySettingsDto;
        const merged: CompanySettingsDto = { ...this.currentSettings(), ...payload };
        if (!merged.bankAccounts || merged.bankAccounts.length === 0) {
          merged.bankAccounts = this.currentSettings().bankAccounts?.length ? this.currentSettings().bankAccounts : DEFAULT_BANK_ACCOUNTS;
        }

        // Si faltan datos en settings (logo, nombres, RNC o teléfono), intentar completar desde /Company/{id}
        const cid =
          this.activeCompanyId() ||
          (typeof window !== 'undefined'
            ? Number(
                sessionStorage.getItem('currentCompanyId') ||
                  localStorage.getItem('currentCompanyId') ||
                  sessionStorage.getItem('auth_company_id'),
              )
            : null);

        if (cid && (!merged.companyName || !merged.commercialName || !merged.rnc || !merged.logoUrl)) {
          try {
            const comp = await this.getCompany(cid);
            if (comp) {
              if (!merged.companyName && comp.name) merged.companyName = comp.name;
              if (!merged.rnc && comp.rnc) merged.rnc = comp.rnc;
              if (!merged.address && comp.address) merged.address = comp.address;
              if (!merged.phone && comp.phone) merged.phone = comp.phone;
              if (comp.settings) {
                if (!merged.logoUrl && comp.settings.logoUrl) merged.logoUrl = comp.settings.logoUrl;
                if (!merged.commercialName && comp.settings.commercialName) merged.commercialName = comp.settings.commercialName;
                if (!merged.companyName && comp.settings.companyName) merged.companyName = comp.settings.companyName;
                if (!merged.rnc && comp.settings.rnc) merged.rnc = comp.settings.rnc;
              }
            }
          } catch {}
        }

        this.saveToStorage(merged);
        this.currentSettings.set(merged);
        return merged;
      }
    } catch {
      // Fallback a /Company/{id} si /CompanySettings/settings falla o responde con error
      const cid =
        this.activeCompanyId() ||
        (typeof window !== 'undefined'
          ? Number(
              sessionStorage.getItem('currentCompanyId') ||
                localStorage.getItem('currentCompanyId') ||
                sessionStorage.getItem('auth_company_id'),
            )
          : null);

      if (cid) {
        try {
          const comp = await this.getCompany(cid);
          if (comp) {
            const fallback: CompanySettingsDto = {
              ...this.currentSettings(),
              companyName: comp.name || this.currentSettings().companyName,
              rnc: comp.rnc || this.currentSettings().rnc,
              address: comp.address || this.currentSettings().address,
              phone: comp.phone || this.currentSettings().phone,
              ...(comp.settings || {}),
            };
            this.saveToStorage(fallback);
            this.currentSettings.set(fallback);
            return fallback;
          }
        } catch {}
      }
    }
    return this.currentSettings();
  }

  async updateCompanySettings(settings: CompanySettingsDto): Promise<void> {
    const merged = { ...this.currentSettings(), ...settings };
    this.saveToStorage(merged);
    this.currentSettings.set(merged);

    try {
      await this.api.put('/CompanySettings/settings', merged);
    } catch (err) {
      console.warn('Backend CompanySettings update fallback to local cache:', err);
    }
  }

  private saveToStorage(settings: CompanySettingsDto) {
    try {
      const specificKey = this.getStorageKey();
      localStorage.setItem(specificKey, JSON.stringify(settings));
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // ignore
    }
  }

  getBankAccounts(): CompanyBankAccountDto[] {
    const s = this.currentSettings();
    return s.bankAccounts && s.bankAccounts.length > 0 ? s.bankAccounts : DEFAULT_BANK_ACCOUNTS;
  }

  async saveBankAccounts(accounts: CompanyBankAccountDto[]): Promise<void> {
    const s = this.currentSettings();
    await this.updateCompanySettings({ ...s, bankAccounts: accounts });
  }

  async addBankAccount(account: CompanyBankAccountDto): Promise<void> {
    const current = [...this.getBankAccounts()];
    current.push(account);
    await this.saveBankAccounts(current);
  }

  async createCompany(
    data: CreateCompanyRequest,
  ): Promise<CreateCompanyResult> {
    const payload = await this.api.post<any, any>('/Company', data);

    if (payload && payload.company) {
      return {
        company: payload.company as Company,
        tokens: payload.tokens as TokenResponseDto | undefined,
      };
    }

    if (payload && payload.id) {
      return { company: payload as Company };
    }

    throw new Error('Unexpected response from company creation endpoint.');
  }

  async updateCompany(data: Company): Promise<void> {
    await this.api.put('/Company', data);
  }

  async deleteCompany(id: number): Promise<void> {
    await this.api.delete(`/Company/${id}`);
  }
}
