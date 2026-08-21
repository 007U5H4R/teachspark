import {
  AlignmentType, BorderStyle, Document, Footer, ImageRun, PageNumber, Packer, Paragraph,
  ShadingType, Tab, Table, TableCell, TableRow, TabStopPosition, TabStopType, TextRun, VerticalAlign, WidthType,
} from 'docx';
import { imageSize } from 'image-size';
import { timeLabel } from '../bot/paper/copy.js'; // shared with the WhatsApp preview so both phrase the tier time identically
import type { PaperBranding, PaperJson, PaperQuestion, PaperTask, PaperTier } from '../domain/types.js';
import type { DocBuilder } from '../ports.js';

const FONT = 'Nirmala UI'; // ships with Windows; string shorthand also fills the complex-script (Devanagari) slot
const NAVY = '1F3864';     // tier banner fill / task-heading accent (no leading '#')
const GREY = 'D9D9D9';
const TASK_TINT = 'E8ECF7'; // light accent wash behind task headings, matching the reference papers
const RULE_GREY = '999999'; // neutral divider / ruled-writing-line colour
// docx.js defaults an unstyled section to A4 (11906 twips wide) with 1" (1440 twips) margins, and
// ships TabStopPosition.MAX = 9026 as exactly that usable width for right tab stops. We reuse the
// same figure here (and pin page size/margins explicitly in buildPaperDocx() so it can't silently
// drift) instead of hand-computing it — a stale hand-computed value here previously assumed a
// Letter-width page and was ~334 twips too wide for the A4 page actually being rendered.
const TWIPS_FULL = TabStopPosition.MAX; // 9026 = 11906 - 2*1440
const OPTION_INDENT = 700; // MCQ/MTF lines nest one step past the question's own hanging indent (504/360 below)

const run = (text: string, opts: { bold?: boolean; italics?: boolean; size?: number; color?: string } = {}) =>
  new TextRun({ text, font: FONT, size: opts.size ?? 22, bold: opts.bold, italics: opts.italics, color: opts.color }); // size is half-points: 22 = 11pt

const para = (children: TextRun[] | string, opts: Partial<ConstructorParameters<typeof Paragraph>[0] & object> = {}) =>
  new Paragraph({ children: typeof children === 'string' ? [run(children)] : children, spacing: { after: 80 }, ...opts });

/** Right-tab-stopped marks, e.g. "[5]" — pairs with a paragraph `tabStops` entry at
 *  TabStopPosition.MAX and a Tab() run child so marks land in a flush column at the text margin,
 *  instead of being padded out with literal spaces. Owner decision: keep the bracket text as-is
 *  ("[N]") — only the positioning changes. Deliberately not bold: the type-tag run this replaces
 *  in spirit ([MCQ] etc.) is gone entirely, and marks should read as a quiet margin note, not shout. */
const marksRun = (marks: number) =>
  new TextRun({ children: [new Tab(), `[${marks}]`], font: FONT, size: 20, italics: true, color: '666666' });

export function optionPrefixes(language: string): string[] {
  return /hindi|हिंदी|marathi|मराठी|sanskrit/i.test(language) ? ['(क)', '(ख)', '(ग)', '(घ)'] : ['(a)', '(b)', '(c)', '(d)'];
}

