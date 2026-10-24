import type {
  ProductMovementDetail,
  WarehouseMovementHeader,
} from '../../../app/models/movement';

/**
 * Normalizes an individual line item from backend or local storage into a typed ProductMovementDetail.
 * Correctly accounts for PascalCase, camelCase, alternate naming (unitCost, qty, etc.).
 */
export function normalizeProductDetail(raw: any, defaultWarehouseId: number = 1): ProductMovementDetail {
  if (!raw) {
    return {
      productId: 0,
      productName: 'Producto',
      quantity: 0,
      cost: 0,
      price: 0,
      warehouseId: defaultWarehouseId,
      stockAvailable: 0,
    };
  }

  const productId = Number(raw.productId ?? raw.ProductId ?? raw.id ?? raw.Id ?? 0) || 0;
  const quantity = Math.abs(Number(
    raw.quantity ?? raw.Quantity ?? raw.qty ?? raw.Qty ?? raw.quantityReceived ?? raw.units ?? 0
  )) || 0;
  
  let cost = Math.abs(Number(
    raw.cost ?? raw.Cost ?? raw.unitCost ?? raw.UnitCost ?? raw.purchasePrice ?? raw.price ?? raw.Price ?? 0
  )) || 0;

  let price = Math.abs(Number(
    raw.price ?? raw.Price ?? raw.salePrice ?? raw.SalePrice ?? cost
  )) || 0;

  // Si el costo viene en 0, intentar resolverlo desde stock local si está en memoria
  if (cost === 0 && productId > 0 && typeof window !== 'undefined' && window.localStorage) {
    try {
      const rawStock = window.localStorage.getItem('cuadreenv_stock_db');
      if (rawStock) {
        const stocks = JSON.parse(rawStock);
        const match = stocks.find((s: any) => Number(s.productId) === productId);
        if (match && (match.cost || match.price)) {
          cost = Number(match.cost || match.price || 0);
          if (!price) price = Number(match.price || cost);
        }
      }
    } catch {
      // ignore
    }
  }

  const productName =
    raw.productName ??
    raw.ProductName ??
    raw.productDescription ??
    raw.ProductDescription ??
    raw.description ??
    raw.Description ??
    raw.name ??
    raw.Name ??
    (raw.product ? (raw.product.name ?? raw.product.productName ?? raw.product.description) : undefined) ??
    (productId > 0 ? `Producto #${productId}` : 'Artículo de inventario');

  const barCode =
    raw.barCode ??
    raw.BarCode ??
    raw.productBarcode ??
    raw.ProductBarcode ??
    raw.barcode ??
    raw.Barcode ??
    raw.productReference ??
    raw.ProductReference ??
    raw.reference ??
    raw.Reference ??
    (raw.product ? (raw.product.barCode ?? raw.product.barcode) : undefined) ??
    (productId > 0 ? `PROD-${productId}` : '');

  const warehouseId = Number(
    raw.warehouseId ?? raw.WarehouseId ?? raw.toWarehouseId ?? raw.ToWarehouseId ?? raw.fromWarehouseId ?? defaultWarehouseId
  ) || defaultWarehouseId;

  const stockAvailable = Number(
    raw.stockAvailable ?? raw.StockAvailable ?? raw.stock ?? 0
  ) || 0;

  return {
    productId,
    productName,
    barCode,
    quantity,
    cost: cost || price || 0,
    price: price || cost || 0,
    warehouseId,
    stockAvailable,
  };
}

/**
 * Normalizes any warehouse movement header (Entry, Outlet, Transfer) ensuring:
 * 1. Line items are safely unpacked and typed regardless of property naming.
 * 2. Flat backend movements (single product) are unpacked into productDetails.
 * 3. totalQuantity and totalCost are dynamically calculated from line items if backend sends 0, null, or empty.
 * 4. Dates, identifiers and warehouse names are consistently populated.
 */
