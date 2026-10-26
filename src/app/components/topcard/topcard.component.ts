import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconDirective } from '@coreui/icons-angular';

@Component({
  selector: 'app-topcard',
  standalone: true,
  imports: [CommonModule, IconDirective],
  templateUrl: './topcard.component.html',
  styleUrls: ['./topcard.component.scss'],
})
export class TopcardComponent {
  @Input() title = '';
  @Input() value: string | number = '';
  @Input() subtitle = '';
  @Input() icon = 'cilChart';
  @Input() variant: 'primary' | 'success' | 'warning' | 'danger' | 'info' = 'primary';
}
