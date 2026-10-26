import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-nerp-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './nerp-dialog.component.html',
  styleUrls: ['./nerp-dialog.component.scss'],
})
export class NerpDialogComponent {
  @Input() visible = false;
  @Input() title = 'Modal Dialog';
  @Input() subtitle?: string;
  @Input() maxWidth = '600px';
  @Input() showFooter = true;
  @Input() showDefaultIcon = true;
  @Input() iconName?: string;
  @Input() iconBg?: string;
  @Input() iconColor?: string;
  @Input() confirmText = 'Guardar';
  @Input() cancelText = 'Cancelar';
  @Input() confirmDisabled = false;
  @Input() loading = false;
  @Input() closeOnBackdrop = true;

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  close() {
    this.visible = false;
    this.visibleChange.emit(false);
    this.cancel.emit();
  }

  onBackdropClick() {
    if (this.closeOnBackdrop) {
      this.close();
    }
  }
}
