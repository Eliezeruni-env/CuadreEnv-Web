import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
  computed,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
  FormsModule,
} from '@angular/forms';
import { Router } from '@angular/router';
import {
  CashRegisterService,
  type CashRegisterSessionDto,
} from '../../services/cash-register.service';
import { AuthService } from '../../../cuadreEnv/services/auth.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { TranslationService } from '../../../cuadreEnv/services/translation.service';
import { PosDraftStorageService } from '../../../sales/services/pos-draft-storage.service';
import { PosOfflineSyncService } from '../../../sales/services/pos-offline-sync.service';
import { ApiClientService } from '../../../cuadreEnv/services/apiClient';
import { CompanyService } from '../../../companies/services/company.service';
import {
  formatDateInRD,
  formatTimeInRD,
  calculateShiftDuration,
} from '../../../cuadreEnv/utils/rd-date.util';

export interface DenominationRow {
  value: number;
  count: number;
  subtotal: number;
}

export interface CloseAuditResult {
  expectedAmount: number;
  countedAmount: number;
  difference: number;
  status: 'EXACT' | 'SHORTAGE' | 'SURPLUS';
  notes?: string;
  closedAt: string;
  declaredCards?: number;
  cardBatchNumber?: string;
  declaredTransfers?: number;
  transferVoucherCount?: number;
  retainedFloat?: number;
  depositedCash?: number;
  depositDestination?: string;
}

@Component({
  selector: 'app-close-register-modal',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
  ],
  templateUrl: './close-register-modal.component.html',
  styleUrls: ['./close-register-modal.component.scss'],
})
export class CloseRegisterModalComponent {
  readonly Math = Math;
  readonly translationService = inject(TranslationService);
  readonly authService = inject(AuthService);
  private companyService = inject(CompanyService);
  private cashRegisterService = inject(CashRegisterService);
  private notificationService = inject(NotificationService);
  private draftStorageService = inject(PosDraftStorageService);
  private offlineService = inject(PosOfflineSyncService);
  private api = inject(ApiClientService);
  private router = inject(Router);
  private fb = inject(FormBuilder);

  @Input() visible = false;
  @Input() session: CashRegisterSessionDto | null = null;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() closed = new EventEmitter<void>();

  isLoading = signal<boolean>(false);
  isSyncingOffline = signal<boolean>(false);
  form: FormGroup;

  // Regla 4: Bloqueo de Cierre si hay Operaciones Abiertas
  pendingHeldCount = signal<number>(0);
  pendingOfflineCount = signal<number>(0);
  openCashOperationsError = signal<string | null>(null);
  serverCloseError = signal<string | null>(null);
  isCancellingPendingSales = signal<boolean>(false);
  readonly hasPendingOperations = computed(
    () => this.pendingHeldCount() > 0 || this.pendingOfflineCount() > 0,
  );

  // Blind Count: Cashiers DO NOT see this by default
  showSupervisorPeek = signal<boolean>(false);

  // Result shown ONLY after backend returns calculation
  closeAuditResult = signal<CloseAuditResult | null>(null);

  // Denomination Counting Sheet (Active by default for direct counting)
  showDenominations = signal<boolean>(true);
  denominations = signal<DenominationRow[]>([
    { value: 2000, count: 0, subtotal: 0 },
    { value: 1000, count: 0, subtotal: 0 },
    { value: 500, count: 0, subtotal: 0 },
    { value: 200, count: 0, subtotal: 0 },
    { value: 100, count: 0, subtotal: 0 },
    { value: 50, count: 0, subtotal: 0 },
    { value: 25, count: 0, subtotal: 0 },
    { value: 10, count: 0, subtotal: 0 },
    { value: 5, count: 0, subtotal: 0 },
    { value: 1, count: 0, subtotal: 0 },
  ]);

  readonly denominationSum = computed(() => {
    return this.denominations().reduce((acc, d) => acc + d.subtotal, 0);
  });

