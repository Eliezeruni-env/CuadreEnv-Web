import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FilterPanelComponent } from './filter-panel.component';

describe('FilterPanelComponent', () => {
  let component: FilterPanelComponent;
  let fixture: ComponentFixture<FilterPanelComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    component = TestBed.runInInjectionContext(() => new FilterPanelComponent());
  });

  it('should emit the current filters and clear them', () => {
    component.config = [
      { key: 'search', label: 'Search', type: 'text' },
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        options: [
          { label: 'All', value: '' },
          { label: 'Active', value: 'active' },
        ],
      },
    ];

    let emitted: Record<string, unknown> | undefined;
    component.filtersChange.subscribe((value) => (emitted = value));

    component.values = { search: 'abc', status: 'active' };
    component.emitFilters();

    expect(emitted).toEqual({ search: 'abc', status: 'active' });

    component.clearFilters();
    expect(component.values).toEqual({});
  });
});
