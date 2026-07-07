import * as Comlink from 'comlink';
import { readBarcodesFromImageData, setZXingModuleOverrides } from 'zxing-wasm/reader';
import zxingReaderWasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import { preprocessPage } from './preprocess';
import { Box } from '../core/geometry';

// Load the zxing wasm from the locally-bundled asset, never a CDN, to satisfy
// the local-only directive.
setZXingModuleOverrides({
  locateFile: (path: string, prefix: string) =>
    path.endsWith('.wasm') ? zxingReaderWasmUrl : prefix + path,
});

/** A decoded 1D/2D code with its payload and normalized location. */
export interface DecodedCode {
  /** Decoded text payload. */
  text: string;
  /** Symbology, e.g. 'QRCode', 'Code128', 'PDF417', 'DataMatrix'. */
  format: string;
  /** Axis-aligned bounding box of the symbol, normalized to [0,1]. */
  boxNorm: Box;
  /** zxing validity (checksum/structure verified). */
  isValid: boolean;
}

const parserApi = {
  /**
   * Runs canvas page normalization and real image-quality analysis.
   */
  async preprocessPage(imageBitmap: ImageBitmap, pageIndex: number) {
    console.log(`[Parser Worker] Preprocessing page ${pageIndex}`);
    const result = await preprocessPage(imageBitmap, pageIndex);
    return {
      normalizedBitmap: result.normalizedBitmap,
      width: result.width,
      height: result.height,
      quality: result.quality,
      transforms: result.transforms,
      skewDeg: result.skewDeg,
    };
  },

  /**
   * Decodes every 1D/2D code (QR, PDF417, DataMatrix, Aztec, Code128, EAN, ...)
   * in the image using the local zxing-wasm engine. Returns only checksum-valid
   * results with payloads and normalized positions. Nothing leaves the device.
   */
  async decodeCodes(imageBitmap: ImageBitmap): Promise<DecodedCode[]> {
    const w = imageBitmap.width;
    const h = imageBitmap.height;
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get OffscreenCanvas 2D context for code decoding');
    ctx.drawImage(imageBitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, w, h);

    const results = await readBarcodesFromImageData(imageData, {
      tryHarder: true,
      tryRotate: true,
      tryInvert: true,
    });

    const decoded: DecodedCode[] = [];
    for (const r of results) {
      if (!r.isValid || r.text === '') continue;
      const pts = [r.position.topLeft, r.position.topRight, r.position.bottomRight, r.position.bottomLeft];
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const xMin = Math.max(0, Math.min(...xs));
      const yMin = Math.max(0, Math.min(...ys));
      const xMax = Math.min(w, Math.max(...xs));
      const yMax = Math.min(h, Math.max(...ys));
      decoded.push({
        text: r.text,
        format: r.format,
        boxNorm: [xMin / w, yMin / h, xMax / w, yMax / h],
        isValid: r.isValid,
      });
    }
    console.log(`[Parser Worker] Decoded ${decoded.length} valid code(s).`);
    return decoded;
  },
};

Comlink.expose(parserApi);
export type ParserWorkerApi = typeof parserApi;
