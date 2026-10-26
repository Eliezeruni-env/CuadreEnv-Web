import { Component, OnInit, signal, computed, inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ServiceService } from '../../services/service.service';
import { CategoryService } from '../../../products/services/category.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { ConfirmDialogService } from '../../../cuadreEnv/services/confirm-dialog.service';
import { TranslationService } from '../../../cuadreEnv/services/translation.service';
import { ServiceItemDto } from '../../models/service-item.model';
import { ServiceModalComponent } from '../service-modal/service-modal.component';
import {
  ButtonDirective,
  CardBodyComponent,
  CardComponent,
  CardHeaderComponent,
  SpinnerComponent,
} from '@coreui/angular';
import { IconDirective } from '@coreui/icons-angular';

@Component({
  selector: 'app-services-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    SpinnerComponent,
    IconDirective,
    ServiceModalComponent,
  ],
  templateUrl: './services-list.component.html',
  styleUrls: ['./services-list.component.scss'],
})
export class ServicesListComponent implements OnInit {
  private readonly serviceService = inject(ServiceService);
  private readonly categoryService = inject(CategoryService);
  private readonly notification = inject(NotificationService);
  private readonly confirmService = inject(ConfirmDialogService);
  public readonly translationService = inject(TranslationService);
  private readonly router = inject(Router);

  @ViewChild(ServiceModalComponent) serviceModal!: ServiceModalComponent;

  services = signal<ServiceItemDto[]>([]);
  categories = signal<any[]>([]);
  isLoading = signal<boolean>(false);

  // Filters
  searchQuery = '';
  statusFilter: 'ALL' | 'ACTIVE' | 'INACTIVE' = 'ALL';
  selectedCategoryId: number | null = null;

  // KPIs
  totalCount = computed(() => this.services().length);
  activeCount = computed(() => this.services().filter((s) => s.isActive).length);
  avgPrice = computed(() => {
    const list = this.services();
    if (list.length === 0) return 0;
    const sum = list.reduce((acc, s) => acc + (s.price || 0), 0);
    return sum / list.length;
  });

  filteredServices = computed(() => {
    let list = this.services();

    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase().trim();
      list = list.filter(
        (s) =>
          s.code.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q) ||
          (s.description && s.description.toLowerCase().includes(q))
      );
    }

    if (this.selectedCategoryId) {
      list = list.filter((s) => s.categoryId === this.selectedCategoryId);
    }

    if (this.statusFilter === 'ACTIVE') {
      list = list.filter((s) => s.isActive);
    } else if (this.statusFilter === 'INACTIVE') {
      list = list.filter((s) => !s.isActive);
    }

    return list;
  });

  async ngOnInit() {
    await Promise.all([this.loadServices(), this.loadCategories()]);
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

  async loadServices() {
    this.isLoading.set(true);
    try {
      const list = await this.serviceService.getServices();
      this.services.set(list);
    } catch (e) {
      this.notification.error('Error al cargar la lista de servicios.');
    } finally {
      this.isLoading.set(false);
    }
  }

  openCreateModal() {
    if (this.serviceModal) {
      this.serviceModal.openCreate();
    }
  }

  openEditModal(service: ServiceItemDto) {
    if (this.serviceModal) {
      this.serviceModal.openEdit(service);
    }
  }

  onServiceSaved(_service: ServiceItemDto) {
    this.loadServices();
  }

  async toggleStatus(service: ServiceItemDto) {
    if (!service.id) return;
    try {
      const newStatus = await this.serviceService.toggleServiceStatus(service.id);
      service.isActive = newStatus;
      this.services.set([...this.services()]);
      this.notification.info(`Servicio ${service.code} ${newStatus ? 'activado' : 'desactivado'}.`);
    } catch {
      this.notification.error('No se pudo cambiar el estado del servicio.');
    }
  }

  async deleteService(service: ServiceItemDto) {
    if (!service.id) return;
    const confirmed = await this.confirmService.confirm({
      title: '¿Eliminar Servicio?',
      message: `¿Estás seguro de que deseas eliminar el servicio ${service.code} - "${service.name}"? Esta acción no se puede deshacer.`,
      confirmText: 'Sí, Eliminar',
      cancelText: 'Cancelar',
    });

    if (!confirmed) return;

    try {
      await this.serviceService.deleteService(service.id);
      this.notification.success(`Servicio ${service.code} eliminado correctamente.`);
      await this.loadServices();
    } catch {
      this.notification.error('Error al eliminar el servicio.');
    }
  }

  billService(service: ServiceItemDto) {
    // Navigate to /sales/service passing selected service
    this.router.navigate(['/sales/service'], {
      queryParams: { serviceId: service.id, code: service.code },
    });
  }

  getProfitMargin(service: ServiceItemDto): number {
    if (!service.price || service.price <= 0) return 0;
    const cost = service.cost || 0;
    const margin = ((service.price - cost) / service.price) * 100;
    return Math.max(0, Math.round(margin * 10) / 10);
  }
}
