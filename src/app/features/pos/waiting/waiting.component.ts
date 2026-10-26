import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-pos-waiting',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './waiting.component.html',
  styleUrls: ['./waiting.component.scss'],
})
export class PosWaitingComponent {}
