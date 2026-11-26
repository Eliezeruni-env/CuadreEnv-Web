import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AgendaService } from '../../services/agenda.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import type { AgendaClientDto } from '../../models/agenda.models';

@Component({
  selector: 'app-agenda-clients',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './agenda-clients.component.html',
  styleUrls: ['./agenda-clients.component.scss'],
})
export class AgendaClientsComponent implements OnInit {
  protected readonly Math = Math;
  private readonly agendaService = inject(AgendaService);
  private readonly notificationService = inject(NotificationService);

  isLoading = signal<boolean>(true);
  clients = signal<AgendaClientDto[]>([]);
  searchQuery = signal<string>('');
  expandedClientId = signal<number | null>(null);

  // Pagination
  currentPage = signal<number>(1);
  pageSize = signal<number>(10);

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredClients.length / this.pageSize()));
  }

  get paginatedClients(): AgendaClientDto[] {
    const page = Math.min(this.currentPage(), this.totalPages);
    const start = (page - 1) * this.pageSize();
    return this.filteredClients.slice(start, start + this.pageSize());
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage.set(page);
    }
  }

  ngOnInit(): void {
    this.loadClients();
  }

  async loadClients(): Promise<void> {
    try {
      this.isLoading.set(true);
      const res = await this.agendaService.getClients(this.searchQuery() || undefined);
      this.clients.set(res);
      if (res.length > 0 && !this.expandedClientId()) {
        this.expandedClientId.set(res[0].customerId);
      }
    } catch (err: any) {
      this.notificationService.error('Error al cargar clientes de agenda', err?.message);
    } finally {
      this.isLoading.set(false);
    }
  }

  toggleExpand(clientId: number): void {
    if (this.expandedClientId() === clientId) {
      this.expandedClientId.set(null);
    } else {
      this.expandedClientId.set(clientId);
    }
  }

  get filteredClients(): AgendaClientDto[] {
    const q = this.searchQuery().toLowerCase().trim();
    if (!q) return this.clients();
    return this.clients().filter(
      (c) => c.fullName.toLowerCase().includes(q) || c.phone.includes(q),
    );
  }

  get totalClients(): number {
    return this.clients().length;
  }

  get recurringClients(): number {
    return this.clients().filter((c) => c.isRecurrent).length;
  }

  openWhatsApp(phone: string): void {
    const clean = phone.replace(/\D/g, '');
    window.open(`https://wa.me/${clean}`, '_blank');
  }
}
