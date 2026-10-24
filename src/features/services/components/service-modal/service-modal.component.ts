import { Component, Input, Output, EventEmitter, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ServiceService } from '../../services/service.service';
import { CategoryService } from '../../../products/services/category.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { ServiceItemDto } from '../../models/service-item.model';
import {
  ButtonDirective,
  FormControlDirective,
  FormDirective,
  SpinnerComponent,
} from '@coreui/angular';
import { IconDirective } from '@coreui/icons-angular';

@Component({
  selector: 'app-service-modal',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    SpinnerComponent,
    IconDirective,
  ],
  templateUrl: './service-modal.component.html',
})
export class ServiceModalComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly serviceService = inject(ServiceService);
  private readonly categoryService = inject(CategoryService);
  private readonly notification = inject(NotificationService);

  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() saved = new EventEmitter<ServiceItemDto>();

  isEditMode = false;
  selectedServiceId: number | null = null;
  isLoading = signal<boolean>(false);
  categories = signal<any[]>([]);

  form: FormGroup = this.fb.group({
    code: ['', [Validators.required]],
    name: ['', [Validators.required, Validators.minLength(2)]],
    description: [''],
    categoryId: [null],
    price: [0, [Validators.required, Validators.min(0.01)]],
    cost: [0, [Validators.min(0)]],
    estimatedDuration: [''],
    taxRate: [0.18],
    isActive: [true],
  });

  async ngOnInit() {
    await this.loadCategories();
  }

  async loadCategories() {
    try {
      const res = await this.categoryService.getCategories();
      if (res.success && Array.isArray(res.data)) {
        this.categories.set(res.data);
      }
    } catch {
      // ignore
    }
  }

  openCreate() {
    this.isEditMode = false;
    this.selectedServiceId = null;
    this.form.reset({
      code: this.serviceService.generateServiceCode(),
      name: '',
      description: '',
      categoryId: this.categories()[0]?.id || null,
      price: 0,
      cost: 0,
      estimatedDuration: '',
      taxRate: 0.18,
      isActive: true,
    });
    this.visible = true;
    this.visibleChange.emit(true);
  }

  openEdit(service: ServiceItemDto) {
    this.isEditMode = true;
    this.selectedServiceId = service.id ?? null;
    this.form.reset({
      code: service.code,
      name: service.name,
      description: service.description || '',
      categoryId: service.categoryId || null,
      price: service.price || 0,
      cost: service.cost || 0,
      estimatedDuration: service.estimatedDuration || '',
      taxRate: service.taxRate ?? 0.18,
      isActive: service.isActive !== false,
    });
    this.visible = true;
    this.visibleChange.emit(true);
  }

  close() {
    this.visible = false;
    this.visibleChange.emit(false);
  }

  async onSubmit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notification.warning('Por favor completa todos los campos requeridos correctamente.');
      return;
    }

    const val = this.form.value;
    let codeStr = String(val.code || '').trim().toUpperCase();
    if (!codeStr.startsWith('SERV-')) {
      codeStr = `SERV-${codeStr}`;
    }

    this.isLoading.set(true);
    try {
      const selectedCatId = val.categoryId ? Number(val.categoryId) : undefined;
      const selectedCat = selectedCatId ? this.categories().find((c: any) => c.id === selectedCatId) : null;
      const categoryName = selectedCat ? (selectedCat.description || selectedCat.name || selectedCat.Description || selectedCat.Name) : undefined;

      if (this.isEditMode && this.selectedServiceId) {
        const updated = await this.serviceService.updateService(this.selectedServiceId, {
          code: codeStr,
          name: val.name.trim(),
          description: val.description ? val.description.trim() : undefined,
          categoryId: selectedCatId,
          categoryName,
          price: Number(val.price),
          cost: Number(val.cost || 0),
          estimatedDuration: val.estimatedDuration,
          taxRate: Number(val.taxRate),
          isActive: Boolean(val.isActive),
        });
        this.notification.success(`Servicio ${updated.code} actualizado correctamente.`);
        this.saved.emit(updated);
      } else {
        const created = await this.serviceService.createService({
          code: codeStr,
          name: val.name.trim(),
          description: val.description ? val.description.trim() : undefined,
          categoryId: selectedCatId,
          categoryName,
          price: Number(val.price),
          cost: Number(val.cost || 0),
          estimatedDuration: val.estimatedDuration,
          taxRate: Number(val.taxRate),
          isActive: Boolean(val.isActive),
        });
        this.notification.success(`Servicio ${created.code} registrado en el catálogo.`);
        this.saved.emit(created);
      }
      this.close();
    } catch (e: any) {
      this.notification.error('Error al guardar el servicio.');
    } finally {
      this.isLoading.set(false);
    }
  }
}
