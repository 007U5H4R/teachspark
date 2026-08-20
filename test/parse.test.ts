import { describe, it, expect } from 'vitest';
import {
  parseCommand, parseOption, renderMenu, validateTopic, chunkText, containsPii,
  GRADE_OPTIONS, SUBJECT_OPTIONS, BOARD_OPTIONS, IMPACT_OPTIONS, REFERRAL_OPTIONS,
} from '../src/bot/parse.js';

describe('parseCommand', () => {
  it.each([
    ['help', 'help'], ['HELP', 'help'], ['*help*', 'help'], ['?', 'help'],
    ['restart', 'restart'], ['Reset', 'restart'],
    ['new', 'new'], ['NEW!', 'new'], ['menu', 'new'], ['another', 'new'], ['next', 'new'],
    ['paper', 'paper'], ['QP', 'paper'], ['Question Paper', 'paper'],
    ['hello', null], ['fractions', null], ['', null],
  ])('%s -> %s', (body, cmd) => expect(parseCommand(body)).toBe(cmd));
});

describe('renderMenu', () => {
  it('numbers options from 1', () => {
    expect(renderMenu(GRADE_OPTIONS)).toBe('1) Primary (Classes 1-5)\n2) Middle (Classes 6-8)\n3) High (Classes 9-12)');
  });
});

describe('parseOption', () => {
  it('accepts numbers with punctuation', () => {
    expect(parseOption('2', GRADE_OPTIONS)?.id).toBe('middle');
    expect(parseOption('2)', GRADE_OPTIONS)?.id).toBe('middle');
    expect(parseOption(' 3. ', GRADE_OPTIONS)?.id).toBe('high');
    expect(parseOption('4', GRADE_OPTIONS)).toBeNull();
    expect(parseOption('0', GRADE_OPTIONS)).toBeNull();
  });
  it('accepts ids, labels and aliases (case-insensitive)', () => {
    expect(parseOption('Middle (Classes 6-8)', GRADE_OPTIONS)?.id).toBe('middle');
    expect(parseOption('class 7', GRADE_OPTIONS)?.id).toBe('middle');
    expect(parseOption('I teach 10th', GRADE_OPTIONS)?.id).toBe('high');
    expect(parseOption('maths', SUBJECT_OPTIONS)?.id).toBe('math');
    expect(parseOption('Science', SUBJECT_OPTIONS)?.id).toBe('science');
    expect(parseOption('SST', SUBJECT_OPTIONS)?.id).toBe('social');
    expect(parseOption('cbse', BOARD_OPTIONS)?.id).toBe('cbse');
    expect(parseOption('State board (Maharashtra)', BOARD_OPTIONS)?.id).toBe('state');
    expect(parseOption('30 min', IMPACT_OPTIONS)?.id).toBe('30');
    expect(parseOption('about an hour', IMPACT_OPTIONS)?.id).toBe('45');
    expect(parseOption('yes', REFERRAL_OPTIONS)?.id).toBe('yes');
    expect(parseOption('No', REFERRAL_OPTIONS)?.id).toBe('no');
  });
  it('returns null for unrelated text', () => {
    expect(parseOption('fractions', GRADE_OPTIONS)).toBeNull();
    expect(parseOption('', GRADE_OPTIONS)).toBeNull();
  });
  it('reaches the exact-label tier when the leading word is not an alias', () => {
    const OPT = [{ id: 'z', label: 'Zed (X-Y)', aliases: ['unrelated'] }];
    expect(parseOption('Zed (X-Y)', OPT)?.id).toBe('z');   // returns null before the fix
    expect(parseOption('Zed (X-Y).', OPT)?.id).toBe('z');  // trailing punct on input also matches
  });
});

describe('validateTopic', () => {
  it('accepts real topics and collapses whitespace', () => {
    expect(validateTopic('  Comparing   fractions ')).toEqual({ ok: true, topic: 'Comparing fractions' });
    expect(validateTopic('Years 1857-1947 revolt')).toEqual({ ok: true, topic: 'Years 1857-1947 revolt' });
  });
  it('rejects acknowledgements and very short input', () => {
    expect(validateTopic('ok')).toEqual({ ok: false, reason: 'ack' });
    expect(validateTopic('Yes!')).toEqual({ ok: false, reason: 'ack' });
    expect(validateTopic('hi')).toEqual({ ok: false, reason: 'ack' });
    expect(validateTopic('👍')).toEqual({ ok: false, reason: 'ack' });
    expect(validateTopic('ab')).toEqual({ ok: false, reason: 'too_short' });
  });
  it('rejects PII (emails, phone numbers) and over-long text', () => {
    expect(validateTopic('fractions for priya@school.com')).toEqual({ ok: false, reason: 'pii' });
    expect(validateTopic('call me 98765 43210')).toEqual({ ok: false, reason: 'pii' });
    expect(validateTopic('x'.repeat(201))).toEqual({ ok: false, reason: 'too_long' });
  });
  it('treats a 9-digit run as below the phone-number threshold (boundary)', () => {
    expect(validateTopic('call me 98765 4321')).toEqual({ ok: true, topic: 'call me 98765 4321' });
  });
});

describe('containsPii', () => {
  it('flags emails and 10-digit phone numbers', () => {
    expect(containsPii('fractions for priya@school.com')).toBe(true);
    expect(containsPii('call me 98765 43210')).toBe(true);
  });
  it('does not flag plain text or a 9-digit run', () => {
    expect(containsPii('Comparing fractions')).toBe(false);
    expect(containsPii('call me 98765 4321')).toBe(false);
  });
});

describe('chunkText', () => {
  it('returns one chunk when text fits', () => {
    expect(chunkText('a\n\nb', 100)).toEqual(['a\n\nb']);
  });
  it('splits on paragraph boundaries under the limit', () => {
    const p1 = 'A'.repeat(60), p2 = 'B'.repeat(60), p3 = 'C'.repeat(60);
    expect(chunkText(`${p1}\n\n${p2}\n\n${p3}`, 130)).toEqual([`${p1}\n\n${p2}`, p3]);
  });
  it('splits long paragraphs on lines, then hard-splits long lines', () => {
    const lines = Array.from({ length: 5 }, (_, i) => `line${i} ${'x'.repeat(40)}`).join('\n');
    const chunks = chunkText(lines, 100);
    expect(chunks.every((c) => c.length <= 100)).toBe(true);
    expect(chunks.join('\n')).toBe(lines);
    const huge = 'Z'.repeat(250);
    expect(chunkText(huge, 100)).toEqual(['Z'.repeat(100), 'Z'.repeat(100), 'Z'.repeat(50)]);
  });
  it('never emits a whitespace-only chunk from a hard split', () => {
    const chunks = chunkText('A' + ' '.repeat(3000) + 'B', 1500);
    expect(chunks.every((c) => c.trim().length > 0)).toBe(true);
  });
  it('never returns empty chunks', () => {
    expect(chunkText('\n\n\nhello\n\n\n', 50)).toEqual(['hello']);
  });
});
