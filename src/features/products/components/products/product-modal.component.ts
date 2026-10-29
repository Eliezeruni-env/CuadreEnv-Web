import { Component, Input, Output, EventEmitter, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ProductService } from '../../services/product.service';
import { ProductTypeService } from '../../services/product-type.service';
import { CategoryService } from '../../services/category.service';
import { UnitOfMeasurementService, type UnitOfMeasurement } from '../../services/unit-of-measurement.service';
import { ProductPackagingService, type ProductPackaging } from '../../services/product-packaging.service';
import { TranslationService } from '../../../cuadreEnv/services/translation.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { ConfirmDialogService } from '../../../cuadreEnv/services/confirm-dialog.service';
import { AuthService } from '../../../cuadreEnv/services/auth.service';
import { applyFieldErrorsToForm } from '../../../cuadreEnv/utils/api-error-mapper';
import {
  type ProductDto,
} from '../../../cuadreEnv/types/api';
import { generateDominicanEan13 } from '../../../cuadreEnv/utils/barcode.util';
import {
  ButtonDirective,
  ColComponent,
  FormControlDirective,
  FormDirective,
  RowComponent,
  SpinnerComponent
} from '@coreui/angular';
import { IconDirective } from '@coreui/icons-angular';

@Component({
  selector: 'app-product-modal',
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
    IconDirective
  ],
  templateUrl: './product-modal.component.html',
  styleUrls: ['./product-modal.component.scss']
})
export class ProductModalComponent {
  readonly translationService = inject(TranslationService);
  private productService = inject(ProductService);
  private productTypeService = inject(ProductTypeService);
  private categoryService = inject(CategoryService);
  private unitService = inject(UnitOfMeasurementService);
  private packagingService = inject(ProductPackagingService);
  private notificationService = inject(NotificationService);
  private confirmService = inject(ConfirmDialogService);
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);

  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() saved = new EventEmitter<void>();

  isEditMode = false;
  selectedProductId: number | null = null;
  isLoading = signal<boolean>(false);

  productTypes = signal<any[]>([]);
  categories = signal<any[]>([]);
  units = signal<UnitOfMeasurement[]>([]);

  missingLookups = signal<boolean>(false);
  missingLookupMessage = signal<string>('');

  productForm: FormGroup;

  constructor() {
    this.productForm = this.fb.group({
      description: ['', [Validators.required, Validators.maxLength(200)]],
      barcode: ['', [Validators.maxLength(100)]],
      reference: ['', [Validators.maxLength(50)]],
      productTypeId: [null, [Validators.required]],
      categoryId: [null, [Validators.required]],
      unitOfMeasurementId: [1, [Validators.required]],
      cost: [0, [Validators.required, Validators.min(0.01)]],
      price: [0, [Validators.min(0)]],
      imageUrl: [''],
      allowFractional: [false],
      stock: [0, [Validators.required, Validators.min(0)]],
      shortDescription: ['', [Validators.maxLength(200)]],
      minimumQuantity: [0, [Validators.min(0)]],
      maximumQuantity: [0, [Validators.min(0)]],
      invoiceWithoutStock: [false],
      expirationDate: [''],
      isOrganic: [false],
      // Empaque Mayor y Venta al Detalle
      hasPackaging: [false],
      packageUnitName: ['Saco'],
      packageUnitsCount: [100, [Validators.min(0.01)]],
      packagePrice: [0, [Validators.min(0)]],
      packageCost: [0, [Validators.min(0)]],
      hasIndividualUnit: [false],
      individualUnitName: ['Unidad suelta'],
      individualUnitPrice: [0, [Validators.min(0)]],
      individualUnitWeight: [1, [Validators.min(0.001)]],
    });
  }

  async loadLookups(): Promise<boolean> {
    this.missingLookups.set(false);
    this.missingLookupMessage.set('');

    let typeItems: any[] = [];
    let catItems: any[] = [];
    let unitItems: any[] = [];

    // 1. Product Types
    try {
      const typesRes = await this.productTypeService.getProductTypes();
      typeItems = Array.isArray(typesRes?.data) ? typesRes.data : [];
      // Filtrar tipo Servicio: los servicios tienen su propio módulo y catálogo
      typeItems = typeItems.filter((t: any) => {
        const name = (t.name || t.description || '').toLowerCase();
        return t.id !== 2 && !name.includes('serv');
      });
      if (typeItems.length === 0) {
        typeItems = [{ id: 1, name: 'Estándar', description: 'Estándar' }];
      }
      this.productTypes.set(typeItems);
    } catch {
      typeItems = [{ id: 1, name: 'Estándar', description: 'Estándar' }];
      this.productTypes.set(typeItems);
    }

    // 2. Categories
    try {
      const catsRes = await this.categoryService.getCategories();
      catItems = Array.isArray(catsRes?.data) ? catsRes.data : [];
      if (catItems.length === 0) {
        try {
          const created = await this.categoryService.createCategory({ description: 'General' });
          const createdData = created?.data?.data || created?.data || { id: 1, description: 'General', name: 'General' };
          catItems = [createdData];
        } catch {
          catItems = [{ id: 1, description: 'General', name: 'General' }];
        }
      }
      this.categories.set(catItems);
    } catch {
      catItems = [{ id: 1, description: 'General', name: 'General' }];
      this.categories.set(catItems);
    }

    // 3. Units of Measurement
    try {
      const unitsRes = await this.unitService.getUnitsOfMeasurement();
      unitItems = Array.isArray(unitsRes?.data) ? unitsRes.data : [];
      if (unitItems.length === 0) {
        unitItems = [{ id: 1, name: 'Unidad', symbol: 'und' }];
      }
      this.units.set(unitItems);
    } catch {
      unitItems = [{ id: 1, name: 'Unidad', symbol: 'und' }];
      this.units.set(unitItems);
    }

    return true;
  }

  goToSettings() {
    this.close();
    this.router.navigate(['/products/settings']);
  }

  async openCreate() {
    this.isEditMode = false;
    this.selectedProductId = null;
    await this.loadLookups();
    this.productForm.reset({
      description: '',
      barcode: '',
      reference: '',
      productTypeId: this.productTypes().length > 0 ? this.productTypes()[0].id : null,
      categoryId: this.categories().length > 0 ? this.categories()[0].id : null,
      unitOfMeasurementId: this.units().length > 0 ? this.units()[0].id : 1,
      cost: 0,
      stock: 0,
      shortDescription: '',
      minimumQuantity: 0,
      maximumQuantity: 0,
      invoiceWithoutStock: false,
      expirationDate: '',
      isOrganic: false,
      hasPackaging: false,
      packageUnitName: 'Saco',
      packageUnitsCount: 100,
      packagePrice: 0,
      packageCost: 0,
      hasIndividualUnit: false,
      individualUnitName: 'Unidad suelta',
      individualUnitPrice: 0,
      individualUnitWeight: 1,
    });
    this.visible = true;
    this.visibleChange.emit(true);
  }

  async openEdit(product: ProductDto) {
    this.isEditMode = true;
    this.selectedProductId = product.id || null;
    await this.loadLookups();
    const pkg = product.id ? this.packagingService.getPackaging(product.id) : undefined;
    const photo = product.imageUrl || (product.id ? this.productService.getProductPhoto(product.id) : null) || (product.barcode ? this.productService.getProductPhoto(product.barcode) : null) || '';
    const calcPrice = product.price || (product.cost ? Math.round(Number(product.cost) * 1.35 * 100) / 100 : 0);

    this.productForm.patchValue({
      description: product.description || '',
      barcode: product.barcode || '',
      reference: product.reference || '',
      productTypeId: product.productTypeId || (this.productTypes().length > 0 ? this.productTypes()[0].id : null),
      categoryId: product.categoryId || (this.categories().length > 0 ? this.categories()[0].id : null),
      unitOfMeasurementId: product.unitOfMeasurementId || (this.units().length > 0 ? this.units()[0].id : 1),
      cost: product.cost || 0,
      price: calcPrice,
      imageUrl: photo,
      allowFractional: Boolean(product.allowFractional),
      stock: product.stock || 0,
      shortDescription: product.shortDescription || '',
      minimumQuantity: product.minimumQuantity || 0,
      maximumQuantity: product.maximumQuantity || 0,
      invoiceWithoutStock: product.invoiceWithoutStock || false,
      expirationDate: product.expirationDate ? product.expirationDate.split('T')[0] : '',
      isOrganic: Boolean(product.isOrganic),
      hasPackaging: pkg?.hasPackaging ?? false,
      packageUnitName: pkg?.packageUnitName || 'Saco',
      packageUnitsCount: pkg?.packageUnitsCount || 100,
      packagePrice: pkg?.packagePrice || 0,
      packageCost: pkg?.packageCost || 0,
      hasIndividualUnit: pkg?.hasIndividualUnit ?? false,
      individualUnitName: pkg?.individualUnitName || 'Unidad suelta',
      individualUnitPrice: pkg?.individualUnitPrice || 0,
      individualUnitWeight: pkg?.individualUnitWeight || 1,
    });
    this.visible = true;
    this.visibleChange.emit(true);
  }

  close() {
    this.visible = false;
    this.visibleChange.emit(false);
  }

  getSelectedUnitSymbol(): string {
    const unitId = Number(this.productForm.get('unitOfMeasurementId')?.value);
    const u = this.units().find(unit => unit.id === unitId);
    return u?.symbol || 'und';
  }

  getCalculatedStockEquivalence(): string {
    const stock = Number(this.productForm.get('stock')?.value) || 0;
    const hasPkg = Boolean(this.productForm.get('hasPackaging')?.value);
    const factor = Number(this.productForm.get('packageUnitsCount')?.value) || 1;
    const pkgName = this.productForm.get('packageUnitName')?.value || 'Saco';
    const symbol = this.getSelectedUnitSymbol();

    if (!hasPkg || factor <= 0 || stock <= 0) return '';
    const full = Math.floor(stock / factor);
    const remainder = Math.round((stock % factor) * 100) / 100;
    if (full > 0 && remainder > 0) {
      return `Equivale a: ${full} ${full === 1 ? pkgName : pkgName + 's'} + ${remainder} ${symbol} al detalle`;
    } else if (full > 0) {
      return `Equivale a: ${full} ${full === 1 ? pkgName : pkgName + 's'} completos`;
    } else {
      return `Equivale a: ${remainder} ${symbol} al detalle (< 1 ${pkgName})`;
    }
  }

  generateBarcodeForProduct() {
    const formVal = this.productForm.value;
    const name = String(formVal.description || '').trim();
    const ref = String(formVal.reference || '').trim();
    const catId = formVal.categoryId ? Number(formVal.categoryId) : null;
    const generated = generateDominicanEan13(catId, name || ref);
    this.productForm.patchValue({ barcode: generated });
    this.notificationService.info(`Código de barra EAN-13 generado: ${generated}`);
  }

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      if (file.size > 5 * 1024 * 1024) {
        this.notificationService.warning('La foto no debe superar 5MB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        this.productForm.patchValue({ imageUrl: dataUrl });
      };
      reader.readAsDataURL(file);
    }
  }

  removePhoto(): void {
    this.productForm.patchValue({ imageUrl: '' });
  }

  getMarginStats() {
    const cost = Number(this.productForm.get('cost')?.value) || 0;
    const price = Number(this.productForm.get('price')?.value) || 0;
    const profit = Math.max(0, price - cost);
    const marginPct = price > 0 ? Math.round(((price - cost) / price) * 100) : 0;
    return { cost, price, profit, marginPct };
  }

  async saveProduct() {
    if (this.productForm.invalid) {
      this.productForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    const formVal = this.productForm.value;
    const name = String(formVal.description || '').trim();

    // Auto-generación de código de barras EAN-13 si no se digitó ninguno
    let barcode = String(formVal.barcode || '').trim();
    if (!barcode) {
      const catId = formVal.categoryId ? Number(formVal.categoryId) : null;
      barcode = generateDominicanEan13(catId, name || formVal.reference);
      this.productForm.patchValue({ barcode });
    }

    // pre-flight duplicate check
    if (!this.isEditMode) {
      try {
        const searchRes = await this.productService.searchProducts(name);
        const existing = searchRes?.data || [];
        if (existing && existing.some(p => (p.description || '').toLowerCase() === name.toLowerCase())) {
          this.notificationService.error('El nombre del producto ya existe.');
          this.productForm.get('description')?.setErrors({ duplicate: true });

          const inputEl = document.querySelector('input[formControlName="description"]') as HTMLInputElement;
          if (inputEl) {
            inputEl.focus();
          }
          this.isLoading.set(false);
          return;
        }

        if (barcode && existing.some(p => (p.barcode || '').trim() === barcode)) {
          this.notificationService.error('El código de barras ya está registrado en otro producto.');
          this.productForm.get('barcode')?.setErrors({ duplicate: true });
          this.isLoading.set(false);
          return;
        }
      } catch (err) {
        console.warn('Error doing pre-flight check:', err);
      }
    }

    const defaultTypeId = this.productTypes().length > 0 ? Number(this.productTypes()[0].id) : 1;
    const defaultCatId = this.categories().length > 0 ? Number(this.categories()[0].id) : 1;
    const defaultUnitId = this.units().length > 0 ? Number(this.units()[0].id) : 1;

    const payload: ProductDto = {
      description: name,
      cost: Number(formVal.cost) || 0,
      price: Number(formVal.price) || (Number(formVal.cost) * 1.35),
      imageUrl: formVal.imageUrl || null,
      allowFractional: Boolean(formVal.allowFractional),
      stock: Number(formVal.stock) || 0,
      invoiceWithoutStock: Boolean(formVal.invoiceWithoutStock),
      barcode: barcode,
      reference: String(formVal.reference || '').trim(),
      shortDescription: String(formVal.shortDescription || '').trim(),
      minimumQuantity: Number(formVal.minimumQuantity) || 0,
      maximumQuantity: Number(formVal.maximumQuantity) || 0,
      unitOfMeasurementId: formVal.unitOfMeasurementId ? Number(formVal.unitOfMeasurementId) : defaultUnitId,
      productTypeId: formVal.productTypeId ? Number(formVal.productTypeId) : defaultTypeId,
      categoryId: formVal.categoryId ? Number(formVal.categoryId) : defaultCatId,
      expirationDate: formVal.expirationDate ? String(formVal.expirationDate).trim() : null,
      isOrganic: Boolean(formVal.isOrganic),
    };

    try {
      let savedId: number | null = null;
      if (this.isEditMode) {
        payload.id = this.selectedProductId!;
        await this.productService.updateProduct(payload);
        savedId = this.selectedProductId;
        this.notificationService.success('Producto actualizado exitosamente.');
      } else {
        const createRes = await this.productService.createProduct(payload);
        savedId = (createRes as any)?.data?.id ?? (createRes as any)?.data?.Id ?? (createRes as any)?.id ?? null;
        if (!savedId) {
          try {
            const search = await this.productService.searchProducts(name);
            const found = search?.data?.find(p => p.description?.toLowerCase() === name.toLowerCase());
            if (found?.id) savedId = found.id;
          } catch {
            // ignore
          }
        }
        this.notificationService.success('Producto creado exitosamente.');
      }

      if (savedId) {
        if (formVal.imageUrl) {
          this.productService.saveProductPhoto(savedId, formVal.imageUrl);
          if (barcode) {
            this.productService.saveProductPhoto(barcode, formVal.imageUrl);
          }
        }
        if (formVal.hasPackaging) {
          this.packagingService.savePackaging({
            productId: savedId,
            hasPackaging: true,
            packageUnitName: formVal.packageUnitName || 'Saco',
            packageUnitsCount: Number(formVal.packageUnitsCount) || 1,
            packagePrice: Number(formVal.packagePrice) || 0,
            packageCost: Number(formVal.packageCost) || 0,
            hasIndividualUnit: Boolean(formVal.hasIndividualUnit),
            individualUnitName: formVal.individualUnitName || 'Unidad suelta',
            individualUnitPrice: Number(formVal.individualUnitPrice) || 0,
            individualUnitWeight: Number(formVal.individualUnitWeight) || 1,
          });
        } else {
          this.packagingService.deletePackaging(savedId);
        }
      }

      this.saved.emit();
      this.close();
    } catch (e: any) {
      const mapped = this.notificationService.showApiError(e);
      if (mapped.fieldErrors) {
        applyFieldErrorsToForm(this.productForm, mapped.fieldErrors);
      }
      if (mapped.errorCode === 'DUPLICATE_NAME') {
        this.productForm.get('description')?.setErrors({ duplicate: true });
        const inputEl = document.querySelector('input[formControlName="description"]') as HTMLInputElement;
        if (inputEl) {
          inputEl.focus();
        }
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  async deleteProduct() {
    if (!this.selectedProductId) return;
    const productName = this.productForm.get('description')?.value || `Producto #${this.selectedProductId}`;
    const confirmed = await this.confirmService.confirm({
      title: '¿Eliminar producto?',
      message: '¿Estás seguro de que deseas eliminar este producto? Esta acción no se puede deshacer.',
      confirmText: 'Eliminar',
      variant: 'danger',
    });
    if (!confirmed) return;

    this.isLoading.set(true);
    try {
      await this.productService.deleteProduct(this.selectedProductId);
      this.notificationService.success('Producto eliminado exitosamente.');
      this.saved.emit();
      this.close();
    } catch (e: any) {
      this.notificationService.showApiError(e);
    } finally {
      this.isLoading.set(false);
    }
  }
}
