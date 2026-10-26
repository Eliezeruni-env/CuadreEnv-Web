import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { IconDirective } from '@coreui/icons-angular';

export interface SectionNavItem {
  label: string;
  value: string;
  icon?: string;
  route?: string;
}

@Component({
  selector: 'app-section-nav',
  standalone: true,
  templateUrl: './section-nav.component.html',
  styleUrl: './section-nav.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, IconDirective],
})
export class SectionNavComponent {
  @Input() items: SectionNavItem[] = [];
  @Input() activeValue = '';
  @Input() ariaLabel = 'Section navigation';
  @Output() selectionChange = new EventEmitter<string>();

  onSelect(value: string): void {
    this.selectionChange.emit(value);
  }
}
