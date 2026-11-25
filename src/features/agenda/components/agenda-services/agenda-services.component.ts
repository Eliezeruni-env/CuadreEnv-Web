import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AgendaService } from '../../services/agenda.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import { ServiceService } from '../../../services/services/service.service';
import type { ReservableServiceDto, ProfessionalDto } from '../../models/agenda.models';
import type { ServiceItemDto } from '../../../services/models/service-item.model';

@Component({
  selector: 'app-agenda-services',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './agenda-services.component.html',
  styleUrls: ['./agenda-services.component.scss'],
})
export class AgendaServicesComponent implements OnInit {
  private readonly agendaService = inject(AgendaService);
  private readonly serviceService = inject(ServiceService);
  private readonly notificationService = inject(NotificationService);

  isLoading = signal<boolean>(true);
  services = signal<ReservableServiceDto[]>([]);
  professionals = signal<ProfessionalDto[]>([]);
  catalogServices = signal<ServiceItemDto[]>([]);

  // Modal signals
  isModalOpen = signal<boolean>(false);
  editingService = signal<ReservableServiceDto | null>(null);

  // Form fields
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

  async openCreateModal(): Promise<void> {
    try {
      this.editingService.set(null);
      this.formProductId = 0;
      this.formDurationMinutes = 30;
      this.formBufferMinutes = 0;
      this.formIsPublic = true;
      this.formIsActive = true;
      this.formColorHex = '#4f46e5';
      this.selectedProfessionalIds = this.professionals().map((p) => p.id);

      // Cargar EXCLUSIVAMENTE servicios del módulo de Servicios del SaaS general
      // NUNCA cargar productos físicos de inventario
      const allServices = await this.serviceService.getServices({ activeOnly: true });
      const validServices = (allServices || []).filter(
        (s) => s && s.id && Number(s.id) > 0
      );

      this.catalogServices.set(validServices);
      if (validServices.length > 0) {
        this.formProductId = validServices[0].id!;
      }
      this.isModalOpen.set(true);
    } catch (err: any) {
      this.notificationService.error('Error al cargar servicios del catálogo', err?.message);
    }
  }

  openEditModal(service: ReservableServiceDto): void {
    this.editingService.set(service);
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
      this.notificationService.error('Error al actualizar visibilidad', err?.message);
    }
  }

  async saveService(): Promise<void> {
    try {
      if (this.editingService()) {
        await this.agendaService.updateService(this.editingService()!.id, {
          durationMinutes: this.formDurationMinutes,
          bufferMinutes: this.formBufferMinutes,
          isPublic: this.formIsPublic,
          isActive: this.formIsActive,
          colorHex: this.formColorHex,
          assignedProfessionalIds: this.selectedProfessionalIds,
        });
        this.notificationService.success('Servicio actualizado', 'Los cambios se guardaron con éxito.');
      } else {
        if (!this.formProductId) {
          this.notificationService.error('Error', 'Selecciona un servicio válido del catálogo.');
          return;
        }
        await this.agendaService.createService({
          productId: this.formProductId,
          durationMinutes: this.formDurationMinutes,
          bufferMinutes: this.formBufferMinutes,
          isPublic: this.formIsPublic,
          colorHex: this.formColorHex,
          assignedProfessionalIds: this.selectedProfessionalIds,
        });
        this.notificationService.success('Servicio creado', 'El servicio reservable ha sido vinculado exitosamente.');
      }
      this.isModalOpen.set(false);
      await this.loadData();
    } catch (err: any) {
      this.notificationService.error('Error al guardar servicio', err?.message);
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
