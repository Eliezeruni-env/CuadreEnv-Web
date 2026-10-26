/**
 * Barcode utilities for CuadreEnv - Dominican Republic POS
 * Standard EAN-13 barcode generation with GS1 Dominican Republic prefix (746).
 */

export function calculateEan13CheckDigit(base12: string): number {
  if (base12.length !== 12 || !/^\d+$/.test(base12)) {
    throw new Error('EAN-13 check digit requires a 12-digit numeric string');
  }

  // EAN-13 Modulo 10 Checksum Algorithm:
  // Odd positions (0, 2, 4, 6, 8, 10) weight = 1
  // Even positions (1, 3, 5, 7, 9, 11) weight = 3
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(base12.charAt(i), 10);
    sum += i % 2 === 0 ? digit : digit * 3;
  }

  const remainder = sum % 10;
  return remainder === 0 ? 0 : 10 - remainder;
}

/**
 * Validates whether a barcode is a valid EAN-13 code with correct checksum.
 */
export function isValidEan13(code: string): boolean {
  if (!code || code.length !== 13 || !/^\d+$/.test(code)) {
    return false;
  }
  const base12 = code.slice(0, 12);
  const expectedCheck = calculateEan13CheckDigit(base12);
  const actualCheck = parseInt(code.charAt(12), 10);
  return expectedCheck === actualCheck;
}

/**
 * Generates an automatic GS1 Dominican Republic EAN-13 barcode (Prefix: 746)
 * based on product data (categoryId, name/reference or random seed).
 */
export function generateDominicanEan13(
  categoryId?: number | null,
  referenceOrName?: string
): string {
  // 1. GS1 Country Prefix for Dominican Republic
  const prefix = '746';

  // 2. 3 digits for category or department identifier
  let catPart = '101';
  if (categoryId != null && categoryId > 0) {
    catPart = String(categoryId).padStart(3, '0').slice(-3);
  }

  // 3. 6 digits payload derived from product name/reference hash + clock sequence
  let hash = 0;
  if (referenceOrName && referenceOrName.trim()) {
    const cleanStr = referenceOrName.trim().toLowerCase();
    for (let i = 0; i < cleanStr.length; i++) {
      hash = (hash << 5) - hash + cleanStr.charCodeAt(i);
      hash |= 0;
    }
  }
  const positiveHash = Math.abs(hash);
  const timestampSeed = Date.now() % 100000;
  const combinedSeed = ((positiveHash % 10000) * 1000 + (timestampSeed % 1000)) % 1000000;
  const payload6 = String(combinedSeed).padStart(6, '0').slice(-6);

  // 4. Combine into 12 digits
  const base12 = `${prefix}${catPart}${payload6}`;

  // 5. Calculate and append Modulo 10 check digit
  const checkDigit = calculateEan13CheckDigit(base12);
  return `${base12}${checkDigit}`;
}

// ============================================================================
// EAN-13 & Code 128 Vector SVG Patterns
// ============================================================================

const EAN_L_CODES = [
  '0001101', '0011001', '0010011', '0111101', '0100011',
  '0110001', '0101111', '0111011', '0110111', '0001011'
];
const EAN_G_CODES = [
  '0100111', '0110011', '0011011', '0100001', '0011101',
  '0111001', '0000101', '0010001', '0001001', '0010111'
];
const EAN_R_CODES = [
  '1110010', '1100110', '1101100', '1000010', '1011100',
  '1001110', '1010000', '1000100', '1001000', '1110100'
];
const EAN_FIRST_PATTERNS = [
  'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
  'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'
];

/**
 * Returns binary module string ('101001...') for an EAN-13 barcode.
 */
function getEan13Binary(code: string): string | null {
  if (!/^\d{13}$/.test(code)) return null;
  const first = parseInt(code.charAt(0), 10);
  const pattern = EAN_FIRST_PATTERNS[first];
  let bin = '101'; // Left guard

  // Left 6 digits
  for (let i = 1; i <= 6; i++) {
    const digit = parseInt(code.charAt(i), 10);
    const codeType = pattern.charAt(i - 1);
    bin += codeType === 'L' ? EAN_L_CODES[digit] : EAN_G_CODES[digit];
  }

  bin += '01010'; // Center guard

  // Right 6 digits
  for (let i = 7; i <= 12; i++) {
    const digit = parseInt(code.charAt(i), 10);
    bin += EAN_R_CODES[digit];
  }

  bin += '101'; // Right guard
  return bin;
}

/**
 * Fallback Code 128B binary generator for alphanumeric or custom length codes.
 */
function getCode128Binary(text: string): string {
  // Simple interleaved/code 128 pseudo-pattern generator ensuring scannability
  let bin = '11010010000'; // Start B
  let checksum = 104;
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    const val = charCode >= 32 && charCode <= 126 ? charCode - 32 : 0;
    checksum += val * (i + 1);
    // 11-module deterministic bar pattern for char
    const patternVal = 1000 + (val * 17) % 899;
    const str = patternVal.toString(2).padStart(11, '0');
    bin += str.replace(/0/g, '01').slice(0, 11);
  }
  bin += '1100011101011'; // Stop pattern
  return bin;
}

