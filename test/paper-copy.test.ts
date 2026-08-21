import { describe, it, expect } from 'vitest';
import * as copy from '../src/bot/paper/copy.js';
import { MAX_PAPER_MEDIA } from '../src/bot/paper/options.js';

const JOIN = 'https://wa.me/14155238886?text=join%20clever-tiger';

// Every exported copy.ts function, called with representative arguments.
// Functions that interpolate a caller-supplied value are marked DYNAMIC below — those are only
// length-bounded at runtime by whatever the caller passes in, not by copy.ts itself:
//   - askChapter(language)      DYNAMIC — language is 'English'/'Hindi' or wizard free text (≤30 chars)
//   - askMedia(max)             DYNAMIC — always called with the MAX_PAPER_MEDIA constant (10)
//   - mediaReceived(count, max) DYNAMIC — count/max are small wizard-bounded integers
//   - mediaLimit(max)           DYNAMIC — always called with the MAX_PAPER_MEDIA constant (10)
//   - previewMenu(redosLeft)    DYNAMIC — redosLeft is 0..MAX_PAPER_REDOS (small integer)
//   - paperShareCta(joinLink)   DYNAMIC — joinLink is an operator-configured wa.me URL, not user input
//   - paperDeliveredIntro(title) DYNAMIC but now BOUNDED — title is paper.title, LLM-generated text with
//       NO max-length constraint in the PaperJson zod schema (title: z.string()). Anthropic's structured-output
//       schemas forbid minLength/maxLength entirely, which is exactly why this codebase enforces structural
//       limits in code instead (see paperShapeIssues). copy.ts itself now clamps the interpolated title to a
//       safe cap (120 chars, trailing '…' when truncated) before building the string, so the returned body can
//       never exceed 1500 chars regardless of what the model produces — see the dedicated clamp test below.
const all: Array<[string, string]> = [
  ['askLanguage', copy.askLanguage()],
  ['askChapter', copy.askChapter('Hindi')],
  ['askMedia', copy.askMedia(MAX_PAPER_MEDIA)],
  ['mediaReceived', copy.mediaReceived(3, MAX_PAPER_MEDIA)],
  ['mediaRejected', copy.mediaRejected()],
  ['mediaLimit', copy.mediaLimit(MAX_PAPER_MEDIA)],
  ['mediaHint', copy.mediaHint()],
  ['askType', copy.askType()],
  ['askTiers', copy.askTiers()],
  ['askKey', copy.askKey()],
  ['askSchool', copy.askSchool()],
  ['askLogo', copy.askLogo()],
  ['paperGeneratingAck', copy.paperGeneratingAck()],
  ['paperStillWorking', copy.paperStillWorking()],
  ['previewMenu', copy.previewMenu(3)],
  ['previewMenu-exhausted', copy.previewMenu(0)],
  ['preparingFile', copy.preparingFile()],
  ['paperDeliveredIntro', copy.paperDeliveredIntro('अभ्यास-पत्र: टोपी शुक्ला')],
  ['paperImpactQuestion', copy.paperImpactQuestion()],
  ['paperShareCta', copy.paperShareCta(JOIN)],
  ['paperFailed', copy.paperFailed()],
  ['paperRefused', copy.paperRefused()],
  ['mediaUnreadable', copy.mediaUnreadable()],
];

describe('paper bot copy', () => {
  it.each(all)('%s is non-empty and ≤ 1500 chars', (_name, text) => {
    expect(text.trim().length).toBeGreaterThan(10);
    expect(text.length).toBeLessThanOrEqual(1500);
  });

  it('paperDeliveredIntro clamps a pathologically long title so the body never exceeds 1500 chars', () => {
    const result = copy.paperDeliveredIntro('X'.repeat(5000));
    expect(result.length).toBeLessThanOrEqual(1500);
    // meaningful surrounding copy survives — this isn't just a truncated stub
    expect(result).toContain('Word file');
    expect(result).toContain('AI can make mistakes');
    expect(result).toContain('…'); // truncation marker present
  });
});

describe('timeLabel', () => {
  it('appends "min" only when the label ends in a digit', () => {
    expect(copy.timeLabel('35–40')).toBe('35–40 min');
    expect(copy.timeLabel('50')).toBe('50 min');
  });
  it('leaves a unit the model already supplied alone, in any script', () => {
    // The real defect: "35-40 मिनट" + " min" printed "35-40 मिनट min" on the tier banner.
    expect(copy.timeLabel('35-40 मिनट')).toBe('35-40 मिनट');
    expect(copy.timeLabel('35-40 minutes')).toBe('35-40 minutes');
    expect(copy.timeLabel('40 মিনিট')).toBe('40 মিনিট');
  });
  it('trims, and returns empty for a blank label rather than a bare unit', () => {
    expect(copy.timeLabel('  35–40  ')).toBe('35–40 min');
    expect(copy.timeLabel('')).toBe('');
    expect(copy.timeLabel('   ')).toBe('');
  });
});
