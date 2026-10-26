import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconDirective } from '@coreui/icons-angular';

export interface ClientSearchResult {
  id: number;
  name: string;
  identification?: string;
  phone?: string;
  email?: string;
}

@Component({
  selector: 'app-client-search',
  standalone: true,
  imports: [CommonModule, IconDirective],
  templateUrl: './client-search.component.html',
  styleUrls: ['./client-search.component.scss'],
})
export class ClientSearchComponent {
  @Input() visible = false;
  @Input() clients: ClientSearchResult[] = [];
  @Output() clientSelected = new EventEmitter<ClientSearchResult>();
  @Output() cancel = new EventEmitter<void>();

  searchTerm = '';

  get filteredClients(): ClientSearchResult[] {
    if (!this.searchTerm.trim()) {
      return this.clients;
    }
    const q = this.searchTerm.toLowerCase().trim();
    return this.clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.identification && c.identification.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q))
    );
  }

  onSearchInput(event: Event) {
    const input = event.target as HTMLInputElement;
    this.searchTerm = input.value;
  }

  selectClient(client: ClientSearchResult) {
    this.clientSelected.emit(client);
    this.cancel.emit();
  }
}
