import { Injectable, inject } from '@angular/core';
import { ApiClientService, extractArray } from '../../cuadreEnv/services/apiClient';
import type { ApiResponse } from '../../cuadreEnv/types/api';
import type { Warehouse, WarehouseConcept } from '../../../app/models/warehouse';

const WAREHOUSES_STORAGE_KEY = 'cuadreenv_warehouses_db';

const DEFAULT_WAREHOUSES: Warehouse[] = [];

const DEFAULT_CONCEPTS: WarehouseConcept[] = [
  // Conceptos de Entrada (ENTRY)
  { id: 1, name: 'Compra / Recepción de Mercancía', type: 'ENTRY', description: 'Ingreso directo por compras a proveedores' },
  { id: 2, name: 'Producción / Fraccionamiento al Detalle', type: 'ENTRY', description: 'Envasado o conversión de sacos/bultos a unidades menores o libras' },
  { id: 3, name: 'Ajuste de Inventario (+)', type: 'ENTRY', description: 'Corrección de conteo físico sobrante' },
  { id: 4, name: 'Devolución de Cliente / Nota de Crédito', type: 'ENTRY', description: 'Reingreso por devolución de mercancía vendida' },
  { id: 5, name: 'Retorno de Surtidor / Liquidación de Ruta', type: 'ENTRY', description: 'Retorno de mercancía no vendida por el chofer o surtidor' },
  { id: 6, name: 'Entrada por Muestra Comercial o Donación', type: 'ENTRY', description: 'Ingreso de artículos promocionales o muestras' },

  // Conceptos de Salida (OUTLET)
  { id: 7, name: 'Venta Directa / Despacho a Cliente', type: 'OUTLET', description: 'Salida por facturación comercial al cliente' },
  { id: 8, name: 'Carga a Surtidor / Despacho a Ruta', type: 'OUTLET', description: 'Asignación de mercancía al vehículo del surtidor para reparto' },
  { id: 9, name: 'Consumo Interno / Uso Operativo', type: 'OUTLET', description: 'Salida de insumos, limpieza o uso en instalaciones' },
  { id: 10, name: 'Merma / Avería / Daño Físico', type: 'OUTLET', description: 'Producto deteriorado, roto o inutilizable' },
  { id: 11, name: 'Vencimiento / Caducidad', type: 'OUTLET', description: 'Retiro y descarte de productos con fecha de vencimiento cumplida' },
  { id: 12, name: 'Ajuste de Inventario (-)', type: 'OUTLET', description: 'Corrección de faltante físico en auditoría' },
  { id: 13, name: 'Devolución a Proveedor por Defecto', type: 'OUTLET', description: 'Retorno de mercancía defectuosa al suplidor' },
  { id: 14, name: 'Muestra Comercial / Degustación', type: 'OUTLET', description: 'Entrega de producto como prueba comercial' },

  // Conceptos de Transferencia (TRANSFER)
  { id: 15, name: 'Transferencia Inter-Sucursales', type: 'TRANSFER', description: 'Reubicación de existencias entre almacenes centrales' },
  { id: 16, name: 'Envío a Almacén Móvil / Camión de Ruta', type: 'TRANSFER', description: 'Transferencia a unidad móvil para venta en calle' },
  { id: 17, name: 'Retorno desde Móvil a Depósito Central', type: 'TRANSFER', description: 'Descarga de mercancía sobrante de ruta hacia almacén' },
  { id: 18, name: 'Reubicación a Zona de Cuarentena / Revisión', type: 'TRANSFER', description: 'Aislamiento preventivo para control de calidad' },
];

@Injectable({
  providedIn: 'root',
})
export class WarehouseService {
  private api = inject(ApiClientService);

