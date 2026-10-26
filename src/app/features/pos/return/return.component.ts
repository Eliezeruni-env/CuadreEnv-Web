import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-pos-return',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './return.component.html',
  styleUrls: ['./return.component.scss'],
})
export class PosReturnComponent {}
