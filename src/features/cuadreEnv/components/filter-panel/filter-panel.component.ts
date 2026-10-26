import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  inject,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  signal,
  SimpleChanges,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, takeUntil } from 'rxjs';
import {
  ButtonDirective,
  CardBodyComponent,
  CardComponent,
  FormControlDirective,
  FormSelectDirective,
  InputGroupComponent,
  InputGroupTextDirective,
} from '@coreui/angular';
import { IconDirective } from '@coreui/icons-angular';
import { TranslationService } from '../../services/translation.service';

export interface FilterOption {
  label: string;
  value: string | number;
}

export interface FilterConfig {
  key: string;
  label: string;
  type: 'text' | 'select' | 'date' | 'dateRange' | 'number' | 'numberRange';
  placeholder?: string;
  options?: FilterOption[];
  min?: number | string;
  max?: number | string;
}

export type FilterValues = Record<string, unknown>;

@Component({
  selector: 'app-filter-panel',
  standalone: true,
  templateUrl: './filter-panel.component.html',
  styleUrl: './filter-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    CardComponent,
    CardBodyComponent,
    ButtonDirective,
    FormControlDirective,
    FormSelectDirective,
    InputGroupComponent,
    InputGroupTextDirective,
    IconDirective,
  ],
})
export class FilterPanelComponent implements OnInit, OnChanges, OnDestroy {
  readonly translationService = inject(TranslationService);
  private cdr = inject(ChangeDetectorRef, { optional: true });

  @Input() config: FilterConfig[] = [];
  @Input() values: FilterValues = {};
  @Input() title = 'Filtros de Búsqueda';
  @Input() collapsed = false;
  @Output() filtersChange = new EventEmitter<FilterValues>();

  isExpanded = signal(true);

  private destroy$ = new Subject<void>();
  private debouncedText$ = new Subject<{ key: string; value: string }>();

  ngOnInit(): void {
    this.isExpanded.set(!this.collapsed);

    this.debouncedText$
      .pipe(debounceTime(250), takeUntil(this.destroy$))
      .subscribe(({ key, value }) => {
        this.updateValue(key, value);
      });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['values']) {
      this.cdr?.markForCheck();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  togglePanel(): void {
    this.isExpanded.update((current) => !current);
  }

  getValue(key: string): unknown {
    return this.values?.[key] ?? '';
  }

  getRangeValue(key: string, field: 'from' | 'to'): string | number | null {
    const value = this.values?.[key] as
      | { from?: string | number | null; to?: string | number | null }
      | undefined;
    if (value && typeof value === 'object') {
      return value[field] ?? '';
    }
    // Fallback if stored flat like key_min / key_from
    if (field === 'from') {
      return (this.values?.[key + '_min'] ?? this.values?.[key + '_from'] ?? '') as any;
    } else {
      return (this.values?.[key + '_max'] ?? this.values?.[key + '_to'] ?? '') as any;
    }
  }

  updateValue(key: string, value: unknown): void {
    const nextValues = { ...(this.values || {}), [key]: value };
    this.values = nextValues;
    this.cdr?.markForCheck();
    this.emitFilters();
  }

  onTextInput(key: string, value: string): void {
    this.values = { ...(this.values || {}), [key]: value };
    this.debouncedText$.next({ key, value });
  }

  onEnter(key: string): void {
    const val = this.values?.[key];
    this.updateValue(key, val);
  }

  onDateRangeChange(key: string, field: 'from' | 'to', value: string): void {
    const currentValue = (this.values?.[key] as
      | { from?: string | null; to?: string | null }
      | undefined) ?? { from: null, to: null };
    const nextValue = { ...currentValue, [field]: value || null };
    this.values = { ...(this.values || {}), [key]: nextValue };
    this.cdr?.markForCheck();
    this.emitFilters();
  }

  onNumberRangeChange(key: string, field: 'from' | 'to', value: string): void {
    const currentValue = (this.values?.[key] as
      | { from?: number | null; to?: number | null }
      | undefined) ?? { from: null, to: null };
    const parsedValue = value === '' || value === null || value === undefined ? null : Number(value);
    const nextValue = { ...currentValue, [field]: parsedValue };
    this.values = { ...(this.values || {}), [key]: nextValue };
    this.cdr?.markForCheck();
    this.emitFilters();
  }

  clearFilters(): void {
    this.values = {};
    this.cdr?.markForCheck();
    this.emitFilters();
  }

  emitFilters(): void {
    const raw = { ...(this.values || {}) };
    const normalized: Record<string, unknown> = {};

    for (const [k, v] of Object.entries(raw)) {
      if (v === undefined || v === null || v === '') continue;

      if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        const obj = v as { from?: any; to?: any };
        const hasFrom = obj.from !== null && obj.from !== undefined && obj.from !== '';
        const hasTo = obj.to !== null && obj.to !== undefined && obj.to !== '';

        if (hasFrom || hasTo) {
          normalized[k] = obj;
          if (hasFrom) {
            normalized[`${k}_from`] = obj.from;
            normalized[`${k}_min`] = obj.from;
          }
          if (hasTo) {
            normalized[`${k}_to`] = obj.to;
            normalized[`${k}_max`] = obj.to;
          }
        }
      } else {
        normalized[k] = v;
      }
    }

    this.filtersChange.emit(normalized);
  }

  getActiveFiltersCount(): number {
    return Object.values(this.values || {}).filter((value) => {
      if (value === null || value === undefined || value === '') {
        return false;
      }

      if (typeof value === 'object') {
        return Object.values(value as Record<string, unknown>).some(
          (item) => item !== null && item !== undefined && item !== '',
        );
      }

      return true;
    }).length;
  }
}
