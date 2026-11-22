import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { CustomerService } from '../../../customers/services/customer.service';
import { SaleService } from '../../services/sale.service';
import { ProductService } from '../../../products/services/product.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { ReceivableService } from '../../services/receivable.service';
import type { ProductDto } from '../../../cuadreEnv/types/api';

export interface CorporateClient {
  id: number;
  companyName: string;
  rnc: string;
  contactPerson: string;
  phone: string;
  email: string;
  creditLimit: number;
  creditDays: number;
  currentBalance: number;
  availableCredit: number;
  activeOrdersCount: number;
  status: 'Activo' | 'Bloqueado por Mora' | 'En Revisión';
}

export interface B2BOrderItem {
  productId: number;
  code: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  itbis: number;
  subtotal: number;
}

const STORAGE_CORP_CLIENTS = 'cuadreenv_corporate_clients_v2';

@Component({
  selector: 'app-corporate-sales',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './corporate-sales.component.html',
  styleUrls: ['./corporate-sales.component.scss'],
})
export class CorporateSalesComponent implements OnInit {
  private customerService = inject(CustomerService);
  private saleService = inject(SaleService);
  private productService = inject(ProductService);
  private notificationService = inject(NotificationService);
  private receivableService = inject(ReceivableService);
  private fb = inject(FormBuilder);

  viewMode = signal<'list' | 'new-order'>('list');
  isLoading = signal<boolean>(false);
  searchTerm = signal<string>('');
  statusFilter = signal<string>('TODOS');
  tabFilter = signal<'TODOS' | 'CON_SALDO' | 'AL_DIA'>('TODOS');

  corporateClients = signal<CorporateClient[]>(this.loadCorporateClients());
  products = signal<ProductDto[]>([]);

  // B2B Order Form State
  selectedClientForSale = signal<CorporateClient | null>(null);
  orderPoNumber = signal<string>('OC-CD-2026-0158');
  orderNcf = signal<string>('B01 - Factura de Crédito Fiscal');
  orderWarehouse = signal<string>('Almacén Principal');
  orderIssueDate = signal<string>('2026-01-26');
  orderDueDate = signal<string>('2026-02-25');
  orderDeliveryNotes = signal<string>('Entregar en andén 3 de recepción, horario matutino.');
  productSearchInput = signal<string>('');

  orderItems = signal<B2BOrderItem[]>([
    {
      productId: 1,
      code: 'DET-IND-04L',
      productName: 'Detergente líquido industrial 4 L',
      quantity: 10,
      unitPrice: 1650.0,
      itbis: 2970.0,
      subtotal: 16500.0,
    },
    {
      productId: 2,
      code: 'ACE-PRE-01L',
      productName: 'Aceite vegetal premium 1 L',
      quantity: 10,
      unitPrice: 580.0,
      itbis: 1044.0,
      subtotal: 5800.0,
    },
  ]);

  // Modal para nuevo cliente corporativo
  isClientModalOpen = signal<boolean>(false);
  clientForm: FormGroup;

  readonly totalCreditAssigned = computed(() =>
    this.corporateClients().reduce((sum, c) => sum + (c.creditLimit || 0), 0)
  );

  readonly totalReceivableBalance = computed(() =>
    this.corporateClients().reduce((sum, c) => sum + (c.currentBalance || 0), 0)
  );

  readonly totalAvailableCredit = computed(() =>
    this.corporateClients().reduce((sum, c) => sum + (c.availableCredit || 0), 0)
  );

  readonly totalCompaniesCount = computed(() => this.corporateClients().length);