export function normalizeWarehouseMovement<T extends WarehouseMovementHeader>(raw: any): T {
  if (!raw) return raw;

  const defaultWh = Number(
    raw.warehouseId ?? raw.WarehouseId ?? raw.toWarehouseId ?? raw.ToWarehouseId ?? raw.warehouseOfOriginId ?? 1
  ) || 1;

  // Extract raw details array from any known property name
  const rawList =
    raw.productDetails ??
    raw.details ??
    raw.warehouseEntryDetails ??
    raw.warehouseOutletDetails ??
    raw.warehouseTransferDetails ??
    raw.items ??
    [];

  let productDetails: ProductMovementDetail[] = (Array.isArray(rawList) ? rawList : []).map(
    (d: any) => normalizeProductDetail(d, defaultWh)
  );

  // If list was empty but this record is a flat movement containing a product
  const flatProdId = Number(raw.productId ?? raw.ProductId ?? 0);
  const flatQty = Math.abs(Number(raw.quantity ?? raw.Quantity ?? raw.qty ?? raw.Qty ?? 0));
  if (productDetails.length === 0 && (flatProdId > 0 || flatQty > 0)) {
    productDetails = [normalizeProductDetail(raw, defaultWh)];
  }

  // Dynamically compute real totals
  let computedQuantity = productDetails.reduce((sum, item) => sum + (item.quantity || 0), 0);
  let computedCost = productDetails.reduce(
    (sum, item) => sum + (item.quantity || 0) * (item.cost || item.price || 0),
    0
  );

  const rawQty = Math.abs(Number(raw.totalQuantity ?? raw.TotalQuantity ?? 0));
  const rawCost = Math.abs(Number(
    raw.totalCost ?? raw.TotalCost ?? raw.totalAmount ?? raw.TotalAmount ?? raw.amountTotal ?? raw.amount ?? raw.subtotal ?? 0
  ));

  // If items didn't have cost, try to get from product catalog/stock cache
  if (computedCost === 0 && rawCost === 0 && productDetails.length > 0) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const rawStock = window.localStorage.getItem('cuadreenv_stock_db');
        if (rawStock) {
          const stocks = JSON.parse(rawStock);
          const costMap = new Map<number, number>();
          stocks.forEach((s: any) => {
            if (s.productId && (s.cost || s.price)) {
              costMap.set(Number(s.productId), Number(s.cost || s.price || 0));
            }
          });
          for (const item of productDetails) {
            if (!item.cost && !item.price && costMap.has(item.productId)) {
              const knownCost = costMap.get(item.productId) || 0;
              item.cost = knownCost;
              item.price = knownCost;
            }
          }
          computedCost = productDetails.reduce(
            (sum, item) => sum + (item.quantity || 0) * (item.cost || item.price || 0),
            0
          );
        }
      }
    } catch {
      // ignore
    }
  }

  const id = Number(raw.id ?? raw.Id ?? Date.now());
  const rawType = String(raw.type ?? raw.Type ?? '').toUpperCase();
  const inferredPrefix =
    rawType.includes('ENTRY') || rawType.includes('INBOUND') || rawType === '0'
      ? 'ENT'
      : rawType.includes('OUTLET') || rawType.includes('OUTBOUND') || rawType === '1'
      ? 'SAL'
      : rawType.includes('TRANS') || rawType === '2'
      ? 'TRF'
      : 'MOV';

  const prefix = raw.prefix ?? raw.Prefix ?? inferredPrefix;
  const movementNumber =
    raw.movementNumber ??
    raw.MovementNumber ??
    raw.number ??
    raw.code ??
    `${prefix}-${String(id).slice(-6)}`;

  // If backend returned 0 or null, use computed sum of product details
  const totalQuantity = (computedQuantity > 0 ? computedQuantity : rawQty) || flatQty || (productDetails.length > 0 ? productDetails[0].quantity : 0);
  const totalCost = (computedCost > 0 ? computedCost : rawCost);

  const warehouseName =
    raw.warehouseName ??
    raw.WarehouseName ??
    raw.toWarehouseName ??
    raw.ToWarehouseName ??
    raw.fromWarehouseName ??
    raw.FromWarehouseName ??
    (raw.warehouse ? (raw.warehouse.name ?? raw.warehouse.WarehouseName) : undefined) ??
    (raw.toWarehouseId ? `Almacén #${raw.toWarehouseId}` : undefined) ??
    (raw.warehouseId ? `Almacén #${raw.warehouseId}` : undefined) ??
    'Almacén Principal';

  const warehouseOfOriginName =
    raw.warehouseOfOriginName ??
    raw.WarehouseOfOriginName ??
    raw.fromWarehouseName ??
    raw.FromWarehouseName ??
    (raw.warehouseOfOrigin ? raw.warehouseOfOrigin.name : undefined) ??
    (raw.fromWarehouseId ? `Almacén #${raw.fromWarehouseId}` : undefined) ??
    (raw.warehouseOfOriginId ? `Almacén #${raw.warehouseOfOriginId}` : undefined);

  const destinationWarehouseName =
    raw.destinationWarehouseName ??
    raw.DestinationWarehouseName ??
    raw.toWarehouseName ??
    raw.ToWarehouseName ??
    (raw.destinationWarehouse ? raw.destinationWarehouse.name : undefined) ??
    (raw.toWarehouseId ? `Almacén #${raw.toWarehouseId}` : undefined) ??
    (raw.destinationWarehouseId ? `Almacén #${raw.destinationWarehouseId}` : undefined);

  let conceptName =
    raw.conceptName ??
    raw.ConceptName ??
    (raw.concept ? (raw.concept.name ?? raw.concept.description) : undefined);

  if (!conceptName || conceptName === 'Movimiento de Almacén' || conceptName.trim().length === 0) {
    if (prefix === 'ENT' || rawType.includes('ENTRY') || rawType.includes('INBOUND') || String(movementNumber).startsWith('ENT')) {
      conceptName = 'Entrada de Almacén';
    } else if (prefix === 'SAL' || rawType.includes('OUTLET') || rawType.includes('OUTBOUND') || String(movementNumber).startsWith('SAL')) {
      conceptName = 'Salida de Almacén';
    } else if (prefix === 'TRF' || rawType.includes('TRANS') || String(movementNumber).startsWith('TRF')) {
      conceptName = 'Transferencia de Almacén';
    } else {
      conceptName = 'Entrada de Almacén';
    }
  }

  const createDate =
    raw.createDate ??
    raw.CreateDate ??
    raw.creationDate ??
    raw.CreationDate ??
    raw.date ??
    raw.Date ??
    raw.createdAt ??
    new Date().toISOString();

  const statusId = Number(raw.statusId ?? raw.StatusId ?? 1);
  const statusName =
    raw.statusName ??
    raw.StatusName ??
    (statusId === 1 ? 'Aplicado' : statusId === 2 ? 'Pendiente' : 'Anulado');

  return {
    ...raw,
    id,
    prefix,
    movementNumber,
    warehouseId: raw.warehouseId ?? raw.WarehouseId ?? defaultWh,
    warehouseName,
    warehouseOfOriginId: raw.warehouseOfOriginId ?? raw.WarehouseOfOriginId,
    warehouseOfOriginName,
    destinationWarehouseId: raw.destinationWarehouseId ?? raw.DestinationWarehouseId,
    destinationWarehouseName,
    conceptId: Number(raw.conceptId ?? raw.ConceptId ?? 1),
    conceptName,
    commentary: raw.commentary ?? raw.Commentary ?? raw.comments ?? raw.description ?? raw.observation ?? '',
    createDate,
    statusId,
    statusName,
    totalQuantity,
    totalCost,
    productDetails,
  } as T;
}
