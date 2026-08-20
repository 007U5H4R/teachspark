import {
  AlignmentType, BorderStyle, Document, Footer, ImageRun, PageNumber, Packer, Paragraph,
  ShadingType, Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType,
} from 'docx';
import { imageSize } from 'image-size';
import type { PaperBranding, PaperJson, PaperQuestion, PaperTask, PaperTier } from '../domain/types.js';
import type { DocBuilder } from '../ports.js';

const FONT = 'Nirmala UI'; // ships with Windows; string shorthand also fills the complex-script (Devanagari) slot
const NAVY = '1F3864';     // tier banner fill (no leading '#')
const GREY = 'D9D9D9';
const TWIPS_FULL = 9360;   // usable width at A4 with default 1" margins

const run = (text: string, opts: { bold?: boolean; italics?: boolean; size?: number; color?: string } = {}) =>
  new TextRun({ text, font: FONT, size: opts.size ?? 22, bold: opts.bold, italics: opts.italics, color: opts.color }); // size is half-points: 22 = 11pt

const para = (children: TextRun[] | string, opts: Partial<ConstructorParameters<typeof Paragraph>[0] & object> = {}) =>
  new Paragraph({ children: typeof children === 'string' ? [run(children)] : children, spacing: { after: 80 }, ...opts });

export function optionPrefixes(language: string): string[] {
  return /hindi|हिंदी|marathi|मराठी|sanskrit/i.test(language) ? ['(क)', '(ख)', '(ग)', '(घ)'] : ['(a)', '(b)', '(c)', '(d)'];
}

export function answerLineCount(q: PaperQuestion): number {
  if (q.type === 'MCQ' || q.type === 'TOF' || q.type === 'MTF' || q.type === 'FIB') return 0;
  return Math.min(10, Math.max(2, q.marks + 1)); // SA/LA/CW/CB: writing space scaled by marks, capped
}

const RULE = '_'.repeat(88);

/** image-size dispatches on magic bytes, so a mislabeled ICNS/JXL/HEIF can reach its
 *  DoS-prone parsers (GHSA-w3rx-r6r6-pgpr, no upstream fix). Only ever hand it JPEG or PNG. */
function logoKind(buf: Buffer): 'jpg' | 'png' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
      && buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) return 'png';
  return null;
}

function headerBlock(paper: PaperJson, branding: PaperBranding): (Paragraph | Table)[] {
  const cells: TableCell[] = [];
  const kind = branding.logo ? logoKind(branding.logo.data) : null;
  if (branding.logo && kind) {
    const logo = branding.logo;
    const dims = imageSize(logo.data); // bytes are byte-verified JPEG/PNG at this point — safe; used only for the width/height ratio
    const h = 56;
    const w = Math.round((dims.width && dims.height ? dims.width / dims.height : 1) * h);
    cells.push(new TableCell({
      width: { size: 1600, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({ children: [new ImageRun({ type: kind, data: logo.data, transformation: { width: Math.min(w, 140), height: h } })] })],
    }));
  } else if (branding.logo) {
    console.warn('docx: school logo bytes are not JPEG/PNG (magic-byte check failed) — rendering without a logo');
  }
  const hasLogo = Boolean(branding.logo && kind);
  cells.push(new TableCell({
    width: { size: hasLogo ? TWIPS_FULL - 1600 : TWIPS_FULL, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
    children: [
      // I5: '||' not '??' -- the wizard persists '' (not null) as its "school name skipped" sentinel
      // so PAPER_KEY's schoolName===null gate does not re-ask on a later paper; '' must still fall
      // back to the default header here exactly like the null (never-asked) case does.
      new Paragraph({ alignment: hasLogo ? AlignmentType.LEFT : AlignmentType.CENTER, children: [run(branding.schoolName || 'TeachSpark', { bold: true, size: 30 })] }),
      new Paragraph({ alignment: hasLogo ? AlignmentType.LEFT : AlignmentType.CENTER, children: [run(`${paper.subjectLabel} · ${paper.assessmentLabel}`, { size: 20, color: '555555' })] }),
    ],
  }));
  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: { style: BorderStyle.NONE, size: 0 }, bottom: { style: BorderStyle.SINGLE, size: 8, color: NAVY }, left: { style: BorderStyle.NONE, size: 0 }, right: { style: BorderStyle.NONE, size: 0 }, insideHorizontal: { style: BorderStyle.NONE, size: 0 }, insideVertical: { style: BorderStyle.NONE, size: 0 } },
    rows: [new TableRow({ children: cells })],
  });

  const meta: Array<[string, string]> = [
    ['Title', paper.title],
    ['Grade / कक्षा', paper.gradeLabel],
    ['Chapter / पाठ', paper.chapterLabel],
    ['Board', paper.boardLabel],
    ['Tiers / स्तर', paper.tiers.map((t) => `${t.tier} (${t.tierLabel})`).join(' · ')],
  ];
  const metaTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [2600, TWIPS_FULL - 2600],
    rows: meta.map(([k, v]) => new TableRow({
      children: [
        new TableCell({ shading: { fill: 'F2F2F2', type: ShadingType.CLEAR, color: 'auto' }, margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [para([run(k, { bold: true, size: 20 })], { spacing: { after: 0 } })] }),
        new TableCell({ margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [para([run(v, { size: 20 })], { spacing: { after: 0 } })] }),
      ],
    })),
  });

  return [
    headerTable,
    para('', { spacing: { after: 60 } }),
    metaTable,
    para('', { spacing: { after: 60 } }),
    para([run('Name / नाम: ______________________    Roll No.: ________    Date / दिनांक: ____________', { size: 20 })]),
    ...(paper.generalInstructions.length > 0
      ? [para([run('Instructions / निर्देश: ', { bold: true, size: 20 }), run(paper.generalInstructions.join(' '), { italics: true, size: 20 })])]
      : []),
  ];
}