  readonly filteredClients = computed(() => {
    const q = this.searchTerm().trim().toLowerCase();
    const status = this.statusFilter();
    const tab = this.tabFilter();

    return this.corporateClients().filter((c) => {
      const matchesQuery =
        !q ||
        c.companyName.toLowerCase().includes(q) ||
        c.rnc.toLowerCase().includes(q) ||
        c.contactPerson.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q);

      if (!matchesQuery) return false;

      if (status !== 'TODOS' && c.status !== status) return false;

      if (tab === 'CON_SALDO') return c.currentBalance > 0;
      if (tab === 'AL_DIA') return c.currentBalance === 0;

      return true;
    });
  });

  // B2B Order Computeds
  readonly orderSubtotalGross = computed(() =>
    this.orderItems().reduce((acc, it) => acc + it.subtotal, 0)
  );

  readonly orderItbisTotal = computed(() =>
    this.orderItems().reduce((acc, it) => acc + it.itbis, 0)
  );

  readonly orderTotalAmount = computed(
    () => Math.round((this.orderSubtotalGross() + this.orderItbisTotal()) * 100) / 100
  );

  readonly postOrderPendingBalance = computed(() => {
    const client = this.selectedClientForSale();
    if (!client) return 0;
    return client.currentBalance + this.orderTotalAmount();
  });

  readonly postOrderAvailableCredit = computed(() => {
    const client = this.selectedClientForSale();
    if (!client) return 0;
    return Math.max(0, client.creditLimit - this.postOrderPendingBalance());
  });

  readonly postOrderCreditPercentage = computed(() => {
    const client = this.selectedClientForSale();
    if (!client || client.creditLimit <= 0) return 0;
    return Math.min(100, Math.round((this.postOrderPendingBalance() / client.creditLimit) * 100));
  });

  readonly isCreditAvailableSufficient = computed(() => {
    const client = this.selectedClientForSale();
    if (!client) return false;
    return this.orderTotalAmount() <= client.availableCredit;
  });

  constructor() {
    this.clientForm = this.fb.group({
      companyName: ['', [Validators.required, Validators.minLength(3)]],
      rnc: ['', [Validators.required, Validators.minLength(9)]],
      contactPerson: ['', Validators.required],
      phone: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      creditLimit: [500000, [Validators.required, Validators.min(0)]],
      creditDays: [30, [Validators.required, Validators.min(1)]],
    });
  }

  async ngOnInit(): Promise<void> {
    await this.loadProducts();
  }

  loadCorporateClients(): CorporateClient[] {
    try {
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem(STORAGE_CORP_CLIENTS);
        if (raw) return JSON.parse(raw);
      }
    } catch {}
    return [
      {
        id: 101,
        companyName: 'Supermercados Del Valle, SRL',
        rnc: '130-99887-1',
        contactPerson: 'Lic. Mariano Castillo',
        phone: '809-567-8900',
        email: 'compras@delvalle.com.do',
        creditLimit: 500000,
        creditDays: 30,
        currentBalance: 125400,
        availableCredit: 374600,
        activeOrdersCount: 2,
        status: 'Activo',
      },
      {
        id: 102,
        companyName: 'Distribuidora Norte, EIRL',
        rnc: '131-45678-9',
        contactPerson: 'Ing. Laura Bautista',
        phone: '809-556-1122',
        email: 'abastecimiento@norte.com.do',
        creditLimit: 300000,
        creditDays: 15,
        currentBalance: 0,
        availableCredit: 300000,
        activeOrdersCount: 0,
        status: 'Activo',
      },
      {
        id: 103,
        companyName: 'Cadena Hotelera Atlántico, SAS',
        rnc: '101-77889-4',
        contactPerson: 'Carlos Mendoza (Chef Ejecutivo & Compras)',
        phone: '829-887-4433',
        email: 'compras@atlantico.com.do',
        creditLimit: 750000,
        creditDays: 45,
        currentBalance: 420000,
        availableCredit: 330000,
        activeOrdersCount: 3,
        status: 'Activo',
      },
      {
        id: 104,
        companyName: 'Servicios Industriales Omega, SRL',
        rnc: '1234567897',
        contactPerson: 'Ludwig Cabrera',
        phone: '809-345-6677',
        email: 'compras@omega.com.do',
        creditLimit: 150000,
        creditDays: 30,
        currentBalance: 0,
        availableCredit: 150000,
        activeOrdersCount: 0,
        status: 'Activo',
      },
    ];
  }

  saveCorporateClients(list: CorporateClient[]): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_CORP_CLIENTS, JSON.stringify(list));
    }
    this.corporateClients.set(list);
  }

  async loadProducts(): Promise<void> {
    try {
      const res = await this.productService.getPagedProducts(1, 100);
      if (res?.success && res.data?.items) {
        this.products.set(res.data.items);
      }
    } catch {}
  }

  openNewClientModal(): void {
    this.clientForm.reset({ creditLimit: 500000, creditDays: 30 });
    this.isClientModalOpen.set(true);
  }

  saveCorporateClient(): void {
    if (this.clientForm.invalid) {
      this.clientForm.markAllAsTouched();
      return;
    }

    const val = this.clientForm.value;
    const limit = Number(val.creditLimit) || 500000;
    const newClient: CorporateClient = {
      id: Date.now(),
      companyName: val.companyName,
      rnc: val.rnc,
      contactPerson: val.contactPerson,
      phone: val.phone,
      email: val.email,
      creditLimit: limit,
      creditDays: Number(val.creditDays) || 30,
      currentBalance: 0,
      availableCredit: limit,
      activeOrdersCount: 0,
      status: 'Activo',
    };

    const current = [...this.corporateClients()];
    current.unshift(newClient);
    this.saveCorporateClients(current);
    this.notificationService.success(`Cliente corporativo "${newClient.companyName}" registrado exitosamente.`);
    this.isClientModalOpen.set(false);
  }

  openNewOrder(client: CorporateClient): void {
    this.selectedClientForSale.set(client);
    this.orderPoNumber.set(`OC-CD-2026-0${Math.floor(100 + Math.random() * 900)}`);
    this.orderItems.set([
      {
        productId: 1,
        code: 'DET-IND-04L',
        productName: 'Detergente líquido industrial 4 L',
        quantity: 10,
        unitPrice: 1650.0,
        itbis: 2970.0,
        subtotal: 16500.0,
      },
      {
        productId: 2,
        code: 'ACE-PRE-01L',
        productName: 'Aceite vegetal premium 1 L',
        quantity: 10,
        unitPrice: 580.0,
        itbis: 1044.0,
        subtotal: 5800.0,
      },
    ]);
    this.viewMode.set('new-order');
  }

  backToList(): void {
    this.viewMode.set('list');
  }

  updateItemQty(idx: number, delta: number): void {
    const items = [...this.orderItems()];
    const it = items[idx];
    if (!it) return;

    it.quantity = Math.max(1, it.quantity + delta);
    it.subtotal = Math.round(it.quantity * it.unitPrice * 100) / 100;
    it.itbis = Math.round(it.subtotal * 0.18 * 100) / 100;
    this.orderItems.set(items);
  }

  removeOrderItem(idx: number): void {
    const items = [...this.orderItems()];
    items.splice(idx, 1);
    this.orderItems.set(items);
  }

  addProductBySearch(term: string): void {
    if (!term || !term.trim()) return;
    const q = term.trim().toLowerCase();
    const p = this.products().find(
      (item) => item.description?.toLowerCase().includes(q) || item.barcode?.toLowerCase().includes(q)
    );
    if (p) {
      const price = Number((p as any).price || (p as any).priceList || 100);
      const subtotal = price;
      const itbis = Math.round(subtotal * 0.18 * 100) / 100;
      const items = [...this.orderItems()];
      items.push({
        productId: p.id!,
        code: p.barcode || `PROD-${p.id}`,
        productName: p.description || 'Producto',
        quantity: 1,
        unitPrice: price,
        itbis: itbis,
        subtotal: subtotal,
      });
      this.orderItems.set(items);
      this.productSearchInput.set('');
    } else {
      this.notificationService.info(`Producto "${term}" no encontrado.`);
    }
  }

  async approveAndInvoiceOrder(): Promise<void> {
    const client = this.selectedClientForSale();
    const items = this.orderItems();
    if (!client || items.length === 0) return;

    const total = this.orderTotalAmount();

    if (total > client.availableCredit) {
      this.notificationService.error(
        `Límite de crédito excedido: La orden (RD$ ${total.toFixed(2)}) supera el crédito disponible de la empresa (RD$ ${client.availableCredit.toFixed(2)}).`
      );
      return;
    }

    try {
      // Registrar venta a crédito
      await this.receivableService.createReceivable({
        customerId: client.id,
        customerName: client.companyName,
        customerPhone: client.phone,
        customerEmail: client.email,
        description: `Venta B2B Fiscal (${this.orderNcf()}) - OC: ${this.orderPoNumber()}`,
        totalAmount: total,
        installmentAmount: total,
        totalInstallments: 1,
        startDate: this.orderDueDate(),
        frequency: 'Mensual',
        downPayment: 0,
        items: items.map((it) => ({
          productId: it.productId,
          productName: it.productName,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          subtotal: it.subtotal,
        })),
      });

      // Actualizar saldos del cliente
      const clients = [...this.corporateClients()];
      const idx = clients.findIndex((c) => c.id === client.id);
      if (idx !== -1) {
        clients[idx].currentBalance += total;
        clients[idx].availableCredit = Math.max(0, clients[idx].creditLimit - clients[idx].currentBalance);
        clients[idx].activeOrdersCount += 1;
        this.saveCorporateClients(clients);
      }

      this.notificationService.success(
        `¡Orden comercial B2B aprobada y facturada con NCF B01 para ${client.companyName}! Stock rebajado exitosamente.`
      );
      this.viewMode.set('list');
    } catch {
      this.notificationService.error('Error al procesar la orden comercial B2B.');
    }
  }

  exportClients(): void {
    const rows = this.corporateClients().map((c) => ({
      Empresa: c.companyName,
      RNC: c.rnc,
      Contacto: c.contactPerson,
      Plazo: `${c.creditDays} días`,
      Limite: c.creditLimit,
      SaldoPendiente: c.currentBalance,
      CreditoDisponible: c.availableCredit,
      Estado: c.status,
    }));
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      ['Empresa,RNC,Contacto,Plazo,Limite,Saldo Pendiente,Credito Disponible,Estado']
        .concat(
          rows.map((r) =>
            `"${r.Empresa}","${r.RNC}","${r.Contacto}","${r.Plazo}",${r.Limite},${r.SaldoPendiente},${r.CreditoDisponible},"${r.Estado}"`
          )
        )
        .join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `clientes_corporativos_b2b_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
