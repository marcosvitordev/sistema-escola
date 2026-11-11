import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFString, StandardFonts, degrees } from 'pdf-lib';
import { studentPdf } from '../src/lib/pdf-page-access';

const original = await PDFDocument.create();
const font = await original.embedFont(StandardFonts.Helvetica);
const pages = [original.addPage([612, 792]), original.addPage([612, 792]), original.addPage([500, 700])];
pages[0].drawText('VISIBLE FIRST PAGE', { x: 50, y: 600, font });
pages[1].drawText('SECRET_BLOCKED_CONTENT', { x: 50, y: 600, font });
pages[2].drawText('VISIBLE ROTATED PAGE', { x: 50, y: 400, font });
pages[2].setRotation(degrees(90)); pages[2].setCropBox(10, 20, 450, 650);
original.setTitle('SECRET_METADATA');
await original.attach(Buffer.from('SECRET_ATTACHMENT'), 'secret.txt', { mimeType: 'text/plain' });
pages[0].node.set(PDFName.of('Annots'), original.context.obj([
  original.context.register(original.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [40, 560, 200, 580], A: { S: 'URI', URI: PDFString.of('https://example.com/aula') } })),
  // Copying this annotation's object graph would also copy the hidden page.
  original.context.register(original.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [40, 530, 200, 550], Dest: [pages[1].ref, PDFName.of('Fit')] })),
]));
const bytes = await original.save();
const sha256 = createHash('sha256').update(bytes).digest('hex');
assert.deepEqual(await studentPdf(bytes, sha256, []), bytes);
const [one, duplicate] = await Promise.all([studentPdf(bytes, sha256, [2]), studentPdf(bytes, sha256, [2])]);
assert.equal(one, duplicate, 'Concurrent requests should reuse the same rendering.');
const clean = await PDFDocument.load(one);
assert.equal(clean.getPageCount(), 3);
assert.equal(clean.getTitle(), undefined);
assert.equal(clean.catalog.get(PDFName.of('Names')), undefined, 'No original attachments or destinations.');
assert.equal(clean.getPage(2).getWidth(), 650);
assert.equal(clean.getPage(2).getHeight(), 450);
const links = clean.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
assert.equal(links.size(), 1, 'Only the safe external link should survive.');
const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
const task = getDocument({ data: new Uint8Array(one), standardFontDataUrl: `${process.cwd().replaceAll('\\', '/')}/node_modules/pdfjs-dist/standard_fonts/` });
try {
  const pdf = await task.promise;
  const text = [];
  for (let page = 1; page <= pdf.numPages; page++) text.push(await (await pdf.getPage(page)).getTextContent());
  assert.ok(JSON.stringify(text).includes('bloqueada'));
  assert.ok(!JSON.stringify(text).includes('SECRET_'));
  const annotations = await (await pdf.getPage(1)).getAnnotations();
  assert.equal(annotations[0].url, 'https://example.com/aula');
} finally { await task.destroy(); }
const allBlocked = await PDFDocument.load(await studentPdf(bytes, sha256, [1, 2, 3]));
assert.equal(allBlocked.getPageCount(), 3);
assert.ok(allBlocked.getPages().every(page => !page.node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict)?.keys().length), 'All blocked pages contain no original images.');
console.log('PASS restricted PDF: hidden content, attachments and destination graphs removed; links, numbering and rotated/cropped geometry preserved.');
