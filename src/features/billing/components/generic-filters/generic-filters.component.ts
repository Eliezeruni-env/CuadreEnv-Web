import {
  Component,
  EventEmitter,
  OnInit,
  Output,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CustomerService } from '../../../customers/services/customer.service';
import type { CustomerDto } from '../../../cuadreEnv/types/api';

export interface BillingFilterValues {
  documentNumber?: string;
  clientId?: number | null;
  statusId?: number | null;
  startDate?: string;
  endDate?: string;
}

@Component({
  selector: 'app-generic-filters',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './generic-filters.component.html',
  styleUrls: ['./generic-filters.component.scss'],
})
export class GenericFiltersComponent implements OnInit {
  private customerService = inject(CustomerService);

  @Output() filtersChange = new EventEmitter<BillingFilterValues>();

  customers = signal<CustomerDto[]>([]);

  filterValues: BillingFilterValues = {
    documentNumber: '',
    clientId: null,
    statusId: null,
    startDate: '',
    endDate: '',
  };

  async ngOnInit() {
    try {
      const res = await this.customerService.getCustomers();
      if (res?.success && res.data) {
        this.customers.set(res.data);
      }
    } catch {
      // ignore
    }
  }

  emitFilters() {
    this.filtersChange.emit({ ...this.filterValues });
  }

  resetFilters() {
    this.filterValues = {
      documentNumber: '',
      clientId: null,
      statusId: null,
      startDate: '',
      endDate: '',
    };
    this.emitFilters();
  }
}
