import { Component, EventEmitter, inject, Output, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProductService, PreloadedCatalog } from '../../services/product.service';
import { CategoryService } from '../../services/category.service';
import { ProductTypeService } from '../../services/product-type.service';
import { AuthService } from '../../../cuadreEnv/services/auth.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import type { ProductDto } from '../../../cuadreEnv/types/api';

export interface ParsedImportRow {
  rowNumber: number;
  barcode: string;
  reference: string;
  description: string;
  categoryName: string;
  cost: number;
  price: number;
  stock: number;
  minQuantity: number;
  isValid: boolean;
  validationError?: string;
}

@Component({
  selector: 'app-product-import-modal',
  templateUrl: './product-import-modal.component.html',
  styleUrls: ['./product-import-modal.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class ProductImportModalComponent implements OnInit {
  @Output() imported = new EventEmitter<void>();

  private readonly productService = inject(ProductService);
  private readonly categoryService = inject(CategoryService);
  private readonly productTypeService = inject(ProductTypeService);
  private readonly authService = inject(AuthService);
  private readonly notificationService = inject(NotificationService);

  isOpen = signal<boolean>(false);
  activeTab = signal<'preloaded' | 'upload'>('preloaded');
  catalogs = signal<PreloadedCatalog[]>([]);
  isLoadingCatalogs = signal<boolean>(false);

  selectedCatalog = signal<PreloadedCatalog | null>(null);

  // File upload state
  fileName = signal<string>('');
  rawCsvContent = signal<string>('');
  parsedRows = signal<ParsedImportRow[]>([]);
  isParsing = signal<boolean>(false);
  isImporting = signal<boolean>(false);
  importProgress = signal<number>(0);
  importStats = signal<{ total: number; success: number; failed: number } | null>(null);

  ngOnInit(): void {
    void this.loadCatalogs();
  }

  async loadCatalogs(): Promise<void> {
    this.isLoadingCatalogs.set(true);
    try {
      const res = await this.productService.getPreloadedCatalogs();
      const list = res?.data || [];
      this.catalogs.set(list);
      if (list.length > 0 && !this.selectedCatalog()) {
        this.selectedCatalog.set(list[0]);
      }
    } catch {
      this.catalogs.set([]);
    } finally {
      this.isLoadingCatalogs.set(false);
    }
  }

  open(): void {
    this.isOpen.set(true);
    this.activeTab.set('preloaded');
    this.importStats.set(null);
    this.parsedRows.set([]);
    this.fileName.set('');
    if (this.catalogs().length === 0) {
      void this.loadCatalogs();
    } else if (!this.selectedCatalog()) {
      this.selectedCatalog.set(this.catalogs()[0]);
    }
  }

  close(): void {
    if (this.isImporting()) return;
    this.isOpen.set(false);
  }

  selectCatalog(cat: PreloadedCatalog): void {
    this.selectedCatalog.set(cat);
  }

  /**
   * Descarga la plantilla CSV lista para abrir en Excel con acentos y caracteres especiales dominicanos (UTF-8 con BOM).
   */
  downloadTemplateCsv(catalog?: PreloadedCatalog): void {
    const target = catalog || this.selectedCatalog() || this.catalogs()[0];
    if (!target) return;
    const headers = 'Codigo_Barra,Referencia,Descripcion,Categoria,Costo_Compra,Precio_Venta,Stock_Inicial,Stock_Minimo';
    
    const rows = target.items.map(it => 
      `"${it.barcode}","${it.reference}","${it.description.replace(/"/g, '""')}","${it.category}",${it.cost.toFixed(2)},${it.price.toFixed(2)},${it.stock},${it.minQuantity}`
    );

    const csvContent = '\uFEFF' + [headers, ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Plantilla_Catalogo_${target.id}_CuadreEnv.csv`;
    link.click();
    URL.revokeObjectURL(url);
    this.notificationService.success(`Plantilla descargada: ${link.download}`);
  }

  /**
   * Carga directamente los productos del catálogo seleccionado a la base de datos con 1 solo clic.
   */
  async importSelectedPreloadedCatalog(): Promise<void> {
    const cat = this.selectedCatalog();
    if (!cat) return;

    const rows: ParsedImportRow[] = cat.items.map((it, idx) => ({
      rowNumber: idx + 1,
      barcode: it.barcode,
      reference: it.reference,
      description: it.description,
      categoryName: it.category,
      cost: it.cost,
      price: it.price,
      stock: it.stock,
      minQuantity: it.minQuantity,
      isValid: true
    }));

    await this.executeBatchImport(rows, `Catálogo Base (${cat.name})`);
  }

  /**
   * Manejador para subida de archivo .csv / .txt desde el explorador o arrastrado.
   */
  onFileSelected(event: Event): void {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;
    this.processFile(file);
  }

  onFileDropped(event: DragEvent): void {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    this.processFile(file);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  private processFile(file: File): void {
    this.fileName.set(file.name);
    this.isParsing.set(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target?.result || '');
      this.rawCsvContent.set(text);
      this.parseCsv(text);
      this.isParsing.set(false);
    };
    reader.onerror = () => {
      this.notificationService.error('Error al leer el archivo seleccionado.');
      this.isParsing.set(false);
    };
    reader.readAsText(file, 'utf-8');
  }

  /**
   * Parser inteligente de CSV/TSV con autodetección de delimitador y mapeo flexible de columnas.
   */
  parseCsv(text: string): void {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 2) {
      this.notificationService.error('El archivo debe tener al menos una fila de encabezados y una fila de productos.');
      this.parsedRows.set([]);
      return;
    }

    // Autodetectar delimitador: coma, punto y coma, tabulación o pipe
    const firstLine = lines[0];
    let delimiter = ',';
    const counts = {
      ',': (firstLine.match(/,/g) || []).length,
      ';': (firstLine.match(/;/g) || []).length,
      '\t': (firstLine.match(/\t/g) || []).length,
      '|': (firstLine.match(/\|/g) || []).length
    };
    const bestDelim = (Object.keys(counts) as (keyof typeof counts)[]).reduce((a, b) => counts[a] > counts[b] ? a : b);
    if (counts[bestDelim] > 0) delimiter = bestDelim;

    const headers = this.parseCsvLine(firstLine, delimiter).map(h => this.normalizeHeader(h));

    // Mapeo automático de columnas
    const colIdx = {
      barcode: headers.findIndex(h => /barcode|codigo|barra|ean|upc/i.test(h)),
      reference: headers.findIndex(h => /referencia|ref|sku|clave|modelo/i.test(h)),
      description: headers.findIndex(h => /descripcion|nombre|producto|articulo|item|titulo/i.test(h)),
      category: headers.findIndex(h => /categoria|rubro|familia|departamento|grupo/i.test(h)),
      cost: headers.findIndex(h => /costo|compra|cost|precio_costo/i.test(h)),
      price: headers.findIndex(h => /precio|venta|pvp|price|precio_venta/i.test(h)),
      stock: headers.findIndex(h => /stock|cantidad|cant|inventario|existencia/i.test(h)),
      minQuantity: headers.findIndex(h => /minimo|stock_minimo|reorden|min/i.test(h))
    };

    if (colIdx.description === -1) {
      this.notificationService.error('No se pudo identificar la columna de "Descripción" o "Nombre del Producto" en el encabezado.');
      this.parsedRows.set([]);
      return;
    }

    const rows: ParsedImportRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const parts = this.parseCsvLine(lines[i], delimiter);
      if (parts.length === 0 || parts.every(p => !p.trim())) continue;

      const desc = (colIdx.description !== -1 ? parts[colIdx.description] : '') || '';
      const barcode = (colIdx.barcode !== -1 ? parts[colIdx.barcode] : '') || '';
      const reference = (colIdx.reference !== -1 ? parts[colIdx.reference] : '') || '';
      const cat = (colIdx.category !== -1 ? parts[colIdx.category] : 'General') || 'General';
      const cost = Number(this.cleanNumber(colIdx.cost !== -1 ? parts[colIdx.cost] : '0')) || 0;
      const price = Number(this.cleanNumber(colIdx.price !== -1 ? parts[colIdx.price] : '0')) || (cost > 0 ? cost * 1.3 : 0);
      const stock = Number(this.cleanNumber(colIdx.stock !== -1 ? parts[colIdx.stock] : '0')) || 0;
      const minQty = Number(this.cleanNumber(colIdx.minQuantity !== -1 ? parts[colIdx.minQuantity] : '0')) || 5;

      let isValid = true;
      let error = '';

      if (!desc.trim()) {
        isValid = false;
        error = 'Falta descripción';
      } else if (cost < 0 || isNaN(cost)) {
        isValid = false;
        error = 'Costo inválido';
      }

      rows.push({
        rowNumber: i,
        barcode: barcode.trim(),
        reference: reference.trim(),
        description: desc.trim(),
        categoryName: cat.trim() || 'General',
        cost,
        price,
        stock,
        minQuantity: minQty,
        isValid,
        validationError: error
      });
    }

    this.parsedRows.set(rows);
    const validCount = rows.filter(r => r.isValid).length;
    this.notificationService.info(`Archivo leído: ${rows.length} filas analizadas (${validCount} válidas para importar).`);
  }

  private parseCsvLine(line: string, delimiter: string): string[] {
    const result: string[] = [];
    let cur = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += char;
      }
    }
    result.push(cur.trim());
    return result;
  }

  private normalizeHeader(header: string): string {
    return header
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '_');
  }

  private cleanNumber(val: string | undefined): string {
    if (!val) return '0';
    return val.replace(/RD\$|\$|,|\s/g, '').trim();
  }

  /**
   * Ejecuta la creación por lote de productos consumiendo el ProductService.
   */
  async executeBatchImport(rowsToImport?: ParsedImportRow[], sourceLabel?: string): Promise<void> {
    const rows = (rowsToImport || this.parsedRows()).filter(r => r.isValid);
    if (rows.length === 0) {
      this.notificationService.warning('No hay productos válidos para importar.');
      return;
    }

    this.isImporting.set(true);
    this.importProgress.set(0);

    const companyId = this.authService.companyId() || 1;

    // 1. Obtener o garantizar tipos de producto y categorías
    let defaultTypeId = 1;
    let defaultCatId = 1;

    try {
      const typesRes = await this.productTypeService.getProductTypes();
      const types = Array.isArray(typesRes?.data) ? typesRes.data : [];
      if (types.length > 0 && types[0].id) {
        defaultTypeId = types[0].id;
      }
    } catch {
      // Ignorar si usa id por defecto
    }

    try {
      const catsRes = await this.categoryService.getCategories();
      const cats = Array.isArray(catsRes?.data) ? catsRes.data : [];
      if (cats.length > 0 && cats[0].id) {
        defaultCatId = cats[0].id;
      }
    } catch {
      // Ignorar si usa id por defecto
    }

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const payload: ProductDto = {
        description: row.description,
        barcode: row.barcode || `AUTO-${Date.now()}-${i + 1}`,
        reference: row.reference || `REF-${i + 1}`,
        cost: row.cost,
        price: row.price,
        priceList: row.price,
        stock: row.stock,
        minimumQuantity: row.minQuantity,
        companyId,
        productTypeId: defaultTypeId,
        categoryId: defaultCatId,
        unitOfMeasurementId: 1,
        invoiceWithoutStock: false
      };

      try {
        await this.productService.createProduct(payload);
        successCount++;
      } catch (err) {
        console.warn(`Error al importar fila ${row.rowNumber} (${row.description}):`, err);
        failCount++;
      }

      const progress = Math.round(((i + 1) / rows.length) * 100);
      this.importProgress.set(progress);
    }

    this.isImporting.set(false);
    this.importStats.set({ total: rows.length, success: successCount, failed: failCount });

    if (successCount > 0) {
      this.notificationService.success(`¡Éxito! Se importaron ${successCount} productos correctamente.`);
      this.imported.emit();
    } else {
      this.notificationService.error('No se pudo importar ningún producto. Verifique los datos o la conexión.');
    }
  }
}
