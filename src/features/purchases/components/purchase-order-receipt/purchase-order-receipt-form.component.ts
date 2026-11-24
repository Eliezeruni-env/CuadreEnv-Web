import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PurchaseOrderReceiptService } from '../../services/purchase-order-receipt.service';
import { PurchaseService } from '../../services/purchase.service';
import { ProductService } from '../../../products/services/product.service';
import { ManageRequestService } from '../../../inventory/services/manage-request.service';
import { WarehouseService } from '../../../inventory/services/warehouse.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import {
  PurchaseOrder,
  PurchaseOrderReceiptDetail,
} from '../../../../app/models/purchase-order';
import { ManageRequestType } from '../../../../app/models/manage-request';
import type { Warehouse } from '../../../../app/models/warehouse';
import type { ProductDto } from '../../../cuadreEnv/types/api';

@Component({
  selector: 'app-purchase-order-receipt-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './purchase-order-receipt-form.component.html',
  styleUrls: ['./purchase-order-receipt-form.component.scss'],
})
export class PurchaseOrderReceiptFormComponent implements OnInit {
  private poService = inject(PurchaseOrderReceiptService);
  private purchaseService = inject(PurchaseService, { optional: true });
  private productService = inject(ProductService, { optional: true });
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

  // Selector para agregar productos adicionales en el conteo físico
  catalogProducts = signal<ProductDto[]>([]);
  showAddProductRow = signal<boolean>(false);
  selectedAddProductId = signal<string>('');
  addProductQty = signal<number>(1);
  addProductCost = signal<number>(0);

  async ngOnInit() {
    await this.loadWarehouses();
    await this.loadAvailableOrders();
    await this.loadCatalogProducts();

    const paramId = this.route.snapshot.paramMap.get('id') || this.route.snapshot.queryParamMap.get('id');
    if (paramId) {
      this.searchPoNumber = paramId;
      await this.searchOrder();
    }
  }

  async loadCatalogProducts() {
    if (!this.productService) return;
    try {
      const res = await this.productService.getPagedProducts(1, 100);
      if (res?.success && res.data?.items) {
        this.catalogProducts.set(res.data.items);
      }
    } catch {
      this.catalogProducts.set([]);
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

    // Buscar renglones en todas las propiedades posibles
    let rawList: any[] = [];
    if (order.productDetails && order.productDetails.length > 0) {
      rawList = order.productDetails;
    } else if ((order as any).items && (order as any).items.length > 0) {
      rawList = (order as any).items;
    } else if ((order as any).details && (order as any).details.length > 0) {
      rawList = (order as any).details;
    }

    // Si aún está vacío, intentar recuperar la compra original de localStorage
    if (rawList.length === 0 && this.purchaseService) {
      const localPurchases = this.purchaseService.getLocalPurchases();
      const match = localPurchases.find(
        (p) =>
          p.id === order.id ||
          p.invoiceNumber === order.orderNumber ||
          `OC-${p.id}` === order.orderNumber ||
          `OC-${String(p.id).slice(-6)}` === order.orderNumber,
      );
      if (match) {
        rawList =
          match.details && match.details.length > 0
            ? match.details
            : (match as any).items || [];
      }
    }

    this.receiptLines = rawList.map((d: any, idx: number) => {
      const qtyOrdered = Number(d.quantityOrdered ?? d.quantity ?? 1) || 1;
      const qtyReceivedPrev = Number(d.quantityReceived ?? 0) || 0;
      const remaining = Math.max(0, qtyOrdered - qtyReceivedPrev);
      const unitCost = Number(d.unitCost ?? d.costPrice ?? d.cost ?? 0) || 0;
      return {
        productId: Number(d.productId || d.id || idx + 1),
        barCode: d.barCode || d.productCode || d.code || '',
        productName: d.productName || d.name || d.description || `Producto #${d.productId || idx + 1}`,
        quantityOrdered: qtyOrdered,
        quantityReceived: remaining > 0 ? remaining : qtyOrdered,
        unitCost: unitCost,
        subTotal: (remaining > 0 ? remaining : qtyOrdered) * unitCost,
        warehouseId: order.warehouseId || 1,
      };
    });

    this.currentStep.set(2);
  }

  toggleAddProductRow() {
    this.showAddProductRow.update((v) => !v);
    if (this.showAddProductRow() && this.catalogProducts().length > 0 && !this.selectedAddProductId()) {
      const first = this.catalogProducts()[0];
      this.selectedAddProductId.set(String(first.id));
      this.addProductCost.set(Number(first.cost || first.price || 0));
    }
  }

  onAddProductSelectionChange(pId: string) {
    this.selectedAddProductId.set(pId);
    const found = this.catalogProducts().find((p) => String(p.id) === pId);
    if (found) {
      this.addProductCost.set(Number(found.cost || found.price || 0));
    }
  }

  addProductToReceipt() {
    const pId = Number(this.selectedAddProductId());
    if (!pId) {
      this.notificationService.warning('Seleccione un producto para agregar.');
      return;
    }
    const qty = Math.max(1, Number(this.addProductQty()) || 1);
    const cost = Math.max(0, Number(this.addProductCost()) || 0);

    const prod = this.catalogProducts().find((p) => p.id === pId);
    const existing = this.receiptLines.find((l) => l.productId === pId);

    if (existing) {
      existing.quantityReceived += qty;
      existing.quantityOrdered += qty;
      existing.subTotal = existing.quantityReceived * existing.unitCost;
    } else {
      this.receiptLines.push({
        productId: pId,
        barCode: prod?.barcode || '',
        productName: prod?.description || `Producto #${pId}`,
        quantityOrdered: qty,
        quantityReceived: qty,
        unitCost: cost,
        subTotal: qty * cost,
        warehouseId: this.selectedWarehouseId,
      });
    }

    this.showAddProductRow.set(false);
    this.addProductQty.set(1);
    this.notificationService.success('Producto agregado a la recepción.');
  }

  removeLine(idx: number) {
    this.receiptLines.splice(idx, 1);
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
      let found = all.find(
        (o) =>
          o.id === targetId ||
          o.orderNumber.toLowerCase() === term.toLowerCase() ||
          `OC-${o.id}`.toLowerCase() === term.toLowerCase() ||
          `OC-${String(o.id).padStart(5, '0')}`.toLowerCase() === term.toLowerCase(),
      );

      if (!found && targetId > 0) {
        const single = await this.poService.getPurchaseOrder(targetId);
        if (single?.success && single.data) {
          found = single.data;
        }
      }

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
    const details = this.selectedOrder.productDetails || (this.selectedOrder as any).items || (this.selectedOrder as any).details || [];
    if (details.length === 0) return false;
    return this.receiptLines.some((line) => {
      const orderedLine = details.find((d: any) => (d.productId || d.id) === line.productId);
      if (!orderedLine) return false;
      const remaining = Math.max(0, Number(orderedLine.quantityOrdered ?? (orderedLine as any).quantity ?? 0) - Number(orderedLine.quantityReceived ?? 0));
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
