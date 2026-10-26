import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IconDirective } from '@coreui/icons-angular';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink, IconDirective],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss'],
})
export class NavbarComponent {
  @Input() pageTitle = '';
  @Input() companyName = '';
  @Input() userName = 'Administrador';
  @Input() userRole = 'Admin';
  @Input() userInitials = 'AD';

  @Output() toggleSidebar = new EventEmitter<void>();
}
