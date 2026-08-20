import type { PdfSection } from '../ports.js';

export function cleanModelText(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/```[a-zA-Z]*\n?/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^[ \t]*[-*•][ \t]+/gm, '- ')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface ParsedOutput {
  title: string | null;
  sections: PdfSection[];
}

function normHeader(s: string): string {
  return s
    .trim()
    .replace(/[–—]/g, '-')
    .replace(/[:.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export function splitIntoSections(text: string, headers: string[]): ParsedOutput {
  const wanted = new Map(headers.map((h) => [normHeader(h), h]));
  let title: string | null = null;
  const sections: PdfSection[] = [];
  let current: PdfSection | null = null;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    const t = trimmed.match(/^TITLE:\s*(.+)$/i);
    if (t && title === null) {
      title = t[1].trim();
      continue;
    }
    const h = wanted.get(normHeader(trimmed));
    if (h) {
      current = { heading: h, body: '' };
      sections.push(current);
      continue;
    }
    if (current) current.body = current.body.length ? `${current.body}\n${line}` : line;
  }
  if (sections.length === 0) return { title, sections: [{ heading: 'Worksheet', body: text.trim() }] };
  for (const s of sections) s.body = s.body.trim();
  return { title, sections };
}
