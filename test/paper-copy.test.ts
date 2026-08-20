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
//   - paperDeliveredIntro(title) DYNAMIC AND UNBOUNDED — title is paper.title, LLM-generated text with
//       NO max-length constraint in the PaperJson zod schema (title: z.string()). This sweep only proves
//       the representative sample title below stays under the WhatsApp 1500-char limit; it cannot prove
//       every possible generated title will. If titles ever grow long in production, this is the function
//       that would need a defensive truncation — worth a follow-up if real generations show long titles.
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
});
