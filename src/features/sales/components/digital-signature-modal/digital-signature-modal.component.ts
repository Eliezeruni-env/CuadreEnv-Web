import {
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnChanges,
  SimpleChanges,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-digital-signature-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './digital-signature-modal.component.html',
  styleUrls: ['./digital-signature-modal.component.scss'],
})
export class DigitalSignatureModalComponent implements AfterViewInit, OnChanges {
  @Input() visible = false;
  @Input() title = 'Firma Digital de Conduce / Entrega';
  @Input() signerName = 'Cliente / Receptor';
  @Input() documentNumber?: string;

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() signatureSaved = new EventEmitter<string>(); // Emits Base64 PNG

  @ViewChild('signatureCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  hasDrawn = signal<boolean>(false);
  private isDrawing = false;
  private ctx: CanvasRenderingContext2D | null = null;
  private points: { x: number; y: number }[] = [];

  ngAfterViewInit(): void {
    if (this.visible) {
      setTimeout(() => this.setupCanvas(), 50);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible']?.currentValue === true) {
      setTimeout(() => this.setupCanvas(), 50);
    }
  }

  setupCanvas(): void {
    if (!this.canvasRef?.nativeElement) return;
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    this.ctx = canvas.getContext('2d');
    if (this.ctx) {
      this.ctx.scale(dpr, dpr);
      this.ctx.strokeStyle = '#0f172a';
      this.ctx.lineWidth = 2.5;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
    }

    this.hasDrawn.set(false);
    this.points = [];
  }

  // Touch & Pointer Coordinates
  private getCanvasPos(e: TouchEvent | PointerEvent | MouseEvent): { x: number; y: number } {
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();

    if ('touches' in e && e.touches.length > 0) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    const me = e as MouseEvent;
    return {
      x: me.clientX - rect.left,
      y: me.clientY - rect.top,
    };
  }

  startDrawing(e: TouchEvent | PointerEvent | MouseEvent): void {
    e.preventDefault();
    this.isDrawing = true;
    const pos = this.getCanvasPos(e);
    this.points = [pos];

    if (this.ctx) {
      this.ctx.beginPath();
      this.ctx.moveTo(pos.x, pos.y);
    }
  }

  draw(e: TouchEvent | PointerEvent | MouseEvent): void {
    if (!this.isDrawing || !this.ctx) return;
    e.preventDefault();

    const pos = this.getCanvasPos(e);
    this.points.push(pos);
    this.ctx.lineTo(pos.x, pos.y);
    this.ctx.stroke();
    this.hasDrawn.set(true);
  }

  stopDrawing(e?: TouchEvent | PointerEvent | MouseEvent): void {
    if (!this.isDrawing) return;
    if (e) e.preventDefault();
    this.isDrawing = false;
    if (this.ctx) {
      this.ctx.closePath();
    }
  }

  clearCanvas(): void {
    if (!this.canvasRef?.nativeElement || !this.ctx) return;
    const canvas = this.canvasRef.nativeElement;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.hasDrawn.set(false);
    this.points = [];
  }

  saveSignature(): void {
    if (!this.canvasRef?.nativeElement || !this.hasDrawn()) return;
    const canvas = this.canvasRef.nativeElement;
    const dataUrl = canvas.toDataURL('image/png');
    this.signatureSaved.emit(dataUrl);
    this.close();
  }

  close(): void {
    this.visible = false;
    this.visibleChange.emit(false);
    this.clearCanvas();
  }
}
