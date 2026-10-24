import {
  Component,
  OnInit,
  signal,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ServiceService } from '../../../services/services/service.service';
import { CustomerService } from '../../../customers/services/customer.service';
import { CashRegisterService } from '../../../cash-register/services/cash-register.service';
import { SaleService } from '../../services/sale.service';
import { ReceivableService } from '../../services/receivable.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { TranslationService } from '../../../cuadreEnv/services/translation.service';
import { IconDirective } from '@coreui/icons-angular';
import { type CustomerDto } from '../../../cuadreEnv/types/api';
import {
  SpinnerComponent,
} from '@coreui/angular';
import {
  SaleCompletedModalComponent,
  type CompletedSaleDto,
} from '../sales/sale-completed-modal.component';

export interface ServiceCartItem {
  serviceId: number;
  serviceCode: string;
  serviceName: string;
  unitPrice: number;
  quantity: number;
}

@Component({
  selector: 'app-service-sale-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    FormsModule,
    ReactiveFormsModule,
    IconDirective,
    SpinnerComponent,
    SaleCompletedModalComponent,
  ],
  templateUrl: './service-sale-page.component.html',
  styleUrls: ['./service-sale-page.component.scss'],
})
export class ServiceSalePageComponent implements OnInit {
  readonly translationService = inject(TranslationService);
  private serviceService = inject(ServiceService);
  private customerService = inject(CustomerService);
  private registerService = inject(CashRegisterService);
  private saleService = inject(SaleService);
  private receivableService = inject(ReceivableService);
  private notificationService = inject(NotificationService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  customers = signal<CustomerDto[]>([]);
  servicesList = signal<{ id: number; code: string; description: string; price: number }[]>([]);

  selectedCustomerId: number | null = null;
  paymentMode: 'CASH' | 'CREDIT' = 'CASH';
  dueDate: string = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Selection
  selectedServiceId: number | null = null;
  serviceQuantity = 1;

  // Cart
  cart: ServiceCartItem[] = [];
  serviceNotes = '';
  applyItbis = true;

  isSubmitting = false;

  // Receipt modal
  isSaleCompletedModalOpen = false;
  lastCompletedSale: CompletedSaleDto | null = null;

  get subtotal(): number {
    return this.cart.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0);
  }

  get itbisAmount(): number {
    return this.applyItbis ? Math.round(this.subtotal * 0.18 * 100) / 100 : 0;
  }

  get totalAmount(): number {
    return this.subtotal + this.itbisAmount;
  }

  ngOnInit() {
    this.loadData();
  }

  async loadData() {
    try {
      const [custRes, services] = await Promise.all([
        this.customerService.getCustomers({ pageNumber: 1, pageSize: 100 } as any),
        this.serviceService.getServices({ activeOnly: true }),
      ]);

      if (custRes?.success && custRes.data) {
        this.customers.set(custRes.data);
      }

      const formatted = services.map((s) => ({
        id: s.id ?? 0,
        code: s.code,
        description: s.name,
        price: Number(s.price || 0),
      }));
      this.servicesList.set(formatted);

      // Check query params for preselected service
      const queryServiceId = this.route.snapshot.queryParams['serviceId'];
      if (queryServiceId) {
        const idNum = Number(queryServiceId);
        const match = formatted.find((s) => s.id === idNum);
        if (match) {
          this.cart.push({
            serviceId: match.id,
            serviceCode: match.code,
            serviceName: match.description,
            unitPrice: match.price,
            quantity: 1,
          });
        }
      }
    } catch (e) {
      console.error('Error loading service sale data:', e);
    }
  }

  onCustomerChange(event: any) {
    const val = event.target.value;
    this.selectedCustomerId = val ? Number(val) : null;
  }

  setPaymentMode(mode: 'CASH' | 'CREDIT') {
    this.paymentMode = mode;
  }

  addSelectedService() {
    if (!this.selectedServiceId || this.serviceQuantity <= 0) return;

    const found = this.servicesList().find((s) => s.id === this.selectedServiceId);
    if (!found) return;

    const existing = this.cart.find((c) => c.serviceId === this.selectedServiceId);
    if (existing) {
      existing.quantity += Number(this.serviceQuantity);
    } else {
      this.cart.push({
        serviceId: found.id,
        serviceCode: found.code,
        serviceName: found.description,
        unitPrice: found.price,
        quantity: Number(this.serviceQuantity),
      });
    }

    this.selectedServiceId = null;
    this.serviceQuantity = 1;
  }

  removeCartItem(index: number) {
    this.cart.splice(index, 1);
  }

  updateItemPrice(index: number, price: number) {
    if (this.cart[index]) {
      this.cart[index].unitPrice = Number(price) || 0;
    }
  }

