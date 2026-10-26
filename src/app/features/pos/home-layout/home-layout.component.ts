import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink } from '@angular/router';
import { IconDirective } from '@coreui/icons-angular';

@Component({
  selector: 'app-pos-home-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, IconDirective],
  templateUrl: './home-layout.component.html',
  styleUrls: ['./home-layout.component.scss'],
})
export class PosHomeLayoutComponent {}
