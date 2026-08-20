import { describe, it, expect } from 'vitest';
import { cleanModelText, splitIntoSections } from '../src/bot/postprocess.js';
import { SKILLS } from '../src/bot/skills.js';

describe('cleanModelText', () => {
  it('removes markdown emphasis, headings, code fences and normalizes bullets/blank lines', () => {
    const raw = '# Title\n\n**LEVEL 1 - SUPPORT**\n```\n1. What is **3/4** + 1/4?\n```\n\n\n\n* a bullet\n• another  \n';
    expect(cleanModelText(raw)).toBe('Title\n\nLEVEL 1 - SUPPORT\n1. What is 3/4 + 1/4?\n\n- a bullet\n- another');
  });
  it('keeps plain text untouched', () => {
    expect(cleanModelText('TITLE: X\nLEVEL 1 - SUPPORT\n1. q')).toBe('TITLE: X\nLEVEL 1 - SUPPORT\n1. q');
  });
});

describe('splitIntoSections', () => {
  const headers = SKILLS.worksheet.sectionHeaders;
  it('extracts the title and header-delimited sections', () => {
    const text = ['TITLE: Fractions Practice', 'LEVEL 1 - SUPPORT', '1. a', '2. b', '', 'LEVEL 2 - ON LEVEL', '1. c', 'LEVEL 3 - CHALLENGE', '1. d', 'ANSWER KEY', 'Level 1: 1) a 2) b'].join('\n');
    const out = splitIntoSections(text, headers);
    expect(out.title).toBe('Fractions Practice');
    expect(out.sections.map((s) => s.heading)).toEqual(headers);
    expect(out.sections[0].body).toBe('1. a\n2. b');
    expect(out.sections[3].body).toBe('Level 1: 1) a 2) b');
  });
  it('tolerates case, en-dashes and trailing colons in headers', () => {
    const text = 'Title: T\nLevel 1 – Support:\n1. a\nLEVEL 2 - ON LEVEL\n1. b\nLevel 3 — Challenge\n1. c\nAnswer Key:\n1) a';
    const out = splitIntoSections(text, headers);
    expect(out.title).toBe('T');
    expect(out.sections.map((s) => s.heading)).toEqual(headers);
  });
  it('falls back to a single section when no headers are found', () => {
    const out = splitIntoSections('just some text\nmore', headers);
    expect(out.title).toBeNull();
    expect(out.sections).toEqual([{ heading: 'Worksheet', body: 'just some text\nmore' }]);
  });
});
