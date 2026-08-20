import type { SkillId, TeacherProfile } from '../domain/types.js';

export interface Skill {
  id: SkillId;
  title: string;
  outputNoun: string;
  topicExample: string;
  sectionHeaders: string[];
  microLesson(profile: TeacherProfile): string;
  userPrompt(profile: TeacherProfile, topic: string): string;
  reusablePrompt(profile: TeacherProfile, topic: string): string;
}

export const SKILL_ORDER: SkillId[] = ['worksheet', 'quiz'];

export const GENERATION_SYSTEM_PROMPT = [
  'You are an experienced school teacher\'s assistant in India. You write short, classroom-ready practice material for school students.',
  'Your output is sent as a WhatsApp message and also printed as a PDF, so write plain text only: no Markdown, no # headings, no ** or __ emphasis, no tables, no code fences, no LaTeX, no emoji. Apply this to every section, not just the first one.',
  'Write all maths in plain characters: use / for division, x for multiplication, ^ for powers, and fractions like 3/4.',
  'Use simple, age-appropriate language for the stated grade and stay within the syllabus of the stated board (CBSE, ICSE or a State board). Questions must be answerable from standard textbooks for that grade; do not invent facts.',
  'Follow the exact section headers given in the request, each on its own line, in that order. Number questions 1. 2. 3. on their own lines. Keep the whole thing under about 650 words.',
  'Never ask for or include any student\'s personal details.',
].join('\n');

function fmt(profile: TeacherProfile): string {
  return `Grade: ${profile.grade}. Subject: ${profile.subject}. Board: ${profile.board}.`;
}

const worksheet: Skill = {
  id: 'worksheet',
  title: '3-level worksheet',
  outputNoun: 'worksheet',
  topicExample: '"Comparing fractions with unlike denominators" or "The water cycle"',
  sectionHeaders: ['LEVEL 1 - SUPPORT', 'LEVEL 2 - ON LEVEL', 'LEVEL 3 - CHALLENGE', 'ANSWER KEY'],
  microLesson: (p) =>
    [
      `💡 *Today's skill (30 seconds): the 3-level worksheet*`,
      '',
      'AI writes great worksheets when you ask for *three levels* of the same topic — Support, On-level and Challenge — so one sheet fits your whole mixed-ability class.',
      '',
      `You give it four things: topic · grade · board · number of questions. It does the rest. I already know you teach ${p.subject} (${p.grade}, ${p.board}).`,
      '',
      `Let's try it on YOUR class. What topic are you teaching this week? (e.g. ${worksheet.topicExample})`,
    ].join('\n'),
  userPrompt: (p, topic) =>
    [
      'Create a differentiated practice worksheet.',
      `${fmt(p)} Topic: ${topic}.`,
      'Use exactly these section headers, each on its own line, in this order:',
      'TITLE: <a short worksheet title>',
      'LEVEL 1 - SUPPORT',
      'LEVEL 2 - ON LEVEL',
      'LEVEL 3 - CHALLENGE',
      'ANSWER KEY',
      'Under each LEVEL header write 5 numbered questions (1. to 5.), one per line, getting harder level by level: Level 1 builds confidence with direct recall and one-step problems, Level 2 is the standard textbook level, Level 3 needs reasoning or a two-step application.',
      'Under ANSWER KEY write "Level 1:", "Level 2:" and "Level 3:" each on its own line followed by the five answers as 1) 2) 3) 4) 5).',
    ].join('\n'),
  reusablePrompt: (p, topic) =>
    `Create a differentiated ${p.grade} ${p.board} ${p.subject} worksheet on "${topic}" with 3 levels (support, on-level, challenge), 5 questions each, and an answer key. Plain text, no tables.`,
};

const quiz: Skill = {
  id: 'quiz',
  title: 'exit ticket',
  outputNoun: 'exit ticket',
  topicExample: '"Photosynthesis: inputs and outputs" or "Linear equations in one variable"',
  sectionHeaders: ['EXIT TICKET', 'ANSWER KEY'],
  microLesson: (p) =>
    [
      `💡 *Today's skill (30 seconds): the exit ticket*`,
      '',
      `An exit ticket is a 5-question quiz students finish in the last 5 minutes of class, so you know who actually got today's lesson before they leave.`,
      '',
      `AI writes one in seconds if you tell it the *objective* of the lesson, not just the chapter name. I'll use your ${p.subject} (${p.grade}, ${p.board}) context.`,
      '',
      `What did you teach today (or will teach next)? Send me the topic or lesson objective (e.g. ${quiz.topicExample})`,
    ].join('\n'),
  userPrompt: (p, topic) =>
    [
      'Create an exit-ticket quiz to check understanding at the end of one lesson.',
      `${fmt(p)} Lesson objective or topic: ${topic}.`,
      'Use exactly these section headers, each on its own line, in this order:',
      'TITLE: <a short quiz title>',
      'EXIT TICKET',
      'ANSWER KEY',
      'Under EXIT TICKET write 5 numbered questions (1. to 5.), one per line, that a student can finish in 5 minutes: 3 quick recall questions, then 2 short application questions. Under ANSWER KEY write the five answers as 1) 2) 3) 4) 5), one per line.',
    ].join('\n'),
  reusablePrompt: (p, topic) =>
    `Write a 5-question exit-ticket quiz for ${p.grade} ${p.board} ${p.subject} on "${topic}" that students can finish in 5 minutes (3 recall, 2 application), with an answer key. Plain text.`,
};

export const SKILLS: Record<SkillId, Skill> = { worksheet, quiz };

export function nextSkillFor(completed: SkillId[]): SkillId {
  return SKILL_ORDER.find((s) => !completed.includes(s)) ?? SKILL_ORDER[0];
}

export function hasNextSkill(completed: SkillId[]): boolean {
  return SKILL_ORDER.some((s) => !completed.includes(s));
}
