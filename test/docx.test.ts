import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DocxPaperBuilder, optionPrefixes, answerLineCount } from '../src/adapters/docx.js';
import { samplePaperJson } from '../src/adapters/memory.js';

const hasUnzip = existsSync('/usr/bin/unzip') || existsSync('/usr/local/bin/unzip');
function docXml(buf: Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), 'docx-'));
  const f = join(dir, 'p.docx');
  writeFileSync(f, buf);
  return execFileSync('unzip', ['-p', f, 'word/document.xml'], { maxBuffer: 64 * 1024 * 1024 }).toString();
}
function zipList(buf: Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), 'docx-'));
  const f = join(dir, 'p.docx');
  writeFileSync(f, buf);
  return execFileSync('unzip', ['-l', f], { maxBuffer: 64 * 1024 * 1024 }).toString();
}

// Genuine 1x1 JPEG (produced via macOS `sips` from the 1x1 PNG below — real magic bytes ff d8 ff,
// confirmed parseable by the installed image-size before use here) and the pre-existing 1x1 PNG fixture.
const JPEG_1PX =
  '/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAAaADAAQAAAABAAAAAQAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAAQABAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAAgICAgICAwICAwUDAwMFBgUFBQUGCAYGBgYGCAoICAgICAgKCgoKCgoKCgwMDAwMDA4ODg4ODw8PDw8PDw8PD//bAEMBAgICBAQEBwQEBxALCQsQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEP/dAAQAAf/aAAwDAQACEQMRAD8A7iiiiv8AQA+XP//Z';
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('optionPrefixes / answerLineCount', () => {
  it('uses Devanagari letters for Hindi and latin otherwise', () => {
    expect(optionPrefixes('Hindi')).toEqual(['(क)', '(ख)', '(ग)', '(घ)']);
    expect(optionPrefixes('English')).toEqual(['(a)', '(b)', '(c)', '(d)']);
  });
  it('gives writing space only to written-response types, scaled by marks', () => {
    const q = samplePaperJson().tiers[0].tasks[1].questions[0]; // SA, 5 marks
    expect(answerLineCount(q)).toBeGreaterThanOrEqual(2);
    expect(answerLineCount({ ...q, type: 'MCQ' })).toBe(0);
    expect(answerLineCount({ ...q, type: 'TOF' })).toBe(0);
    expect(answerLineCount({ ...q, type: 'LA', marks: 5 })).toBeGreaterThanOrEqual(5);
    expect(answerLineCount({ ...q, type: 'CW', marks: 20 })).toBeLessThanOrEqual(10); // capped
  });
});