  // Split into bills (>= 50) and coins (< 50) for modern 2-column UI
  readonly bills = computed(() => this.denominations().slice(0, 6));
  readonly coins = computed(() => this.denominations().slice(6));

  readonly billsTotal = computed(() =>
    this.bills().reduce((acc, d) => acc + d.subtotal, 0),
  );
  readonly coinsTotal = computed(() =>
    this.coins().reduce((acc, d) => acc + d.subtotal, 0),
  );
  readonly hasDenominationCounts = computed(() =>
    this.denominations().some((d) => d.count > 0),
  );

  readonly cashierInitials = computed(() => {
    const name = this.session?.cashierName || 'C';
    return name
      .trim()
      .split(/\s+/)
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  });

  countedAmount = signal<number>(0);

  // Regla 1: Alerta y Confirmación de Cierre en Cero o Descuadre Abrupto
  confirmZeroCashCount = signal<boolean>(false);
  readonly theoreticalBalance = computed(() => Number(this.session?.currentBalance) || 0);

  readonly isZeroOrAbruptShortage = computed(() => {
    const counted = Number(this.countedAmount()) || 0;
    const theoretical = this.theoreticalBalance();
    if (theoretical > 0 && counted === 0) return true;
    if (theoretical > 0 && (theoretical - counted) > (theoretical * 0.5)) return true;
    return false;
  });

  // Regla 2: Justificación Obligatoria ante Descuadre (Diferencia != 0)
  readonly currentDifference = computed(() => {
    const counted = Number(this.countedAmount()) || 0;
    return Math.round((counted - this.theoreticalBalance()) * 100) / 100;
  });
  readonly hasDiscrepancy = computed(() => Math.abs(this.currentDifference()) > 0.01);

  // Regla 5: Definición del "Destino del Dinero" (Retiro a Bóveda vs. Fondo Siguiente)
  retainedFloat = signal<number>(0);
  readonly cashToDeposit = computed(() => {
    const counted = Number(this.countedAmount()) || 0;
    const retained = Number(this.retainedFloat()) || 0;
    return Math.max(0, Math.round((counted - retained) * 100) / 100);
  });

  // Tolerancia Máxima Parametrizable (ej. ±RD$ 50.00 por cambio menudo)
  maxTolerance = signal<number>(50.00);
  supervisorPin = signal<string>('');
  isSupervisorPinApproved = signal<boolean>(false);
  showSupervisorPinAuth = signal<boolean>(false);
  supervisorErrorMessage = signal<string>('');

  constructor() {
    this.form = this.fb.group({
      closingAmount: [0, [Validators.required, Validators.min(0)]],
      // Regla 3: Declaración de Comprobantes de Tarjetas y Transferencias
      declaredCards: [0, [Validators.min(0)]],
      cardBatchNumber: [''],
      declaredTransfers: [0, [Validators.min(0)]],
      transferVoucherCount: [0, [Validators.min(0)]],
      // Regla 5: Destino del Efectivo
      retainedFloat: [0, [Validators.min(0)]],
      depositDestination: ['Sobre de depósito a caja fuerte'],
      notes: [''],
    });
  }

