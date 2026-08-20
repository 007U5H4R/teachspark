import type { Option } from '../parse.js';

export const MAX_PAPER_MEDIA = 10;
export const MAX_PAPER_REDOS = 3;
export const PAPER_STALE_MS = 360_000; // 6 min — paper generation is slower than worksheets

export const LANGUAGE_OPTIONS: Option[] = [
  // no 'eng' alias — parseOption's substring pass would swallow "Bengali" into English
  { id: 'english', label: 'English', aliases: ['english'] },
  { id: 'hindi', label: 'Hindi', aliases: ['hindi', 'हिंदी', 'हिन्दी'] },
];
export const PAPER_TYPE_OPTIONS: Option[] = [
  { id: 'worksheet', label: 'Worksheet', aliases: ['worksheet', 'practice'] },
  { id: 'homework', label: 'Homework assignment', aliases: ['homework', 'hw', 'assignment'] },
  { id: 'question_paper', label: 'Question paper (test/exam)', aliases: ['question', 'test', 'exam'] },
  { id: 'case_study', label: 'Case study', aliases: ['case', 'case study'] },
];
export const PAPER_TIER_OPTIONS: Option[] = [
  { id: 'all', label: 'All three tiers (A + B + C)', aliases: ['all', 'abc', 'three'] },
  { id: 'a', label: 'Only Tier A — Foundational', aliases: ['a', 'foundational', 'easy'] },
  { id: 'b', label: 'Only Tier B — Proficient', aliases: ['b', 'proficient', 'medium'] },
  { id: 'c', label: 'Only Tier C — Advanced', aliases: ['c', 'advanced', 'hard'] },
];
export const PAPER_KEY_OPTIONS: Option[] = [
  { id: 'yes', label: 'Yes — include the answer key (teacher version)', aliases: ['yes', 'y', 'haan', 'key'] },
  { id: 'no', label: 'No — student copy only', aliases: ['no', 'n', 'nahi'] },
];
export const PAPER_IMPACT_OPTIONS: Option[] = [
  { id: '30', label: 'About 30 minutes', aliases: ['30', 'half'] },
  { id: '60', label: 'About an hour', aliases: ['60', 'hour'] },
  { id: '120', label: '2+ hours', aliases: ['120', 'two', 'more'] },
];
export const PREVIEW_OPTIONS: Option[] = [
  { id: 'file', label: '📄 Get the Word file', aliases: ['file', 'word', 'send', 'get', 'ok', 'yes'] },
  { id: 'redo', label: '🔁 Try a fresh version', aliases: ['redo', 'fresh', 'retry'] }, // NOT 'again' -- parseCommand maps it to the global 'new' command, checked before this menu ever runs, so it was dead and misrouted her into the worksheet flow
  { id: 'harder', label: '📈 Make it harder', aliases: ['harder', 'tougher'] },
  { id: 'easier', label: '📉 Make it easier', aliases: ['easier', 'simpler'] },
];
