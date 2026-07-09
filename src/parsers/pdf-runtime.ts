/**
 * P2.5 — PDF.js runtime wrapper (browser-only, dynamic import).
 *
 * Thin by design: ALL laws live in pdf-text-layer.ts (pure, tested). This
 * file only touches pdfjs-dist and canvas — rasterize a page at the interim
 * ~200 DPI budget and extract the text layer as TextRuns in page units.
 *
 * pdfjs-dist v6 ships its worker as an ESM module; Vite resolves the URL
 * via `new URL(..., import.meta.url)` — no copy step, hashed into the build.
 */

import type { PdfPageText, TextRun } from './pdf-text-layer';
import { classifyPage, RASTER_LONG_SIDE } from './pdf-text-layer';

export interface RenderedPdfPage {
  bitmap: ImageBitmap;
  page: PdfPageText;
  pageCount: number;
}

/** PDF sniffing: magic bytes are the truth; extensions and MIME are hints. */
export async function isPdfFile(file: File): Promise<boolean> {
  if (file.type === 'application/pdf') return true;
  if (/\.pdf$/i.test(file.name)) return true;
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  return head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46; // %PDF
}

/** Render page `index` at the interim raster budget + extract its text layer. */
export async function renderPdfPage(data: ArrayBuffer, index: number): Promise<RenderedPdfPage> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();

  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;
  try {
    const page = await doc.getPage(index + 1); // pdfjs is 1-based
    const base = page.getViewport({ scale: 1 });
    const scale = RASTER_LONG_SIDE / Math.max(base.width, base.height);
    const viewport = page.getViewport({ scale });

    const canvas = new OffscreenCanvas(Math.round(viewport.width), Math.round(viewport.height));
    const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
    await page.render({ canvas: canvas as unknown as HTMLCanvasElement, canvasContext: ctx, viewport }).promise;
    const bitmap = canvas.transferToImageBitmap();

    // Text layer in BASE page units (y-down viewport space) so boxes are
    // resolution-independent; pdf-text-layer normalizes to [0,1].
    const content = await page.getTextContent();
    const runs: TextRun[] = [];
    for (const item of content.items) {
      if (!('str' in item) || typeof item.str !== 'string') continue;
      if (item.str.length === 0) continue;
      // transform = [a,b,c,d,e,f]; e,f = origin in PDF space (y-up).
      const [, , , d, e, f] = item.transform as number[];
      const height = Math.abs(d) || Math.abs(item.height as number) || 10;
      const width = (item.width as number) ?? 0;
      const yTop = base.height - f - height; // flip to y-down
      runs.push({ text: item.str, box: [e, yTop, e + width, yTop + height] });
    }

    return {
      bitmap,
      page: classifyPage(index, base.width, base.height, runs),
      pageCount: doc.numPages,
    };
  } finally {
    await task.destroy();
  }
}
