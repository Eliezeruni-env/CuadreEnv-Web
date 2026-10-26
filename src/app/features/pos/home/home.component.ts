import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

export interface PosProductItem {
  id: number;
  name: string;
  category: string;
  price: number;
}

export interface PosCartItem {
  id: number;
  name: string;
  price: number;
  quantity: number;
}

@Component({
  selector: 'app-pos-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
})
export class PosHomeComponent {
  private router = inject(Router);

  searchQuery = '';
  products: PosProductItem[] = [
    { id: 1, name: 'Servicio Básico', category: 'Servicios', price: 500 },
    { id: 2, name: 'Refresco 20oz', category: 'Bebidas', price: 45 },
    { id: 3, name: 'Agua Mineral 500ml', category: 'Bebidas', price: 25 },
    { id: 4, name: 'Combo Especial', category: 'Combos', price: 350 },
    { id: 5, name: 'Cuaderno Profesional', category: 'Papelería', price: 120 },
  ];

  cart: PosCartItem[] = [];

  get filteredProducts(): PosProductItem[] {
    if (!this.searchQuery.trim()) return this.products;
    const q = this.searchQuery.toLowerCase().trim();
    return this.products.filter((p) => p.name.toLowerCase().includes(q));
  }

  get totalAmount(): number {
    return this.cart.reduce((acc, i) => acc + i.quantity * i.price, 0);
  }

  onSearch(event: Event) {
    const input = event.target as HTMLInputElement;
    this.searchQuery = input.value;
  }

  addToCart(p: PosProductItem) {
    const existing = this.cart.find((i) => i.id === p.id);
    if (existing) {
      existing.quantity += 1;
    } else {
      this.cart.push({ id: p.id, name: p.name, price: p.price, quantity: 1 });
    }
  }

  removeFromCart(index: number) {
    this.cart.splice(index, 1);
  }

  clearCart() {
    this.cart = [];
  }

  proceedToPayment() {
    this.router.navigate(['/pos/payments'], {
      queryParams: { total: this.totalAmount },
    });
  }
}
