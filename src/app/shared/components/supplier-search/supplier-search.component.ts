import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconDirective } from '@coreui/icons-angular';

export interface SupplierSearchResult {
  id: number;
  name: string;
  rnc?: string;
  phone?: string;
  email?: string;
}

@Component({
  selector: 'app-supplier-search',
  standalone: true,
  imports: [CommonModule, IconDirective],
  templateUrl: './supplier-search.component.html',
  styleUrls: ['./supplier-search.component.scss'],
})
export class SupplierSearchComponent {
  @Input() visible = false;
  @Input() suppliers: SupplierSearchResult[] = [];
  @Output() supplierSelected = new EventEmitter<SupplierSearchResult>();
  @Output() cancel = new EventEmitter<void>();

  searchTerm = '';

  get filteredSuppliers(): SupplierSearchResult[] {
    if (!this.searchTerm.trim()) {
      return this.suppliers;
    }
    const q = this.searchTerm.toLowerCase().trim();
    return this.suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.rnc && s.rnc.toLowerCase().includes(q)) ||
        (s.phone && s.phone.includes(q))
    );
  }

  onSearchInput(event: Event) {
    const input = event.target as HTMLInputElement;
    this.searchTerm = input.value;
  }

  selectSupplier(supplier: SupplierSearchResult) {
    this.supplierSelected.emit(supplier);
    this.cancel.emit();
  }
}
