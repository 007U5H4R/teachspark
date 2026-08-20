import { renderMenu, type TopicRejection } from '../parse.js';
// options.ts (not wizard.ts) so copy ↔ wizard never form an import cycle
import { PAPER_IMPACT_OPTIONS, PAPER_KEY_OPTIONS, PAPER_TIER_OPTIONS, PAPER_TYPE_OPTIONS, PREVIEW_OPTIONS } from './options.js';

export function askLanguage(): string {
  return [
    '📝 *Question Paper Maker* — I turn photos of your lesson into a complete, tiered question paper as an editable Word file.',
    '',
    'Which language subject is this paper for?',
    '1) English\n2) Hindi\nOr just type the language name — e.g. Marathi', // deliberately NOT "3)" — a bare "3" would be rejected by the free-text digit guard
  ].join('\n');
}

export function askChapter(language: string): string {
  return `Great — a ${language} paper. Which chapter, poem or prose piece is it on? (e.g. "टोपी शुक्ला" or "The Fun They Had")`;
}

// M3: mirrors messages.ts's topicRejected(reason, skill) -- explains WHY instead of one generic
// re-ask for every rejection reason.
export function askChapterRejected(reason: TopicRejection, language: string): string {
  switch (reason) {
    case 'pii':
      return `Please don't share student names, phone numbers or emails — I only need the chapter name 🙂 Which chapter, poem or prose piece? (e.g. "टोपी शुक्ला" or "The Fun They Had")`;
    case 'too_long':
      return 'That is a bit long — give me the chapter name in under 200 characters.';
    case 'ack':
    case 'too_short':
      return `Just tell me which chapter, poem or prose piece this ${language} paper is on (e.g. "टोपी शुक्ला" or "The Fun They Had").`;
  }
}

export function askMedia(max: number): string {
  return [
    `📸 Now send me *photos of the lesson pages* (up to ${max}), one by one — or a PDF of the chapter.`,
    'Clear, well-lit, straight-on photos work best.',
    '',
    'When you are done, type *DONE*.',
    'No photos handy? Type *SKIP* and I will work from the chapter name.',
  ].join('\n');
}

export function mediaReceived(count: number, max: number): string {
  return `✅ Got page ${count} of up to ${max}. Send the next one, or type *DONE*.`;
}

export function mediaRejected(): string {
  return `I can read *photos (JPG/PNG)* and *PDFs* only — that file type I can't use. Please send a photo of the page instead 🙂`;
}

export function mediaLimit(max: number): string {
  return `That's the limit — I can work with up to ${max} pages per paper. Type *DONE* and I'll use the ones you sent.`;
}

export function mediaHint(): string {
  return `Send lesson-page photos (or a PDF), then type *DONE*. Or type *SKIP* to let me work from the chapter name alone.`;
}

export function askType(): string {
  return `What are we making?\n${renderMenu(PAPER_TYPE_OPTIONS)}`;
}

export function askTiers(): string {
  return `Which difficulty tiers should the paper have?\n${renderMenu(PAPER_TIER_OPTIONS)}\n\n(Tiers differ by thinking depth, not length — A recalls, B applies, C analyses.)`;
}

export function askKey(): string {
  return `Should I include the *answer key* (teacher version)?\n${renderMenu(PAPER_KEY_OPTIONS)}`;
}

export function askSchool(): string {
  return `One-time setup: what is your *school name*, exactly as it should appear on the paper's header? (or type *SKIP*)`;
}

export function askLogo(): string {
  return `And your *school logo*? Send it as an image (JPG/PNG) — or type *SKIP*. I'll remember both for every future paper.`;
}

export function paperGeneratingAck(): string {
  return `📖 Reading your lesson pages and designing the paper now — this one takes *2–3 minutes*. I'll send a preview before the Word file.`;
}

export function paperStillWorking(): string {
  return 'Still working on your paper — about a minute more 📖✍️'; // must contain "working" (wizard test asserts it)
}

export function previewMenu(redosLeft: number): string {
  if (redosLeft <= 0) {
    return `1) 📄 Get the Word file\n(You've used all the redos for this paper — but the file is fully editable in Word.)`;
  }
  return `Happy with it?\n${renderMenu(PREVIEW_OPTIONS)}\n(${redosLeft} redo${redosLeft === 1 ? '' : 's'} left)`;
}

export function preparingFile(): string {
  return '📄 Making your Word file — a few seconds…';
}

// paper.title is LLM-generated text with no max-length constraint in the PaperJson zod schema —
// Anthropic's structured-output schemas forbid minLength/maxLength entirely, which is exactly why
// this codebase enforces structural limits in code instead (see paperShapeIssues). Clamp here so
// the interpolated title can never push paperDeliveredIntro's return past the WhatsApp 1500-char
// body limit, regardless of what the model produces.
const MAX_TITLE_CHARS = 120;

function clampTitle(title: string): string {
  return title.length > MAX_TITLE_CHARS ? `${title.slice(0, MAX_TITLE_CHARS - 1)}…` : title;
}

export function paperDeliveredIntro(title: string): string {
  return [
    `📄 Here comes your paper: *${clampTitle(title)}* (Word file — fully editable: change any question, add your school details, print).`,
    '⚠️ AI can make mistakes — please review before using in class.',
  ].join('\n');
}

export function paperImpactQuestion(): string {
  return `⏱️ Roughly how long would making this paper have taken you by hand?\n${renderMenu(PAPER_IMPACT_OPTIONS)}`;
}

export function paperShareCta(joinLink: string): string {
  return [
    `🙏 That's time back in your week! Know a teacher drowning in paper-setting? Forward this link 👉 ${joinLink}`,
    '(They tap it, send the "join" message that appears, then type Hi.)',
    '',
    'Type *PAPER* for another paper, *NEW* for a 2-minute AI skill, or *HELP* for options.',
  ].join('\n');
}

export function paperFailed(): string {
  return `😔 Sorry — that paper didn't come together. Type *PAPER* to try again (fewer pages sometimes helps).`;
}

// I1: a REDO's regeneration failed, but she already has the paper she started with -- unlike
// paperFailed(), this must NOT tell her to type PAPER (that resets paperJson and discards it).
export function paperRedoFailed(): string {
  return `😕 Couldn't make a new version this time — here's the one you already had.`;
}

export function paperRefused(): string {
  return `I can't make a paper from that material. Please send pages from a school textbook chapter — type *PAPER* to start again.`;
}

export function mediaUnreadable(): string {
  return `😕 I couldn't read those pages (blur or lighting, usually). Send clearer photos — straight-on, good light — then type *DONE*.`;
}