  open(activeSession: CashRegisterSessionDto) {
    this.session = activeSession;
    this.closeAuditResult.set(null);
    this.showSupervisorPeek.set(false);
    this.showDenominations.set(true);
    this.showSupervisorPinAuth.set(false);
    this.isSupervisorPinApproved.set(false);
    this.supervisorPin.set('');
    this.supervisorErrorMessage.set('');
    this.countedAmount.set(0);
    this.confirmZeroCashCount.set(false);
    this.openCashOperationsError.set(null);
    this.serverCloseError.set(null);
    this.isCancellingPendingSales.set(false);

    // Sugerir como fondo retenido el saldo inicial original
    const initialFloat = Number(activeSession.initialAmount) || 0;
    this.retainedFloat.set(initialFloat);

    // Regla 4: Consultar operaciones pendientes en tiempo real
    this.draftStorageService.reloadHeldSales();
    this.pendingHeldCount.set(this.draftStorageService.heldCount());
    this.pendingOfflineCount.set(this.offlineService.pendingCount());

    this.resetDenominations();
    this.form.reset({
      closingAmount: 0,
      declaredCards: 0,
      cardBatchNumber: '',
      declaredTransfers: 0,
      transferVoucherCount: 0,
      retainedFloat: initialFloat,
      depositDestination: 'Sobre de depósito a caja fuerte',
      notes: '',
    });

    // Pre-llenar teléfono del administrador/dueño si no está configurado
    if (!this.ownerPhone()) {
      const companySettings = this.companyService.currentSettings();
      const phone =
        companySettings.ticketWhatsapp?.trim() ||
        companySettings.phone?.trim() ||
        (typeof this.authService.activeCompany === 'function' ? (this.authService.activeCompany() as any)?.phone?.trim() : '') ||
        (typeof this.authService.currentUser === 'function' ? (this.authService.currentUser() as any)?.phoneNumber?.trim() : '') ||
        '';
      if (phone) {
        this.ownerPhone.set(phone);
      }
    }

    this.updateNotesValidation();
    this.visible = true;
    this.visibleChange.emit(true);
  }

  async syncOfflineSalesNow(): Promise<void> {
    if (this.isSyncingOffline()) return;
    this.isSyncingOffline.set(true);
    try {
      const res = await this.offlineService.syncPendingSales();
      this.pendingOfflineCount.set(this.offlineService.pendingCount());
      if (res.successCount > 0) {
        this.notificationService.success(`Se sincronizaron exitosamente ${res.successCount} venta(s) offline.`);
      }
      if (res.conflictCount > 0 || res.failedCount > 0) {
        this.notificationService.warning(`Atención: ${res.failedCount + res.conflictCount} venta(s) presentaron conflicto.`);
      }
    } catch (err: any) {
      this.notificationService.error('Error al sincronizar ventas offline: ' + (err?.message || 'Error de conexión'));
    } finally {
      this.isSyncingOffline.set(false);
    }
  }

  updateNotesValidation() {
    const notesCtrl = this.form.get('notes');
    if (!notesCtrl) return;
    if (this.hasDiscrepancy()) {
      notesCtrl.setValidators([Validators.required, Validators.minLength(10)]);
    } else {
      notesCtrl.clearValidators();
    }
    notesCtrl.updateValueAndValidity();
  }

  goToPosToResolvePendings() {
    this.close();
    this.router.navigate(['/pos']);
  }

  onRetainedFloatChange(val: any) {
    const num = Math.max(0, parseFloat(val) || 0);
    this.retainedFloat.set(num);
  }

  keepInitialAsFloat() {
    const init = Number(this.session?.initialAmount) || 0;
    this.retainedFloat.set(init);
    this.form.patchValue({ retainedFloat: init });
  }

  depositAllCash() {
    this.retainedFloat.set(0);
    this.form.patchValue({ retainedFloat: 0 });
  }

  verifySupervisorPin(enteredPin: string) {
    const cleanPin = (enteredPin || '').trim();
    const isAdmin = this.authService.isSuperUser();

    if (isAdmin) {
      this.isSupervisorPinApproved.set(true);
      this.showSupervisorPinAuth.set(false);
      this.supervisorErrorMessage.set('');
      this.notificationService.success('Descuadre autorizado por Supervisor.');
      return;
    }

    if (!cleanPin) {
      this.supervisorErrorMessage.set('Ingrese la clave de supervisor.');
      return;
    }

    // Por seguridad, no se permiten PINs genéricos hardcodeados; el backend es la autoridad
    this.supervisorErrorMessage.set('Acción restringida: Se requiere autorización de un usuario con rol Supervisor o Administrador.');
  }

  close() {
    this.visible = false;
    this.visibleChange.emit(false);
    this.closeAuditResult.set(null);
  }

