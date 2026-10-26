import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../cuadreEnv/services/auth.service';
import type { ApiResponse } from '../../cuadreEnv/types/api';

export interface UnitOfMeasurement {
  id: number;
  name: string;
  symbol: string;
  allowsDecimals: boolean;
  description?: string;
  companyId?: number;
  isSystem?: boolean;
}

const DEFAULT_UNITS: UnitOfMeasurement[] = [
  { id: 1, name: 'Unidad', symbol: 'und', allowsDecimals: false, description: 'Venta por unidad entera (conteo discreto)', isSystem: true },
  { id: 2, name: 'Libra', symbol: 'lb', allowsDecimals: true, description: 'Peso en libras (permite decimales)', isSystem: true },
  { id: 3, name: 'Kilogramo', symbol: 'kg', allowsDecimals: true, description: 'Peso en kilogramos (permite decimales)', isSystem: true },
  { id: 4, name: 'Gramo', symbol: 'g', allowsDecimals: true, description: 'Peso en gramos (permite decimales)', isSystem: true },
  { id: 5, name: 'Litro', symbol: 'L', allowsDecimals: true, description: 'Volumen en litros (permite decimales)', isSystem: true },
  { id: 6, name: 'Galón', symbol: 'gal', allowsDecimals: true, description: 'Volumen en galones (permite decimales)', isSystem: true },
  { id: 7, name: 'Metro', symbol: 'm', allowsDecimals: true, description: 'Longitud en metros (permite decimales)', isSystem: true },
  { id: 8, name: 'Paquete', symbol: 'paq', allowsDecimals: false, description: 'Empaque cerrado o paquete', isSystem: true },
  { id: 9, name: 'Caja', symbol: 'caj', allowsDecimals: false, description: 'Caja de productos', isSystem: true },
  { id: 10, name: 'Hora / Servicio', symbol: 'hr', allowsDecimals: true, description: 'Tiempo de servicio prestado', isSystem: true },
];

@Injectable({
  providedIn: 'root'
})
export class UnitOfMeasurementService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly baseUrl =
    (environment.apiUrl || 'http://localhost:8080').replace(/\/v1\/?$/, '').replace(/\/$/, '') + '/v1';

  private readonly storageKey = 'cuadre_units_of_measurement';
  readonly units = signal<UnitOfMeasurement[]>([]);

  constructor() {
    this.initUnits();
  }

  private initUnits(): void {
    const cached = this.loadFromStorage();
    if (cached && cached.length > 0) {
      this.units.set(cached);
    } else {
      this.units.set(DEFAULT_UNITS);
      this.saveToStorage(DEFAULT_UNITS);
    }
  }

  private loadFromStorage(): UnitOfMeasurement[] | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const data = localStorage.getItem(this.storageKey);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  private saveToStorage(units: UnitOfMeasurement[]): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(units));
    } catch {
      // storage error fallback
    }
  }

  async getUnitsOfMeasurement(): Promise<ApiResponse<UnitOfMeasurement[]>> {
    // Intentar sincronizar con backend si existe endpoint, con fallback a catálogo local enriquecido
    try {
      const res: any = await firstValueFrom(this.http.get<any>(`${this.baseUrl}/unitofmeasurement`));
      const serverUnits = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
      if (serverUnits.length > 0) {
        // Enlazar banderas de decimales según el símbolo o convención
        const merged = serverUnits.map((u: any) => ({
          id: u.id,
          name: u.name || u.description || `Unidad ${u.id}`,
          symbol: u.symbol || (u.name || '').substring(0, 3).toLowerCase(),
          allowsDecimals: u.allowsDecimals ?? this.checkAllowsDecimals(u.symbol || u.name),
          description: u.description || '',
          companyId: u.companyId
        }));
        this.units.set(merged);
        this.saveToStorage(merged);
        return { success: true, data: merged };
      }
    } catch {
      // Usar catálogo persistido local con defaults garantizados
    }

    const current = this.units();
    return { success: true, data: current };
  }

  getUnitById(id: number): UnitOfMeasurement | undefined {
    return this.units().find(u => u.id === id);
  }

  getUnitBySymbol(symbol: string): UnitOfMeasurement | undefined {
    const s = (symbol || '').trim().toLowerCase();
    return this.units().find(u => u.symbol.toLowerCase() === s);
  }

  async createUnitOfMeasurement(dto: {
    name: string;
    symbol: string;
    allowsDecimals: boolean;
    description?: string;
  }): Promise<ApiResponse<UnitOfMeasurement>> {
    const current = this.units();
    const nextId = current.length > 0 ? Math.max(...current.map(u => u.id)) + 1 : 1;
    const companyId = this.authService.companyId() || 0;

    const newUnit: UnitOfMeasurement = {
      id: nextId,
      name: dto.name.trim(),
      symbol: dto.symbol.trim().toLowerCase(),
      allowsDecimals: Boolean(dto.allowsDecimals),
      description: dto.description?.trim() || '',
      companyId,
      isSystem: false
    };

    const updated = [...current, newUnit];
    this.units.set(updated);
    this.saveToStorage(updated);

    // Intento de persistencia remota opcional
    try {
      await firstValueFrom(this.http.post<any>(`${this.baseUrl}/unitofmeasurement`, newUnit));
    } catch {
      // Ok, queda en el almacén de configuración
    }

    return { success: true, data: newUnit, message: 'Unidad de medida creada exitosamente.' };
  }

  async updateUnitOfMeasurement(id: number, dto: {
    name: string;
    symbol: string;
    allowsDecimals: boolean;
    description?: string;
  }): Promise<ApiResponse<UnitOfMeasurement>> {
    const current = this.units();
    const index = current.findIndex(u => u.id === id);
    if (index === -1) {
      return { success: false, message: 'Unidad de medida no encontrada.' };
    }

    const updatedUnit: UnitOfMeasurement = {
      ...current[index],
      name: dto.name.trim(),
      symbol: dto.symbol.trim().toLowerCase(),
      allowsDecimals: Boolean(dto.allowsDecimals),
      description: dto.description?.trim() || ''
    };

    const updated = [...current];
    updated[index] = updatedUnit;
    this.units.set(updated);
    this.saveToStorage(updated);

    try {
      await firstValueFrom(this.http.put<any>(`${this.baseUrl}/unitofmeasurement/${id}`, updatedUnit));
    } catch {
      // Ok
    }

    return { success: true, data: updatedUnit, message: 'Unidad de medida actualizada.' };
  }

  async deleteUnitOfMeasurement(id: number): Promise<ApiResponse<boolean>> {
    const current = this.units();
    const target = current.find(u => u.id === id);
    if (target?.isSystem) {
      return { success: false, message: 'No se pueden eliminar las unidades de medida básicas del sistema.' };
    }

    const filtered = current.filter(u => u.id !== id);
    this.units.set(filtered);
    this.saveToStorage(filtered);

    try {
      await firstValueFrom(this.http.delete<any>(`${this.baseUrl}/unitofmeasurement/${id}`));
    } catch {
      // Ok
    }

    return { success: true, data: true, message: 'Unidad de medida eliminada.' };
  }

  checkAllowsDecimals(nameOrSymbol: string): boolean {
    const val = (nameOrSymbol || '').toLowerCase();
    const decimalUnits = ['lb', 'libra', 'kg', 'kilo', 'kilogramo', 'g', 'gramo', 'l', 'litro', 'gal', 'galon', 'm', 'metro', 'cm', 'hr', 'hora', 'yarda', 'yd'];
    return decimalUnits.some(u => val.includes(u));
  }
}
