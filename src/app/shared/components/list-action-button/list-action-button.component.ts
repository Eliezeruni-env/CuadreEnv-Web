import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-list-action-button',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './list-action-button.component.html',
  styleUrls: ['./list-action-button.component.scss'],
})
export class ListActionButtonComponent {
  @Input() showView = false;
  @Input() showEdit = true;
  @Input() showDelete = true;

  @Input() viewTooltip?: string;
  @Input() editTooltip?: string;
  @Input() deleteTooltip?: string;

  @Output() view = new EventEmitter<void>();
  @Output() edit = new EventEmitter<void>();
  @Output() delete = new EventEmitter<void>();
}
