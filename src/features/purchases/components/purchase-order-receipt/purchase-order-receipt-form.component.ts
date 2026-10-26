import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PurchaseOrderReceiptService } from '../../services/purchase-order-receipt.service';
import { ManageRequestService } from '../../../inventory/services/manage-request.service';
import { WarehouseService } from '../../../inventory/services/warehouse.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import {
  PurchaseOrder,
  PurchaseOrderReceiptDetail,
} from '../../../../app/models/purchase-order';
import { ManageRequestType } from '../../../../app/models/manage-request';
import type { Warehouse } from '../../../../app/models/warehouse';

@Component({
  selector: 'app-purchase-order-receipt-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './purchase-order-receipt-form.component.html',
  styleUrls: ['./purchase-order-receipt-form.component.scss'],
})
export class PurchaseOrderReceiptFormComponent implements OnInit {
  private poService = inject(PurchaseOrderReceiptService);
  private manageRequestService = inject(ManageRequestService);
  private warehouseService = inject(WarehouseService);
  private notificationService = inject(NotificationService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  currentStep = signal<number>(1);
  searchPoNumber = '';
  isSearching = signal<boolean>(false);
  isSubmitting = signal<boolean>(false);

  availableOrders = signal<PurchaseOrder[]>([]);
  selectedOrder: PurchaseOrder | null = null;
  selectedWarehouseId = 1;
  warehouses: Warehouse[] = [];
  receiptLines: PurchaseOrderReceiptDetail[] = [];
  receptionComments = '';

  async ngOnInit() {
    await this.loadWarehouses();
    await this.loadAvailableOrders();

    const paramId = this.route.snapshot.paramMap.get('id') || this.route.snapshot.queryParamMap.get('id');
    if (paramId) {
      this.searchPoNumber = paramId;
      await this.searchOrder();
    }
  }

  async loadAvailableOrders() {
    try {
      const res = await this.poService.getPurchaseOrders();
      if (res?.success && res.data) {
        // Pending or partially received
        this.availableOrders.set(res.data.filter((o) => o.statusId !== 3));
      }
    } catch {
      this.availableOrders.set([]);
    }
  }

  async loadWarehouses() {
    const res = await this.warehouseService.getWarehouses();
    if (res?.success && res.data) {
      this.warehouses = res.data.filter((w) => w.isActive !== false);
      if (this.warehouses.length > 0 && !this.warehouses.some((w) => w.id === this.selectedWarehouseId)) {
        this.selectedWarehouseId = this.warehouses[0].id;
      }
    }
  }

  selectOrderDirectly(order: PurchaseOrder) {
    if (order.statusId === 3) {
      this.notificationService.warning('Esta orden de compra ya fue completada.');
      return;
    }

    this.selectedOrder = order;
    this.selectedWarehouseId = order.warehouseId || 1;
    this.receiptLines = (order.productDetails || []).map((d) => ({
      productId: d.productId,
      barCode: d.barCode,
      productName: d.productName,
      quantityOrdered: d.quantityOrdered,
      quantityReceived: Math.max(0, d.quantityOrdered - (d.quantityReceived || 0)),
      unitCost: d.unitCost,
      subTotal: Math.max(0, d.quantityOrdered - (d.quantityReceived || 0)) * d.unitCost,
      warehouseId: order.warehouseId || 1,
    }));
    this.currentStep.set(2);
  }

  async searchOrder() {
    const term = this.searchPoNumber.trim();
    if (!term) return;

    this.isSearching.set(true);
    try {
      const idMatch = term.match(/\d+$/);
      const targetId = idMatch ? parseInt(idMatch[0], 10) : 0;

      const res = await this.poService.getPurchaseOrders();
      const all = res?.data || [];
      const found = all.find(
        (o) =>
          o.id === targetId ||
          o.orderNumber.toLowerCase() === term.toLowerCase() ||
          `OC-${o.id}`.toLowerCase() === term.toLowerCase(),
      );

      if (found) {
        this.selectOrderDirectly(found);
      } else {
        this.notificationService.error(`No se encontró la orden de compra "${term}".`);
      }
    } catch (e: any) {
      this.notificationService.showApiError(e);
    } finally {
      this.isSearching.set(false);
    }
  }

  updateReceivedQty(line: PurchaseOrderReceiptDetail, val: number) {
    line.quantityReceived = Math.max(0, Number(val) || 0);
    line.subTotal = line.quantityReceived * line.unitCost;
  }

  hasDiscrepancies(): boolean {
    if (!this.selectedOrder) return false;
    return this.receiptLines.some((line) => {
      const orderedLine = this.selectedOrder!.productDetails.find((d) => d.productId === line.productId);
      const remaining = orderedLine ? orderedLine.quantityOrdered - orderedLine.quantityReceived : 0;
      return line.quantityReceived !== remaining;
    });
  }

  get totalReceivedUnits(): number {
    return this.receiptLines.reduce((acc, l) => acc + l.quantityReceived, 0);
  }

  get totalReceiptAmount(): number {
    return this.receiptLines.reduce((acc, l) => acc + (l.quantityReceived * l.unitCost), 0);
  }

  nextStep() {
    if (this.totalReceivedUnits === 0) {
      this.notificationService.warning('Debe registrar al menos 1 unidad recibida.');
      return;
    }
    this.currentStep.set(3);
  }

  prevStep() {
    this.currentStep.set(Math.max(1, this.currentStep() - 1));
  }

  async processReception() {
    if (!this.selectedOrder) return;
    this.isSubmitting.set(true);

    const discrepancies = this.hasDiscrepancies();

    try {
      if (discrepancies) {
        // Create Manage Request for supervisor approval
        const payloadJson = JSON.stringify({
          purchaseOrderId: this.selectedOrder.id,
          orderNumber: this.selectedOrder.orderNumber,
          warehouseId: this.selectedWarehouseId,
          supplierName: this.selectedOrder.supplierName,
          items: this.receiptLines,
          comments: this.receptionComments,
        });

        const reqRes = await this.manageRequestService.createRequest({
          requestType: ManageRequestType.PurchaseReceipt,
          typeName: 'Recepción de Compra con Discrepancia',
          comment: `Recepción de ${this.selectedOrder.orderNumber} con cantidades físicas discrepantes a la orden.`,
          payloadJson,
        });

        if (reqRes?.success) {
          this.notificationService.warning(
            'Se detectaron variaciones en el conteo físico. Se ha generado la solicitud de autorización en la bandeja de supervisión.',
          );
          this.router.navigate(['/inventory/manage-requests']);
        }
      } else {
        // Direct reception
        const res = await this.poService.createReceipt({
          purchaseOrderId: this.selectedOrder.id,
          purchaseOrderNumber: this.selectedOrder.orderNumber,
          warehouseId: this.selectedWarehouseId,
          supplierId: this.selectedOrder.supplierId,
          supplierName: this.selectedOrder.supplierName,
          comments: this.receptionComments,
          statusId: 1, // Direct applied
          hasDiscrepancies: false,
          productDetails: this.receiptLines,
        });

        if (res?.success) {
          this.notificationService.success(
            `Mercancía ingresada a inventario exitosamente. Comprobante ${res.data?.receiptNumber}.`,
          );
          this.router.navigate(['/purchases/receipts']);
        }
      }
    } catch (e: any) {
      this.notificationService.showApiError(e);
    } finally {
      this.isSubmitting.set(false);
    }
  }

  cancel() {
    this.router.navigate(['/purchases/receipts']);
  }
}