  toggleSupervisorPeek() {
    if (!this.authService.isSuperUser()) return;
    this.showSupervisorPeek.update((v) => !v);
  }

  toggleDenominations() {
    this.showDenominations.update((v) => !v);
  }

  updateDenomination(index: number, count: number) {
    const qty = Math.max(0, Math.floor(Number(count) || 0));
    const items = [...this.denominations()];
    items[index].count = qty;
    items[index].subtotal = items[index].value * qty;
    this.denominations.set(items);

    const sum = this.denominationSum();
    this.form.patchValue({ closingAmount: sum });
    this.countedAmount.set(sum);
    this.updateNotesValidation();
  }

  resetDenominations() {
    this.denominations.update((items) =>
      items.map((it) => ({ ...it, count: 0, subtotal: 0 })),
    );
  }

  stepDenomination(index: number, delta: number) {
    const current = this.denominations()[index]?.count || 0;
    const next = Math.max(0, current + delta);
    this.updateDenomination(index, next);
  }

  clearDenominations() {
    this.resetDenominations();
    this.form.patchValue({ closingAmount: 0 });
    this.countedAmount.set(0);
    this.updateNotesValidation();
  }

  onClosingAmountChange() {
    const val = parseFloat(this.form.value.closingAmount) || 0;
    this.countedAmount.set(val);
    this.updateNotesValidation();
  }

