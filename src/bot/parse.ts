export type Command = 'help' | 'restart' | 'new';

export const FREE_TEXT_MAX = 40;

function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[*_~`]/g, '')
    .replace(/[.!?)\s]+$/g, '')
    .trim();
}

export function parseCommand(body: string): Command | null {
  if (body.trim() === '?') return 'help';
  const t = normalize(body);
  if (['help', 'info'].includes(t)) return 'help';
  if (['restart', 'reset', 'start over'].includes(t)) return 'restart';
  if (['new', 'menu', 'start', 'again', 'another', 'next'].includes(t)) return 'new';
  return null;
}

export interface Option {
  id: string;
  label: string;
  aliases: string[];
}

export const GRADE_OPTIONS: Option[] = [
  { id: 'primary', label: 'Primary (Classes 1-5)', aliases: ['primary', 'lower', 'kg', 'nursery', '1-5', 'class 1', 'class 2', 'class 3', 'class 4', 'class 5', 'grade 1', 'grade 2', 'grade 3', 'grade 4', 'grade 5', '1st', '2nd', '3rd', '4th', '5th'] },
  { id: 'middle', label: 'Middle (Classes 6-8)', aliases: ['middle', '6-8', 'class 6', 'class 7', 'class 8', 'grade 6', 'grade 7', 'grade 8', '6th', '7th', '8th'] },
  { id: 'high', label: 'High (Classes 9-12)', aliases: ['high', 'senior', 'secondary', '9-12', 'class 9', 'class 10', 'class 11', 'class 12', 'grade 9', 'grade 10', 'grade 11', 'grade 12', '9th', '10th', '11th', '12th'] },
];

export const SUBJECT_OPTIONS: Option[] = [
  { id: 'math', label: 'Maths', aliases: ['math', 'maths', 'mathematics'] },
  { id: 'science', label: 'Science', aliases: ['science', 'physics', 'chemistry', 'biology', 'evs'] },
  { id: 'english', label: 'English', aliases: ['english', 'language', 'grammar'] },
  { id: 'social', label: 'Social Studies', aliases: ['social', 'sst', 'history', 'geography', 'civics', 'economics', 'political'] },
  { id: 'other', label: 'Other', aliases: ['other', 'hindi', 'computer', 'commerce', 'accounts', 'sanskrit', 'art'] },
];

export const BOARD_OPTIONS: Option[] = [
  { id: 'cbse', label: 'CBSE', aliases: ['cbse', 'ncert'] },
  { id: 'icse', label: 'ICSE / ISC', aliases: ['icse', 'isc', 'cisce'] },
  { id: 'state', label: 'State board', aliases: ['state', 'ssc', 'hsc', 'seba', 'maharashtra', 'karnataka', 'tamil', 'kerala', 'bihar', 'gujarat', 'rajasthan', 'bengal', 'telangana', 'andhra', 'up board', 'mp board'] },
  { id: 'other', label: 'Other (IB / IGCSE / …)', aliases: ['other', 'ib', 'igcse', 'cambridge', 'international'] },
];

export const IMPACT_OPTIONS: Option[] = [
  { id: '15', label: 'About 15 minutes', aliases: ['15', 'fifteen', 'quarter'] },
  { id: '30', label: 'About 30 minutes', aliases: ['30', 'thirty', 'half'] },
  { id: '45', label: '45 minutes or more', aliases: ['45', '60', 'hour', 'more'] },
];

export const REFERRAL_OPTIONS: Option[] = [
  { id: 'yes', label: 'Yes — a colleague forwarded it', aliases: ['yes', 'y', 'haan', 'colleague', 'forwarded'] },
  { id: 'no', label: 'No — I found it myself', aliases: ['no', 'n', 'myself', 'nahi'] },
];

export function renderMenu(options: Option[]): string {
  return options.map((o, i) => `${i + 1}) ${o.label}`).join('\n');
}

export function parseOption(body: string, options: Option[]): Option | null {
  const t = normalize(body);
  if (!t) return null;
  if (/^\d{1,2}$/.test(t)) {
    const i = Number(t);
    return i >= 1 && i <= options.length ? options[i - 1] : null;
  }
  for (const o of options) {
    if (t === o.id || t === o.label.toLowerCase() || o.aliases.includes(t)) return o;
  }
  // leading token match, e.g. "30 min" -> alias "30", "10th class" -> alias "10th"
  const first = t.split(/\s+/)[0] ?? '';
  for (const o of options) {
    if (first.length > 0 && o.aliases.includes(first)) return o;
  }
  for (const o of options) {
    for (const a of o.aliases) {
      if (a.length >= 3 && t.includes(a)) return o;
    }
  }
  return null;
}

export type TopicRejection = 'too_short' | 'ack' | 'too_long' | 'pii';
export type TopicValidation = { ok: true; topic: string } | { ok: false; reason: TopicRejection };

const ACKS = new Set([
  'ok', 'okay', 'k', 'kk', 'yes', 'y', 'no', 'hi', 'hii', 'hiii', 'hello', 'hey', 'thanks', 'thank you', 'thx',
  'sure', 'fine', 'good', 'great', 'nice', 'done', 'hmm', 'yo', 'ya', 'yup', 'yeah', 'haan', 'ji', 'ok ok', 'start',
]);

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE_RE = /\+?\d[\d\s().-]{8,}\d/g;

export function validateTopic(body: string): TopicValidation {
  const raw = body.trim();
  const norm = normalize(raw);
  const lettersOnly = norm.replace(/[^\p{L}\p{N}]/gu, '');
  if (ACKS.has(norm) || (lettersOnly.length === 0 && raw.length > 0)) return { ok: false, reason: 'ack' };
  if (raw.length < 3) return { ok: false, reason: 'too_short' };
  if (raw.length > 200) return { ok: false, reason: 'too_long' };
  if (EMAIL_RE.test(raw)) return { ok: false, reason: 'pii' };
  const phones = raw.match(PHONE_RE) ?? [];
  if (phones.some((p) => p.replace(/\D/g, '').length >= 10)) return { ok: false, reason: 'pii' };
  return { ok: true, topic: raw.replace(/\s+/g, ' ') };
}

export function chunkText(text: string, max = 1500): string[] {
  const out: string[] = [];
  let cur = '';
  const flush = () => {
    if (cur.trim().length > 0) out.push(cur.trim());
    cur = '';
  };
  const append = (piece: string, sep: string) => {
    if (cur.length === 0) cur = piece;
    else if (cur.length + sep.length + piece.length > max) {
      flush();
      cur = piece;
    } else cur = `${cur}${sep}${piece}`;
  };
  for (const para of text.split(/\n{2,}/)) {
    if (para.trim().length === 0) continue;
    if (para.length <= max) {
      append(para, '\n\n');
      continue;
    }
    flush();
    for (const line of para.split('\n')) {
      if (line.length <= max) {
        append(line, '\n');
        continue;
      }
      flush();
      for (let i = 0; i < line.length; i += max) out.push(line.slice(i, i + max));
    }
    flush();
  }
  flush();
  return out;
}
