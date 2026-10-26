import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface FilterConfigItem {
  key: string;
  label: string;
  type: 'text' | 'select' | 'numberRange' | 'dateRange';
  placeholder?: string;
  columnClass?: string;
  options?: { label: string; value: any }[];
}

export type GenericFilterValues = Record<string, any>;

@Component({
  selector: 'app-generic-filters',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app-generic-filters.component.html',
  styleUrls: ['./app-generic-filters.component.scss'],
})
export class AppGenericFiltersComponent {
  @Input() title = 'Filtros y Búsqueda';
  @Input() config: FilterConfigItem[] = [];
  @Input() values: GenericFilterValues = {};
  @Output() filtersChange = new EventEmitter<GenericFilterValues>();

  onInputChange(key: string, event: Event) {
    const target = event.target as HTMLInputElement;
    const updated = { ...this.values, [key]: target.value };
    this.filtersChange.emit(updated);
  }

  onSelectChange(key: string, event: Event) {
    const target = event.target as HTMLSelectElement;
    const updated = { ...this.values, [key]: target.value };
    this.filtersChange.emit(updated);
  }

  hasActiveFilters(): boolean {
    return Object.values(this.values).some((v) => v !== '' && v !== null && v !== undefined);
  }

  resetFilters() {
    const empty: GenericFilterValues = {};
    for (const item of this.config) {
      if (item.type === 'numberRange') {
        empty[item.key + '_min'] = '';
        empty[item.key + '_max'] = '';
      } else if (item.type === 'dateRange') {
        empty[item.key + '_from'] = '';
        empty[item.key + '_to'] = '';
      } else {
        empty[item.key] = '';
      }
    }
    this.filtersChange.emit(empty);
  }
}