describe('DocxPaperBuilder', () => {
  it('produces a valid zip-container .docx', async () => {
    const buf = await new DocxPaperBuilder().buildPaperDocx(samplePaperJson(), { schoolName: 'Ryan International School', logo: null }, false);
    expect(buf.subarray(0, 2).toString()).toBe('PK');
    expect(buf.length).toBeGreaterThan(4000);
  });
  it.skipIf(!hasUnzip)('renders header, banner, tasks, MCQ letters and Devanagari content', async () => {
    const xml = docXml(await new DocxPaperBuilder().buildPaperDocx(samplePaperJson(), { schoolName: 'Ryan International School', logo: null }, false));
    expect(xml).toContain('Ryan International School');
    expect(xml).toContain('टोपी शुक्ला');            // chapter, Devanagari intact
    expect(xml).toContain('FOUNDATIONAL');           // tier banner
    expect(xml).toContain('(क)');                    // Hindi MCQ option prefix
    expect(xml).toContain('Nirmala UI');             // Devanagari-capable font set
    expect(xml).toContain('35–40');                  // tier time
    expect(xml).not.toContain('ANSWER KEY');         // student version
  });
  it.skipIf(!hasUnzip)('appends the answer key only for the teacher version', async () => {
    const xml = docXml(await new DocxPaperBuilder().buildPaperDocx(samplePaperJson(), { schoolName: null, logo: null }, true));
    expect(xml).toContain('ANSWER KEY');
    expect(xml).toContain('उत्तर');                   // sample answer text present
  });
  it.skipIf(!hasUnzip)('I5: an empty-string schoolName (the wizard\'s skip sentinel) still falls back to TeachSpark', async () => {
    const xml = docXml(await new DocxPaperBuilder().buildPaperDocx(samplePaperJson(), { schoolName: '', logo: null }, false));
    expect(xml).toContain('TeachSpark');
  });
  // Regression guard for defect 1: the internal question-type enum (PaperQuestionType) must never
  // be printed on the page — a teacher/student must never see a literal "[MCQ]" next to a question.
  // The type must still *drive layout* (options list, answer-line count, etc.) without ever being
  // rendered as text. Owner decision: marks stay bracketed ("[N]") — only their position changed
  // (right tab stop instead of space-padding) — so this test also pins that marks are still present.
  it.skipIf(!hasUnzip)('never prints the internal question-type tag, but still prints right-tab-stopped marks in brackets', async () => {
    const xml = docXml(await new DocxPaperBuilder().buildPaperDocx(samplePaperJson(), { schoolName: 'Ryan International School', logo: null }, false));
    for (const tag of ['[MCQ]', '[SA]', '[FIB]', '[LA]', '[CW]', '[CB]', '[TOF]', '[MTF]']) {
      expect(xml).not.toContain(tag);
    }
    expect(xml).toContain('[5]');              // marks for the sample fixture's 5-mark questions — still printed
    expect(xml).toContain('w:tab');             // right tab stop that now positions them, replacing space-padding
    expect(xml).not.toContain('Title</w:t>');   // defect 3: no more a table row literally labelled "Title"
  });
  // Defect 4: a multi-tier paper must start each additional tier on a new page, like separate
  // tiered handouts, rather than running tiers together on the same page.
  it.skipIf(!hasUnzip)('starts each additional tier on a new page', async () => {
    const tierA = samplePaperJson().tiers[0];
    const tierB = { ...tierA, tier: 'B' as const, tierLabel: 'Proficient' };
    const paper = samplePaperJson({ tiers: [tierA, tierB] });
    const xml = docXml(await new DocxPaperBuilder().buildPaperDocx(paper, { schoolName: 'X', logo: null }, false));
    expect(xml).toContain('w:pageBreakBefore');
    expect((xml.match(/w:pageBreakBefore/g) ?? []).length).toBe(1); // one break between the 2 tiers; no answer key requested here
  });
  // Defect 5, seen on the first real paper: the tier banner read "35-40 मिनट min". PaperTier.timeMinutes
  // is specified as a bare range, but the model answers in the paper's own language and supplies the unit
  // itself, so appending "min" unconditionally doubled it. Both directions are pinned here.
  it.skipIf(!hasUnzip)('does not double the time unit when the model already supplied one', async () => {
    const tier = { ...samplePaperJson().tiers[0], timeMinutes: '35-40 मिनट' };
    const xml = docXml(await new DocxPaperBuilder().buildPaperDocx(samplePaperJson({ tiers: [tier] }), { schoolName: 'X', logo: null }, false));
    expect(xml).toContain('35-40 मिनट');
    expect(xml).not.toContain('मिनट min');
  });
  it.skipIf(!hasUnzip)('still appends a unit when the model supplied a bare range', async () => {
    const tier = { ...samplePaperJson().tiers[0], timeMinutes: '35–40' };
    const xml = docXml(await new DocxPaperBuilder().buildPaperDocx(samplePaperJson({ tiers: [tier] }), { schoolName: 'X', logo: null }, false));
    expect(xml).toContain('35–40 min');
  });
  it('embeds a PNG logo without throwing', async () => {
    // 1x1 transparent PNG
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    const buf = await new DocxPaperBuilder().buildPaperDocx(samplePaperJson(), { schoolName: 'X', logo: { data: png, contentType: 'image/png' } }, false);
    expect(buf.subarray(0, 2).toString()).toBe('PK');
  });

  // GHSA-w3rx-r6r6-pgpr / GHSA-5p2g-fcmc-qvqq: image-size's ICNS/JXL/HEIF parsers can infinite-loop on
  // crafted input, and image-size dispatches on magic bytes, not the declared content-type. A school
  // logo arrives over WhatsApp; the content-type allowlist alone doesn't stop mislabeled bytes from
  // reaching those parsers. docx.ts must byte-verify JPEG/PNG before ever calling imageSize().
  it.skipIf(!hasUnzip)('renders WITH a logo when given genuine JPEG magic bytes', async () => {
    const jpg = Buffer.from(JPEG_1PX, 'base64');
    const buf = await new DocxPaperBuilder().buildPaperDocx(samplePaperJson(), { schoolName: 'X', logo: { data: jpg, contentType: 'image/jpeg' } }, false);
    expect(buf.subarray(0, 2).toString()).toBe('PK');
    expect(zipList(buf)).toContain('word/media/');
  });
  it.skipIf(!hasUnzip)('renders WITH a logo when given genuine PNG magic bytes', async () => {
    const png = Buffer.from(PNG_1PX, 'base64');
    const buf = await new DocxPaperBuilder().buildPaperDocx(samplePaperJson(), { schoolName: 'X', logo: { data: png, contentType: 'image/png' } }, false);
    expect(buf.subarray(0, 2).toString()).toBe('PK');
    expect(zipList(buf)).toContain('word/media/');
  });
  it('renders WITHOUT a logo, and never throws, when the bytes are mislabeled/not JPEG or PNG', async () => {
    // ICNS magic bytes — pre-mitigation this reached image-size's DoS-prone ICNS parser and got
    // embedded as a mislabeled "jpg" anyway; this test pins that it is now skipped instead.
    const junk = Buffer.from('icns' + 'x'.repeat(64));
    const buf = await new DocxPaperBuilder().buildPaperDocx(samplePaperJson(), { schoolName: 'X', logo: { data: junk, contentType: 'image/png' } }, false);
    expect(buf.subarray(0, 2).toString()).toBe('PK');
    expect(buf.length).toBeGreaterThan(4000);
    if (hasUnzip) expect(zipList(buf)).not.toContain('word/media/');
  });
});
