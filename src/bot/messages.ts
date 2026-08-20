import type { TeacherProfile } from '../domain/types.js';
import { renderMenu, GRADE_OPTIONS, SUBJECT_OPTIONS, BOARD_OPTIONS, IMPACT_OPTIONS, REFERRAL_OPTIONS, type TopicRejection } from './parse.js';
import type { Skill } from './skills.js';

export const BOT_NAME = 'TeachSpark';

export function welcome(): string {
  return [
    `👋 Hi! I'm *${BOT_NAME}*. In about 2 minutes I'll teach you one AI skill and we'll make a ready-to-use worksheet for YOUR class — free.`,
    '',
    'First, which grade do you mainly teach?',
    renderMenu(GRADE_OPTIONS),
    '',
    'Reply with the number 🙂',
  ].join('\n');
}

export function restarted(): string {
  return `Okay — starting fresh.\n\n${welcome()}`;
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
    'Commands:',
    '• *NEW* — make another worksheet or quiz',
    '• *PAPER* — turn photos of a lesson into a full question paper (Word file)',
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
