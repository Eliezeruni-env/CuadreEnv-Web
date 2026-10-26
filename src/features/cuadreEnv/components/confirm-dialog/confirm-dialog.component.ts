import { Component, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonDirective } from '@coreui/angular';
import { IconDirective } from '@coreui/icons-angular';
import { ConfirmDialogService } from '../../services/confirm-dialog.service';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule, ButtonDirective, IconDirective],
  templateUrl: './confirm-dialog.component.html',
  styleUrls: ['./confirm-dialog.component.scss'],
})
export class ConfirmDialogComponent {
  private confirmService = inject(ConfirmDialogService);
  readonly state = this.confirmService.state;

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.state()) {
      this.cancel();
    }
  }

  onBackdropClick(_event: MouseEvent) {
    this.cancel();
  }

  confirm() {
    this.confirmService.handleConfirm();
  }

  cancel() {
    this.confirmService.handleCancel();
  }
}
