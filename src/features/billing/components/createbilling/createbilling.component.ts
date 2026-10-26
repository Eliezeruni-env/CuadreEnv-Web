import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { BillingService } from '../../services/billing.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { ClientSearchComponent } from '../client-search/client-search.component';
import { ProductSearchComponent } from '../product-search/product-search.component';
import { ProductTableComponent } from '../product-table/product-table.component';
import type { HeaderDto, ProductDetails } from '../../../../app/models/billing';

@Component({
  selector: 'app-createbilling',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ClientSearchComponent,
    ProductSearchComponent,
    ProductTableComponent,
  ],
  templateUrl: './createbilling.component.html',
  styleUrls: ['./createbilling.component.scss'],
})
export class CreatebillingComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private billingService = inject(BillingService);
  private notificationService = inject(NotificationService);

  isQuotationConversion = false;
  quotationId: string | null = null;
  isSubmitting = false;

  currentHeader: HeaderDto = {
    clientId: 1,
    clientName: 'Consumidor Final',
    billingTypeId: 1,
    voucherTypeId: 1,
    warehouseId: 1,
    rncOrCedula: '000-0000000-0',
    paymentTermDays: 30,
  };

  productDetails: ProductDetails[] = [];
  detailToEdit: (ProductDetails & { _editIndex?: number }) | null = null;

  async ngOnInit() {
    this.route.params.subscribe(async (params) => {
      const qId =
        params['quotationNo'] || params['quotationId'] || params['id'];
      if (qId) {
        this.isQuotationConversion = true;
        this.quotationId = qId;
        await this.loadQuotationData(qId);
      }
    });
  }

  async loadQuotationData(qId: string) {
    try {
      const res = await this.billingService.getQuotationForBilling(qId);
      if (res?.success && res.data) {
        this.currentHeader = { ...res.data.header };
        this.productDetails = [...res.data.items];
        this.notificationService.info(
          `Datos precargados desde la cotización #${qId}.`,
        );
      }
    } catch (e) {
      console.error('Error cargando cotización:', e);
    }
  }

  onHeaderChange(header: HeaderDto) {
    this.currentHeader = { ...header };
  }

  onProductAdded(detail: ProductDetails) {
    // Check if product already exists to increase quantity
    const existingIndex = this.productDetails.findIndex(
      (p) => p.productId === detail.productId,
    );

    if (existingIndex >= 0) {
      const existing = this.productDetails[existingIndex];
      existing.quantity += detail.quantity;
      const line = this.billingService.calculateLineTotals(
        existing.price,
        existing.quantity,
        existing.discountPercentage,
        existing.itbisPercentage,
      );
      existing.discountAmount = line.discountAmount;
      existing.subTotal = line.subTotal;
      existing.itbisAmount = line.itbisAmount;
      existing.totalAmount = line.totalAmount;
      this.productDetails = [...this.productDetails];
    } else {
      this.productDetails = [...this.productDetails, detail];
    }
  }

  onProductUpdated(event: { index: number; detail: ProductDetails }) {
    if (event.index >= 0 && event.index < this.productDetails.length) {
      this.productDetails[event.index] = { ...event.detail };
      this.productDetails = [...this.productDetails];
      this.detailToEdit = null;
    }
  }

  onEditLine(index: number) {
    if (index >= 0 && index < this.productDetails.length) {
      this.detailToEdit = {
        ...this.productDetails[index],
        _editIndex: index,
      };
    }
  }

  onDeleteLine(index: number) {
    this.productDetails = this.productDetails.filter((_, i) => i !== index);
    this.notificationService.info('Producto eliminado de la factura.');
  }

  onClearLines() {
    this.productDetails = [];
    this.detailToEdit = null;
    this.notificationService.info('Lista de productos vaciada.');
  }

  async submitBilling() {
    if (!this.currentHeader.clientId) {
      this.notificationService.warning(
        'Selecciona un cliente para la factura.',
      );
      return;
    }

    if (this.productDetails.length === 0) {
      this.notificationService.warning(
        'Agrega al menos un producto a la factura.',
      );
      return;
    }

    this.isSubmitting = true;
    try {
      const res = await this.billingService.createBilling(
        this.currentHeader,
        this.productDetails,
      );

      if (res?.success && res.data) {
        this.notificationService.success(
          res.message || 'Factura emitida exitosamente.',
        );
        this.router.navigate(['/billing']);
      } else {
        this.notificationService.error(
          res?.message || 'Error al emitir la factura.',
        );
      }
    } catch (e: any) {
      this.notificationService.error(
        e?.message || 'Error inesperado al emitir la factura.',
      );
    } finally {
      this.isSubmitting = false;
    }
  }

  goBack() {
    this.router.navigate(['/billing']);
  }
}
