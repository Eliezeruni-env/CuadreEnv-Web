import {
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  OnInit,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  signal,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { soundEffects } from '../../../../features/cuadreEnv/utils/sound-effects';
import { NotificationService } from '../../../../features/cuadreEnv/services/notification.service';

@Component({
  selector: 'app-camera-barcode-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './camera-barcode-modal.component.html',
  styleUrls: ['./camera-barcode-modal.component.scss'],
})
export class CameraBarcodeModalComponent implements OnInit, OnChanges, OnDestroy {
  private notificationService = inject(NotificationService);

  @Input() visible: boolean = true;
  @Input() title: string = 'Lector de Códigos de Barra';
  @Input() subtitle: string = 'Apunta la cámara hacia el código de barras';
  @Input() warehouseName?: string;
  @Input() continuous: boolean = false;

  @Output() barcodeDetected = new EventEmitter<string>();
  @Output() codeDetected = new EventEmitter<string>();
  @Output() closed = new EventEmitter<void>();

  @ViewChild('scannerVideo') videoRef?: ElementRef<HTMLVideoElement>;

  private stream: MediaStream | null = null;
  private zxingReader: BrowserMultiFormatReader | null = null;
  private animFrameId: number | null = null;
  private isScanning = false;
  private lastScannedCode = '';
  private lastScannedTime = 0;

  isTorchAvailable = signal<boolean>(false);
  isTorchOn = signal<boolean>(false);
  scanFlash = signal<boolean>(false);
  lastDetectedCode = signal<string | null>(null);

  ngOnInit(): void {
    if (this.visible) {
      setTimeout(() => this.startCamera(), 100);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible']) {
      if (this.visible) {
        setTimeout(() => this.startCamera(), 100);
      } else {
        this.stopCamera();
      }
    }
  }

  ngOnDestroy(): void {
    this.stopCamera();
  }

  async startCamera(): Promise<void> {
    if (typeof window === 'undefined') return;

    if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      this.notificationService.error('El acceso a la cámara requiere conexión HTTPS o localhost.');
      this.close();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      this.notificationService.warning('Tu navegador o dispositivo no soporta acceso a la cámara.');
      this.close();
      return;
    }

    this.lastDetectedCode.set(null);
    this.scanFlash.set(false);
    this.isScanning = true;

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      let mediaStream: MediaStream | null = null;
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch {
        // Fallback genérico si ideal environment falla
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        }).catch(async () => {
          return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        });
      }

      if (!mediaStream) {
        throw new Error('No se pudo iniciar el flujo de la cámara.');
      }

      this.stream = mediaStream;

      const video = this.videoRef?.nativeElement;
      if (video) {
        video.srcObject = mediaStream;
        await video.play().catch((e) => console.warn('Camera play warning:', e));

        // Chequear disponibilidad de linterna (torch)
        const track = mediaStream.getVideoTracks()[0];
        if (track && (track.getCapabilities as any)) {
          const caps = (track.getCapabilities as any)();
          this.isTorchAvailable.set(!!caps?.torch);
        }

        this.initScanningLoops(video);
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      let msg = 'No se pudo acceder a la cámara.';
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        msg = 'Permiso denegado para usar la cámara. Habilita los permisos en tu navegador.';
      }
      this.notificationService.error(msg);
      this.close();
    }
  }

  stopCamera(): void {
    this.isScanning = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    const video = this.videoRef?.nativeElement;
    if (video) {
      video.srcObject = null;
    }

    this.isTorchOn.set(false);
    this.isTorchAvailable.set(false);
  }

  private initScanningLoops(video: HTMLVideoElement): void {
    // 1. Acelerador nativo BarcodeDetector si está disponible en Chromium/Android
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      this.runNativeBarcodeDetectorLoop(video);
    } else {
      // 2. ZXing Browser MultiFormatReader fallback
      this.runZxingDecodeLoop(video);
    }
  }

  private async runNativeBarcodeDetectorLoop(video: HTMLVideoElement): Promise<void> {
    try {
      const barcodeDetector = new (window as any).BarcodeDetector({
        formats: [
          'ean_13',
          'ean_8',
          'upc_a',
          'upc_e',
          'code_128',
          'code_39',
          'code_93',
          'itf',
          'qr_code',
          'data_matrix',
        ],
      });

      const detectFrame = async () => {
        if (!this.isScanning) return;
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          try {
            const barcodes = await barcodeDetector.detect(video);
            if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
              const code = String(barcodes[0].rawValue).trim();
              if (code) {
                this.handleDetectedCode(code);
                if (!this.continuous) return;
              }
            }
          } catch {
            // Ignorar errores de frames individuales
          }
        }
        this.animFrameId = requestAnimationFrame(detectFrame);
      };

      this.animFrameId = requestAnimationFrame(detectFrame);
    } catch {
      // Fallback a ZXing
      this.runZxingDecodeLoop(video);
    }
  }

  private runZxingDecodeLoop(video: HTMLVideoElement): void {
    if (!this.zxingReader) {
      const hints = new Map<DecodeHintType, any>();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.CODE_93,
        BarcodeFormat.ITF,
        BarcodeFormat.QR_CODE,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);
      this.zxingReader = new BrowserMultiFormatReader(hints);
    }

    this.zxingReader.decodeFromVideoElement(video, (result) => {
      if (!this.isScanning) return;
      if (result && result.getText()) {
        const code = result.getText().trim();
        if (code) {
          this.handleDetectedCode(code);
        }
      }
    }).catch((err) => {
      console.warn('ZXing decode loop error:', err);
    });
  }

  private handleDetectedCode(code: string): void {
    const now = Date.now();
    // Prevenir rebotes rápidos del mismo código (<1.5s)
    if (this.lastScannedCode === code && now - this.lastScannedTime < 1500) {
      return;
    }

    this.lastScannedCode = code;
    this.lastScannedTime = now;
    this.lastDetectedCode.set(code);

    // Feedback sonoro y táctil
    try {
      soundEffects.playScannerBeep();
    } catch {}

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(40);
      } catch {}
    }

    // Efecto visual de flash
    this.scanFlash.set(true);
    setTimeout(() => this.scanFlash.set(false), 300);

    // Emitir resultado en ambos emisores para máxima compatibilidad
    this.barcodeDetected.emit(code);
    this.codeDetected.emit(code);

    if (!this.continuous) {
      setTimeout(() => this.close(), 350);
    }
  }

  async toggleTorch(): Promise<void> {
    if (!this.stream) return;
    const track = this.stream.getVideoTracks()[0];
    if (!track) return;

    const nextState = !this.isTorchOn();
    try {
      await (track as any).applyConstraints({
        advanced: [{ torch: nextState }],
      });
      this.isTorchOn.set(nextState);
    } catch (e) {
      console.warn('No se pudo conmutar la linterna:', e);
    }
  }

  close(): void {
    this.stopCamera();
    this.closed.emit();
  }
}
