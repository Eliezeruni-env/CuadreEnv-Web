import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  computed,
  ViewChild,
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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  CashRegisterService,
  type CashRegisterSessionDto,
  type CashRegisterMovementItem,
} from '../../services/cash-register.service';
import { AuthService } from '../../../cuadreEnv/services/auth.service';
import { TranslationService } from '../../../cuadreEnv/services/translation.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { formatDateInRD } from '../../../cuadreEnv/utils/rd-date.util';
import { ManualMovementModalComponent } from './manual-movement-modal.component';
import { CloseRegisterModalComponent } from './close-register-modal.component';
import {
  SaleCompletedModalComponent,
  type CompletedSaleDto,
} from '../../../sales/components/sales/sale-completed-modal.component';
import { AuthPosModalComponent } from './auth-pos-modal.component';
import { ListPaginationComponent } from '../../../cuadreEnv/components/list-pagination/list-pagination.component';
import {
  ButtonDirective,
  ContainerComponent,
  AlertComponent,
  SpinnerComponent,
  FormControlDirective,
  FormDirective,
  FormSelectDirective,
} from '@coreui/angular';
import { UserService } from '../../../users/services/user.service';

@Component({
  selector: 'app-cash-register',
  templateUrl: './cash-register.component.html',
  styleUrls: ['./cash-register.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    ContainerComponent,
    ButtonDirective,
    AlertComponent,
    SpinnerComponent,
    FormControlDirective,
    FormDirective,
    FormSelectDirective,
    ManualMovementModalComponent,
    CloseRegisterModalComponent,
    SaleCompletedModalComponent,
    AuthPosModalComponent,
    ListPaginationComponent,
    RouterLink,
  ],
})
export class CashRegisterComponent implements OnInit, OnDestroy {
  readonly Math = Math;
  readonly translationService = inject(TranslationService);
  private readonly cashRegisterService = inject(CashRegisterService);
  private readonly notificationService = inject(NotificationService);
  public readonly authService = inject(AuthService);
  private readonly userService = inject(UserService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  @ViewChild('manualMovementModal') manualMovementModal!: ManualMovementModalComponent;
  @ViewChild('closeRegisterModal') closeRegisterModal!: CloseRegisterModalComponent;
  @ViewChild('saleCompletedModal') saleCompletedModal!: SaleCompletedModalComponent;
  @ViewChild('authPosModal') authPosModal!: AuthPosModalComponent;

  activeSession = signal<CashRegisterSessionDto | null>(null);
  movements = signal<CashRegisterMovementItem[]>([]);
  sessionHistory = signal<CashRegisterSessionDto[]>([]);
  cashiers = signal<{ id: number | string; name: string; email: string }[]>([]);

  activeTab = signal<'movimientos' | 'ventas' | 'ingresos' | 'egresos'>('movimientos');
  isLoading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);

  showMovementMenu = signal<boolean>(false);
  isPauseModalOpen = signal<boolean>(false);

  // Turno Detail Modal
  isSessionDetailModalOpen = signal<boolean>(false);
  isLoadingSessionDetail = signal<boolean>(false);
  selectedSessionDetail = signal<any | null>(null);
  sessionDetailTab = signal<'resumen' | 'ventas' | 'productos' | 'movimientos'>('resumen');

  // Pagination signals
  movementsPage = signal<number>(1);
  movementsPageSize = signal<number>(10);
  historyPage = signal<number>(1);
  historyPageSize = signal<number>(5);

  // Modals visibility
  isQuickSaleModalOpen = false;
  isManualMovementModalOpen = false;
  isCloseModalOpen = false;
  isSaleCompletedModalOpen = false;
  lastCompletedSale: CompletedSaleDto | null = null;
  pendingPosAction: 'OPEN' | 'RESUME' | 'CLOSE' | null = null;

  openSessionForm: FormGroup;
  pauseForm: FormGroup;