export function answerLineCount(q: PaperQuestion): number {
  if (q.type === 'MCQ' || q.type === 'TOF' || q.type === 'MTF' || q.type === 'FIB') return 0;
  return Math.min(10, Math.max(2, q.marks + 1)); // SA/LA/CW/CB: writing space scaled by marks, capped
}

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
    // Explicit grid matching the per-cell DXA widths above — some renderers mis-measure a table
    // whose columns are only ever implied by cell widths and never declared on the table itself.
    columnWidths: hasLogo ? [1600, TWIPS_FULL - 1600] : [TWIPS_FULL],
    borders: { top: { style: BorderStyle.NONE, size: 0 }, bottom: { style: BorderStyle.SINGLE, size: 8, color: NAVY }, left: { style: BorderStyle.NONE, size: 0 }, right: { style: BorderStyle.NONE, size: 0 }, insideHorizontal: { style: BorderStyle.NONE, size: 0 }, insideVertical: { style: BorderStyle.NONE, size: 0 } },
    rows: [new TableRow({ children: cells })],
  });

  // Paper title as a proper centred heading — never a table row literally labelled "Title".
  const titlePara = para([run(paper.title, { bold: true, size: 30 })], {
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: 120 },
  });

  // Compact meta box: one bordered table, label+value merged per cell — matches the reference
  // papers' terse "लेबल (Label): value" convention, never a five-row label/value table.
  // Time / Max Marks only make sense here for a single-tier paper (they otherwise vary per tier,
  // and are already shown on each tier's own banner below); a multi-tier paper shows the tier list
  // instead, exactly like the multi-tier reference sample does.
  const metaField = (label: string, value: string): TextRun[] => [run(`${label}: `, { bold: true, size: 20 }), run(value, { size: 20 })];
  const metaCell = (content: TextRun[], span = 1) => new TableCell({
    columnSpan: span,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [para(content, { spacing: { after: 0 } })],
  });
  const metaBorder = { style: BorderStyle.SINGLE, size: 4, color: 'auto' };
  const singleTier = paper.tiers.length === 1 ? paper.tiers[0] : null;
  const metaColWidth = Math.floor(TWIPS_FULL / 4); // DXA widths must be integers; put the remainder in the last column
  const metaTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [metaColWidth, metaColWidth, metaColWidth, TWIPS_FULL - metaColWidth * 3],
    borders: { top: metaBorder, bottom: metaBorder, left: metaBorder, right: metaBorder, insideHorizontal: metaBorder, insideVertical: metaBorder },
    rows: [
      new TableRow({
        children: [
          metaCell(metaField('कक्षा (Grade)', paper.gradeLabel)),
          metaCell(metaField('विषय (Subject)', paper.subjectLabel)),
          metaCell(metaField('पाठ (Chapter)', paper.chapterLabel)),
          metaCell(metaField('बोर्ड (Board)', paper.boardLabel)),
        ],
      }),
      new TableRow({
        children: singleTier
          ? [
              metaCell(metaField('समय (Time)', timeLabel(singleTier.timeMinutes)), 2),
              metaCell(metaField('कुल अंक (Max Marks)', String(singleTier.totalMarks)), 2),
            ]
          : [metaCell(metaField('स्तर (Tiers)', paper.tiers.map((t) => `${t.tier} (${t.tierLabel})`).join(' · ')), 4)],
      }),
    ],
  });

  // Thin divider before the paper body starts, echoing the reference papers' rule under the header.
  const closingRule = para('', { border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE_GREY, space: 1 } }, spacing: { after: 160 } });

  return [
    headerTable,
    para('', { spacing: { after: 60 } }),
    titlePara,
    metaTable,
    para('', { spacing: { after: 60 } }),
    para([run('Name / नाम: ______________________    Roll No.: ________    Date / दिनांक: ____________', { size: 20 })]),
    ...(paper.generalInstructions.length > 0
      ? [para([run('Instructions / निर्देश: ', { bold: true, size: 20 }), run(paper.generalInstructions.join(' '), { italics: true, size: 20 })])]
      : []),
    closingRule,
  ];
}

function tierBanner(tier: PaperTier): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({
      children: [new TableCell({
        shading: { fill: NAVY, type: ShadingType.CLEAR, color: 'auto' },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [para([run(`TIER ${tier.tier} — ${tier.tierLabel.toUpperCase()}   ·   ${timeLabel(tier.timeMinutes)}   ·   ${tier.totalMarks} marks`, { bold: true, color: 'FFFFFF' })], { spacing: { after: 0 } })],
      })],
    })],
  });
}

