import {
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  OnInit,
  AfterViewInit,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  signal,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { soundEffects } from '../../../../features/cuadreEnv/utils/sound-effects';
import { NotificationService } from '../../../../features/cuadreEnv/services/notification.service';
import { BarcodeLookupService } from '../../../../features/products/services/barcode-lookup.service';

@Component({
  selector: 'app-camera-barcode-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './camera-barcode-modal.component.html',
  styleUrls: ['./camera-barcode-modal.component.scss'],
})
export class CameraBarcodeModalComponent implements OnInit, AfterViewInit, OnChanges, OnDestroy {
  private notificationService = inject(NotificationService);
  private barcodeLookup = inject(BarcodeLookupService);

  @Input() visible: boolean = true;
  @Input() title: string = 'Lector de Códigos de Barra';
  @Input() subtitle: string = 'Apunta la cámara hacia el código de barras';
  @Input() warehouseName?: string;
  @Input() continuous: boolean = false;

  @Output() barcodeDetected = new EventEmitter<string>();
  @Output() codeDetected = new EventEmitter<string>();
  @Output() closed = new EventEmitter<void>();

  @ViewChild('scannerVideo') videoRef?: ElementRef<HTMLVideoElement>;
  @ViewChild('fileInputRef') fileInputRef?: ElementRef<HTMLInputElement>;

  private stream: MediaStream | null = null;
  private zxingReader: BrowserMultiFormatReader | null = null;
  private zxingControls: IScannerControls | null = null;
  private animFrameId: number | null = null;
  private isScanning = false;
  private lastScannedCode = '';
  private lastScannedTime = 0;
  private facingMode: 'environment' | 'user' = 'environment';

  isTorchAvailable = signal<boolean>(false);
  isTorchOn = signal<boolean>(false);
  scanFlash = signal<boolean>(false);
  lastDetectedCode = signal<string | null>(null);
  isLoadingCamera = signal<boolean>(true);
  cameraError = signal<string | null>(null);
  isDecodingFile = signal<boolean>(false);

  ngOnInit(): void {
    this.initZxingReader();
  }

  ngAfterViewInit(): void {
    if (this.visible) {
      setTimeout(() => this.startCamera(), 80);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible']) {
      if (this.visible) {
        setTimeout(() => this.startCamera(), 80);
      } else {
        this.stopCamera();
      }
    }
  }

  ngOnDestroy(): void {
    this.stopCamera();
  }

  private initZxingReader(): void {
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
        BarcodeFormat.DATA_MATRIX,
        BarcodeFormat.CODABAR,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);
      this.zxingReader = new BrowserMultiFormatReader(hints, {
        delayBetweenScanAttempts: 80,
      });
    }
  }

  async startCamera(): Promise<void> {
    if (typeof window === 'undefined') return;

    if (
      !window.isSecureContext &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1'
    ) {
      this.notificationService.error('El acceso a la cámara requiere HTTPS o localhost.');
      this.cameraError.set('Requiere HTTPS o localhost');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      this.notificationService.warning('Tu navegador no soporta acceso a la cámara.');
      this.cameraError.set('Navegador no compatible con cámara');
      return;
    }

    this.isLoadingCamera.set(true);
    this.cameraError.set(null);
    this.lastDetectedCode.set(null);
    this.scanFlash.set(false);
    this.isScanning = true;

    try {
      this.stopCameraStreamsOnly();

      let mediaStream: MediaStream | null = null;
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: this.facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch (e1) {
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: this.facingMode },
            audio: false,
          });
        } catch (e2) {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }
      }

      if (!mediaStream) {
        throw new Error('No se pudo inicializar la cámara');
      }

      this.stream = mediaStream;

      const videoEl =
        this.videoRef?.nativeElement ||
        (document.getElementById('cameraBarcodeModalVideo') as HTMLVideoElement);

      if (!videoEl) {
        console.warn('Video element not yet mounted, retrying in 120ms...');
        setTimeout(() => this.startCamera(), 120);
        return;
      }

      videoEl.setAttribute('autoplay', '');
      videoEl.setAttribute('muted', '');
      videoEl.setAttribute('playsinline', '');
      videoEl.setAttribute('webkit-playsinline', '');
      videoEl.muted = true;
      videoEl.srcObject = mediaStream;

      await videoEl.play().catch((err) => console.warn('Video play warning:', err));
      this.isLoadingCamera.set(false);

      // Comprobar soporte de linterna (torch)
      const track = mediaStream.getVideoTracks()[0];
      if (track && (track.getCapabilities as any)) {
        try {
          const caps = (track.getCapabilities as any)();
          this.isTorchAvailable.set(!!caps?.torch);
        } catch {}
      }

      this.initZxingReader();

      // 1. Activar acelerador nativo por hardware del navegador si está disponible (BarcodeDetector)
      this.startHardwareBarcodeDetection(videoEl);

      // 2. Iniciar decodificación continua con ZXing decodeFromStream / decodeFromVideoElement
      try {
        this.zxingControls = await this.zxingReader!.decodeFromStream(
          mediaStream,
          videoEl,
          (result, error) => {
            if (!this.isScanning) return;
            if (result && result.getText()) {
              const code = result.getText().trim();
              if (code) {
                this.handleDetectedCode(code);
              }
            }
          }
        );
      } catch (streamErr) {
        console.warn('Fallback: decodeFromVideoElement', streamErr);
        try {
          this.zxingControls = await this.zxingReader!.decodeFromVideoElement(
            videoEl,
            (result, error) => {
              if (!this.isScanning) return;
              if (result && result.getText()) {
                const code = result.getText().trim();
                if (code) {
                  this.handleDetectedCode(code);
                }
              }
            }
          );
        } catch (elemErr) {
          console.warn('ZXing video element fallback error:', elemErr);
        }
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      this.isLoadingCamera.set(false);
      let msg = 'No se pudo acceder a la cámara.';
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        msg = 'Permiso denegado para usar la cámara. Permite el acceso en tu navegador.';
      }
      this.cameraError.set(msg);
      this.notificationService.error(msg);
    }
  }

  private startHardwareBarcodeDetection(videoEl: HTMLVideoElement): void {
    if (typeof window === 'undefined' || !('BarcodeDetector' in window)) return;

    (window as any).BarcodeDetector.getSupportedFormats()
      .then((supported: string[]) => {
        if (!supported || supported.length === 0) return;
        const targetFormats = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code']
          .filter((f) => supported.includes(f));
        if (targetFormats.length === 0) return;

        let detector: any = null;
        try {
          detector = new (window as any).BarcodeDetector({ formats: targetFormats });
        } catch {
          return;
        }

        const scanLoop = async () => {
          if (!this.isScanning || !this.visible) return;
          if (videoEl && videoEl.readyState >= videoEl.HAVE_CURRENT_DATA) {
            try {
              const barcodes = await detector.detect(videoEl);
              if (barcodes && barcodes.length > 0) {
                const rawVal = barcodes[0].rawValue?.trim();
                if (rawVal) {
                  this.handleDetectedCode(rawVal);
                  if (!this.continuous) return;
                }
              }
            } catch {
              // ignore frame read warnings
            }
          }
          if (this.isScanning && this.visible) {
            this.animFrameId = requestAnimationFrame(scanLoop);
          }
        };

        this.animFrameId = requestAnimationFrame(scanLoop);
      })
      .catch(() => {});
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    this.isDecodingFile.set(true);

    try {
      this.notificationService.info('Decodificando imagen del código de barras...');
      const code = await this.barcodeLookup.decodeBarcodeFromImage(file);
      if (code) {
        this.handleDetectedCode(code);
      }
    } catch (err: any) {
      this.notificationService.error(err?.message || 'No se pudo decodificar el código de la imagen.');
    } finally {
      this.isDecodingFile.set(false);
      input.value = '';
    }
  }

  async switchCamera(): Promise<void> {
    this.facingMode = this.facingMode === 'environment' ? 'user' : 'environment';
    await this.startCamera();
  }

  private handleDetectedCode(code: string): void {
    const now = Date.now();
    // Prevenir rebotes rápidos del mismo código (<1.4s)
    if (this.lastScannedCode === code && now - this.lastScannedTime < 1400) {
      return;
    }

    this.lastScannedCode = code;
    this.lastScannedTime = now;
    this.lastDetectedCode.set(code);

    // Feedback sonoro y háptico
    try {
      soundEffects.playScannerBeep();
    } catch {}

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(50);
      } catch {}
    }

    // Efecto visual de flash verde
    this.scanFlash.set(true);
    setTimeout(() => this.scanFlash.set(false), 280);

    // Emitir resultado a los componentes padres
    this.barcodeDetected.emit(code);
    this.codeDetected.emit(code);

    if (!this.continuous) {
      setTimeout(() => this.close(), 300);
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
      console.warn('No se pudo activar la linterna:', e);
    }
  }

  private stopCameraStreamsOnly(): void {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.zxingControls) {
      try {
        this.zxingControls.stop();
      } catch {}
      this.zxingControls = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {}
      });
      this.stream = null;
    }
  }

  stopCamera(): void {
    this.isScanning = false;
    this.stopCameraStreamsOnly();

    const videoEl =
      this.videoRef?.nativeElement ||
      (document.getElementById('cameraBarcodeModalVideo') as HTMLVideoElement);
    if (videoEl) {
      videoEl.srcObject = null;
    }

    this.isTorchOn.set(false);
    this.isTorchAvailable.set(false);
  }

  close(): void {
    this.stopCamera();
    this.closed.emit();
  }
}