  // Billetera Visual para Apertura de Caja
  showOpenDenominations = signal<boolean>(false);
  openDenominations = signal<{ value: number; count: number; subtotal: number }[]>([
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

  readonly openDenominationSum = computed(() => {
    return this.openDenominations().reduce((acc, d) => acc + d.subtotal, 0);
  });

  readonly openBills = computed(() => this.openDenominations().slice(0, 6));
  readonly openCoins = computed(() => this.openDenominations().slice(6));

  toggleOpenDenominations() {
    this.showOpenDenominations.update((v) => !v);
  }

  addOpenDenominationCount(index: number, delta: number) {
    const items = [...this.openDenominations()];
    const current = items[index].count || 0;
    const next = Math.max(0, current + delta);
    items[index].count = next;
    items[index].subtotal = items[index].value * next;
    this.openDenominations.set(items);

    const sum = this.openDenominationSum();
    this.openSessionForm.patchValue({ initialAmount: sum });
  }

  updateOpenDenomination(index: number, count: number) {
    const qty = Math.max(0, Math.floor(Number(count) || 0));
    const items = [...this.openDenominations()];
    items[index].count = qty;
    items[index].subtotal = items[index].value * qty;
    this.openDenominations.set(items);

    const sum = this.openDenominationSum();
    this.openSessionForm.patchValue({ initialAmount: sum });
  }

  clearOpenDenominations() {
    this.openDenominations.update((items) =>
      items.map((it) => ({ ...it, count: 0, subtotal: 0 })),
    );
    this.openSessionForm.patchValue({ initialAmount: 0 });
  }

  // Computed properties
  readonly currentDateFormatted = computed(() => {
    const str = formatDateInRD(new Date(), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return `Hoy, ${str}`;
  });

  readonly currentCalculatedBalance = computed(() => {
    const session = this.activeSession();
    if (!session) return 0;
    const initial = Number(session.initialAmount) || 0;
    return Math.max(0, initial + this.totalEntradas() - this.totalSalidas());
  });

  readonly totalVentasCount = computed(() => {
    return this.movements().filter((m) =>
      m.category === 'Ventas' ||
      (m.description || '').toLowerCase().includes('venta') ||
      (m.description || '').toLowerCase().includes('factura') ||
      m.saleId != null
    ).length;
  });

  readonly totalVentasMonto = computed(() => {
    return this.movements()
      .filter((m) =>
        m.category === 'Ventas' ||
        (m.description || '').toLowerCase().includes('venta') ||
        (m.description || '').toLowerCase().includes('factura') ||
        m.saleId != null
      )
      .reduce((acc, m) => acc + (m.inAmount || 0), 0);
  });

  readonly totalIngresosCount = computed(() => {
    return this.movements().filter((m) => m.type === 'Entrada' || (m.inAmount != null && m.inAmount > 0)).length;
  });

  readonly totalEgresosCount = computed(() => {
    return this.movements().filter((m) => m.type === 'Salida' || (m.outAmount != null && m.outAmount > 0)).length;
  });

  readonly activeTabLabel = computed(() => {
    switch (this.activeTab()) {
      case 'ventas':
        return 'Ventas en efectivo';
      case 'ingresos':
        return 'Ingresos';
      case 'egresos':
        return 'Egresos';
      default:
        return 'Movimientos';
    }
  });

  readonly filteredMovements = computed(() => {
    const list = this.movements();
    const tab = this.activeTab();

    if (tab === 'ventas') {
      return list.filter((m) =>
        m.category === 'Ventas' ||
        (m.description || '').toLowerCase().includes('venta') ||
        (m.description || '').toLowerCase().includes('factura') ||
        m.saleId != null
      );
    }
    if (tab === 'ingresos') {
      // Todos los ingresos y entradas reales en caja (ventas, cobros, depósitos manuales)
      return list.filter((m) => m.type === 'Entrada' || (m.inAmount != null && m.inAmount > 0));
    }
    if (tab === 'egresos') {
      // Todas las salidas y egresos reales de caja (gastos, retiros, compras)
      return list.filter((m) => m.type === 'Salida' || (m.outAmount != null && m.outAmount > 0));
    }
    return list;
  });

  readonly pagedMovements = computed(() => {
    const list = this.filteredMovements();
    const start = (this.movementsPage() - 1) * this.movementsPageSize();
    return list.slice(start, start + this.movementsPageSize());
  });

  readonly pagedHistory = computed(() => {
    const list = this.sessionHistory();
    const start = (this.historyPage() - 1) * this.historyPageSize();
    return list.slice(start, start + this.historyPageSize());
  });

  readonly totalEntradas = computed(() => {
    return this.movements()
      .filter((m) => m.type === 'Entrada')
      .reduce((acc, m) => acc + (m.inAmount || 0), 0);
  });

  readonly totalSalidas = computed(() => {
    return this.movements()
      .filter((m) => m.type === 'Salida')
      .reduce((acc, m) => acc + (m.outAmount || 0), 0);
  });

  readonly totalTransacciones = computed(() => {
    return this.movements().length;
  });

  onMovementsPageChange(page: number) {
    this.movementsPage.set(page);
  }

  onHistoryPageChange(page: number) {
    this.historyPage.set(page);
  }

  constructor() {
    const curr = this.authService.currentUser();
    const defaultName = curr?.email ? curr.email.split('@')[0] : 'Usuario Actual';

    this.openSessionForm = this.fb.group({
      initialAmount: [10000, [Validators.required, Validators.min(0)]],
      name: ['Caja Principal 01', [Validators.required]],
      cashierName: [defaultName, [Validators.required]],
      notes: ['Fondo inicial para operaciones diarias'],
    });

    this.pauseForm = this.fb.group({
      reason: ['Almuerzo / Receso', [Validators.required]],
      notes: [''],
    });
  }

  private syncTimer: any = null;
  private onFocusHandler = () => {
    void this.loadData();
  };
  private onVisibilityHandler = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      void this.loadData();
    }
  };
  private onCashChangedHandler = () => {
    void this.loadData();
  };

  ngOnInit() {
    this.loadData();
    this.loadCashiers();

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', this.onFocusHandler);
      window.addEventListener('cuadre_cash_register_changed', this.onCashChangedHandler);
      // Sincronización continua en segundo plano entre PC y móvil cada 15s
      this.syncTimer = setInterval(() => {
        void this.loadData();
      }, 15000);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityHandler);
    }

