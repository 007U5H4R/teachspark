import type { TeacherProfile } from '../domain/types.js';
import { renderMenu, GRADE_OPTIONS, SUBJECT_OPTIONS, BOARD_OPTIONS, IMPACT_OPTIONS, REFERRAL_OPTIONS, CHOICE_OPTIONS, CONFIRM_OPTIONS, type TopicRejection } from './parse.js';
import type { Skill } from './skills.js';

export const BOT_NAME = 'TeachSpark';

export function welcome(): string {
  return [
    `👋 Hi! I'm *${BOT_NAME}*. In about 2 minutes I'll teach you one AI skill and we'll make ready-to-use classroom material for YOUR class — free.`,
    '',
    "Here's what I can make for you:",
    renderMenu(CHOICE_OPTIONS),
    '',
    'Other commands anytime: *HELP* · *CLEAR* · *RESTART*',
    'Reply with a number 🙂',
  ].join('\n');
}

/** Shorter choice prompt for returning teachers / the AWAITING_CHOICE reprompt. */
export function chooseWhatToMake(): string {
  return [
    'What would you like to make?',
    renderMenu(CHOICE_OPTIONS),
    '',
    'Reply with a number 🙂',
  ].join('\n');
}

/** The grade question that welcome() used to ask, now shown once a make-option needs onboarding. */
export function askGrade(): string {
  return `First, which grade do you mainly teach?\n${renderMenu(GRADE_OPTIONS)}\n\nReply with the number 🙂`;
}

export function restarted(): string {
  return `Okay — starting fresh.\n\n${welcome()}`;
}

export function clearConfirm(): string {
  return [
    '🧹 Clear your current session?',
    '',
    "This clears your progress here with me and starts you fresh — it does *not* delete anything. Any worksheets, quizzes or papers I've already sent you stay in your WhatsApp chat.",
    '',
    'Are you sure?',
    renderMenu(CONFIRM_OPTIONS),
  ].join('\n');
}

export function cleared(): string {
  return `✅ Cleared — starting you fresh. Your grade, subject and board are still saved.\n\n${chooseWhatToMake()}`;
}

export function clearCancelled(): string {
  return 'No problem — nothing was cleared. Carry on 🙂';
}

export function askSubject(): string {
  return `Great 👍 Which subject do you mainly teach?\n${renderMenu(SUBJECT_OPTIONS)}`;
}

export function askBoard(): string {
  return `And which board?\n${renderMenu(BOARD_OPTIONS)}`;
}

export function pleaseReplyWithNumber(menu: string): string {
  return `Please reply with just the number 🙂\n${menu}`;
}

export function acceptedFreeText(label: string, nextPrompt: string): string {
  return `Got it — "${label}".\n\n${nextPrompt}`;
}

export function generatingAck(outputNoun: string): string {
  return `✍️ Making your ${outputNoun} now — about 30 seconds…`;
}

export function stillWorking(): string {
  return 'Still working on it — about 20 more seconds ✍️';
}

export function disclaimer(): string {
  return '⚠️ AI can make mistakes — please review before using in class.';
}

export function pdfFailedNote(): string {
  return '(The PDF could not be made this time — the text above is complete.)';
}

export function reusablePromptAndImpact(prompt: string): string {
  return [
    '🎁 *Keep the skill, not just the sheet.* Here is the exact prompt you just used — paste it into ChatGPT, Gemini or any AI tool next time:',
    '',
    `"${prompt}"`,
    '',
    '⏱️ Roughly how long would this have taken you by hand?',
    renderMenu(IMPACT_OPTIONS),
  ].join('\n');
}

export function referralQuestion(minutesLabel: string | null): string {
  const head = minutesLabel ? `🎉 You just saved ${minutesLabel.toLowerCase()}!` : '🎉 Done!';
  return `${head} One last thing — did a colleague forward ${BOT_NAME} to you?\n${renderMenu(REFERRAL_OPTIONS)}`;
}

export function shareCta(joinLink: string, nextSkillTitle: string | null): string {
  const next = nextSkillTitle
    ? `Tomorrow I'll message you skill #2: the *${nextSkillTitle}*.`
    : 'That was the last skill for now — thank you for testing!';
  return [
    `🙏 Thank you! Know a teacher who'd want this? Forward this link 👉 ${joinLink}`,
    '(They tap it, send the "join" message that appears, then type Hi.)',
    '',
    next,
    'Reply *NEW* anytime for another one, or *HELP* for options.',
    'Or type *PAPER* to turn your textbook photos into a complete question paper 📄',
  ].join('\n');
}

export function help(): string {
  return [
    `ℹ️ *${BOT_NAME}* teaches you one AI skill at a time and makes classroom material for YOUR class.`,
    '',
    'I can make three things for you:',
    '• A *worksheet* — 3 levels + an answer key',
    '• A *quiz* — a 5-question exit ticket',
    '• A *question paper* — built from photos of your lesson (Word file)',
    '',
    'Commands:',
    '• *NEW* (or *MENU*) — choose what to make',
    '• *PAPER* — jump straight to a question paper',
    '• *CLEAR* — clear this session and start fresh (keeps your grade / subject / board)',
    '• *RESTART* — change your grade / subject / board',
    '• *HELP* — this message',
    '',
    'What I store: your WhatsApp number, your grade, subject and board, and the topics you ask for. Never student details — please don\'t send any.',
    'AI can make mistakes — always review before using in class.',
  ].join('\n');
}

export function topicRejected(reason: TopicRejection, skill: Skill): string {
  switch (reason) {
    case 'pii':
      return `Please don't share student names, phone numbers or emails — I only need the topic 🙂 What topic? (e.g. ${skill.topicExample})`;
    case 'too_long':
      return 'That is a bit long — give me the topic in under 200 characters.';
    case 'ack':
    case 'too_short':
      return `Just tell me the topic in a few words, e.g. ${skill.topicExample}`;
  }
}

export function generationFailed(): string {
  return `😔 Sorry, that one didn't work. Let's try again — send me the topic once more (or try a simpler one).`;
}

export function generationRefused(): string {
  return `I can't make material on that topic. Try a classroom topic like "Fractions" or "The water cycle" — what topic?`;
}

export function somethingWentWrong(): string {
  return '😔 Something went wrong on my side. Please send that again in a moment.';
}

export function nudge(skill: Skill, profile: TeacherProfile): string {
  return [
    `👋 Good morning! Yesterday you made a ready-to-use ${BOT_NAME} sheet with AI. Today's 2-minute skill: the *${skill.title}*.`,
    '',
    skill.microLesson(profile),
  ].join('\n');
}
