import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-pos-search-sale',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './search-sale.component.html',
  styleUrls: ['./search-sale.component.scss'],
})
export class PosSearchSaleComponent {}
