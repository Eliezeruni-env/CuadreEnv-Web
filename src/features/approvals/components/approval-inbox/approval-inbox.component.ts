import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApprovalService } from '../../services/approval.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import type { DeletionApprovalDto } from '../../../cuadreEnv/types/api';

@Component({
  selector: 'app-approval-inbox',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './approval-inbox.component.html',
  styleUrls: ['./approval-inbox.component.scss'],
})
export class ApprovalInboxComponent implements OnInit {
  private approvalService = inject(ApprovalService);
  private notificationService = inject(NotificationService);

  activeTab = signal<'pending' | 'history'>('pending');

  // Confirmation dialogs
  selectedItemForApprove = signal<DeletionApprovalDto | null>(null);
  selectedItemForReject = signal<DeletionApprovalDto | null>(null);
  rejectionReason = signal<string>('');

  isProcessing = signal<boolean>(false);

  readonly pendingList = computed(() => this.approvalService.pendingApprovals());
  readonly historyList = computed(() => this.approvalService.historyApprovals());
  readonly pendingCount = computed(() => this.approvalService.pendingCount());

  ngOnInit(): void {
    void this.approvalService.loadApprovals();
  }

  setTab(tab: 'pending' | 'history'): void {
    this.activeTab.set(tab);
  }

  promptApprove(item: DeletionApprovalDto): void {
    this.selectedItemForApprove.set(item);
  }

  cancelApprove(): void {
    this.selectedItemForApprove.set(null);
  }

  async confirmApprove(): Promise<void> {
    const item = this.selectedItemForApprove();
    if (!item) return;

    this.isProcessing.set(true);
    try {
      await this.approvalService.approve(item.id);
      this.notificationService.success(
        `Solicitud de borrado para "${item.entityCode}" aprobada exitosamente.`
      );
      this.selectedItemForApprove.set(null);
    } catch (err: any) {
      this.notificationService.error(err?.message || 'Error al aprobar la solicitud.');
    } finally {
      this.isProcessing.set(false);
    }
  }

  promptReject(item: DeletionApprovalDto): void {
    this.selectedItemForReject.set(item);
    this.rejectionReason.set('');
  }

  cancelReject(): void {
    this.selectedItemForReject.set(null);
    this.rejectionReason.set('');
  }

  async confirmReject(): Promise<void> {
    const item = this.selectedItemForReject();
    if (!item) return;

    this.isProcessing.set(true);
    try {
      await this.approvalService.reject(item.id, this.rejectionReason());
      this.notificationService.warning(
        `Solicitud de borrado para "${item.entityCode}" rechazada.`
      );
      this.selectedItemForReject.set(null);
      this.rejectionReason.set('');
    } catch (err: any) {
      this.notificationService.error(err?.message || 'Error al rechazar la solicitud.');
    } finally {
      this.isProcessing.set(false);
    }
  }

  formatDate(dateStr?: string): string {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('es-DO', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  }
}