function questionBlock(q: PaperQuestion, prefixes: string[]): Paragraph[] {
  const out: Paragraph[] = [
    // Hanging indent: the number sits near the margin, wrapped lines align under the question
    // text (not under the number) — matches the reference papers. Marks are right-tab-stopped to
    // the text margin instead of padded with literal spaces, so they line up in a column
    // regardless of question length. The internal type code (MCQ/SA/FIB/...) is intentionally
    // never printed on the page — it only drives the layout below (options / match-pairs /
    // answer-line count).
    para([run(`${q.number}. `, { bold: true }), run(q.text), marksRun(q.marks)], {
      keepLines: true,
      keepNext: true,
      indent: { left: 504, hanging: 360 },
      tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
    }),
  ];
  if (q.type === 'MCQ' && q.options) {
    q.options.forEach((opt, i) => out.push(para([run(`${prefixes[i] ?? `(${i + 1})`} ${opt}`, { size: 20 })], { indent: { left: OPTION_INDENT }, keepLines: true, spacing: { after: 60 } })));
  }
  if (q.type === 'MTF' && q.matchPairs) {
    // right column sorted alphabetically so the printed order never mirrors the answer order
    const rights = q.matchPairs.map((p) => p.right).sort((a, b) => a.localeCompare(b));
    q.matchPairs.forEach((p, i) => out.push(para([run(`${i + 1}) ${p.left}    —    ${String.fromCharCode(97 + i)}) ${rights[i]}`, { size: 20 })], { indent: { left: OPTION_INDENT }, spacing: { after: 60 } })));
  }
  // Ruled blank space — a bottom-bordered empty line — rather than underscore runs, so it reads as
  // an actual writing line instead of a ragged row of "_" glyphs (especially under Devanagari).
  for (let i = 0; i < answerLineCount(q); i++) {
    out.push(para(' ', { border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE_GREY, space: 1 } }, spacing: { after: 160 } }));
  }
  return out;
}

function taskBlock(task: PaperTask, prefixes: string[]): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [
    // Coloured accent bar + tint, not a flat grey box — matches both reference papers' task-heading
    // treatment and reads with clearer hierarchy than a uniform shade.
    para([run(`${task.heading}  (${task.headingEnglish})`, { bold: true, size: 24, color: NAVY })], {
      keepNext: true,
      shading: { fill: TASK_TINT, type: ShadingType.CLEAR, color: 'auto' },
      border: { left: { style: BorderStyle.SINGLE, size: 24, color: NAVY, space: 6 } },
      spacing: { before: 240, after: 100 },
    }),
    para([run(task.instructions, { italics: true, size: 20 })], { keepNext: true }),
  ];
  if (task.passage) {
    out.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [new TableRow({ children: [new TableCell({
        shading: { fill: 'F5F5F5', type: ShadingType.CLEAR, color: 'auto' },
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
    paper.tiers.forEach((tier, tierIndex) => {
      // Each tier starts on its own page — a multi-tier paper reads as separate tiered handouts,
      // the way a teacher would hand them out, not one run-on document. The first tier follows
      // straight after the header (no blank leading page).
      children.push(
        para('', { spacing: { after: 60 }, ...(tierIndex > 0 ? { pageBreakBefore: true } : {}) }),
        tierBanner(tier),
        para('', { spacing: { after: 40 } }),
      );
      for (const task of tier.tasks) children.push(...taskBlock(task, prefixes));
    });
    if (paper.sourceNotes.length > 0) {
      children.push(para([run(`Note: ${paper.sourceNotes.join(' ')}`, { italics: true, size: 18, color: '888888' })], { spacing: { before: 120 } }));
    }
    if (teacherVersion) children.push(...answerKeyBlock(paper));

    const doc = new Document({
      styles: { default: { document: { run: { font: FONT, size: 22 } } } },
      sections: [{
        properties: {
          // Pinned explicitly (A4, 1" margins) so TWIPS_FULL / TabStopPosition.MAX-based layout —
          // the meta box's column widths, the right-tab-stopped marks column — can never silently
          // drift from the page geometry it was computed against.
          page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
        },
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
