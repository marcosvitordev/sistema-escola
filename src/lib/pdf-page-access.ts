import { PDFDocument, PDFName, PDFString, StandardFonts, rgb } from 'pdf-lib';
import { resolve } from 'node:path';

export class RestrictedPdfBusyError extends Error {}
const cache = new Map<string, Uint8Array>();
const pending = new Map<string, Promise<Uint8Array>>();
let tail: Promise<unknown> = Promise.resolve();
let cacheBytes = 0;

/** Never copy PDF objects from a restricted original: links, shared resources and
 * attachments can otherwise carry content from hidden pages into the new file. */
export async function studentPdf(content: Uint8Array, sha256: string, blockedPages: number[]): Promise<Uint8Array> {
  if (!blockedPages.length) return new Uint8Array(content);
  const blocked = new Set(blockedPages);
  const key = `${sha256}:${[...blocked].sort((a, b) => a - b).join(',')}`;
  const hit = cache.get(key);
  if (hit) { cache.delete(key); cache.set(key, hit); return hit; }
  const existing = pending.get(key); if (existing) return existing;
  if (pending.size >= 2) throw new RestrictedPdfBusyError('Preparando apostilas. Tente novamente em alguns segundos.');
  const task = tail.catch(() => {}).then(async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const { createCanvas } = await import('@napi-rs/canvas');
    const root = resolve(process.cwd(), 'node_modules', 'pdfjs-dist').replaceAll('\\', '/');
    const loading = pdfjs.getDocument({ data: new Uint8Array(content), maxImageSize: 16_000_000, standardFontDataUrl: `${root}/standard_fonts/`, cMapUrl: `${root}/cmaps/`, cMapPacked: true, wasmUrl: `${root}/wasm/` });
    const original = await loading.promise;
    try {
      const output = await PDFDocument.create();
      const font = await output.embedFont(StandardFonts.Helvetica);
      // Same numbering and display geometry, including rotated/cropped originals.
      for (let n = 1; n <= original.numPages; n++) {
        const source = await original.getPage(n);
        const size = source.getViewport({ scale: 1 });
        output.addPage([size.width, size.height]);
        source.cleanup();
      }
      for (let n = 1; n <= original.numPages; n++) {
        const target = output.getPage(n - 1);
        if (blocked.has(n)) {
          target.drawText(`Pagina ${n} bloqueada pelo professor`, { x: 24, y: Math.max(24, target.getHeight() / 2), size: Math.min(16, target.getWidth() / 30), font, color: rgb(.35, .4, .38) });
          continue;
        }
        const source = await original.getPage(n);
        const base = source.getViewport({ scale: 1 });
        const viewport = source.getViewport({ scale: Math.min(2, 1600 / Math.max(base.width, base.height)) });
        const surface = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        try {
          await source.render({ canvas: surface as unknown as HTMLCanvasElement, canvasContext: surface.getContext('2d') as unknown as CanvasRenderingContext2D, viewport, annotationMode: pdfjs.AnnotationMode.ENABLE }).promise;
          const image = await output.embedJpg(surface.toBuffer('image/jpeg', 85));
          target.drawImage(image, { x: 0, y: 0, width: base.width, height: base.height });
        } finally { surface.width = 1; surface.height = 1; }
        // Rebuild only safe clickable links; never import original object graphs.
        const links = await source.getAnnotations({ intent: 'display' });
        const annotations = [];
        for (const link of links) {
          if (link.subtype !== 'Link' || link.noView || !Array.isArray(link.rect) || link.rect.length !== 4 || !link.rect.every(Number.isFinite)) continue;
          const rect = [...base.convertToViewportPoint(link.rect[0], link.rect[1]), ...base.convertToViewportPoint(link.rect[2], link.rect[3])];
          const common = { Type: 'Annot', Subtype: 'Link', Rect: [Math.min(rect[0], rect[2]), base.height - Math.max(rect[1], rect[3]), Math.max(rect[0], rect[2]), base.height - Math.min(rect[1], rect[3])], Border: [0, 0, 0] };
          if (typeof link.url === 'string') {
            try { const url = new URL(link.url); if (!['https:', 'http:', 'mailto:', 'tel:'].includes(url.protocol)) continue;
              annotations.push(output.context.register(output.context.obj({ ...common, A: { Type: 'Action', S: 'URI', URI: PDFString.of(url.href) } })));
            } catch { /* Ignore unsafe or malformed links. */ }
          } else if (link.dest) {
            try { const dest = typeof link.dest === 'string' ? await original.getDestination(link.dest) : link.dest;
              if (!Array.isArray(dest) || !dest.length) continue;
              const index = typeof dest[0] === 'number' ? dest[0] : await original.getPageIndex(dest[0]);
              if (!Number.isInteger(index) || index < 0 || index >= original.numPages || blocked.has(index + 1)) continue;
              annotations.push(output.context.register(output.context.obj({ ...common, Dest: [output.getPage(index).ref, PDFName.of('Fit')] })));
            } catch { /* An invalid destination must not block the document. */ }
          }
        }
        if (annotations.length) target.node.set(PDFName.of('Annots'), output.context.obj(annotations));
        source.cleanup();
      }
      const result = await output.save();
      if (result.byteLength <= 24_000_000) {
        while (cacheBytes + result.byteLength > 24_000_000 && cache.size) { const oldest = cache.keys().next().value!; cacheBytes -= cache.get(oldest)!.byteLength; cache.delete(oldest); }
        cache.set(key, result); cacheBytes += result.byteLength;
      }
      return result;
    } finally { await loading.destroy(); }
  });
  pending.set(key, task); tail = task;
  try { return await task; } finally { pending.delete(key); }
}
