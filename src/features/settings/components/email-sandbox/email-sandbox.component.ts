import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import {
  TestmailService,
  TestmailEmail,
  TestmailConfig,
  DEFAULT_TESTMAIL_APIKEY,
  DEFAULT_TESTMAIL_NAMESPACE,
} from '../../../cuadreEnv/services/testmail.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';

@Component({
  selector: 'app-email-sandbox',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './email-sandbox.component.html',
  styleUrls: ['./email-sandbox.component.scss'],
})
export class EmailSandboxComponent implements OnInit {
  public readonly testmailService = inject(TestmailService);
  private readonly notificationService = inject(NotificationService);
  private readonly sanitizer = inject(DomSanitizer);

  config = signal<TestmailConfig>(this.testmailService.getConfig());
  isLoading = signal<boolean>(false);
  isTesting = signal<boolean>(false);
  filterTag = signal<string>('');

  emails = signal<TestmailEmail[]>([]);
  totalCount = signal<number>(0);
  selectedEmail = signal<TestmailEmail | null>(null);
  selectedEmailHtml = signal<SafeHtml>('');

  // Config modal
  showConfigModal = signal<boolean>(false);
  editApiKey = signal<string>('');
  editNamespace = signal<string>('');
  editEnabled = signal<boolean>(true);

  activeTab = signal<'html' | 'text' | 'json'>('html');

  ngOnInit() {
    this.loadEmails();
  }

  async loadEmails() {
    this.isLoading.set(true);
    try {
      const tag = this.filterTag().trim();
      const res = await this.testmailService.fetchEmails({
        tag: tag || undefined,
        limit: 25,
      });

      if (res.result === 'success') {
        this.emails.set(res.emails || []);
        this.totalCount.set(res.count || 0);

        if (this.emails().length > 0 && !this.selectedEmail()) {
          this.selectEmail(this.emails()[0]);
        }
      } else {
        this.notificationService.warning(res.message || 'No se pudieron recuperar los correos.');
      }
    } catch (err: any) {
      this.notificationService.error(`Error al cargar buzón: ${err?.message || 'Error de red'}`);
    } finally {
      this.isLoading.set(false);
    }
  }

  selectEmail(email: TestmailEmail) {
    this.selectedEmail.set(email);
    if (email.html) {
      this.selectedEmailHtml.set(this.sanitizer.bypassSecurityTrustHtml(email.html));
    } else {
      this.selectedEmailHtml.set(this.sanitizer.bypassSecurityTrustHtml(`<pre>${email.text || ''}</pre>`));
    }
  }

  async testConnection() {
    this.isTesting.set(true);
    try {
      const result = await this.testmailService.testConnection();
      if (result.success) {
        this.notificationService.success(result.message);
        this.totalCount.set(result.count || 0);
      } else {
        this.notificationService.error(result.message);
      }
    } finally {
      this.isTesting.set(false);
    }
  }

  openConfig() {
    const current = this.testmailService.getConfig();
    this.editApiKey.set(current.apiKey);
    this.editNamespace.set(current.namespace);
    this.editEnabled.set(current.sandboxEnabled);
    this.showConfigModal.set(true);
  }

  closeConfig() {
    this.showConfigModal.set(false);
  }

  saveConfig() {
    this.testmailService.saveConfig({
      apiKey: this.editApiKey().trim(),
      namespace: this.editNamespace().trim(),
      sandboxEnabled: this.editEnabled(),
    });
    this.config.set(this.testmailService.getConfig());
    this.showConfigModal.set(false);
    this.notificationService.success('Configuración de Testmail guardada con éxito.');
    this.loadEmails();
  }

  resetToDefaults() {
    this.editApiKey.set(DEFAULT_TESTMAIL_APIKEY);
    this.editNamespace.set(DEFAULT_TESTMAIL_NAMESPACE);
    this.editEnabled.set(true);
  }

  copySampleEmail() {
    const addr = this.testmailService.generateEmailAddress('vta1001');
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(addr);
      this.notificationService.info(`Buzón de prueba copiado: ${addr}`);
    }
  }
}
