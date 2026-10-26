import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface TopCardMetric {
  title: string;
  value: string | number;
  subtitle?: string;
  subtitleClass?: string;
  icon?: string;
  iconBg?: string;
  iconColor?: string;
  colClass?: string;
}

@Component({
  selector: 'app-top-cards',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './top-cards.component.html',
  styleUrls: ['./top-cards.component.scss'],
})
export class TopCardsComponent {
  @Input() cards: TopCardMetric[] = [];
}
