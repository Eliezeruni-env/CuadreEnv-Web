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

  // Sorting
  sortColumn = signal<string>('code');
  sortDirection = signal<'asc' | 'desc'>('asc');

  toggleSort(column: string) {
    if (this.sortColumn() === column) {
      this.sortDirection.set(this.sortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortColumn.set(column);
      this.sortDirection.set('asc');
    }
  }

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

    const col = this.sortColumn();
    const dir = this.sortDirection();
    return [...list].sort((a, b) => {
      let valA: any = '';
      let valB: any = '';
      switch (col) {
        case 'code':
          valA = a.code.toLowerCase();
          valB = b.code.toLowerCase();
          break;
        case 'name':
          valA = a.name.toLowerCase();
          valB = b.name.toLowerCase();
          break;
        case 'category':
          valA = (a.categoryName || '').toLowerCase();
          valB = (b.categoryName || '').toLowerCase();
          break;
        case 'price':
          valA = a.price || 0;
          valB = b.price || 0;
          break;
        case 'cost':
          valA = a.cost || 0;
          valB = b.cost || 0;
          break;
        case 'margin':
          valA = this.getProfitMargin(a);
          valB = this.getProfitMargin(b);
          break;
        case 'status':
          valA = a.isActive ? 1 : 0;
          valB = b.isActive ? 1 : 0;
          break;
        default:
          valA = a.code.toLowerCase();
          valB = b.code.toLowerCase();
      }
      if (valA < valB) return dir === 'asc' ? -1 : 1;
      if (valA > valB) return dir === 'asc' ? 1 : -1;
      return 0;
    });
  });

  async ngOnInit() {
    await Promise.all([this.loadServices(), this.loadCategories()]);
  }

  async loadCategories() {
    try {
      const res = await this.categoryService.getCategories();
      if (res.success && Array.isArray(res.data) && res.data.length > 0) {
        this.categories.set(res.data);
      } else {
        this.categories.set([
          { id: 1, name: 'Mantenimiento' },
          { id: 2, name: 'Instalación' },
          { id: 3, name: 'Consultoría' },
        ]);
      }
    } catch {
      this.categories.set([
        { id: 1, name: 'Mantenimiento' },
        { id: 2, name: 'Instalación' },
        { id: 3, name: 'Consultoría' },
      ]);
    }
  }

  async loadServices() {
    this.isLoading.set(true);
    try {
      const list = await this.serviceService.getServices();
      this.services.set(Array.isArray(list) ? list : []);
    } catch (e) {
      this.services.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  openCreateModal() {
    if (this.serviceModal) {
      this.serviceModal.openCreate();
    }
  }

  openViewModal(service: ServiceItemDto) {
    if (this.serviceModal) {
      this.serviceModal.openView(service);
    }
  }

  openEditModal(service: ServiceItemDto) {
    if (this.serviceModal) {
      this.serviceModal.openEdit(service);
    }
  }

  onServiceSaved(_service?: any) {
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
