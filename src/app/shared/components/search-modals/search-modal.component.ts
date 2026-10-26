import { Component, Input, Output, EventEmitter, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface SearchOptionItem {
  id: any;
  name?: string;
  description?: string;
  title?: string;
  subtitle?: string;
  phone?: string;
  email?: string;
  barcode?: string;
  reference?: string;
  [key: string]: any;
}

@Component({
  selector: 'app-search-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './search-modal.component.html',
  styleUrls: ['./search-modal.component.scss'],
})
export class SearchModalComponent {
  @Input() visible = false;
  @Input() title = 'Buscar y Seleccionar';
  @Input() placeholder = 'Escriba para filtrar...';
  @Input() items: SearchOptionItem[] = [];

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() itemSelected = new EventEmitter<SearchOptionItem>();

  searchTerm = signal<string>('');

  filteredItems = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    if (!term) return this.items;

    return this.items.filter((item) => {
      const name = (item.name || item.description || item.title || '').toLowerCase();
      const phone = (item.phone || '').toLowerCase();
      const email = (item.email || '').toLowerCase();
      const code = (item.barcode || item.reference || '').toLowerCase();
      return name.includes(term) || phone.includes(term) || email.includes(term) || code.includes(term);
    });
  });

  onSearch(event: Event) {
    const val = (event.target as HTMLInputElement).value;
    this.searchTerm.set(val);
  }

  selectItem(item: SearchOptionItem) {
    this.itemSelected.emit(item);
    this.close();
  }

  close() {
    this.visible = false;
    this.visibleChange.emit(false);
    this.searchTerm.set('');
  }
}
