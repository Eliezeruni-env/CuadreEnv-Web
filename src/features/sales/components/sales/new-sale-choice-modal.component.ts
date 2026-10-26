import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonDirective } from '@coreui/angular';

@Component({
  selector: 'app-new-sale-choice-modal',
  standalone: true,
  imports: [CommonModule, ButtonDirective],
  templateUrl: './new-sale-choice-modal.component.html',
  styleUrls: ['./new-sale-choice-modal.component.scss'],
})
export class NewSaleChoiceModalComponent {
  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() optionSelected = new EventEmitter<'quick' | 'credit' | 'service'>();

  open() {
    this.visible = true;
    this.visibleChange.emit(true);
  }

  close() {
    this.visible = false;
    this.visibleChange.emit(false);
  }

  selectOption(opt: 'quick' | 'credit' | 'service') {
    this.optionSelected.emit(opt);
    this.close();
  }
}