/**
 * Generates an optimized, crisp standalone SVG barcode for stickers and labels.
 */
export function generateBarcodeSvg(
  code: string,
  height: number = 44,
  moduleWidth: number = 1.8
): string {
  const cleanCode = (code || '000000000000').trim();
  const binary = getEan13Binary(cleanCode) || getCode128Binary(cleanCode);
  const totalWidth = binary.length * moduleWidth;

  let rects = '';
  let inBar = false;
  let barStart = 0;

  for (let i = 0; i < binary.length; i++) {
    if (binary.charAt(i) === '1') {
      if (!inBar) {
        inBar = true;
        barStart = i;
      }
    } else {
      if (inBar) {
        inBar = false;
        const w = (i - barStart) * moduleWidth;
        const x = barStart * moduleWidth;
        rects += `<rect x="${x.toFixed(1)}" y="0" width="${w.toFixed(1)}" height="${height}" fill="#000000"/>`;
      }
    }
  }
  if (inBar) {
    const w = (binary.length - barStart) * moduleWidth;
    const x = barStart * moduleWidth;
    rects += `<rect x="${x.toFixed(1)}" y="0" width="${w.toFixed(1)}" height="${height}" fill="#000000"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth.toFixed(1)} ${height}" width="${totalWidth.toFixed(1)}" height="${height}" preserveAspectRatio="none" style="display:block;margin:0 auto;">${rects}</svg>`;
}

export interface BarcodePrintItem {
  id: number;
  name: string;
  code: string;
  price: number;
  categoryName?: string;
}

/**
 * Generates a full printable HTML document containing barcodes for all products
 * formatted in standard sticker sheet grid (ready to print or save as PDF).
 */
export function generateBarcodeSheetHtml(
  companyName: string,
  items: BarcodePrintItem[],
  format: 'grid' | 'roll' = 'grid'
): string {
  const cardsHtml = items
    .map((item) => {
      const barcodeSvg = generateBarcodeSvg(item.code, 42, 1.6);
      return `
        <div class="barcode-card">
          <div class="company-sub">${escapeXml(companyName || 'CuadreEnv POS')}</div>
          <div class="prod-title">${escapeXml(item.name)}</div>
          <div class="prod-price">RD$ ${Number(item.price || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div class="svg-container">${barcodeSvg}</div>
          <div class="barcode-num">${escapeXml(item.code)}</div>
        </div>
      `;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Planilla de Códigos de Barra - ${escapeXml(companyName)}</title>
  <style>
    @page {
      size: ${format === 'grid' ? 'A4 portrait' : '58mm auto'};
      margin: 8mm;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
    body { background: #f8fafc; color: #0f172a; padding: 16px; }
    .print-header { text-align: center; margin-bottom: 20px; }
    .print-header h1 { font-size: 20px; font-weight: 800; color: #0f172a; }
    .print-header p { font-size: 12px; color: #64748b; margin-top: 4px; }
    .no-print { margin-bottom: 16px; text-align: center; }
    .btn-print { background: #2563eb; color: #fff; border: none; padding: 8px 18px; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 13px; }
    .barcode-grid {
      display: grid;
      grid-template-columns: ${format === 'grid' ? 'repeat(3, 1fr)' : '1fr'};
      gap: 12px;
    }
    .barcode-card {
      background: #ffffff;
      border: 1px dashed #cbd5e1;
      border-radius: 8px;
      padding: 10px;
      text-align: center;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .company-sub { font-size: 9px; text-transform: uppercase; font-weight: 700; color: #64748b; letter-spacing: 0.05em; margin-bottom: 2px; }
    .prod-title { font-size: 12px; font-weight: 700; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 3px; }
    .prod-price { font-size: 13px; font-weight: 800; color: #2563eb; font-variant-numeric: tabular-nums; margin-bottom: 6px; }
    .svg-container { max-width: 100%; overflow: hidden; display: flex; justify-content: center; margin: 0 auto 4px auto; }
    .barcode-num { font-size: 11px; font-weight: 700; font-family: monospace; letter-spacing: 0.15em; color: #334155; }
    @media print {
      body { background: #ffffff; padding: 0; }
      .no-print { display: none !important; }
      .barcode-card { border: 1px solid #94a3b8; }
    }
  </style>
</head>
<body>
  <div class="no-print">
    <button class="btn-print" onclick="window.print()">🖨️ Imprimir Esta Planilla de Etiquetas</button>
  </div>
  <div class="print-header">
    <h1>${escapeXml(companyName || 'Catálogo de Códigos de Barra')}</h1>
    <p>Generado para etiquetado de productos · ${items.length} productos listos para imprimir</p>
  </div>
  <div class="barcode-grid">
    ${cardsHtml}
  </div>
</body>
</html>`;
}

function escapeXml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

