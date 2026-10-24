import {
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CustomerService } from '../../../customers/services/customer.service';
import { TaxpayerService } from '../../services/taxpayer.service';
import { WarehouseService } from '../../../inventory/services/warehouse.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import type { CustomerDto } from '../../../cuadreEnv/types/api';
import type { HeaderDto } from '../../../../app/models/billing';
import type { Warehouse } from '../../../../app/models/warehouse';

@Component({
  selector: 'app-client-search',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './client-search.component.html',
  styleUrls: ['./client-search.component.scss'],
})
export class ClientSearchComponent implements OnInit {
  private customerService = inject(CustomerService);
  private taxpayerService = inject(TaxpayerService);
  private warehouseService = inject(WarehouseService);
  private notificationService = inject(NotificationService);

  @Input() set initialHeader(h: HeaderDto | null | undefined) {
    if (h) {
      this.header = { ...h };
    }
  }

  @Output() headerChange = new EventEmitter<HeaderDto>();

  customers = signal<CustomerDto[]>([]);
  warehouses = signal<Warehouse[]>([]);
  isSearchingRnc = signal<boolean>(false);
  rncSearchInput = signal<string>('');

  header: HeaderDto = {
    clientId: 1,
    clientName: 'Consumidor Final',
    billingTypeId: 1, // Contado
    voucherTypeId: 1, // Consumidor Final B02
    warehouseId: 1,
    rncOrCedula: '000-0000000-0',
    paymentTermDays: 30,
  };

  async ngOnInit() {
    await Promise.all([this.loadCustomers(), this.loadWarehouses()]);
    this.emitHeader();
  }

  async loadWarehouses() {
    try {
      const res = await this.warehouseService.getWarehouses();
      if (res?.success && res.data && res.data.length > 0) {
        this.warehouses.set(res.data);
        const match = res.data.find((w) => w.id === this.header.warehouseId);
        if (!match) {
          const mainWh = res.data.find((w) => w.isMain) || res.data[0];
          this.header.warehouseId = mainWh.id;
        }
      } else {
        this.warehouses.set([]);
      }
    } catch {
      this.warehouses.set([]);
    }
  }

  async loadCustomers() {
    try {
      const res = await this.customerService.getCustomers();
      if (res?.success && res.data) {
        this.customers.set(res.data);
      }
    } catch {
      // Fallback customer
      this.customers.set([
        { id: 1, name: 'Consumidor Final', identification: '000-0000000-0' } as any,
      ]);
    }
  }

  async searchTaxpayerByRnc() {
    const raw = this.rncSearchInput();
    const clean = this.taxpayerService.normalizeDocument(raw);
    if (!clean || clean.length < 9) {
      this.notificationService.warning('Ingresa un RNC (9 dígitos) o Cédula (11 dígitos) válido.');
      return;
    }

    this.isSearchingRnc.set(true);
    try {
      const res = await this.taxpayerService.getTaxpayer(clean);
      if (res.success && res.data) {
        const tp = res.data;
        const formatted = this.taxpayerService.formatDocument(tp.rnc);
        this.header.clientName = tp.commercialName || tp.name;
        this.header.rncOrCedula = formatted;
        this.header.voucherTypeId = 2; // Auto-seleccionar B01 Crédito Fiscal
        this.notificationService.success(`RNC Validado: ${tp.name} (${tp.status})`);
        this.emitHeader();
      } else {
        this.notificationService.error(res.message || 'RNC no encontrado en el padrón de la DGII.');
      }
    } catch (e: any) {
      this.notificationService.showApiError(e);
    } finally {
      this.isSearchingRnc.set(false);
    }
  }

  onClientSelected(clientId: number) {
    const cust = this.customers().find((c) => c.id === clientId);
    if (cust) {
      this.header.clientName = cust.name;
      this.header.rncOrCedula = cust.identification || '';
      // If client has tax ID, suggest B01 (Crédito fiscal)
      if (cust.identification && cust.identification.length > 5 && this.header.voucherTypeId === 1) {
        this.header.voucherTypeId = 2;
      }
    }
    this.emitHeader();
  }

  resetClient() {
    this.header.clientId = 1;
    this.header.clientName = 'Consumidor Final';
    this.header.rncOrCedula = '000-0000000-0';
    this.header.voucherTypeId = 1;
    this.rncSearchInput.set('');
    this.emitHeader();
  }

  emitHeader() {
    this.headerChange.emit({ ...this.header });
  }
}
