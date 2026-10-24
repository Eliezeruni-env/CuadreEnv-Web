import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CategoryService } from '../../services/category.service';
import { ProductTypeService } from '../../services/product-type.service';
import { UnitOfMeasurementService, type UnitOfMeasurement } from '../../services/unit-of-measurement.service';
import { TranslationService } from '../../../cuadreEnv/services/translation.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { ConfirmDialogService } from '../../../cuadreEnv/services/confirm-dialog.service';
import { AuthService } from '../../../cuadreEnv/services/auth.service';
import { applyFieldErrorsToForm } from '../../../cuadreEnv/utils/api-error-mapper';
import {
  CardComponent,
  CardBodyComponent,
  ContainerComponent,
  ButtonDirective,
  FormControlDirective,
  FormDirective,
  SpinnerComponent,
  AlertComponent,
  TableDirective
} from '@coreui/angular';
import { IconDirective } from '@coreui/icons-angular';
import { ListPaginationComponent } from '../../../cuadreEnv/components/list-pagination/list-pagination.component';

@Component({
  selector: 'app-product-settings',
  templateUrl: './product-settings.component.html',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ContainerComponent,
    CardComponent,
    CardBodyComponent,
    ButtonDirective,
    FormControlDirective,
    FormDirective,
    SpinnerComponent,
    AlertComponent,
    TableDirective,
    IconDirective,
    ListPaginationComponent
  ]
})
export class ProductSettingsComponent implements OnInit {
  readonly translationService = inject(TranslationService);
  private categoryService = inject(CategoryService);
  private productTypeService = inject(ProductTypeService);
  readonly unitService = inject(UnitOfMeasurementService);
  private notificationService = inject(NotificationService);
  private confirmService = inject(ConfirmDialogService);
  private authService = inject(AuthService);
  private fb = inject(FormBuilder);