function tierBanner(tier: PaperTier): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({
      children: [new TableCell({
        shading: { fill: NAVY, type: ShadingType.CLEAR, color: 'auto' },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [para([run(`TIER ${tier.tier} — ${tier.tierLabel.toUpperCase()}   ·   ${tier.timeMinutes} min   ·   ${tier.totalMarks} marks`, { bold: true, color: 'FFFFFF' })], { spacing: { after: 0 } })],
      })],
    })],
  });
}

function questionBlock(q: PaperQuestion, prefixes: string[]): Paragraph[] {
  const out: Paragraph[] = [
    para([run(`${q.number}. `, { bold: true }), run(`[${q.type}] `, { size: 16, color: '888888' }), run(q.text), run(`   [${q.marks}]`, { bold: true, size: 20 })], { keepLines: true, keepNext: true }),
  ];
  if (q.type === 'MCQ' && q.options) {
    q.options.forEach((opt, i) => out.push(para([run(`${prefixes[i] ?? `(${i + 1})`} ${opt}`, { size: 20 })], { indent: { left: 480 }, keepLines: true, spacing: { after: 40 } })));
  }
  if (q.type === 'MTF' && q.matchPairs) {
    // right column sorted alphabetically so the printed order never mirrors the answer order
    const rights = q.matchPairs.map((p) => p.right).sort((a, b) => a.localeCompare(b));
    q.matchPairs.forEach((p, i) => out.push(para([run(`${i + 1}) ${p.left}    —    ${String.fromCharCode(97 + i)}) ${rights[i]}`, { size: 20 })], { indent: { left: 480 }, spacing: { after: 40 } })));
  }
  for (let i = 0; i < answerLineCount(q); i++) out.push(para([run(RULE, { color: '999999', size: 20 })], { spacing: { after: 120 } }));
  return out;
}

function taskBlock(task: PaperTask, prefixes: string[]): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [
    para([run(`${task.heading}  (${task.headingEnglish})`, { bold: true, size: 24 })], { keepNext: true, shading: { fill: GREY, type: ShadingType.CLEAR, color: 'auto' }, spacing: { before: 160, after: 60 } }),
    para([run(task.instructions, { italics: true, size: 20 })], { keepNext: true }),
  ];
  if (task.passage) {
    out.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [new TableRow({ children: [new TableCell({
        borders: { top: { style: BorderStyle.SINGLE, size: 4, color: GREY }, bottom: { style: BorderStyle.SINGLE, size: 4, color: GREY }, left: { style: BorderStyle.SINGLE, size: 4, color: GREY }, right: { style: BorderStyle.SINGLE, size: 4, color: GREY } },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: task.passage.split('\n').map((line) => para([run(line, { size: 20 })], { spacing: { after: 40 } })),
      })] })],
    }));
  }
  for (const q of task.questions) out.push(...questionBlock(q, prefixes));
  return out;
}

function answerKeyBlock(paper: PaperJson): Paragraph[] {
  const out: Paragraph[] = [
    para([run('ANSWER KEY / उत्तर-कुंजी — Teacher Version', { bold: true, size: 28 })], { pageBreakBefore: true, spacing: { after: 120 } }),
  ];
  for (const tier of paper.tiers) {
    out.push(para([run(`Tier ${tier.tier} — ${tier.tierLabel}`, { bold: true, size: 24 })], { spacing: { before: 120, after: 60 } }));
    for (const task of tier.tasks) {
      out.push(para([run(task.heading, { bold: true, size: 20 })], { spacing: { after: 40 } }));
      for (const q of task.questions) {
        out.push(para([run(`${q.number}. `, { bold: true, size: 20 }), run(q.answer, { size: 20 }), ...(q.answerNotes ? [run(`  (${q.answerNotes})`, { italics: true, size: 18, color: '555555' })] : [])], { spacing: { after: 40 } }));
      }
    }
  }
  return out;
}

export class DocxPaperBuilder implements DocBuilder {
  async buildPaperDocx(paper: PaperJson, branding: PaperBranding, teacherVersion: boolean): Promise<Buffer> {
    const prefixes = optionPrefixes(paper.language);
    const children: (Paragraph | Table)[] = [...headerBlock(paper, branding)];
    for (const tier of paper.tiers) {
      children.push(para('', { spacing: { after: 60 } }), tierBanner(tier), para('', { spacing: { after: 40 } }));
      for (const task of tier.tasks) children.push(...taskBlock(task, prefixes));
    }
    if (paper.sourceNotes.length > 0) {
      children.push(para([run(`Note: ${paper.sourceNotes.join(' ')}`, { italics: true, size: 18, color: '888888' })], { spacing: { before: 120 } }));
    }
    if (teacherVersion) children.push(...answerKeyBlock(paper));

    const doc = new Document({
      styles: { default: { document: { run: { font: FONT, size: 22 } } } },
      sections: [{
        properties: {},
        footers: {
          default: new Footer({
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: `${paper.title} · ${paper.chapterLabel} · Made with TeachSpark · Page `, font: FONT, size: 16, color: '777777' }),
                new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: '777777' }),
                new TextRun({ text: ' of ', font: FONT, size: 16, color: '777777' }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: '777777' }),
              ],
            })],
          }),
        },
        children,
      }],
    });
    return Packer.toBuffer(doc); // async — always await
  }
}