  updateQuantity(index: number, delta: number) {
    if (this.cart[index]) {
      const next = this.cart[index].quantity + delta;
      if (next <= 0) {
        this.removeCartItem(index);
      } else {
        this.cart[index].quantity = next;
      }
    }
  }

  async submitSale() {
    if (this.cart.length === 0) {
      this.notificationService.warning('Debes agregar al menos un servicio a la venta.');
      return;
    }

    this.isSubmitting = true;

    try {
      let cashRegisterId: number | null = null;
      if (this.paymentMode === 'CASH') {
        const sessionRes = await this.registerService.getActiveSession();
        if (sessionRes?.success && sessionRes.data) {
          cashRegisterId = sessionRes.data.id;
        }
      }

      const salePayload: any = {
        customerId: this.selectedCustomerId,
        cashRegisterId: cashRegisterId,
        total: this.totalAmount,
        paidAmount: this.paymentMode === 'CASH' ? this.totalAmount : 0,
        dueDate: this.paymentMode === 'CREDIT' ? this.dueDate : null,
        originChannel: 'SERVICIO',
        paymentType: this.paymentMode === 'CASH' ? 'CASH' : 'CREDIT',
        paymentMethod: this.paymentMode === 'CASH' ? 'CASH' : 'OTHER',
        notes: this.serviceNotes ? `[SERVICIO] ${this.serviceNotes.trim()}` : '[SERVICIO] Factura de Servicios',
        payment: this.paymentMode === 'CASH' ? {
          method: 'CASH',
          amount: this.totalAmount,
          amountReceived: this.totalAmount,
          changeAmount: 0,
        } : undefined,
        details: this.cart.map((item) => ({
          productId: item.serviceId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      };

      const saleRes = await this.saleService.createSale(salePayload);
      const createdSaleId = saleRes?.data?.id || (saleRes as any)?.id;

      if (this.paymentMode === 'CASH' && cashRegisterId) {
        await this.registerService.addMovement({
          type: 'Entrada',
          category: 'Ventas',
          description: `Venta de Servicios #${createdSaleId || 'Servicio'} ${this.serviceNotes ? '(' + this.serviceNotes + ')' : ''}`,
          amount: this.totalAmount,
        });
      }

      if (this.paymentMode === 'CREDIT') {
        const customerName = this.customers().find((c) => c.id === this.selectedCustomerId)?.name || 'Cliente';
        await this.receivableService.createReceivable({
          customerId: this.selectedCustomerId,
          customerName: customerName,
          description: `Venta de Servicios #${createdSaleId || 'Servicio'} - ${this.serviceNotes || 'Mano de obra'}`,
          totalAmount: this.totalAmount,
          installmentAmount: this.totalAmount,
          totalInstallments: 1,
          startDate: this.dueDate,
          frequency: 'Mensual',
        });
      }

      this.notificationService.success(
        `Venta de servicios registrada exitosamente por RD$ ${this.totalAmount.toLocaleString('es-DO', { minimumFractionDigits: 2 })}.`,
      );

      const cust = this.customers().find((c) => c.id === this.selectedCustomerId);
      this.lastCompletedSale = {
        id: createdSaleId,
        invoiceNumber: `VTA-SERV-${String(createdSaleId || Date.now()).slice(-6)}`,
        date: new Date().toISOString(),
        customerName: cust?.name || 'Consumidor final',
        customerRnc: cust?.identification || '000-0000000-0',
        cashRegisterName: cashRegisterId ? `Caja #${cashRegisterId}` : 'Venta Directa',
        cashierName: 'Admin',
        paymentMethod: this.paymentMode === 'CASH' ? 'Efectivo / Contado' : 'Crédito',
        subtotal: Math.round((this.totalAmount / 1.18) * 100) / 100,
        discount: 0,
        itbis: Math.round((this.totalAmount - (this.totalAmount / 1.18)) * 100) / 100,
        total: this.totalAmount,
        amountReceived: this.paymentMode === 'CASH' ? this.totalAmount : 0,
        change: 0,
        notes: this.serviceNotes || undefined,
        items: this.cart.map((it) => ({
          productId: it.serviceId,
          productCode: it.serviceCode,
          productName: it.serviceName,
          unitPrice: it.unitPrice,
          quantity: it.quantity,
          total: it.quantity * it.unitPrice,
        })),
      };

      this.isSaleCompletedModalOpen = true;
    } catch (e: any) {
      console.error('Error submitting service sale:', e);
      this.notificationService.showApiError(e);
    } finally {
      this.isSubmitting = false;
    }
  }

  submitServiceSale() {
    return this.submitSale();
  }

  onReceiptClosed() {
    this.onModalDismissed();
  }

  onModalDismissed() {
    this.isSaleCompletedModalOpen = false;
    this.router.navigate(['/sales']);
  }

  printInvoice() {
    window.print();
  }
}
