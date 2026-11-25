import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataExchangeService } from '../../services/data-exchange.service';
import { NotificationService } from '../../../cuadreEnv/services/notification.service';
import {
  ImportPreviewResponseDto,
  ImportConfirmResponseDto
} from '../../models/data-exchange.models';

@Component({
  selector: 'app-data-exchange-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './data-exchange-modal.component.html',
  styleUrls: ['./data-exchange-modal.component.scss']
})
export class DataExchangeModalComponent {
  @Input() entity: 'products' | 'customers' | 'categories' = 'products';
  @Input() entityTitle = 'Productos';
  @Output() imported = new EventEmitter<void>();

  private readonly dataExchangeService = inject(DataExchangeService);
  private readonly notificationService = inject(NotificationService);

  isOpen = signal<boolean>(false);
  mode = signal<'create_and_update' | 'create_only'>('create_and_update');
  
  selectedFile = signal<File | null>(null);
  fileName = signal<string>('');
  
  // Loading states
  isLoadingPreview = signal<boolean>(false);
  isConfirming = signal<boolean>(false);
  isDownloadingTemplate = signal<boolean>(false);
  isExporting = signal<boolean>(false);

  // Preview result
  preview = signal<ImportPreviewResponseDto | null>(null);
  confirmResult = signal<ImportConfirmResponseDto | null>(null);

  open(): void {
    this.isOpen.set(true);
    this.resetState();
  }

  close(): void {
    if (this.isConfirming()) return;
    this.isOpen.set(false);
  }

  resetState(): void {
    this.selectedFile.set(null);
    this.fileName.set('');
    this.preview.set(null);
    this.confirmResult.set(null);
    this.isLoadingPreview.set(false);
    this.isConfirming.set(false);
  }

  onModeChange(newMode: 'create_and_update' | 'create_only'): void {
    this.mode.set(newMode);
    const file = this.selectedFile();
    if (file) {
      void this.executePreview(file);
    }
  }

  onFileSelected(event: Event): void {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;
    this.handleFile(file);
  }

  onFileDropped(event: DragEvent): void {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    this.handleFile(file);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  private handleFile(file: File): void {
    const validExtensions = ['.xlsx', '.csv', '.xls'];
    const lowerName = file.name.toLowerCase();
    const isValid = validExtensions.some(ext => lowerName.endsWith(ext));

    if (!isValid) {
      this.notificationService.error('Formato inválido. Debe subir un archivo .xlsx o .csv');
      return;
    }

    this.selectedFile.set(file);
    this.fileName.set(file.name);
    void this.executePreview(file);
  }

  async executePreview(file: File): Promise<void> {
    this.isLoadingPreview.set(true);
    this.preview.set(null);
    this.confirmResult.set(null);

    try {
      const res = await this.dataExchangeService.previewImport(this.entity, file, this.mode());
      if (res && res.data) {
        this.preview.set(res.data);
        if (res.data.rowsWithErrors > 0) {
          this.notificationService.warning(
            `El archivo contiene ${res.data.rowsWithErrors} fila(s) con errores. Debe corregirlas antes de poder importar.`
          );
        } else {
          this.notificationService.success(
            `Previsualización lista: ${res.data.rowsToInsert} nuevos, ${res.data.rowsToUpdate} actualizaciones.`
          );
        }
      } else {
        throw new Error(res?.message || 'Error desconocido al validar el archivo.');
      }
    } catch (err: any) {
      const msg = err?.error?.message || err?.message || 'Error al procesar el archivo.';
      this.notificationService.error(msg);
    } finally {
      this.isLoadingPreview.set(false);
    }
  }

  async confirmImport(): Promise<void> {
    const p = this.preview();
    if (!p || !p.batchId || !p.canConfirm) {
      this.notificationService.warning('No es posible confirmar este lote.');
      return;
    }

    this.isConfirming.set(true);
    try {
      const res = await this.dataExchangeService.confirmImport(p.batchId);
      if (res && res.data) {
        this.confirmResult.set(res.data);
        const detail = res.data.alreadyApplied
          ? 'Este lote ya había sido aplicado previamente (idempotente).'
          : `Aplicado con éxito: ${res.data.insertedCount} creados, ${res.data.updatedCount} actualizados.`;
        this.notificationService.success(detail);
        this.imported.emit();
      } else {
        throw new Error(res?.message || 'Error al aplicar el lote.');
      }
    } catch (err: any) {
      const msg = err?.error?.message || err?.message || 'Error al confirmar la importación.';
      this.notificationService.error(msg);
    } finally {
      this.isConfirming.set(false);
    }
  }

  async downloadTemplate(format: 'xlsx' | 'csv'): Promise<void> {
    this.isDownloadingTemplate.set(true);
    try {
      await this.dataExchangeService.downloadTemplate(this.entity, format);
      this.notificationService.success(`Plantilla descargada en formato .${format.toUpperCase()}`);
    } catch (err: any) {
      this.notificationService.error('Error al descargar la plantilla.');
    } finally {
      this.isDownloadingTemplate.set(false);
    }
  }

  async downloadErrorReport(): Promise<void> {
    const p = this.preview();
    if (!p || !p.batchId) return;

    try {
      await this.dataExchangeService.downloadErrors(p.batchId);
      this.notificationService.success('Reporte de errores descargado.');
    } catch (err: any) {
      this.notificationService.error('Error al descargar el reporte de errores.');
    }
  }
}
