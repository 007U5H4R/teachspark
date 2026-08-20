import { describe, it, expect } from 'vitest';
import { PdfkitBuilder, toPdfSafe } from '../src/adapters/pdf.js';

describe('toPdfSafe', () => {
  it('strips emoji and replaces the rupee sign (Helvetica cannot render them)', () => {
    expect(toPdfSafe('Pay ₹100 ✅ today 🎉')).toBe('Pay Rs. 100  today');
    expect(toPdfSafe('a → b')).toBe('a -> b');
  });
});

describe('PdfkitBuilder', () => {
  it('renders a multi-section A4 PDF to a Buffer', async () => {
    const pdf = await new PdfkitBuilder().build({
      title: 'Fractions Practice',
      subtitle: 'Middle (Classes 6-8) · Maths · CBSE · Comparing fractions',
      sections: [
        { heading: 'LEVEL 1 - SUPPORT', body: Array.from({ length: 5 }, (_, i) => `${i + 1}. Question ${i + 1} about 3/4 and 1/2`).join('\n') },
        { heading: 'ANSWER KEY', body: 'Level 1: 1) a 2) b 3) c 4) d 5) e' },
      ],
      footer: 'AI can make mistakes — please review before using in class. Made with TeachSpark.',
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1500);
  });
  it('handles long bodies by paginating (no throw)', async () => {
    const body = Array.from({ length: 200 }, (_, i) => `${i + 1}. ${'lorem ipsum '.repeat(10)}`).join('\n');
    const pdf = await new PdfkitBuilder().build({ title: 'T', subtitle: 's', sections: [{ heading: 'H', body }], footer: 'f' });
    expect(pdf.length).toBeGreaterThan(5000);
  });
});
