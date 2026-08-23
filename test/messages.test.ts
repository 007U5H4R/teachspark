import { describe, it, expect } from 'vitest';
import * as m from '../src/bot/messages.js';
import { SKILLS } from '../src/bot/skills.js';

const profile = { grade: 'Middle (Classes 6-8)', subject: 'Maths', board: 'CBSE' };
const all: Array<[string, string]> = [
  ['welcome', m.welcome()],
  ['chooseWhatToMake', m.chooseWhatToMake()],
  ['askGrade', m.askGrade()],
  ['clearConfirm', m.clearConfirm()],
  ['cleared', m.cleared()],
  ['clearCancelled', m.clearCancelled()],
  ['restarted', m.restarted()],
  ['askSubject', m.askSubject()],
  ['askBoard', m.askBoard()],
  ['pleaseReplyWithNumber', m.pleaseReplyWithNumber('1) a\n2) b')],
  ['acceptedFreeText', m.acceptedFreeText('Class 6', 'Which subject?')],
  ['generatingAck', m.generatingAck('worksheet')],
  ['stillWorking', m.stillWorking()],
  ['disclaimer', m.disclaimer()],
  ['pdfFailedNote', m.pdfFailedNote()],
  ['reusablePromptAndImpact', m.reusablePromptAndImpact('Create a worksheet on "Fractions"')],
  ['referralQuestion', m.referralQuestion('About 30 minutes')],
  ['referralQuestionNull', m.referralQuestion(null)],
  ['shareCta', m.shareCta('https://wa.me/14155238886?text=join%20x', 'exit ticket')],
  ['shareCtaLast', m.shareCta('https://wa.me/14155238886?text=join%20x', null)],
  ['help', m.help()],
  ['topicRejected-ack', m.topicRejected('ack', SKILLS.worksheet)],
  ['topicRejected-pii', m.topicRejected('pii', SKILLS.worksheet)],
  ['topicRejected-too_long', m.topicRejected('too_long', SKILLS.quiz)],
  ['generationFailed', m.generationFailed()],
  ['generationRefused', m.generationRefused()],
  ['somethingWentWrong', m.somethingWentWrong()],
  ['nudge', m.nudge(SKILLS.quiz, profile)],
];

describe('bot copy', () => {
  it.each(all)('%s is non-empty and ≤ 1500 chars', (_name, text) => {
    expect(text.trim().length).toBeGreaterThan(10);
    expect(text.length).toBeLessThanOrEqual(1500);
  });
  it('welcome shows the make-choice menu and asks for a number', () => {
    expect(m.welcome()).toContain('1) Worksheet — 3 levels + answer key');
    expect(m.welcome()).toContain('3) Question paper — from your lesson photos');
    expect(m.welcome().toLowerCase()).toContain('number');
    // it no longer embeds the grade menu — that comes after a make-option is picked
    expect(m.welcome()).not.toContain('Primary (Classes 1-5)');
  });
  it('askGrade asks the grade question with the grade menu', () => {
    expect(m.askGrade()).toContain('1) Primary (Classes 1-5)');
    expect(m.askGrade()).toContain('3) High (Classes 9-12)');
    expect(m.askGrade().toLowerCase()).toContain('grade');
  });
  it('chooseWhatToMake lists the three make-options', () => {
    expect(m.chooseWhatToMake()).toContain('1) Worksheet — 3 levels + answer key');
    expect(m.chooseWhatToMake()).toContain('2) Quiz — 5-question exit ticket');
  });
  it('clear confirmation is truthful: clears the session, deletes nothing, keeps sent files', () => {
    const t = m.clearConfirm();
    expect(t.toLowerCase()).toContain('start');
    expect(t).toMatch(/does \*not\* delete|not delete/i);
    expect(t.toLowerCase()).toContain('whatsapp');
    expect(t).not.toMatch(/delete (the )?file/i);
    expect(m.cleared()).toContain('1) Worksheet — 3 levels + answer key'); // leads into the choice menu
  });
  it('reusable prompt message contains the prompt and the impact menu', () => {
    const t = m.reusablePromptAndImpact('PROMPT-X');
    expect(t).toContain('PROMPT-X');
    expect(t).toContain('1) About 15 minutes');
    expect(t).toContain('3) 45 minutes or more');
  });
  it('share CTA contains the join link and next-skill hint', () => {
    const t = m.shareCta('https://wa.me/1?text=join%20x', 'exit ticket');
    expect(t).toContain('https://wa.me/1?text=join%20x');
    expect(t).toContain('exit ticket');
    expect(t).toMatch(/PAPER/);
    expect(m.shareCta('https://wa.me/1?text=join%20x', null)).not.toContain('skill #2');
  });
  it('help states what is stored and that student data is never needed', () => {
    expect(m.help()).toMatch(/WhatsApp number/);
    expect(m.help()).toMatch(/student/i);
    expect(m.help()).toMatch(/NEW/);
    expect(m.help()).toMatch(/RESTART/);
    expect(m.help()).toMatch(/PAPER/);
    expect(m.help()).toMatch(/CLEAR/);
    expect(m.help().toLowerCase()).toMatch(/worksheet/);
    expect(m.help().toLowerCase()).toMatch(/quiz/);
  });
  it('nudge includes the skill micro-lesson and asks for a topic', () => {
    const t = m.nudge(SKILLS.quiz, profile);
    expect(t).toContain('exit ticket');
    expect(t.toLowerCase()).toContain('topic');
  });
  it('disclaimer is exactly the PRD text', () => {
    expect(m.disclaimer()).toBe('⚠️ AI can make mistakes — please review before using in class.');
  });
});