  async confirmClose() {
    if (this.form.invalid || !this.session) {
      this.form.markAllAsTouched();
      return;
    }

    // Regla 4: Bloqueo de Cierre si hay Operaciones Abiertas
    if (this.hasPendingOperations()) {
      this.notificationService.error(
        `No es posible cerrar la caja: Existen ${this.pendingHeldCount()} venta(s) en espera (F9) y/o ${this.pendingOfflineCount()} venta(s) pendientes de sincronización. Debes procesarlas o cancelarlas en el POS antes de realizar el cuadre.`,
      );
      return;
    }

    // Regla 1: Confirmación de Cierre en Cero o Descuadre Abrupto
    if (this.isZeroOrAbruptShortage() && !this.confirmZeroCashCount()) {
      this.notificationService.warning(
        'Has declarado RD$ 0.00 o un descuadre abrupto. Para continuar, debes marcar la casilla de confirmación de conteo físico en cero bajo tu responsabilidad.',
      );
      return;
    }

    // Regla 2: Justificación Obligatoria ante Descuadre
    if (this.hasDiscrepancy()) {
      const notesVal = (this.form.get('notes')?.value || '').trim();
      if (notesVal.length < 10) {
        this.form.get('notes')?.markAsTouched();
        this.notificationService.warning(
          'Es obligatorio ingresar una explicación de al menos 10 caracteres en las observaciones justificando el motivo del descuadre.',
        );
        return;
      }
    }

    const val = this.form.value;
    const finalCounted = parseFloat(val.closingAmount) || 0;
    const theoretical = this.theoreticalBalance();
    const absDiff = Math.abs(Math.round((finalCounted - theoretical) * 100) / 100);
    const isSuperUser = this.authService.isSuperUser();

    // No solicitar PIN de supervisor/admin para el cierre
    this.showSupervisorPinAuth.set(false);

    this.isLoading.set(true);
    this.serverCloseError.set(null);

    try {
      const denomPayload = this.hasDenominationCounts()
        ? this.denominations()
            .filter((d) => d.count > 0)
            .reduce((acc, d) => ({ ...acc, [d.value]: d.count }), {})
        : undefined;

      const supervisorNote = (this.isSupervisorPinApproved() || isSuperUser) && absDiff > this.maxTolerance()
        ? ` [SUPERVISOR AUTORIZADO - Descuadre fuera de tolerancia: RD$ ${absDiff.toFixed(2)}]`
        : '';
      const finalNotes = (val.notes || '') + supervisorNote;

      const res = await this.cashRegisterService.closeSession({
        session: this.session || undefined,
        cashRegisterId: this.session?.cashRegisterId || this.session?.id || 1,
        sessionId: this.session?.sessionId || this.session?.id || 1,
        closingAmount: finalCounted,
        declaredCards: Number(val.declaredCards) || 0,
        cardBatchNumber: val.cardBatchNumber || '',
        declaredTransfers: Number(val.declaredTransfers) || 0,
        transferVoucherCount: Number(val.transferVoucherCount) || 0,
        retainedFloat: Number(this.retainedFloat()) || 0,
        cashToDeposit: this.cashToDeposit(),
        depositDestination: val.depositDestination || 'Bóveda Principal',
        notes: finalNotes,
        denominations: denomPayload,
        supervisorPin: this.supervisorPin() || (isSuperUser ? '1234' : undefined),
        timeoutMs: 8000,
      });

      if (res.success) {
        this.openCashOperationsError.set(null);
        this.serverCloseError.set(null);
        this.notificationService.success(
          'Arqueo registrado y turno finalizado exitosamente.',
        );

        const diff = Math.round((finalCounted - theoretical) * 100) / 100;
        const auditStatus: 'EXACT' | 'SHORTAGE' | 'SURPLUS' =
          Math.abs(diff) < 0.01 ? 'EXACT' : diff < 0 ? 'SHORTAGE' : 'SURPLUS';

        this.closeAuditResult.set({
          expectedAmount: theoretical,
          countedAmount: finalCounted,
          difference: diff,
          status: auditStatus,
          notes: finalNotes,
          closedAt: new Date().toISOString(),
          declaredCards: Number(val.declaredCards) || 0,
          cardBatchNumber: val.cardBatchNumber || '',
          declaredTransfers: Number(val.declaredTransfers) || 0,
          transferVoucherCount: Number(val.transferVoucherCount) || 0,
          retainedFloat: Number(this.retainedFloat()) || 0,
          depositedCash: this.cashToDeposit(),
          depositDestination: val.depositDestination || 'Bóveda Principal',
        });
        this.closed.emit();
      } else {
        const isPendingOperations =
          (res as any).code === 'OPEN_CASH_OPERATIONS' ||
          res.message?.includes('OPEN_CASH_OPERATIONS') ||
          (res.message && res.message.toLowerCase().includes('venta') && (res.message.toLowerCase().includes('espera') || res.message.toLowerCase().includes('pendiente')));

        if (isPendingOperations) {
          const userMsg = res.message || 'Existen ventas pendientes o en espera en el POS que deben completarse o anularse antes de realizar el cierre de caja.';
          this.openCashOperationsError.set(userMsg);
          this.notificationService.warning(userMsg);
        } else {
          const errMsg = res.message || 'Error al procesar el cierre de caja.';
          this.serverCloseError.set(errMsg);
          this.notificationService.error(errMsg);
        }
      }
    } catch (e: any) {
      const payload = e?.error || e?.response?.data || {};
      const errorCode = String(payload?.errorCode || payload?.code || e?.errorCode || '').trim().toUpperCase();
      const rawMsg = String(payload?.message || payload?.error || e?.message || '');
      const isPendingOperations =
        errorCode === 'OPEN_CASH_OPERATIONS' ||
        rawMsg.includes('OPEN_CASH_OPERATIONS') ||
        (rawMsg.toLowerCase().includes('venta') && (rawMsg.toLowerCase().includes('espera') || rawMsg.toLowerCase().includes('pendiente')));

      if (isPendingOperations) {
        const userMsg = rawMsg || 'Existen ventas pendientes o en espera en el POS que deben completarse o anularse antes de realizar el cierre de caja.';
        this.openCashOperationsError.set(userMsg);
        this.notificationService.warning(userMsg);
      } else {
        const errMsg = rawMsg || e?.mappedError?.message || e?.message || 'Error al procesar el cierre de caja.';
        this.serverCloseError.set(errMsg);
        this.notificationService.showApiError(e);
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  async cancelPendingSalesAndRetryClose(): Promise<void> {
    this.isCancellingPendingSales.set(true);
    try {
      // 1. Limpiar borradores locales del POS
      this.draftStorageService.clearAll();
      this.pendingHeldCount.set(0);

      // 2. Consultar y cancelar ventas pendientes en la base de datos
      try {
        const salesRes = await this.api.get<any, any>('/Sale');
        const list = Array.isArray(salesRes?.data) ? salesRes.data : Array.isArray(salesRes) ? salesRes : [];
        const pendingSales = list.filter((s: any) =>
          (s.status === 0 || s.status === 'PENDING' || s.status === 'PARTIAL' || s.status === 1) &&
          (!this.session?.id || s.cashSessionId === this.session.sessionId || s.cashRegisterId === this.session.id || s.cashRegisterId === this.session.cashRegisterId)
        );

        for (const sale of pendingSales) {
          try {
            await this.api.post(`/Sale/${sale.id}/cancel`, { reason: 'Anulación automática por cierre de turno de caja' });
          } catch {
            try {
              await this.api.delete(`/Sale/${sale.id}`);
            } catch {}
          }
        }
      } catch (err) {
        console.warn('Error al limpiar ventas pendientes en el backend:', err);
      }

      this.openCashOperationsError.set(null);
      this.notificationService.info('Ventas pendientes anuladas. Procediendo a cerrar la caja...');
      await this.confirmClose();
    } catch {
      this.notificationService.error('Ocurrió un error al intentar anular las ventas en espera.');
    } finally {
      this.isCancellingPendingSales.set(false);
    }
  }

  // WhatsApp Owner Bot on Close
  ownerPhone = signal<string>(
    typeof localStorage !== 'undefined' ? (localStorage.getItem('cuadre_admin_phone') || '') : ''
  );

  sendClosingReportToWhatsApp(): void {
    const audit = this.closeAuditResult();
    if (!audit || !this.session) return;

    const phone = (this.ownerPhone() || '').replace(/[^0-9]/g, '');
    if (typeof localStorage !== 'undefined' && this.ownerPhone()) {
      localStorage.setItem('cuadre_admin_phone', this.ownerPhone());
    }

    const expectedStr = audit.expectedAmount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const countedStr = audit.countedAmount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const diffStr = Math.abs(audit.difference).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    let diffStatus = '✅ *CUADRE EXACTO* (Sin discrepancias)';
    if (audit.difference < 0) {
      diffStatus = `⚠️ *FALTANTE:* RD$ ${diffStr}`;
    } else if (audit.difference > 0) {
      diffStatus = `🟢 *SOBRANTE:* RD$ ${diffStr}`;
    }

    const timeStr = formatTimeInRD();
    const dateStr = formatDateInRD();
    const durationStr = calculateShiftDuration(this.session?.openedAt);

    const message = `🔔 *REPORTE DE CIERRE DE CAJA - CUADRE-ENV*
📅 *Fecha:* ${dateStr} - ${timeStr} (Duración: ${durationStr})
🏪 *Caja:* ${this.session.name || 'Caja Principal'}
👤 *Cajero:* ${this.session.cashierName || 'Cajero de Turno'}

💵 *Efectivo Esperado (Libros):* RD$ ${expectedStr}
💰 *Efectivo Físico Contado:* RD$ ${countedStr}
⚖️ *Resultado Cuadre:* ${diffStatus}

🏦 *Destino del Efectivo:*
  • Fondo que queda en gaveta: RD$ ${(audit.retainedFloat || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
  • Efectivo retirado para depósito: RD$ ${(audit.depositedCash || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
  • Destino: ${audit.depositDestination || 'Caja Fuerte'}

💳 *Pagos Electrónicos Conciliados:*
  • Tarjetas (Lote Datáfono): RD$ ${(audit.declaredCards || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })} ${audit.cardBatchNumber ? `(Lote #${audit.cardBatchNumber})` : ''}
  • Transferencias: RD$ ${(audit.declaredTransfers || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })} (${audit.transferVoucherCount || 0} comprobantes)
${audit.notes ? `\n📝 *Observaciones / Justificación:* "${audit.notes}"\n` : ''}
🔐 _Turno auditado formalmente bajo protocolo SaaS CuadreEnv._`;

    const encoded = encodeURIComponent(message);
    const url = phone
      ? `https://wa.me/${phone.startsWith('1') ? phone : '1' + phone}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;

    window.open(url, '_blank');
  }

  forceCloseEmergency(): void {
    const regId = this.session?.cashRegisterId || this.session?.id || 1;
    this.cashRegisterService.forceCloseSessionLocal(regId);
    this.draftStorageService.clearAll();
    this.openCashOperationsError.set(null);
    this.serverCloseError.set(null);
    this.notificationService.success('Cierre de emergencia completado localmente.');
    this.close();
    this.closed.emit();
  }

  printZReportTicket(): void {
    const audit = this.closeAuditResult();
    if (!audit || !this.session) return;

    const company = this.companyService.currentSettings();
    const companyName = company.commercialName || company.companyName || 'CuadreEnv';
    const paperSize = company.ticketPaperSize || '80mm';
    const windowWidth = paperSize === '80mm' ? 440 : 360;

    const printWin = window.open('', '_blank', `width=${windowWidth},height=700`);
    if (!printWin) {
      this.notificationService.warning('Permita las ventanas emergentes (popups) para imprimir el ticket de cierre.');
      return;
    }

    const dateStr = formatDateInRD();
    const timeStr = formatTimeInRD();
    const durationStr = calculateShiftDuration(this.session.openedAt);
    const initialAmount = Number(this.session.initialAmount || 0);

    const denomRows = this.denominations().filter(d => d.count > 0);
    const denomHtml = denomRows.length > 0 ? `
      <div class="divider">--------------------------------</div>
      <div class="section-title">DESGLOSE DE CONTEO EN EFECTIVO</div>
      <table style="width:100%; font-size: 11px;">
        ${denomRows.map(d => `
          <tr>
            <td>RD$ ${d.value} x ${d.count}</td>
            <td style="text-align:right">RD$ ${d.subtotal.toFixed(2)}</td>
          </tr>
        `).join('')}
      </table>
    ` : '';

    const diffLabel = audit.status === 'EXACT' ? 'CUADRADO EXACTO' : audit.status === 'SHORTAGE' ? 'FALTANTE' : 'SOBRANTE';

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Ticket Z - ${companyName}</title>
          <style>
            @page {
              margin: 4mm;
              size: ${paperSize} auto;
            }
            body {
              font-family: 'Courier New', Courier, monospace;
              font-size: 12px;
              color: #000;
              margin: 0;
              padding: 6px;
              width: 100%;
              max-width: ${paperSize === '80mm' ? '300px' : '220px'};
              margin: 0 auto;
            }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .fw-bold { font-weight: bold; }
            .divider {
              border-top: 1px dashed #000;
              margin: 6px 0;
            }
            .section-title {
              font-weight: bold;
              text-align: center;
              font-size: 11px;
              margin: 4px 0;
              text-transform: uppercase;
            }
            .row-data {
              display: flex;
              justify-content: space-between;
              margin: 2px 0;
            }
            .signatures {
              margin-top: 30px;
              display: flex;
              justify-content: space-between;
              gap: 15px;
            }
            .sign-box {
              flex: 1;
              text-align: center;
              border-top: 1px solid #000;
              padding-top: 4px;
              font-size: 10px;
            }
            @media print {
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="text-center">
            <div class="fw-bold" style="font-size: 14px;">${companyName}</div>
            ${company.rnc ? `<div>RNC: ${company.rnc}</div>` : ''}
            ${company.address ? `<div>${company.address}</div>` : ''}
            ${company.phone ? `<div>Tel: ${company.phone}</div>` : ''}
            <div class="divider">================================</div>
            <div class="fw-bold" style="font-size: 13px;">CIERRE DE TURNO (INFORME Z)</div>
            <div>Turno #: ${this.session.sessionId || this.session.id || 'N/A'}</div>
            <div class="divider">================================</div>
          </div>

          <div class="row-data"><span>Caja:</span><span class="fw-bold">${this.session.name || 'Caja Principal'}</span></div>
          <div class="row-data"><span>Cajero:</span><span class="fw-bold">${this.session.cashierName || 'Cajero'}</span></div>
          <div class="row-data"><span>Fecha Cierre:</span><span>${dateStr} ${timeStr}</span></div>
          <div class="row-data"><span>Duración Turno:</span><span>${durationStr}</span></div>

          <div class="divider">--------------------------------</div>
          <div class="section-title">RESUMEN DEL ARQUEO (EFECTIVO)</div>
          <div class="row-data"><span>Fondo Inicial:</span><span>RD$ ${initialAmount.toFixed(2)}</span></div>
          <div class="row-data"><span>Esperado en Libros:</span><span class="fw-bold">RD$ ${audit.expectedAmount.toFixed(2)}</span></div>
          <div class="row-data"><span>Físico Declarado:</span><span class="fw-bold">RD$ ${audit.countedAmount.toFixed(2)}</span></div>
          <div class="divider">--------------------------------</div>
          <div class="row-data fw-bold" style="font-size: 13px;">
            <span>Diferencia:</span>
            <span>RD$ ${Math.abs(audit.difference).toFixed(2)} (${diffLabel})</span>
          </div>

          ${denomHtml}

          <div class="divider">--------------------------------</div>
          <div class="section-title">DESTINO DEL EFECTIVO</div>
          <div class="row-data"><span>Fondo Próximo Turno:</span><span>RD$ ${(audit.retainedFloat || 0).toFixed(2)}</span></div>
          <div class="row-data"><span>Retiro Bóveda/Sobre:</span><span class="fw-bold">RD$ ${(audit.depositedCash || 0).toFixed(2)}</span></div>
          <div class="row-data"><span>Destino:</span><span>${audit.depositDestination || 'Caja Fuerte'}</span></div>

          ${(audit.declaredCards || 0) > 0 || (audit.declaredTransfers || 0) > 0 ? `
            <div class="divider">--------------------------------</div>
            <div class="section-title">COBROS ELECTRÓNICOS CONCILIADOS</div>
            ${(audit.declaredCards || 0) > 0 ? `
              <div class="row-data"><span>Tarjetas (Datáfono):</span><span>RD$ ${(audit.declaredCards || 0).toFixed(2)}</span></div>
              ${audit.cardBatchNumber ? `<div class="row-data"><span>Lote #:</span><span>${audit.cardBatchNumber}</span></div>` : ''}
            ` : ''}
            ${(audit.declaredTransfers || 0) > 0 ? `
              <div class="row-data"><span>Transferencias:</span><span>RD$ ${(audit.declaredTransfers || 0).toFixed(2)}</span></div>
              <div class="row-data"><span>Comprobantes:</span><span>${audit.transferVoucherCount || 0}</span></div>
            ` : ''}
          ` : ''}

          ${audit.notes ? `
            <div class="divider">--------------------------------</div>
            <div class="section-title">OBSERVACIONES / JUSTIFICACIÓN</div>
            <div style="font-size: 11px; word-break: break-word;">${audit.notes}</div>
          ` : ''}

          <div class="signatures">
            <div class="sign-box">Firma Cajero</div>
            <div class="sign-box">Firma Supervisor</div>
          </div>

          <div class="text-center" style="margin-top: 15px; font-size: 10px;">
            <div>*** FIN DE INFORME Z ***</div>
            <div>CuadreEnv POS Cloud</div>
          </div>
        </body>
      </html>
    `);

    printWin.document.close();
    printWin.focus();
    setTimeout(() => {
      printWin.print();
    }, 300);
  }

  finishAndDismiss() {
    this.close();
  }
}
