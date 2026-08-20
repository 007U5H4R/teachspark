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
  it('embeds a PNG logo without throwing', async () => {
    // 1x1 transparent PNG
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    const buf = await new DocxPaperBuilder().buildPaperDocx(samplePaperJson(), { schoolName: 'X', logo: { data: png, contentType: 'image/png' } }, false);
    expect(buf.subarray(0, 2).toString()).toBe('PK');
  });
});