  public getLocalWarehouses(): Warehouse[] {
    try {
      const raw = localStorage.getItem(WAREHOUSES_STORAGE_KEY);
      if (!raw) {
        return [];
      }
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  public saveLocalWarehouses(list: Warehouse[]): void {
    try {
      localStorage.setItem(WAREHOUSES_STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.error('Error saving local warehouses:', e);
    }
  }

  createDefaultMainWarehouse(): Warehouse {
    return {
      id: 1,
      name: 'Almacén Principal',
      code: 'ALM-01',
      address: 'Sede Central',
      phone: '',
      managerName: 'Administrador',
      isMain: true,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
  }

  private enforceSingleMainWarehouse(warehouses: Warehouse[]): Warehouse[] {
    if (!warehouses || warehouses.length === 0) return warehouses;
    let mainFound = false;
    for (const w of warehouses) {
      if (w.isMain) {
        if (!mainFound) {
          mainFound = true;
        } else {
          w.isMain = false;
        }
      }
    }
    if (!mainFound && warehouses.length > 0) {
      warehouses[0].isMain = true;
    }
    return warehouses;
  }

  async getWarehouses(): Promise<ApiResponse<Warehouse[]>> {
    try {
      const res = await this.api.get<any, any>('/warehouse');

      const list = extractArray<any>(res);
      if (list && list.length > 0) {
        const normalized: Warehouse[] = list.map((item: any, idx: number) => {
          const id = item.id ?? item.warehouseId ?? (idx + 1);
          return {
            id,
            name: item.name || item.description || item.warehouseName || `Almacén #${id}`,
            code: item.code || item.warehouseCode || `ALM-${String(id).padStart(2, '0')}`,
            address: item.address || '',
            phone: item.phone || '',
            managerName: item.managerName || '',
            isMain: item.isMain === true,
            isActive: item.isActive !== false,
            createdAt: item.createdAt || new Date().toISOString(),
          };
        });

        // Combinar con almacenes locales para que nunca se pierda un almacén creado por el usuario
        const local = this.getLocalWarehouses();
        const map = new Map<string | number, Warehouse>();
        normalized.forEach((w) => map.set(w.id, w));
        local.forEach((w) => {
          if (!map.has(w.id)) {
            map.set(w.id, w);
          }
        });
        const combined = this.enforceSingleMainWarehouse(Array.from(map.values()));
        this.saveLocalWarehouses(combined);
        return { success: true, data: combined };
      }

      // Si el servidor devolvió lista vacía, usar almacenes locales sin autogenerar por defecto
      const local = this.enforceSingleMainWarehouse(this.getLocalWarehouses());
      return { success: true, data: local };
    } catch {
      // Si la API falla por MODULE_NOT_LICENSED, restricciones de plan o modo offline:
      const local = this.enforceSingleMainWarehouse(this.getLocalWarehouses());
      return { success: true, data: local, message: 'Almacenes cargados correctamente.' };
    }
  }

  async getWarehouse(id: number): Promise<ApiResponse<Warehouse>> {
    const list = this.getLocalWarehouses();
    const found = list.find((w) => w.id === id);
    if (found) return { success: true, data: found };
    return { success: false, message: 'Almacén no encontrado.' };
  }

  async createWarehouse(wh: Partial<Warehouse>): Promise<ApiResponse<Warehouse>> {
    const list = this.getLocalWarehouses();
    const newId = list.length > 0 ? Math.max(...list.map((w) => w.id)) + 1 : 1;
    const newWarehouse: Warehouse = {
      id: newId,
      name: wh.name || `Almacén #${newId}`,
      code: wh.code || `ALM-${String(newId).padStart(2, '0')}`,
      address: wh.address || '',
      phone: wh.phone || '',
      managerName: wh.managerName || '',
      isMain: wh.isMain || false,
      isActive: wh.isActive ?? true,
      createdAt: new Date().toISOString(),
    };

    if (newWarehouse.isMain) {
      list.forEach((w) => (w.isMain = false));
    }

    list.push(newWarehouse);
    this.saveLocalWarehouses(list);

    try {
      await this.api.post<any, any>('/warehouse', newWarehouse);
    } catch {
      try {
        await this.api.post<any, any>('/Warehouse', newWarehouse);
      } catch {
        // offline fallback
      }
    }

    return { success: true, data: newWarehouse, message: 'Almacén registrado exitosamente.' };
  }

  async updateWarehouse(wh: Warehouse): Promise<ApiResponse<Warehouse>> {
    const list = this.getLocalWarehouses();
    let idx = list.findIndex((w) => w.id === wh.id);
    if (idx === -1) {
      list.push(wh);
      idx = list.length - 1;
    }

    if (wh.isMain) {
      list.forEach((w) => {
        if (w.id !== wh.id) w.isMain = false;
      });
    } else {
      const hasAnotherMain = list.some((w) => w.id !== wh.id && w.isMain);
      if (!hasAnotherMain && list.length > 0) {
        wh.isMain = true;
      }
    }

    list[idx] = { ...list[idx], ...wh };
    this.saveLocalWarehouses(list);

    try {
      await this.api.put<any, any>(`/warehouse/${wh.id}`, wh);
    } catch {
      try {
        await this.api.put<any, any>(`/Warehouse/${wh.id}`, wh);
      } catch {
        try {
          await this.api.put<any, any>('/warehouse', wh);
        } catch {
          // offline fallback
        }
      }
    }

    return { success: true, data: list[idx], message: 'Almacén actualizado correctamente.' };
  }

  async deleteWarehouse(id: number): Promise<ApiResponse<boolean>> {
    const list = this.getLocalWarehouses().filter((w) => w.id !== id);
    this.saveLocalWarehouses(list);
    return { success: true, data: true, message: 'Almacén eliminado.' };
  }

  getConcepts(type?: 'ENTRY' | 'OUTLET' | 'TRANSFER'): WarehouseConcept[] {
    if (!type) return DEFAULT_CONCEPTS;
    return DEFAULT_CONCEPTS.filter((c) => c.type === type);
  }
}
