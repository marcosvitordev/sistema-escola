import { degrees, PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { Annotation } from './pdf-annotations';
export async function exportPdf(bytes: Uint8Array, annotations: Annotation[]) {
  const document = await PDFDocument.load(bytes);
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (const note of annotations) {
    const page = document.getPage(note.page - 1);
    const crop = page.getCropBox();
    const rotation = ((page.getRotation().angle % 360) + 360) % 360;
    const width = rotation % 180 ? crop.height : crop.width;
    const height = rotation % 180 ? crop.width : crop.height;
    function point(x: number, y: number) {
      if (rotation === 90) return { x: crop.x + y, y: crop.y + x };
      if (rotation === 180) return { x: crop.x + crop.width - x, y: crop.y + y };
      if (rotation === 270) return { x: crop.x + crop.width - y, y: crop.y + crop.height - x };
      return { x: crop.x + x, y: crop.y + crop.height - y };
    }
    const color = rgb(...[1, 3, 5].map(offset => parseInt(note.color.slice(offset, offset + 2), 16) / 255) as [number, number, number]);
    if (note.type === 'highlight') {
      page.drawRectangle({ ...point(note.x * width, (note.y + note.height) * height), width: note.width * width, height: note.height * height, rotate: degrees(rotation), color, opacity: 0.3 });
    } else {
      // Manual line wrapping matches the editor's explicit newline presentation.
      const lines = note.text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        page.drawText(lines[i], { ...point(note.x * width, note.y * height + note.fontSize * (0.82 + i * 1.3)), font, size: note.fontSize, color, rotate: degrees(rotation) });
      }
    }
  }
  return document.save();
}