    this.route.queryParams.subscribe((params) => {
      if (params['requiresOpenSession']) {
        this.notificationService.warning(
          'Debes aperturar un turno de caja antes de realizar ventas o cobros.',
        );
      }
    });
  }

  ngOnDestroy(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', this.onFocusHandler);
      window.removeEventListener('cuadre_cash_register_changed', this.onCashChangedHandler);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityHandler);
    }
  }

  async loadCashiers() {
    const curr = this.authService.currentUser();
    const defaultItem = {
      id: curr?.id || 1,
      name: curr?.email ? curr.email.split('@')[0] : 'Usuario Actual',
      email: curr?.email || '',
    };
    const list = [defaultItem];

    try {
      const cashiers = await this.userService.getCashiers();
      if (Array.isArray(cashiers) && cashiers.length > 0) {
        for (const u of cashiers) {
          const fullName = `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.userName || u.email;
          if (!list.some((existing) => existing.id === u.id || existing.email === u.email)) {
            list.push({
              id: u.id ?? 0,
              name: fullName,
              email: u.email,
            });
          }
        }
      }
    } catch {
      // If 403 or network issue, fallback quietly to current user
    }

    this.cashiers.set(list);
    if (list.length > 0) {
      this.openSessionForm.patchValue({ cashierName: list[0].name });
    }
  }

  openPauseModal() {
    this.pauseForm.reset({
      reason: 'Almuerzo / Receso',
      notes: '',
    });
    this.isPauseModalOpen.set(true);
  }

  closePauseModal() {
    this.isPauseModalOpen.set(false);
  }

  async confirmPause() {
    if (this.pauseForm.invalid) {
      this.pauseForm.markAllAsTouched();
      return;
    }
    const val = this.pauseForm.value;
    this.isLoading.set(true);
    try {
      const res = await this.cashRegisterService.pauseSession(val.reason, val.notes);
      if (res.success && res.data) {
        this.activeSession.set(res.data);
        this.notificationService.info('La caja ha sido pausada temporalmente.');
        this.closePauseModal();
      } else {
        this.notificationService.error(res.message || 'Error al pausar la caja.');
      }
    } catch (e: any) {
      this.notificationService.showApiError(e);
    } finally {
      this.isLoading.set(false);
    }
  }

  initiateResumeSession() {
    this.pendingPosAction = 'RESUME';
    if (this.authPosModal) this.authPosModal.open('Reanudar Caja');
  }

  async resumeRegisterSession() {
    this.isLoading.set(true);
    try {
      const res = await this.cashRegisterService.resumeSession();
      if (res.success && res.data) {
        this.activeSession.set(res.data);
        this.notificationService.success('Operaciones de caja reanudadas exitosamente.');
      } else {
        this.notificationService.error(res.message || 'Error al reanudar la caja.');
      }
    } catch (e: any) {
      this.notificationService.showApiError(e);
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadData() {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const [sessionRes, historyRes] = await Promise.all([
        this.cashRegisterService.getActiveSession(),
        this.cashRegisterService.getSessionHistory(),
      ]);

      if (sessionRes?.success && sessionRes.data) {
        this.activeSession.set(sessionRes.data);

        // Load movements directly from DB
        const movRes = await this.cashRegisterService.getMovements();
        if (movRes?.success && movRes.data) {
          this.movements.set(movRes.data);
        } else {
          this.movements.set([]);
        }
      } else {
        this.activeSession.set(null);
        this.movements.set([]);
      }

      if (historyRes?.success && historyRes.data) {
        this.sessionHistory.set(historyRes.data);
      }
    } catch (e: any) {
      this.errorMessage.set(
        e?.response?.data?.message || e?.message || 'Error al cargar datos de la caja.',
      );
    } finally {
      this.isLoading.set(false);
    }
  }

  setTab(tab: 'movimientos' | 'ventas' | 'ingresos' | 'egresos') {
    this.activeTab.set(tab);
  }

  toggleMovementMenu() {
    this.showMovementMenu.update((v) => !v);
  }

  initiateOpenSession() {
    if (this.openSessionForm.invalid) {
      this.openSessionForm.markAllAsTouched();
      return;
    }
    this.pendingPosAction = 'OPEN';
    if (this.authPosModal) this.authPosModal.open('Aperturar Caja');
  }

  async openRegisterSession() {
    if (this.openSessionForm.invalid) {
      this.openSessionForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    const val = this.openSessionForm.value;

    try {
      const res = await this.cashRegisterService.openSession({
        name: val.name,
        initialAmount: parseFloat(val.initialAmount),
        cashierName: val.cashierName,
        notes: val.notes,
      });

      if (res.success && res.data) {
        this.activeSession.set(res.data);
        this.notificationService.success(
          `Caja "${res.data.name}" aperturada exitosamente con un fondo de RD$ ${res.data.initialAmount.toLocaleString('es-DO', { minimumFractionDigits: 2 })}.`,
        );
        await this.loadData();
      } else {
        this.notificationService.error(res.message || 'Error al abrir caja.');
      }
    } catch (e: any) {
      this.notificationService.showApiError(e);
    } finally {
      this.isLoading.set(false);
    }
  }

  navigateToPos() {
    this.showMovementMenu.set(false);
    this.router.navigate(['/pos']);
  }

  openQuickSaleModal() {
    this.navigateToPos();
  }

  openManualMovementModal(type: 'Entrada' | 'Salida') {
    this.showMovementMenu.set(false);
    if (this.manualMovementModal) {
      this.manualMovementModal.open(type);
    }
  }

  initiateCloseSession() {
    this.pendingPosAction = 'CLOSE';
    if (this.authService.isSuperUser()) {
      // Los superusuarios / administradores pueden ingresar directo al arqueo de caja
      this.openCloseRegisterModal();
    } else if (this.authPosModal) {
      this.authPosModal.open('Cerrar Caja');
    } else {
      this.openCloseRegisterModal();
    }
  }

  async openCloseRegisterModal() {
    if (!this.closeRegisterModal) return;
    this.isLoading.set(true);
    try {
      const sessionRes = await this.cashRegisterService.getActiveSession();
      if (sessionRes?.success && sessionRes.data) {
        const session = { ...sessionRes.data };
        session.currentBalance = this.currentCalculatedBalance();
        this.activeSession.set(session);
        this.closeRegisterModal.open(session);
      } else if (this.activeSession()) {
        const session = { ...this.activeSession()! };
        session.currentBalance = this.currentCalculatedBalance();
        this.closeRegisterModal.open(session);
      } else {
        this.notificationService.warning('No se encontró una sesión de caja activa para cerrar.');
      }
    } catch (e: any) {
      this.notificationService.showApiError(e);
    } finally {
      this.isLoading.set(false);
    }
  }

  onQuickSaleCompleted(data: CompletedSaleDto) {
    this.lastCompletedSale = data;
    this.loadData();
    if (this.saleCompletedModal) {
      this.saleCompletedModal.open(data);
    } else {
      this.isSaleCompletedModalOpen = true;
    }
  }

  onRegisterClosed() {
    this.activeSession.set(null);
    this.movements.set([]);
    this.loadData();
  }

  onPosAuthenticated(event: { success: boolean; pin: string }) {
    if (event.success) {
      switch (this.pendingPosAction) {
        case 'OPEN':
          this.openRegisterSession();
          break;
        case 'RESUME':
          this.resumeRegisterSession();
          break;
        case 'CLOSE':
          this.openCloseRegisterModal();
          break;
      }
    }
    this.pendingPosAction = null;
  }

  // =========================================================================
  // Turno Detail Modal Handlers
  // =========================================================================
  async openSessionDetail(session: CashRegisterSessionDto) {
    this.selectedSessionDetail.set({
      session,
      sales: [],
      movements: [],
      productSummary: [],
      totals: {
        cashSales: 0,
        cardSales: 0,
        transferSales: 0,
        totalSales: 0,
        cashIn: 0,
        cashOut: 0,
      },
    });
    this.sessionDetailTab.set('resumen');
    this.isSessionDetailModalOpen.set(true);
    this.isLoadingSessionDetail.set(true);

    try {
      const detail = await this.cashRegisterService.getSessionDetail(session.id, session);
      this.selectedSessionDetail.set(detail);
    } catch (e) {
      console.warn('Error loading session detail:', e);
    } finally {
      this.isLoadingSessionDetail.set(false);
    }
  }

  closeSessionDetailModal() {
    this.isSessionDetailModalOpen.set(false);
    this.selectedSessionDetail.set(null);
  }

  setSessionDetailTab(tab: 'resumen' | 'ventas' | 'productos' | 'movimientos') {
    this.sessionDetailTab.set(tab);
  }
}
