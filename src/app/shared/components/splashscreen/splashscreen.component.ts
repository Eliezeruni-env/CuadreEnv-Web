import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-splashscreen',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './splashscreen.component.html',
  styleUrls: ['./splashscreen.component.scss'],
})
export class SplashscreenComponent {
  @Input() visible = false;
  @Input() message = 'Cargando Sistema...';
}
