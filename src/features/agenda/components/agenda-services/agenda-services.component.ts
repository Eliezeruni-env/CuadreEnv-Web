import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IconDirective } from '@coreui/icons-angular';
import { AgendaService } from '../../services/agenda.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { ServiceService } from '../../../services/services/service.service';
import { ProductService } from '../../../products/services/product.service';
import type { ReservableServiceDto, ProfessionalDto } from '../../models/agenda.models';
import type { ServiceItemDto } from '../../../services/models/service-item.model';

@Component({
  selector: 'app-agenda-services',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, IconDirective],
  templateUrl: './agenda-services.component.html',
  styleUrls: ['./agenda-services.component.scss'],
})
export class AgendaServicesComponent implements OnInit {
  private readonly agendaService = inject(AgendaService);
  private readonly serviceService = inject(ServiceService);
  private readonly productService = inject(ProductService);
  private readonly notificationService = inject(NotificationService);

  isLoading = signal<boolean>(true);
  isSaving = signal<boolean>(false);
  services = signal<ReservableServiceDto[]>([]);
  professionals = signal<ProfessionalDto[]>([]);
  catalogServices = signal<ServiceItemDto[]>([]);

  // Pagination
  currentPage = signal<number>(1);
  pageSize = signal<number>(10);
  protected readonly Math = Math;

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.services().length / this.pageSize()));
  }

  get paginatedServices(): ReservableServiceDto[] {
    const page = Math.min(this.currentPage(), this.totalPages);
    const start = (page - 1) * this.pageSize();
    return this.services().slice(start, start + this.pageSize());
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage.set(page);
    }
  }

  // Modal mode: CREATE a brand new service or LINK an existing catalog service
  modalMode = signal<'CREATE' | 'LINK' | 'EDIT'>('CREATE');
  isModalOpen = signal<boolean>(false);
  editingService = signal<ReservableServiceDto | null>(null);

  // Form fields for creating a new service
  formServiceName = '';
  formPrice = 500;

  // Form fields for linking / shared
  formProductId = 0;
  formDurationMinutes = 30;
  formBufferMinutes = 0;
  formIsPublic = true;
  formIsActive = true;
  formColorHex = '#4f46e5';
  selectedProfessionalIds: number[] = [];

  ngOnInit(): void {
    this.loadData();
  }

  async loadData(): Promise<void> {
    try {
      this.isLoading.set(true);
      const [resServices, resProfs] = await Promise.all([
        this.agendaService.getServices(),
        this.agendaService.getProfessionals(),
      ]);
      this.services.set(resServices);
      this.professionals.set(resProfs);
    } catch (err: any) {
      this.notificationService.error('Error al cargar servicios', err?.message);
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadCatalogServices(): Promise<void> {
    try {
      // Cargar EXCLUSIVAMENTE servicios del módulo de Servicios del SaaS general
      // NUNCA cargar productos físicos de inventario
      const allServices = await this.serviceService.getServices({ activeOnly: true });
      const alreadyLinkedProductIds = new Set(this.services().map((s) => Number(s.productId)));

      const validServices = (allServices || []).filter(
        (s) => s && s.id && Number(s.id) > 0 && this.productService.isServiceItem(s) && !alreadyLinkedProductIds.has(Number(s.id))
      );

      this.catalogServices.set(validServices);
      if (validServices.length > 0) {
        this.formProductId = validServices[0].id!;
      } else {
        this.formProductId = 0;
      }
    } catch (err: any) {
      this.notificationService.error('Error al cargar servicios del catálogo', err?.message);
    }
  }

  setModalMode(mode: 'CREATE' | 'LINK'): void {
    this.modalMode.set(mode);
    if (mode === 'LINK' && this.catalogServices().length === 0) {
      this.loadCatalogServices();
    }
  }

  openCreateModal(): void {
    this.editingService.set(null);
    this.modalMode.set('CREATE');
    this.formServiceName = '';
    this.formPrice = 500;
    this.formProductId = 0;
    this.formDurationMinutes = 30;
    this.formBufferMinutes = 0;
    this.formIsPublic = true;
    this.formIsActive = true;
    this.formColorHex = '#4f46e5';
    this.selectedProfessionalIds = this.professionals().map((p) => p.id);
    this.isModalOpen.set(true);

    // Pre-cargar catálogo en segundo plano por si el usuario decide alternar a vincular
    this.loadCatalogServices();
  }

  async openLinkModal(): Promise<void> {
    this.editingService.set(null);
    this.modalMode.set('LINK');
    this.formDurationMinutes = 30;
    this.formBufferMinutes = 0;
    this.formIsPublic = true;
    this.formIsActive = true;
    this.formColorHex = '#4f46e5';
    this.selectedProfessionalIds = this.professionals().map((p) => p.id);
    await this.loadCatalogServices();
    this.isModalOpen.set(true);
  }

  openEditModal(service: ReservableServiceDto): void {
    this.editingService.set(service);
    this.modalMode.set('EDIT');
    this.formProductId = service.productId;
    this.formDurationMinutes = service.durationMinutes;
    this.formBufferMinutes = service.bufferMinutes;
    this.formIsPublic = service.isPublic;
    this.formIsActive = service.isActive;
    this.formColorHex = service.colorHex || '#4f46e5';
    this.selectedProfessionalIds = [...(service.assignedProfessionalIds || [])];
    this.isModalOpen.set(true);
  }

  toggleProfessional(profId: number): void {
    const idx = this.selectedProfessionalIds.indexOf(profId);
    if (idx >= 0) {
      this.selectedProfessionalIds.splice(idx, 1);
    } else {
      this.selectedProfessionalIds.push(profId);
    }
  }

  async togglePublicStatus(service: ReservableServiceDto): Promise<void> {
    try {
      await this.agendaService.updateService(service.id, {
        productId: service.productId,
        durationMinutes: service.durationMinutes,
        bufferMinutes: service.bufferMinutes,
        isPublic: !service.isPublic,
        isActive: service.isActive,
        colorHex: service.colorHex,
        assignedProfessionalIds: service.assignedProfessionalIds,
      });
      service.isPublic = !service.isPublic;
      this.notificationService.success('Servicio actualizado', `Visibilidad pública: ${service.isPublic ? 'Activa' : 'Inactiva'}`);
    } catch (err: any) {
      const errMsg = err?.error?.message || err?.details?.message || err?.message || 'Error al actualizar visibilidad.';
      this.notificationService.error('Error al actualizar visibilidad', errMsg);
    }
  }

  async saveService(): Promise<void> {
    try {
      this.isSaving.set(true);

      if (this.editingService()) {
        await this.agendaService.updateService(this.editingService()!.id, {
          productId: this.editingService()!.productId,
          durationMinutes: this.formDurationMinutes,
          bufferMinutes: this.formBufferMinutes,
          isPublic: this.formIsPublic,
          isActive: this.formIsActive,
          colorHex: this.formColorHex,
          assignedProfessionalIds: this.selectedProfessionalIds,
        });
        this.notificationService.success('Servicio actualizado', 'Los cambios se guardaron con éxito.');
      } else if (this.modalMode() === 'CREATE') {
        const name = (this.formServiceName || '').trim();
        if (!name || name.length < 2) {
          this.notificationService.warning('Nombre requerido', 'Ingresa un nombre válido para el nuevo servicio.');
          this.isSaving.set(false);
          return;
        }
        if (!this.formPrice || this.formPrice <= 0) {
          this.notificationService.warning('Precio requerido', 'Ingresa un precio mayor a 0 para el servicio.');
          this.isSaving.set(false);
          return;
        }

        // 1. Crear el servicio en el módulo general de servicios del SaaS
        // El backend requiere Cost > 0
        const resolvedCost = Math.max(1, Math.round(Number(this.formPrice) * 0.3 * 100) / 100);
        const createdSrv = await this.serviceService.createService({
          name: name,
          price: Number(this.formPrice),
          cost: resolvedCost,
          estimatedDuration: `${this.formDurationMinutes} min`,
          isActive: true,
        });

        if (!createdSrv?.id) {
          throw new Error('No se pudo generar el identificador del nuevo servicio en el catálogo.');
        }

        // 2. Registrar el nuevo servicio como servicio reservable en la Agenda
        await this.agendaService.createService({
          productId: createdSrv.id,
          durationMinutes: this.formDurationMinutes,
          bufferMinutes: this.formBufferMinutes,
          isPublic: this.formIsPublic,
          isActive: true,
          colorHex: this.formColorHex,
          assignedProfessionalIds: this.selectedProfessionalIds,
        });
        this.notificationService.success(
          'Servicio creado',
          `"${name}" fue registrado en el catálogo de servicios y configurado como servicio reservable.`
        );
      } else {
        // Modo LINK
        if (!this.formProductId) {
          this.notificationService.error('Error', 'Selecciona un servicio válido del catálogo.');
          this.isSaving.set(false);
          return;
        }

        // Verificar si el producto ya está vinculado en la agenda
        const existing = this.services().find((s) => Number(s.productId) === Number(this.formProductId));
        if (existing) {
          await this.agendaService.updateService(existing.id, {
            productId: existing.productId,
            durationMinutes: this.formDurationMinutes,
            bufferMinutes: this.formBufferMinutes,
            isPublic: this.formIsPublic,
            isActive: true,
            colorHex: this.formColorHex,
            assignedProfessionalIds: this.selectedProfessionalIds,
          });
          this.notificationService.success(
            'Servicio actualizado',
            'El servicio ya estaba en la agenda y su configuración fue actualizada.'
          );
        } else {
          await this.agendaService.createService({
            productId: this.formProductId,
            durationMinutes: this.formDurationMinutes,
            bufferMinutes: this.formBufferMinutes,
            isPublic: this.formIsPublic,
            isActive: true,
            colorHex: this.formColorHex,
            assignedProfessionalIds: this.selectedProfessionalIds,
          });
          this.notificationService.success('Servicio vinculado', 'El servicio reservable ha sido vinculado exitosamente.');
        }
      }

      this.isModalOpen.set(false);
      await this.loadData();
    } catch (err: any) {
      const errMsg = err?.error?.message || err?.details?.message || err?.message || 'Error al guardar el servicio.';
      this.notificationService.error('Error al guardar servicio', errMsg);
    } finally {
      this.isSaving.set(false);
    }
  }

  get activeServicesCount(): number {
    return this.services().filter((s) => s.isActive).length;
  }

  get publicServicesCount(): number {
    return this.services().filter((s) => s.isPublic).length;
  }

  get averageDuration(): number {
    const list = this.services();
    if (list.length === 0) return 0;
    const sum = list.reduce((acc, curr) => acc + curr.durationMinutes, 0);
    return Math.round(sum / list.length);
  }
}
