import {
  Component,
  Input,
  Output,
  EventEmitter,
  inject,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CreditNoteService } from '../../services/credit-note.service';
import { CashRegisterService } from '../../../cash-register/services/cash-register.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { TranslationService } from '../../../cuadreEnv/services/translation.service';
import { IconDirective } from '@coreui/icons-angular';
import { SpinnerComponent } from '@coreui/angular';
import type { CreditNote } from '../../../../app/models/credit-note';
import type { ProductDetails } from '../../../../app/models/product-details';

@Component({
  selector: 'app-credit-note-form',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IconDirective,
    SpinnerComponent,
  ],
  templateUrl: './credit-note-form.component.html',
  styleUrls: ['./credit-note-form.component.scss'],
})
export class CreditNoteFormComponent implements OnInit {
  readonly translationService = inject(TranslationService);
  private creditNoteService = inject(CreditNoteService);
  private cashRegisterService = inject(CashRegisterService);
  private notificationService = inject(NotificationService);

  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() creditNoteCreated = new EventEmitter<CreditNote>();

  currentStep = 1;

  // Step 1: Invoice Lookup
  searchInvoiceTerm = '';
  isSearchingInvoice = false;
  loadedInvoice: {
    saleId: number;
    billingNumber: string;
    clientId: number;
    clientName: string;
    clientRnc?: string;
    originalNcf: string;
    warehouseId: number;
    warehouseName?: string;
    creationDate: string;
    items: ProductDetails[];
  } | null = null;

  // Step 2: Selection and configuration
  selectedProductIds = new Set<number>();
  returnQuantities: { [productId: number]: number } = {};
  creditNoteType = 1; // 1: Total, 2: Parcial, 3: Ajuste
  refundMethod: 'CASH' | 'CREDIT' | 'BALANCE' = 'CASH';
  observations = '';

  // Step 3: Submission
  isSubmitting = false;

  ngOnInit() {}

  open(preloadedInvoiceId?: string) {
    this.resetForm();
    this.visible = true;
    this.visibleChange.emit(true);

    if (preloadedInvoiceId) {
      this.searchInvoiceTerm = preloadedInvoiceId;
      this.searchInvoice();
    }
  }

  close() {
    this.visible = false;
    this.visibleChange.emit(false);
  }

  resetForm() {
    this.currentStep = 1;
    this.searchInvoiceTerm = '';
    this.loadedInvoice = null;
    this.selectedProductIds.clear();
    this.returnQuantities = {};
    this.creditNoteType = 1;
    this.refundMethod = 'CASH';
    this.observations = '';
  }

  nextStep() {
    if (this.currentStep < 3) {
      this.currentStep++;
    }
  }

  prevStep() {
    if (this.currentStep > 1) {
      this.currentStep--;
    }
  }

  async searchInvoice() {
    if (!this.searchInvoiceTerm.trim()) return;

    this.isSearchingInvoice = true;
    try {
      const res = await this.creditNoteService.searchInvoiceForCreditNote(
        this.searchInvoiceTerm,
      );

      if (res.success && res.data) {
        this.loadedInvoice = res.data;
        this.selectedProductIds.clear();
        this.returnQuantities = {};

        // Auto-select eligible products
        res.data.items.forEach((item: ProductDetails) => {
          if ((item.maxReturnQuantity || 0) > 0) {
            this.selectedProductIds.add(item.productId);
            this.returnQuantities[item.productId] = item.maxReturnQuantity || 1;
          }
        });

        this.notificationService.success(
          `Factura ${res.data.billingNumber} cargada con ${res.data.items.length} productos.`,
        );
      } else {
        this.notificationService.error(
          res.message || 'No se encontró la factura especificada.',
        );
      }
    } catch (e: any) {
      this.notificationService.showApiError(e);
    } finally {
      this.isSearchingInvoice = false;
    }
  }

  toggleItemSelection(productId: number) {
    if (this.selectedProductIds.has(productId)) {
      this.selectedProductIds.delete(productId);
    } else {
      this.selectedProductIds.add(productId);
      if (!this.returnQuantities[productId]) {
        this.returnQuantities[productId] = 1;
      }
    }
  }

  isAllSelected(): boolean {
    if (!this.loadedInvoice) return false;
    const availableItems = this.loadedInvoice.items.filter(
      (it) => (it.maxReturnQuantity || 0) > 0,
    );
    return (
      availableItems.length > 0 &&
      availableItems.every((it) => this.selectedProductIds.has(it.productId))
    );
  }

