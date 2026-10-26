import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CustomerService } from '../../../customers/services/customer.service';
import { SaleService } from '../../services/sale.service';
import { ProductService } from '../../../products/services/product.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { ReceivableService } from '../../services/receivable.service';
import type { CustomerDto, ProductDto, SaleResponseDto } from '../../../cuadreEnv/types/api';

interface CorporateClient {
  id: number;
  companyName: string;
  rnc: string;
  contactPerson: string;
  phone: string;
  email: string;
  creditLimit: number;
  creditDays: number; // 15, 30, 60
  currentBalance: number;
  availableCredit: number;
  activeOrdersCount: number;
  status: 'Activo' | 'Bloqueado por Mora' | 'En Revisión';
}

const STORAGE_CORP_CLIENTS = 'cuadreenv_corporate_clients_v1';

@Component({
  selector: 'app-corporate-sales',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink],
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

  isLoading = signal<boolean>(false);
  searchTerm = signal<string>('');
  selectedFilter = signal<'TODOS' | 'CON_SALDO' | 'AL_DIA' | 'BLOQUEADOS'>('TODOS');

  corporateClients = signal<CorporateClient[]>(this.loadCorporateClients());
  products = signal<ProductDto[]>([]);

  // Modal para nueva venta corporativa B2B
  isSaleModalOpen = signal<boolean>(false);
  selectedClientForSale = signal<CorporateClient | null>(null);
  orderItems = signal<{ productId: number; productName: string; quantity: number; unitPrice: number; total: number }[]>([]);
  orderNotes = signal<string>('');
  orderNcfType = signal<string>('B01'); // B01: Factura de Crédito Fiscal

  // Modal para nuevo cliente corporativo
  isClientModalOpen = signal<boolean>(false);
  clientForm: FormGroup;

  readonly totalCreditAssigned = computed(() =>
    this.corporateClients().reduce((sum, c) => sum + (c.creditLimit || 0), 0)
  );

  readonly totalReceivableBalance = computed(() =>
    this.corporateClients().reduce((sum, c) => sum + (c.currentBalance || 0), 0)
  );

  readonly filteredClients = computed(() => {
    const q = this.searchTerm().trim().toLowerCase();
    const filter = this.selectedFilter();

    return this.corporateClients().filter((c) => {
      const matchesQuery =
        !q ||
        c.companyName.toLowerCase().includes(q) ||
        c.rnc.toLowerCase().includes(q) ||
        c.contactPerson.toLowerCase().includes(q);

      if (!matchesQuery) return false;

      if (filter === 'CON_SALDO') return c.currentBalance > 0;
      if (filter === 'AL_DIA') return c.currentBalance === 0;
      if (filter === 'BLOQUEADOS') return c.status === 'Bloqueado por Mora';
      return true;
    });
  });

  constructor() {
    this.clientForm = this.fb.group({
      companyName: ['', [Validators.required, Validators.minLength(3)]],
      rnc: ['', [Validators.required, Validators.minLength(9)]],
      contactPerson: ['', Validators.required],
      phone: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      creditLimit: [100000, [Validators.required, Validators.min(0)]],
      creditDays: [30, [Validators.required, Validators.min(1)]],
    });
  }

  async ngOnInit(): Promise<void> {
    await this.syncWithSystemCustomers();
    await this.loadProducts();
  }

  private loadCorporateClients(): CorporateClient[] {
    try {
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem(STORAGE_CORP_CLIENTS);
        if (raw) return JSON.parse(raw);
      }
    } catch {}
    return [
      {
        id: 101,
        companyName: 'Supermercados Nacional & Almacenes SRL',
        rnc: '130-99887-1',
        contactPerson: 'Lic. Mariano Castillo',
        phone: '809-567-8900',
        email: 'compras@nacional.com.do',
        creditLimit: 500000,
        creditDays: 30,
        currentBalance: 125400,
        availableCredit: 374600,
        activeOrdersCount: 2,
        status: 'Activo',
      },
      {
        id: 102,
        companyName: 'Distribuidora Horeca del Este EIRL',
        rnc: '131-45678-9',
        contactPerson: 'Ing. Laura Bautista',
        phone: '809-556-1122',
        email: 'abastecimiento@horecaeste.com',
        creditLimit: 300000,
        creditDays: 15,
        currentBalance: 0,
        availableCredit: 300000,
        activeOrdersCount: 0,
        status: 'Activo',
      },
      {
        id: 103,
        companyName: 'Cadena Hotelera Caribe Resorts SAS',
        rnc: '101-77889-4',
        contactPerson: 'Carlos Mendoza (Chef Ejecutivo & Compras)',
        phone: '829-887-4433',
        email: 'cmendoza@cariberesorts.com',
        creditLimit: 750000,
        creditDays: 45,
        currentBalance: 420000,
        availableCredit: 330000,
        activeOrdersCount: 3,
        status: 'Activo',
      },
    ];
  }

  private saveCorporateClients(list: CorporateClient[]): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_CORP_CLIENTS, JSON.stringify(list));
    }
    this.corporateClients.set(list);
  }

  async syncWithSystemCustomers(): Promise<void> {
    this.isLoading.set(true);
    try {
      const res = await this.customerService.getCustomers();
      if (res?.success && res.data) {
        const clients = this.loadCorporateClients();
        // Merge any customer with RNC or business designation
        for (const c of res.data) {
          const clientRnc = c.rnc || c.identification;
          if (clientRnc && !clients.some((cl) => cl.rnc === clientRnc || (c.id && cl.id === c.id))) {
            clients.push({
              id: c.id ?? Date.now(),
              companyName: c.name,
              rnc: clientRnc,
              contactPerson: c.contactName || c.name,
              phone: c.phone || '',
              email: c.email || '',
              creditLimit: c.creditLimit || 150000,
              creditDays: 30,
              currentBalance: 0,
              availableCredit: c.creditLimit || 150000,
              activeOrdersCount: 0,
              status: 'Activo',
            });
          }
        }
        this.saveCorporateClients(clients);
      }
    } catch {
      // fallback
    } finally {
      this.isLoading.set(false);
    }
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
    this.clientForm.reset({ creditLimit: 100000, creditDays: 30 });
    this.isClientModalOpen.set(true);
  }

  saveCorporateClient(): void {
    if (this.clientForm.invalid) {
      this.clientForm.markAllAsTouched();
      return;
    }

    const val = this.clientForm.value;
    const newClient: CorporateClient = {
      id: Date.now(),
      companyName: val.companyName,
      rnc: val.rnc,
      contactPerson: val.contactPerson,
      phone: val.phone,
      email: val.email,
      creditLimit: Number(val.creditLimit) || 100000,
      creditDays: Number(val.creditDays) || 30,
      currentBalance: 0,
      availableCredit: Number(val.creditLimit) || 100000,
      activeOrdersCount: 0,
      status: 'Activo',
    };

    const current = [...this.corporateClients()];
    current.unshift(newClient);
    this.saveCorporateClients(current);
    this.notificationService.success(`Cliente corporativo "${newClient.companyName}" registrado exitosamente.`);
    this.isClientModalOpen.set(false);
  }

  openSaleModal(client: CorporateClient): void {
    this.selectedClientForSale.set(client);
    this.orderItems.set([]);
    this.orderNotes.set('');
    this.orderNcfType.set('B01'); // Valor Fiscal
    this.isSaleModalOpen.set(true);
  }

  addOrderItem(productId: number): void {
    const p = this.products().find((prod) => prod.id === productId);
    if (!p) return;

    const items = [...this.orderItems()];
    const existing = items.find((i) => i.productId === productId);
    const price = Number((p as any).price || p.cost || 100);

    if (existing) {
      existing.quantity += 1;
      existing.total = Math.round(existing.quantity * existing.unitPrice * 100) / 100;
      this.orderItems.set(items);
    } else {
      items.push({
        productId: p.id!,
        productName: p.description || 'Producto',
        quantity: 1,
        unitPrice: price,
        total: price,
      });
      this.orderItems.set(items);
    }
  }

  updateItemQty(idx: number, delta: number): void {
    const items = [...this.orderItems()];
    const it = items[idx];
    if (!it) return;

    it.quantity = Math.max(1, it.quantity + delta);
    it.total = Math.round(it.quantity * it.unitPrice * 100) / 100;
    this.orderItems.set(items);
  }

  removeOrderItem(idx: number): void {
    const items = [...this.orderItems()];
    items.splice(idx, 1);
    this.orderItems.set(items);
  }

  getOrderSubtotal(): number {
    return this.orderItems().reduce((acc, it) => acc + it.total, 0);
  }

  getOrderItbis(): number {
    return Math.round(this.getOrderSubtotal() * 0.18 * 100) / 100;
  }

  getOrderTotal(): number {
    return Math.round((this.getOrderSubtotal() + this.getOrderItbis()) * 100) / 100;
  }

  async processCorporateSale(): Promise<void> {
    const client = this.selectedClientForSale();
    const items = this.orderItems();
    if (!client || items.length === 0) return;

    const total = this.getOrderTotal();

    // Validar línea de crédito
    if (total > client.availableCredit) {
      this.notificationService.error(
        `Límite de crédito excedido: La orden (RD$ ${total.toFixed(2)}) supera el crédito disponible de la empresa (RD$ ${client.availableCredit.toFixed(2)}).`
      );
      return;
    }

    try {
      // 1. Crear Venta a Crédito en ReceivableService
      await this.receivableService.createReceivable({
        customerId: client.id,
        customerName: client.companyName,
        customerPhone: client.phone,
        customerEmail: client.email,
        description: `Venta Corporativa Fiscal (${this.orderNcfType()}) - ${this.orderNotes() || 'Orden B2B a crédito'}`,
        totalAmount: total,
        installmentAmount: total,
        totalInstallments: 1,
        startDate: new Date(Date.now() + client.creditDays * 86400000).toISOString(),
        frequency: 'Mensual',
        downPayment: 0,
        items: items.map((it) => ({
          productId: it.productId,
          productName: it.productName,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          subtotal: it.total,
        })),
      });

      // 2. Actualizar balance del cliente corporativo
      const clients = [...this.corporateClients()];
      const idx = clients.findIndex((c) => c.id === client.id);
      if (idx !== -1) {
        clients[idx].currentBalance += total;
        clients[idx].availableCredit = Math.max(0, clients[idx].creditLimit - clients[idx].currentBalance);
        clients[idx].activeOrdersCount += 1;
        this.saveCorporateClients(clients);
      }

      this.notificationService.success(
        `Orden corporativa B2B procesada para "${client.companyName}". Factura ${this.orderNcfType()} y cuenta por cobrar generadas exitosamente.`
      );
      this.isSaleModalOpen.set(false);
    } catch (e: any) {
      this.notificationService.error('Error al procesar la venta corporativa.');
    }
  }
}
