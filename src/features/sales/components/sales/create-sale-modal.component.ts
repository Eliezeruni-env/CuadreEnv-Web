import { Component, Input, Output, EventEmitter, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormArray } from '@angular/forms';
import { ProductService } from '../../../products/services/product.service';
import { CustomerService } from '../../../customers/services/customer.service';
import { CashRegisterService } from '../../../cash-register/services/cash-register.service';
import { SaleService } from '../../services/sale.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import type { ProductDto, CustomerDto, CashRegisterDto } from '../../../cuadreEnv/types/api';
import { TranslationService } from '../../../cuadreEnv/services/translation.service';
import { IconDirective } from '@coreui/icons-angular';
import {
  ButtonDirective,
  ColComponent,
  FormControlDirective,
  FormDirective,
  RowComponent,
  SpinnerComponent,
  FormSelectDirective,
} from '@coreui/angular';

@Component({
  selector: 'app-create-sale-modal',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonDirective,
    FormControlDirective,
    FormDirective,
    RowComponent,
    ColComponent,
    SpinnerComponent,
    FormSelectDirective,
    IconDirective,
  ],
  templateUrl: './create-sale-modal.component.html',
})
export class CreateSaleModalComponent implements OnInit {
  readonly translationService = inject(TranslationService);
  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() saved = new EventEmitter<void>();

  products = signal<ProductDto[]>([]);
  customers = signal<CustomerDto[]>([]);
  registers = signal<CashRegisterDto[]>([]);
  isLoading = signal<boolean>(false);

  saleForm: FormGroup;

  constructor(
    private productService: ProductService,
    private customerService: CustomerService,
    private registerService: CashRegisterService,
    private saleService: SaleService,
    private notificationService: NotificationService,
    private fb: FormBuilder,
  ) {
    this.saleForm = this.fb.group({
      customerId: [''],
      cashRegisterId: [''],
      paidAmount: [0, [Validators.required, Validators.min(0)]],
      items: this.fb.array([], [Validators.required]),
    });
  }

  get items(): FormArray {
    return this.saleForm.get('items') as FormArray;
  }

  ngOnInit() {
    this.loadInitialData();
  }

  async loadInitialData() {
    try {
      const pRes = await this.productService.getPagedProducts(1, 100);
      if (pRes.success && pRes.data) {
        this.products.set(pRes.data.items || []);
      }

      const cRes = await this.customerService.getCustomers({
        pageNumber: 1,
        pageSize: 100,
      });
      if (cRes.success && cRes.data) {
        this.customers.set(cRes.data);
      }

      const rRes = await this.registerService.getCashRegisters();
      if (rRes.success && rRes.data) {
        this.registers.set(rRes.data);
      }
    } catch (e: any) {
      console.error('Failed to load modal dependencies:', e?.message || e);
    }
  }

  open() {
    this.visible = true;
    this.visibleChange.emit(true);
  }

  close() {
    this.visible = false;
    this.visibleChange.emit(false);
    this.resetForm();
  }

  addItem() {
    const itemGroup = this.fb.group({
      productId: ['', Validators.required],
      quantity: [1, [Validators.required, Validators.min(1)]],
      unitPrice: [0, [Validators.required, Validators.min(0)]],
    });

    itemGroup.get('productId')?.valueChanges.subscribe((prodId) => {
      const p = this.products().find((x) => x.id === Number(prodId));
      if (p) {
        const price = p.cost ? p.cost * 1.3 : 0;
        itemGroup.patchValue({ unitPrice: price }, { emitEvent: false });
        this.recalculatePaid();
      }
    });

    itemGroup.get('quantity')?.valueChanges.subscribe(() => {
      this.recalculatePaid();
    });

    itemGroup.get('unitPrice')?.valueChanges.subscribe(() => {
      this.recalculatePaid();
    });

    this.items.push(itemGroup);
  }

  removeItem(index: number) {
    this.items.removeAt(index);
    this.recalculatePaid();
  }

  calculateTotal(): number {
    let total = 0;
    for (const control of this.items.controls) {
      const q = control.get('quantity')?.value || 0;
      const p = control.get('unitPrice')?.value || 0;
      total += q * p;
    }
    return total;
  }

  recalculatePaid() {
    this.saleForm.patchValue({ paidAmount: this.calculateTotal() });
  }

  resetForm() {
    this.saleForm.reset({
      customerId: '',
      cashRegisterId: '',
      paidAmount: 0,
    });
    this.items.clear();
  }

  async saveSale() {
    if (this.saleForm.invalid || this.items.length === 0) {
      this.saleForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);

    const val = this.saleForm.value;
    const total = this.calculateTotal();

    const payload = {
      customerId: val.customerId ? Number(val.customerId) : null,
      cashRegisterId: val.cashRegisterId ? Number(val.cashRegisterId) : null,
      total: total,
      paidAmount: Number(val.paidAmount),
      details: val.items.map((i: any) => ({
        productId: Number(i.productId),
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
      })),
    };

    try {
      await this.saleService.createSale(payload);
      this.notificationService.success(this.translationService.t('sales.modal.createdSuccess'));
      this.saved.emit();
      this.close();
    } catch (e: any) {
      this.notificationService.showApiError(e);
    } finally {
      this.isLoading.set(false);
    }
  }
}