  activeTab = signal<string>('categories');
  isLoading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);

  // Categories Data & Pagination
  categories = signal<any[]>([]);
  categoriesPage = signal<number>(1);
  categoriesPageSize = 10;
  categoriesTotal = signal<number>(0);

  // Product Types Data & Pagination
  productTypes = signal<any[]>([]);
  productTypesPage = signal<number>(1);
  productTypesPageSize = 10;
  productTypesTotal = signal<number>(0);

  // Units of Measurement Data & Pagination
  units = signal<UnitOfMeasurement[]>([]);
  unitsPage = signal<number>(1);
  unitsPageSize = 10;
  unitsTotal = signal<number>(0);

  // Modals visibility and models
  isCategoryModalVisible = false;
  categoryForm: FormGroup;
  editingCategory: any = null;

  isTypeModalVisible = false;
  typeForm: FormGroup;
  editingType: any = null;

  isUnitModalVisible = false;
  unitForm: FormGroup;
  editingUnit: UnitOfMeasurement | null = null;

  constructor() {
    this.categoryForm = this.fb.group({
      description: ['', [Validators.required, Validators.maxLength(100)]]
    });

    this.typeForm = this.fb.group({
      description: ['', [Validators.required, Validators.maxLength(100)]]
    });

    this.unitForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(80)]],
      symbol: ['', [Validators.required, Validators.maxLength(15)]],
      allowsDecimals: [false],
      description: ['', [Validators.maxLength(200)]]
    });
  }

  ngOnInit(): void {
    this.loadData();
  }

  setTab(tabName: string) {
    this.activeTab.set(tabName);
    this.errorMessage.set(null);
  }

  async loadData() {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      await Promise.all([
        this.loadCategories(),
        this.loadProductTypes(),
        this.loadUnits()
      ]);
    } catch (e: any) {
      const mapped = this.notificationService.showApiError(e);
      this.errorMessage.set(mapped.message);
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadCategories() {
    try {
      const res = await this.categoryService.getCategories();
      if (res.success && res.data) {
        const arr = res.data || [];
        this.categories.set(arr);
        this.categoriesTotal.set(arr.length);
      }
    } catch (e: any) {
      console.error('Error loading categories:', e);
    }
  }

  get paginatedCategories(): any[] {
    const start = (this.categoriesPage() - 1) * this.categoriesPageSize;
    return this.categories().slice(start, start + this.categoriesPageSize);
  }

  onCategoriesPageChange(page: number) {
    this.categoriesPage.set(page);
  }

  async loadProductTypes() {
    try {
      const res = await this.productTypeService.getPagedProductTypes(
        this.productTypesPage(),
        this.productTypesPageSize
      );
      if (res.success && res.data) {
        const pagedData = res.data as any;
        if (pagedData.items) {
          this.productTypes.set(pagedData.items);
          this.productTypesTotal.set(pagedData.totalItemCount || pagedData.total || pagedData.items.length);
        } else {
          const arr = Array.isArray(res.data) ? res.data : [];
          this.productTypes.set(arr);
          this.productTypesTotal.set(arr.length);
        }
      }
    } catch (e: any) {
      console.error('Error loading product types:', e);
    }
  }

  onProductTypesPageChange(page: number) {
    this.productTypesPage.set(page);
    this.loadProductTypes();
  }

  // Category Modal actions
  openCreateCategory() {
    this.editingCategory = null;
    this.categoryForm.reset({ description: '' });
    this.isCategoryModalVisible = true;
  }

  openEditCategory(cat: any) {
    this.editingCategory = cat;
    this.categoryForm.patchValue({ description: cat.description || '' });
    this.isCategoryModalVisible = true;
  }

  closeCategoryModal() {
    this.isCategoryModalVisible = false;
    this.editingCategory = null;
  }

  async saveCategory() {
    if (this.categoryForm.invalid) {
      this.categoryForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    const formVal = this.categoryForm.value;
    const description = String(formVal.description || '').trim();

    try {
      if (this.editingCategory) {
        const res = await this.categoryService.updateCategory(this.editingCategory.id, {
          id: this.editingCategory.id,
          description,
        });
        if (res.success) {
          this.notificationService.success('Categoría actualizada exitosamente.');
          await this.loadCategories();
          this.closeCategoryModal();
        }
      } else {
        const res = await this.categoryService.createCategory({ description });
        if (res.success) {
          this.notificationService.success('Categoría creada exitosamente.');
          await this.loadCategories();
          this.closeCategoryModal();
        }
      }
    } catch (e: any) {
      const mapped = this.notificationService.showApiError(e);
      if (mapped.fieldErrors) {
        applyFieldErrorsToForm(this.categoryForm, mapped.fieldErrors);
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  async deleteCategory(cat: any) {
    const confirmed = await this.confirmService.confirm({
      title: '¿Eliminar categoría?',
      message: '¿Estás seguro de que deseas eliminar esta categoría? Los productos asociados podrían verse afectados.',
      itemName: cat.description || `Categoría #${cat.id}`,
      itemType: 'Categoría',
      confirmText: 'Eliminar',
      variant: 'danger',
    });
    if (!confirmed) return;

    this.isLoading.set(true);
    try {
      await this.categoryService.deleteCategory(cat.id);
      this.notificationService.success('Categoría eliminada exitosamente.');
      await this.loadCategories();
    } catch (e: any) {
      this.notificationService.showApiError(e);
    } finally {
      this.isLoading.set(false);
    }
  }

  // Product Type Modal actions
  openCreateType() {
    this.editingType = null;
    this.typeForm.reset({ description: '' });
    this.isTypeModalVisible = true;
  }

  openEditType(type: any) {
    this.editingType = type;
    this.typeForm.patchValue({ description: type.description || '' });
    this.isTypeModalVisible = true;
  }

  closeTypeModal() {
    this.isTypeModalVisible = false;
    this.editingType = null;
  }

  async saveType() {
    if (this.typeForm.invalid) {
      this.typeForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    const formVal = this.typeForm.value;
    const description = String(formVal.description || '').trim();
    const companyId = this.authService.companyId() || 0;

    try {
      if (this.editingType) {
        // Edit type
        const res = await this.productTypeService.updateProductType({
          id: this.editingType.id,
          description,
          companyId
        });
        this.notificationService.success('Tipo de producto actualizado exitosamente.');
      } else {
        // Create type
        const res = await this.productTypeService.createProductType({
          description,
          companyId
        });
        this.notificationService.success('Tipo de producto creado exitosamente.');
      }
      await this.loadProductTypes();
      this.closeTypeModal();
    } catch (e: any) {
      const mapped = this.notificationService.showApiError(e);
      if (mapped.fieldErrors) {
        applyFieldErrorsToForm(this.typeForm, mapped.fieldErrors);
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  async deleteType(type: any) {
    const confirmed = await this.confirmService.confirm({
      title: '¿Eliminar tipo de producto?',
      message: '¿Estás seguro de que deseas eliminar este tipo de producto? Esta acción no se puede deshacer.',
      itemName: type.description || `Tipo #${type.id}`,
      itemType: 'Tipo de Producto',
      confirmText: 'Eliminar',
      variant: 'danger',
    });
    if (!confirmed) return;

    this.isLoading.set(true);
    try {
      await this.productTypeService.deleteProductType(type.id);
      this.notificationService.success('Tipo de producto eliminado exitosamente.');
      await this.loadProductTypes();
    } catch (e: any) {
      this.notificationService.showApiError(e);
    } finally {
      this.isLoading.set(false);
    }
  }

  // Units of Measurement Logic
  async loadUnits() {
    try {
      const res = await this.unitService.getUnitsOfMeasurement();
      if (res.success && res.data) {
        this.units.set(res.data);
        this.unitsTotal.set(res.data.length);
      }
    } catch (e: any) {
      console.error('Error loading units of measurement:', e);
    }
  }

  get paginatedUnits(): UnitOfMeasurement[] {
    const start = (this.unitsPage() - 1) * this.unitsPageSize;
    return this.units().slice(start, start + this.unitsPageSize);
  }

  onUnitsPageChange(page: number) {
    this.unitsPage.set(page);
  }

  openCreateUnit() {
    this.editingUnit = null;
    this.unitForm.reset({
      name: '',
      symbol: '',
      allowsDecimals: false,
      description: ''
    });
    this.isUnitModalVisible = true;
  }

  openEditUnit(unit: UnitOfMeasurement) {
    this.editingUnit = unit;
    this.unitForm.patchValue({
      name: unit.name,
      symbol: unit.symbol,
      allowsDecimals: unit.allowsDecimals,
      description: unit.description || ''
    });
    this.isUnitModalVisible = true;
  }

  closeUnitModal() {
    this.isUnitModalVisible = false;
    this.editingUnit = null;
  }

  async saveUnit() {
    if (this.unitForm.invalid) {
      this.unitForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    const formVal = this.unitForm.value;

    try {
      if (this.editingUnit) {
        const res = await this.unitService.updateUnitOfMeasurement(this.editingUnit.id, {
          name: formVal.name,
          symbol: formVal.symbol,
          allowsDecimals: formVal.allowsDecimals,
          description: formVal.description
        });
        if (res.success) {
          this.notificationService.success('Unidad de medida actualizada exitosamente.');
          await this.loadUnits();
          this.closeUnitModal();
        } else {
          this.notificationService.error(res.message || 'Error al actualizar unidad.');
        }
      } else {
        const res = await this.unitService.createUnitOfMeasurement({
          name: formVal.name,
          symbol: formVal.symbol,
          allowsDecimals: formVal.allowsDecimals,
          description: formVal.description
        });
        if (res.success) {
          this.notificationService.success('Unidad de medida creada exitosamente.');
          await this.loadUnits();
          this.closeUnitModal();
        } else {
          this.notificationService.error(res.message || 'Error al crear unidad.');
        }
      }
    } catch (e: any) {
      this.notificationService.showApiError(e);
    } finally {
      this.isLoading.set(false);
    }
  }

  async deleteUnit(unit: UnitOfMeasurement) {
    if (unit.isSystem) {
      this.notificationService.warning('Las unidades de medida estándar del sistema no pueden eliminarse.');
      return;
    }

    const confirmed = await this.confirmService.confirm({
      title: '¿Eliminar unidad de medida?',
      message: '¿Estás seguro de que deseas eliminar esta unidad de medida? Los productos que la utilicen mantendrán su histórico.',
      itemName: `${unit.name} (${unit.symbol})`,
      itemType: 'Unidad de Medida',
      confirmText: 'Eliminar',
      variant: 'danger',
    });
    if (!confirmed) return;

    this.isLoading.set(true);
    try {
      const res = await this.unitService.deleteUnitOfMeasurement(unit.id);
      if (res.success) {
        this.notificationService.success('Unidad de medida eliminada exitosamente.');
        await this.loadUnits();
      } else {
        this.notificationService.error(res.message || 'Error al eliminar unidad.');
      }
    } catch (e: any) {
      this.notificationService.showApiError(e);
    } finally {
      this.isLoading.set(false);
    }
  }
}

