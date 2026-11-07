import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

export interface UniversalProductMetadata {
  barcode: string;
  name: string;
  brand?: string;
  category?: string;
  description: string;
  imageUrl?: string;
  quantity?: string;
  source: 'openfoodfacts' | 'upcitemdb' | 'openbeauty' | 'openproducts' | 'openpetfood' | 'backend' | 'local' | 'brocade';
}

@Injectable({
  providedIn: 'root',
})
export class BarcodeLookupService {
  private http = inject(HttpClient);
  private zxingReader: BrowserMultiFormatReader | null = null;

  private getZxingReader(): BrowserMultiFormatReader {
    if (!this.zxingReader) {
      const hints = new Map<DecodeHintType, any>();
      const formats = [
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
      ];
      hints.set(DecodeHintType.POSSIBLE_FORMATS, formats);
      hints.set(DecodeHintType.TRY_HARDER, true);
      this.zxingReader = new BrowserMultiFormatReader(hints);
    }
    return this.zxingReader;
  }

  /**
   * Decodifica el código de barra desde un archivo de imagen (estilo minifier.org)
   * utilizando aceleración nativa por hardware si existe o motor ZXing omnidireccional.
   */
  async decodeBarcodeFromImage(file: File): Promise<string> {
    if (!file) throw new Error('No se seleccionó ningún archivo de imagen.');

    // Intento 1: Acelerador nativo por hardware del navegador (BarcodeDetector)
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window && 'createImageBitmap' in window) {
      try {
        const detector = new (window as any).BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'],
        });
        const bitmap = await createImageBitmap(file);
        const barcodes = await detector.detect(bitmap);
        if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
          const raw = String(barcodes[0].rawValue).trim();
          if (raw) return raw;
        }
      } catch (nativeErr) {
        console.warn('Fallback: BarcodeDetector no pudo decodificar, probando ZXing:', nativeErr);
      }
    }

    // Intento 2: Motor ZXing directo desde ObjectURL
    const objectUrl = URL.createObjectURL(file);
    try {
      const reader = this.getZxingReader();
      const result = await reader.decodeFromImageUrl(objectUrl);
      if (result && result.getText()) {
        const text = result.getText().trim();
        if (text) return text;
      }
    } catch {
      // Probar canvas alternativo
    } finally {
      URL.revokeObjectURL(objectUrl);
    }

    // Intento 3: Decodificación avanzada renderizando en Canvas HTML5 con escalado
    try {
      const canvasResult = await this.decodeViaCanvas(file);
      if (canvasResult) return canvasResult;
    } catch {
      // Ignorar
    }

    throw new Error('No se detectó ningún código de barras legible en la imagen. Intenta con una foto más nítida o escribe el código manualmente.');
  }

  private async decodeViaCanvas(file: File): Promise<string | null> {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = async () => {
        URL.revokeObjectURL(url);
        try {
          const canvas = document.createElement('canvas');
          const maxDim = 1200;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(null);

          ctx.drawImage(img, 0, 0, w, h);
          const reader = this.getZxingReader();
          const res = await reader.decodeFromCanvas(canvas);
          if (res && res.getText()) {
            return resolve(res.getText().trim());
          }
        } catch {
          // No detectado
        }
        resolve(null);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  }

  /**
   * Busca información universal del producto en bases de datos abiertas:
   * 1. Backend CuadreEnv API (/product/lookup/{code}) con catálogo local y UPCitemdb del servidor.
   * 2. Open Food Facts (v0 / v2) mediante fetch simple sin headers para evitar bloqueos CORS.
   * 3. Open Beauty Facts (v0 / v2).
   * 4. Open Products Facts (v0 / v2).
   * 5. Open Pet Food Facts (v0 / v2).
   */
  async lookupUniversalProduct(barcode: string): Promise<UniversalProductMetadata | null> {
    const rawDigits = (barcode || '').replace(/\D/g, '').trim();
    if (!rawDigits || rawDigits.length < 5) return null;

    // Generar candidatos de códigos normalizados (12 dígitos UPC, 13 dígitos EAN, etc.)
    const searchCodes: string[] = [rawDigits];
    if (rawDigits.length === 12) {
      searchCodes.push(`0${rawDigits}`);
    } else if (rawDigits.length === 13 && rawDigits.startsWith('0')) {
      searchCodes.push(rawDigits.substring(1));
    } else if (rawDigits.length === 11) {
      searchCodes.push(`0${rawDigits}`);
      searchCodes.push(`00${rawDigits}`);
    }

    // 1. Consultar Backend CuadreEnv API (soporta base local + búsqueda de servidor sin CORS)
    for (const code of searchCodes) {
      try {
        const endpoints = [
          `${environment.apiUrl}/product/lookup/${encodeURIComponent(code)}`,
          `${environment.API_BASE_URL}/product/lookup/${encodeURIComponent(code)}`,
        ];
        for (const ep of endpoints) {
          try {
            const res: any = await firstValueFrom(
              this.http.get<any>(ep, { headers: { 'x-silent-error': 'true' } })
            );
            const data = res?.data || res;
            if (data && (data.name || data.description || data.name !== undefined)) {
              const name = (data.name || data.description || '').trim();
              const brand = (data.brand || '').trim();
              const category = (data.category || '').trim();
              const imageUrl = (data.imageUrl || '').trim();
              const quantity = (data.quantity || '').trim();
              const isLocal = Boolean(data.isLocal);

              let desc = (data.description || name).trim();
              if (brand && !desc.toLowerCase().includes(brand.toLowerCase())) {
                desc = `${desc} · ${brand}`;
              }

              if (name || desc) {
                return {
                  barcode: data.barcode || code,
                  name: name || desc,
                  brand,
                  category,
                  description: desc || name,
                  imageUrl,
                  quantity,
                  source: isLocal ? 'local' : 'backend',
                };
              }
            }
          } catch {
            // Probar siguiente endpoint backend
          }
        }
      } catch {
        // Continuar a fuentes abiertas de cliente
      }
    }

    // 2. Consultar Open Food Facts directamente con fetch nativo del navegador
    // (Usa credentials: 'omit' y sin custom headers para garantizar simple request CORS 100% compatible)
    for (const code of searchCodes) {
      const offUrls = [
        `https://world.openfoodfacts.org/api/v0/product/${code}.json`,
        `https://world.openfoodfacts.org/api/v2/product/${code}.json`,
      ];
      for (const url of offUrls) {
        try {
          const resp = await fetch(url, {
            method: 'GET',
            mode: 'cors',
            credentials: 'omit',
            headers: { Accept: 'application/json' },
          });
          if (resp.ok) {
            const data: any = await resp.json();
            if (data && (data.status === 1 || data.status_verbose === 'product found') && data.product) {
              const p = data.product;
              const name = (
                p.product_name_es ||
                p.product_name ||
                p.product_name_en ||
                p.generic_name_es ||
                p.generic_name ||
                p.brands ||
                ''
              ).trim();
              const brand = (p.brands || p.brand_owner || '').split(',')[0].trim();
              const category = (p.categories || p.main_category || '')
                .split(',')[0]
                .replace(/^[a-z]{2}:/, '')
                .trim();
              const imageUrl = p.image_front_url || p.image_url || p.image_small_url || '';
              const quantity = (p.quantity || '').trim();

              let desc = name;
              if (brand && !desc.toLowerCase().includes(brand.toLowerCase())) {
                desc = `${desc} · ${brand}`;
              }
              if (quantity && !desc.toLowerCase().includes(quantity.toLowerCase())) {
                desc = `${desc} (${quantity})`;
              }

              if (name) {
                return {
                  barcode: code,
                  name,
                  brand,
                  category,
                  description: desc || name,
                  imageUrl,
                  quantity,
                  source: 'openfoodfacts',
                };
              }
            }
          }
        } catch {
          // Continuar al siguiente
        }
      }
    }

    // 3. Consultar Open Beauty Facts (cosméticos, perfumes, aseo personal)
    for (const code of searchCodes) {
      try {
        const resp = await fetch(`https://world.openbeautyfacts.org/api/v0/product/${code}.json`, {
          method: 'GET',
          mode: 'cors',
          credentials: 'omit',
          headers: { Accept: 'application/json' },
        });
        if (resp.ok) {
          const data: any = await resp.json();
          if (data && data.status === 1 && data.product) {
            const p = data.product;
            const name = (p.product_name_es || p.product_name || p.product_name_en || '').trim();
            const brand = (p.brands || p.brand_owner || '').split(',')[0].trim();
            const category = (p.categories || '').split(',')[0].trim();
            const imageUrl = p.image_front_url || p.image_url || '';
            const quantity = (p.quantity || '').trim();

            let desc = name;
            if (brand && !desc.toLowerCase().includes(brand.toLowerCase())) {
              desc = `${desc} · ${brand}`;
            }

            if (name) {
              return {
                barcode: code,
                name,
                brand,
                category,
                description: desc || name,
                imageUrl,
                quantity,
                source: 'openbeauty',
              };
            }
          }
        }
      } catch {
        // Continuar
      }
    }

    // 4. Consultar Open Products Facts (artículos generales, ferretería, hogar)
    for (const code of searchCodes) {
      try {
        const resp = await fetch(`https://world.openproductsfacts.org/api/v0/product/${code}.json`, {
          method: 'GET',
          mode: 'cors',
          credentials: 'omit',
          headers: { Accept: 'application/json' },
        });
        if (resp.ok) {
          const data: any = await resp.json();
          if (data && data.status === 1 && data.product) {
            const p = data.product;
            const name = (p.product_name_es || p.product_name || p.product_name_en || '').trim();
            const brand = (p.brands || '').split(',')[0].trim();
            const category = (p.categories || '').split(',')[0].trim();
            const imageUrl = p.image_url || p.image_front_url || '';

            let desc = name;
            if (brand && !desc.toLowerCase().includes(brand.toLowerCase())) {
              desc = `${desc} · ${brand}`;
            }

            if (name) {
              return {
                barcode: code,
                name,
                brand,
                category,
                description: desc || name,
                imageUrl,
                source: 'openproducts',
              };
            }
          }
        }
      } catch {
        // Continuar
      }
    }

    // 5. Consultar Open Pet Food Facts (alimento y accesorios para mascotas)
    for (const code of searchCodes) {
      try {
        const resp = await fetch(`https://world.openpetfoodfacts.org/api/v0/product/${code}.json`, {
          method: 'GET',
          mode: 'cors',
          credentials: 'omit',
          headers: { Accept: 'application/json' },
        });
        if (resp.ok) {
          const data: any = await resp.json();
          if (data && data.status === 1 && data.product) {
            const p = data.product;
            const name = (p.product_name_es || p.product_name || p.product_name_en || '').trim();
            const brand = (p.brands || '').split(',')[0].trim();
            const category = (p.categories || '').split(',')[0].trim();
            const imageUrl = p.image_front_url || p.image_url || '';

            let desc = name;
            if (brand && !desc.toLowerCase().includes(brand.toLowerCase())) {
              desc = `${desc} · ${brand}`;
            }

            if (name) {
              return {
                barcode: code,
                name,
                brand,
                category,
                description: desc || name,
                imageUrl,
                source: 'openpetfood',
              };
            }
          }
        }
      } catch {
        // Continuar
      }
    }

    return null;
  }
}
