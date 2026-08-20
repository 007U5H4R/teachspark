import PDFDocument from 'pdfkit';
import type { PdfBuilder, PdfSection } from '../ports.js';

/** Built-in Helvetica is WinAnsi only: strip emoji/variation selectors/ZWJ, swap ₹ and arrows. */
export function toPdfSafe(s: string): string {
  return s
    .replace(/\p{Extended_Pictographic}|\uFE0F|\u200D/gu, '')
    .replace(/\u20B9\s?/g, 'Rs. ')
    .replace(/→/g, '->')
    .replace(/←/g, '<-')
    .replace(/[ \t]+$/gm, '')
    .trim();
}

export class PdfkitBuilder implements PdfBuilder {
  build(input: { title: string; subtitle: string; sections: PdfSection[]; footer: string }): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true, info: { Title: toPdfSafe(input.title) } });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      try {
        doc.font('Helvetica-Bold').fontSize(18).text(toPdfSafe(input.title));
        doc.moveDown(0.3);
        doc.font('Helvetica').fontSize(10).fillColor('#555555').text(toPdfSafe(input.subtitle)).fillColor('#000000');
        doc.moveDown();
        for (const s of input.sections) {
          doc.font('Helvetica-Bold').fontSize(13).text(toPdfSafe(s.heading));
          doc.moveDown(0.3);
          doc.font('Helvetica').fontSize(11).text(toPdfSafe(s.body), { lineGap: 3, paragraphGap: 6 });
          doc.moveDown();
        }
        doc.moveDown();
        doc.font('Helvetica-Oblique').fontSize(9).fillColor('#555555').text(toPdfSafe(input.footer)).fillColor('#000000');
        const { start, count } = doc.bufferedPageRange();
        for (let i = start; i < start + count; i++) {
          doc.switchToPage(i);
          doc.font('Helvetica').fontSize(8).fillColor('#777777').text(`Page ${i + 1} of ${count}`, 50, doc.page.height - 40, { align: 'center', lineBreak: false });
        }
        doc.end();
      } catch (e) {
        reject(e);
      }
    });
  }
}
