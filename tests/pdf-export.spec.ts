import { test, expect } from '@playwright/test';
import { PDFDocument, PDFArray, PDFRawStream, decodePDFRawStream, degrees } from 'pdf-lib';
import { exportPdf } from '../src/lib/pdf-export';

test('exportação preserva coordenadas em páginas rotacionadas e recortadas', async () => {
  const original = await PDFDocument.create();
  for (const angle of [0, 90, 180, 270]) {
    const page = original.addPage([612, 792]);
    page.setCropBox(10, 20, 580, 740); page.setRotation(degrees(angle));
  }
  const annotations = [0, 90, 180, 270].map((angle, i) => ({ id: String(angle), page: i + 1, type: 'text' as const, x: .2, y: .3, width: .4, height: .05, text: 'Resposta preservada', fontSize: 14, color: '#244f87' }));
  const exported = await PDFDocument.load(await exportPdf(await original.save(), annotations));
  for (let i = 0; i < 4; i++) {
    const contents = exported.getPage(i).node.Contents() as PDFArray;
    let decoded = '';
    for (const entry of contents.asArray()) {
      const stream = exported.context.lookup(entry);
      if (stream instanceof PDFRawStream) decoded += Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1');
    }
    const line = decoded.split('\n').find(row => row.endsWith(' Tm'))!;
    const matrix = line.split(' ').slice(0, 6).map(Number);
    const expected = [
      [10 + .2 * 580, 20 + 740 - (.3 * 740 + .82 * 14)],
      [10 + .3 * 580 + .82 * 14, 20 + .2 * 740],
      [10 + 580 - .2 * 580, 20 + .3 * 740 + .82 * 14],
      [10 + 580 - (.3 * 580 + .82 * 14), 20 + 740 - .2 * 740],
    ][i];
    expect(matrix[4]).toBeCloseTo(expected[0], 5);
    expect(matrix[5]).toBeCloseTo(expected[1], 5);
    expect(exported.getPage(i).getRotation().angle).toBe(i * 90);
  }
});