  toggleSelectAll(event: any) {
    if (!this.loadedInvoice) return;
    const checked = event.target.checked;
    if (checked) {
      this.loadedInvoice.items.forEach((item) => {
        if ((item.maxReturnQuantity || 0) > 0) {
          this.selectedProductIds.add(item.productId);
          if (!this.returnQuantities[item.productId]) {
            this.returnQuantities[item.productId] = item.maxReturnQuantity || 1;
          }
        }
      });
    } else {
      this.selectedProductIds.clear();
    }
  }

  updateReturnQuantity(productId: number, val: number, max: number) {
    const safeVal = Math.max(1, Math.min(max, Number(val) || 1));
    this.returnQuantities[productId] = safeVal;
  }

  getItemSubtotal(item: ProductDetails): number {
    const qty = this.returnQuantities[item.productId] || 1;
    const disc = (item.price * qty * (item.discountPercentage || 0)) / 100;
    return item.price * qty - disc;
  }

  getItemItbis(item: ProductDetails): number {
    const sub = this.getItemSubtotal(item);
    return Math.round(sub * 0.18 * 100) / 100;
  }

  get calculatedSubtotal(): number {
    if (!this.loadedInvoice) return 0;
    return this.loadedInvoice.items
      .filter((it) => this.selectedProductIds.has(it.productId))
      .reduce((acc, it) => acc + this.getItemSubtotal(it), 0);
  }

  get calculatedItbis(): number {
    if (!this.loadedInvoice) return 0;
    return this.loadedInvoice.items
      .filter((it) => this.selectedProductIds.has(it.productId))
      .reduce((acc, it) => acc + this.getItemItbis(it), 0);
  }

  get calculatedTotal(): number {
    return this.calculatedSubtotal + this.calculatedItbis;
  }

  getSelectedItemsList(): ProductDetails[] {
    if (!this.loadedInvoice) return [];
    return this.loadedInvoice.items.filter((it) =>
      this.selectedProductIds.has(it.productId),
    );
  }

  async emitCreditNote() {
    if (!this.loadedInvoice || this.selectedProductIds.size === 0) {
      this.notificationService.warning('Seleccione al menos un producto a devolver.');
      return;
    }

    this.isSubmitting = true;

    try {
      let activeSessionId: number | undefined;
      const sessionRes = await this.cashRegisterService.getActiveSession();
      if (sessionRes?.success && sessionRes.data) {
        activeSessionId = sessionRes.data.id;
      }

      const returnDetails: ProductDetails[] = this.getSelectedItemsList().map(
        (it) => {
          const qty = this.returnQuantities[it.productId] || 1;
          const sub = this.getItemSubtotal(it);
          const itbis = this.getItemItbis(it);
          return {
            ...it,
            quantity: qty,
            subTotal: sub,
            itbisAmount: itbis,
            totalAmount: sub + itbis,
          };
        },
      );

      const notePayload: CreditNote = {
        billingId: this.loadedInvoice.saleId,
        billingNumber: this.loadedInvoice.billingNumber,
        customerId: this.loadedInvoice.clientId,
        customerName: this.loadedInvoice.clientName,
        cashSessionId: this.refundMethod === 'CASH' ? activeSessionId : undefined,
        statusId: 1,
        creditNoteType: this.creditNoteType,
        ncf: '', // Asignado exclusivamente por el servidor backend transaccional
        originalNcf: this.loadedInvoice.originalNcf,
        warehouseId: this.loadedInvoice.warehouseId,
        amountSubTotal: this.calculatedSubtotal,
        amountDesc: 0,
        amountItbis: this.calculatedItbis,
        amountTotal: this.calculatedTotal,
        creditNoteDetails: returnDetails,
        refundMethod: this.refundMethod,
        observations: this.observations || `Devolución de factura ${this.loadedInvoice.billingNumber}`,
      };

      const res = await this.creditNoteService.createCreditNote(notePayload);

      if (res.success && res.data) {
        this.notificationService.success(
          `Nota de Crédito ${res.data.creditNoteNumber} (NCF: ${res.data.ncf}) emitida exitosamente por RD$ ${this.calculatedTotal.toLocaleString('es-DO', { minimumFractionDigits: 2 })}.`,
        );
        this.creditNoteCreated.emit(res.data);
        this.close();
      } else {
        this.notificationService.error(res.message || 'Error al emitir la nota de crédito.');
      }
    } catch (e: any) {
      this.notificationService.showApiError(e);
    } finally {
      this.isSubmitting = false;
    }
  }
}
