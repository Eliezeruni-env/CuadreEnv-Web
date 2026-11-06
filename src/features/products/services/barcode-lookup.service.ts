import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
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
  source: 'brocade' | 'openfoodfacts' | 'openproducts' | 'local';
}

@Injectable({
  providedIn: 'root',
})
export class BarcodeLookupService {
  private zxingReader: BrowserMultiFormatReader | null = null;

  constructor(private http: HttpClient) {}

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
          return String(barcodes[0].rawValue).trim();
        }
      } catch (nativeErr) {
        console.warn('Fallback: BarcodeDetector no pudo decodificar, probando ZXing:', nativeErr);
      }
    }

    // Intento 2: Motor ZXing de alta precisión
    const objectUrl = URL.createObjectURL(file);
    try {
      const reader = this.getZxingReader();
      const result = await reader.decodeFromImageUrl(objectUrl);
      if (result && result.getText()) {
        return result.getText().trim();
      }
      throw new Error('No se detectó ningún código de barras legible en la imagen.');
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  /**
   * Busca información universal de producto en bases de datos abiertas (estilo Go-UPC / brocade.io)
   * consultando Brocade.io, Open Food Facts y Open Products Facts.
   */
  async lookupUniversalProduct(barcode: string): Promise<UniversalProductMetadata | null> {
    const cleanDigits = (barcode || '').replace(/\D/g, '').trim();
    if (!cleanDigits || cleanDigits.length < 5) return null;

    // Normalizar a 13 o 12 dígitos si es necesario para GTIN
    const searchCodes = [cleanDigits];
    if (cleanDigits.length === 12) {
      searchCodes.push(`0${cleanDigits}`);
    } else if (cleanDigits.length === 13 && cleanDigits.startsWith('0')) {
      searchCodes.push(cleanDigits.substring(1));
    }

    // 1. Probar en Open Food Facts (Mayor base de datos abierta con imágenes CDN)
    for (const code of searchCodes) {
      try {
        const url = `https://world.openfoodfacts.org/api/v2/product/${code}.json`;
        const res: any = await firstValueFrom(
          this.http.get<any>(url, { headers: { 'x-silent-error': 'true' } })
        );

        if (res && (res.status === 1 || res.status_verbose === 'product found') && res.product) {
          const p = res.product;
          const name = (
            p.product_name_es ||
            p.product_name ||
            p.product_name_en ||
            p.generic_name_es ||
            p.generic_name ||
            ''
          ).trim();
          const brand = (p.brands || p.brand_owner || '').split(',')[0].trim();
          const category = (p.categories || p.main_category || '')
            .split(',')[0]
            .replace(/^[a-z]{2}:/, '')
            .trim();
          const imageUrl = p.image_front_url || p.image_url || p.image_small_url || '';
          const quantity = p.quantity || '';

          let description = name;
          if (brand && !description.toLowerCase().includes(brand.toLowerCase())) {
            description = `${description} · ${brand}`;
          }
          if (quantity && !description.toLowerCase().includes(quantity.toLowerCase())) {
            description = `${description} (${quantity})`;
          }

          if (name) {
            return {
              barcode: code,
              name,
              brand,
              category,
              description: description || name,
              imageUrl,
              quantity,
              source: 'openfoodfacts',
            };
          }
        }
      } catch {
        // Continuar al siguiente proveedor
      }
    }

    // 2. Probar en Brocade.io (EventideSystems Open GTIN / UPC Database)
    for (const code of searchCodes) {
      try {
        const url = `https://www.brocade.io/api/items/${code}`;
        const res: any = await firstValueFrom(
          this.http.get<any>(url, { headers: { 'x-silent-error': 'true' } })
        );

        if (res && (res.name || res.gtin)) {
          const name = (res.name || '').trim();
          const brand = (res.brand_name || res.brand || '').trim();
          const category = (res.category || '').trim();
          const imageUrl = res.image || res.image_url || '';

          let description = name;
          if (brand && !description.toLowerCase().includes(brand.toLowerCase())) {
            description = `${description} · ${brand}`;
          }

          return {
            barcode: code,
            name: name || `Producto ${code}`,
            brand,
            category,
            description: description || name || `Producto ${code}`,
            imageUrl,
            source: 'brocade',
          };
        }
      } catch {
        // Continuar
      }
    }

    // 3. Probar en Open Products Facts (para cosméticos, ferretería, limpieza, ropa)
    for (const code of searchCodes) {
      try {
        const url = `https://world.openproductsfacts.org/api/v2/product/${code}.json`;
        const res: any = await firstValueFrom(
          this.http.get<any>(url, { headers: { 'x-silent-error': 'true' } })
        );

        if (res && res.product && (res.product.product_name || res.product.product_name_es)) {
          const p = res.product;
          const name = (p.product_name_es || p.product_name || p.product_name_en || '').trim();
          const brand = (p.brands || '').split(',')[0].trim();
          const category = (p.categories || '').split(',')[0].trim();
          const imageUrl = p.image_url || p.image_front_url || '';

          let description = name;
          if (brand && !description.toLowerCase().includes(brand.toLowerCase())) {
            description = `${description} · ${brand}`;
          }

          return {
            barcode: code,
            name,
            brand,
            category,
            description: description || name,
            imageUrl,
            source: 'openproducts',
          };
        }
      } catch {
        // No encontrado
      }
    }

    return null;
  }
}

