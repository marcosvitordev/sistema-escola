'use client';
import { useEffect, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';

type PageLink = { id: string; x: number; y: number; width: number; height: number; url?: string; page?: number };

export function PdfLinks({ pdf, pageNumber, onNavigate }: { pdf: PDFDocumentProxy; pageNumber: number; onNavigate: (page: number) => void }) {
  const [result, setResult] = useState<{ pdf: PDFDocumentProxy; pageNumber: number; links: PageLink[] } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setError('');
    async function load() {
      try {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1 });
        const annotations = await page.getAnnotations({ intent: 'display' });
        const links = await Promise.all(annotations.filter(annotation => annotation.subtype === 'Link' && !annotation.noView).map(async (annotation): Promise<PageLink | null> => {
          if (!Array.isArray(annotation.rect) || annotation.rect.length !== 4 || !annotation.rect.every(Number.isFinite)) return null;
          const rect = [...viewport.convertToViewportPoint(annotation.rect[0], annotation.rect[1]), ...viewport.convertToViewportPoint(annotation.rect[2], annotation.rect[3])];
          const x = Math.max(0, Math.min(rect[0], rect[2]) / viewport.width);
          const y = Math.max(0, Math.min(rect[1], rect[3]) / viewport.height);
          const right = Math.min(1, Math.max(rect[0], rect[2]) / viewport.width);
          const bottom = Math.min(1, Math.max(rect[1], rect[3]) / viewport.height);
          if (right <= x || bottom <= y) return null;
          const link: PageLink = { id: annotation.id, x, y, width: right - x, height: bottom - y };
          if (typeof annotation.url === 'string') {
            try {
              const url = new URL(annotation.url);
              if (!['https:', 'http:', 'mailto:', 'tel:'].includes(url.protocol)) return null;
              link.url = url.href;
            } catch { return null; }
          } else if (annotation.dest) {
            try {
              const dest = typeof annotation.dest === 'string' ? await pdf.getDestination(annotation.dest) : annotation.dest;
              if (!Array.isArray(dest) || !dest.length) return null;
              const index = typeof dest[0] === 'number' ? dest[0] : await pdf.getPageIndex(dest[0]);
              if (!Number.isInteger(index) || index < 0 || index >= pdf.numPages) return null;
              link.page = index + 1;
            } catch { return null; }
          } else return null;
          return link;
        }));
        if (active) setResult({ pdf, pageNumber, links: links.filter((link): link is PageLink => link !== null) });
      } catch { if (active) setError('Não foi possível carregar os links desta página. Reabra a apostila para tentar novamente.'); }
    }
    void load();
    return () => { active = false; };
  }, [pdf, pageNumber]);
  const links = result?.pdf === pdf && result.pageNumber === pageNumber ? result.links : [];
  return <>{error && <p className="pdf-link-error" role="alert">{error}</p>}<div className="pdf-link-layer" aria-label="Links da página">{links.map(link => {
    const style = { left: `${link.x * 100}%`, top: `${link.y * 100}%`, width: `${link.width * 100}%`, height: `${link.height * 100}%` };
    return link.url
      ? <a key={link.id} className="pdf-link" style={style} href={link.url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir link: ${link.url} (nova aba)`} title={`${link.url} — abrir em nova aba`} onClick={event => event.stopPropagation()} />
      : <button key={link.id} type="button" className="pdf-link" style={style} aria-label={`Ir para a página ${link.page}`} title={`Ir para a página ${link.page}`} onClick={event => { event.stopPropagation(); onNavigate(link.page!); }} />;
  })}</div></>;
}
