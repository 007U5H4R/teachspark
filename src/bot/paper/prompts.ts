import { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';
import type { PaperJson, PaperQcReport, PaperTierId } from '../../domain/types.js';
import type { PaperGenInput } from '../../ports.js';

export const TIER_TIME: Record<PaperTierId, string> = { A: '35–40', B: '40–45', C: '50–60' };
export const TIER_LABEL: Record<PaperTierId, string> = { A: 'Foundational', B: 'Proficient', C: 'Advanced' };

export const PAPER_SYSTEM_PROMPT = [
  'You are an experienced school examination designer for Indian K-12 language classes (English, Hindi and regional languages). You design complete, curriculum-aligned assessments that read as if a skilled teacher wrote them.',
  'This paper is rendered directly into a formatted .docx template — the JSON schema only constrains field shape, never field content — so every string field must be plain text only: no Markdown, no # headings, no ** or __ emphasis, no bullet or numbered list syntax, no LaTeX, no emoji. Apply this to every field in every tier and task alike — title, headings, instructions, passages, question text, options, answers and answerNotes — not just the first one.',
  '',
  'STRUCTURE — every tier you produce contains exactly these 4 tasks, in order:',
  'Task 1 — Reading Comprehension & Vocabulary: a short passage or extract FROM THE SUPPLIED LESSON (put it in the "passage" field) with comprehension questions, word meanings, synonyms/antonyms, or contextual vocabulary. Choose the format that fits this lesson; do not mechanically repeat the same activity.',
  "Task 2 — Language in Use: error identification, sentence correction, rewriting, transformation, grammar application, usage-based MCQ. Test APPLICATION of language, not memorization.",
  "Task 3 — Textual Analysis: character, motivation, theme, main idea, setting, cause and effect, author's intent, figures of speech, inference with evidence from the text. Stay grounded in the supplied lesson.",
  'Task 4 — Creative / Personal Response: letter, diary entry, story continuation, poem, opinion, alternative ending, character perspective. Response length: tier A (Foundational) 3–6 sentences, tier B (Proficient) 5–8 sentences, tier C (Advanced) 8–10 lines.',
  '',
  'DIFFICULTY — tiers differ by cognitive complexity, never merely by length:',
  'Tier A — Foundational: recall, recognition, basic comprehension, direct textual evidence, straightforward grammar, simple application.',
  'Tier B — Proficient: application, comparison, interpretation, inference, reasoning, contextual language use, connecting multiple ideas.',
  'Tier C — Advanced: analysis, evaluation, synthesis, critical thinking, multi-step reasoning, independent expression, creative application.',
  '',
  'GROUNDING RULES:',
  '- Ground every question primarily in the supplied lesson pages or reference document. Never invent facts absent from the source; do not contradict it. Only creative (CW) and explicitly inferential questions may go beyond it.',
  '- If a supplied page is unreadable or blurry, add a note to sourceNotes and avoid that portion — never hallucinate the missing content.',
  '- If no lesson pages are supplied, generate from your knowledge of the named chapter for the stated grade and board, and say so in sourceNotes.',
  '- Balance coverage across the whole lesson; do not over-test one small portion.',
  '',
  'QUESTION RULES:',
  '- Exactly 4 tasks per tier; each tier\'s totalMarks equals the sum of its question marks and is completable in its time window.',
  '- Keep MCQ options plausible, mutually distinct and free of accidental clues; exactly 4 options per MCQ, no letter prefixes (the renderer adds them).',
  '- Do not reveal answers inside question wording. Avoid two questions testing the identical skill.',
  '- Write the entire paper — headings, instructions, questions, answers — in the requested language of instruction, with correct grammar and spelling and age-appropriate wording. headingEnglish carries the English gloss of each task heading (the template prints both).',
  '- Provide an answer for EVERY question: the correct option text for MCQ/TOF/FIB/MTF, expected points for SA/LA/CB, and a short rubric in answerNotes for CW.',
  "- Never ask for or include any student's personal details.",
].join('\n');

// NOTE: structured outputs reject minLength/maxLength, minimum/maximum and minItems>1 —
// keep these schemas free of size constraints; paperShapeIssues() enforces structure instead.
const PaperQuestionZ = z.object({
  number: z.number().int(),
  type: z.enum(['MCQ', 'FIB', 'SA', 'LA', 'CW', 'CB', 'MTF', 'TOF']),
  text: z.string(),
  marks: z.number().int(),
  options: z.array(z.string()).nullable(),
  matchPairs: z.array(z.object({ left: z.string(), right: z.string() })).nullable(),
  answer: z.string(),
  answerNotes: z.string().nullable(),
});

const PaperTaskZ = z.object({
  taskNumber: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  heading: z.string(),
  headingEnglish: z.string(),
  instructions: z.string(),
  passage: z.string().nullable(),
  questions: z.array(PaperQuestionZ),
});

const PaperTierZ = z.object({
  tier: z.enum(['A', 'B', 'C']),
  tierLabel: z.string(),
  timeMinutes: z.string(),
  totalMarks: z.number().int(),
  tasks: z.array(PaperTaskZ),
});

export const PaperJsonZ: z.ZodType<PaperJson> = z.object({
  title: z.string(),
  language: z.string(),
  gradeLabel: z.string(),
  subjectLabel: z.string(),
  boardLabel: z.string(),
  chapterLabel: z.string(),
  assessmentLabel: z.string(),
  generalInstructions: z.array(z.string()),
  tiers: z.array(PaperTierZ),
  sourceNotes: z.array(z.string()),
});

export const PaperQcZ: z.ZodType<PaperQcReport> = z.object({
  pass: z.boolean(),
  issues: z.array(z.string()),
  fixedPaper: PaperJsonZ.nullable(),
});

/** Structural rules the API schema cannot express (fed into the QC/repair pass). */
export function paperShapeIssues(paper: PaperJson): string[] {
  const issues: string[] = [];
  if (paper.tiers.length === 0) issues.push('paper has no tiers');
  for (const tier of paper.tiers) {
    if (tier.tasks.length !== 4) issues.push(`tier ${tier.tier} has ${tier.tasks.length} tasks — must have exactly 4 tasks`);
    let sum = 0;
    for (const task of tier.tasks) {
      if (task.questions.length === 0) issues.push(`tier ${tier.tier} task ${task.taskNumber} has no questions`);
      for (const q of task.questions) {
        sum += q.marks;
        if (q.marks <= 0) issues.push(`tier ${tier.tier} task ${task.taskNumber} Q${q.number} has non-positive marks`);
        if (q.type === 'MCQ' && (q.options?.length ?? 0) !== 4) issues.push(`tier ${tier.tier} task ${task.taskNumber} Q${q.number} is MCQ but does not have exactly 4 options`);
        if (q.type === 'MTF' && (q.matchPairs?.length ?? 0) < 2) issues.push(`tier ${tier.tier} task ${task.taskNumber} Q${q.number} is MTF but has fewer than 2 pairs`);
        if (q.answer.trim().length === 0) issues.push(`tier ${tier.tier} task ${task.taskNumber} Q${q.number} has no answer`);
      }
    }
    if (sum !== tier.totalMarks) issues.push(`tier ${tier.tier} totalMarks ${tier.totalMarks} does not equal the question-mark sum ${sum}`);
  }
  return issues;
}

function mediaBlocks(input: PaperGenInput): Anthropic.ContentBlockParam[] {
  return input.media.map((m): Anthropic.ContentBlockParam => {
    const data = m.data.toString('base64'); // no newlines — Buffer.toString('base64') never inserts them
    if (m.contentType === 'application/pdf') {
      return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } };
    }
    return { type: 'image', source: { type: 'base64', media_type: m.contentType as 'image/jpeg' | 'image/png' | 'image/webp', data } };
  });
}

function requestText(input: PaperGenInput): string {
  const r = input.request;
  const lines = [
    'Design a complete assessment from the supplied lesson material.',
    `Language of instruction / subject: ${r.language}. Grade: ${r.grade}. Board: ${r.board}.`,
    `Chapter / lesson: ${r.chapter}.`,
    `Assessment type: ${r.assessmentType.replace('_', ' ')}.`,
    `Tiers required: ${r.tiers.join(', ')}. Time windows — ${r.tiers.map((t) => `${t}: ${TIER_TIME[t]} minutes`).join(' · ')}.`,
    `Tier labels — ${r.tiers.map((t) => `${t}: ${TIER_LABEL[t]}`).join(' · ')}.`,
  ];
  if (input.media.length === 0) {
    lines.push('No lesson pages are attached — generate from your knowledge of this chapter for this grade and board, and record that in sourceNotes.');
  } else {
    lines.push(`The ${input.media.length} attachment(s) above are the lesson pages / reference material — they are the primary source for every question.`);
  }
  if (r.adjustment === 'harder') lines.push('The teacher asked for a HARDER paper than your previous attempt: raise the cognitive demand within each tier (not the length).');
  if (r.adjustment === 'easier') lines.push('The teacher asked for an EASIER paper than your previous attempt: lower the cognitive demand within each tier while keeping the structure.');
  return lines.join('\n');
}

export function buildPaperUserContent(input: PaperGenInput): Anthropic.ContentBlockParam[] {
  return [...mediaBlocks(input), { type: 'text', text: requestText(input) }];
}

export function buildQcUserContent(paper: PaperJson, input: PaperGenInput): Anthropic.ContentBlockParam[] {
  const shape = paperShapeIssues(paper);
  const checklist = [
    'You are the quality-control reviewer for the assessment JSON below. Check it against the source material above (when attached) and this checklist:',
    '1. GROUNDING — every non-creative question is answerable from the source; no hallucinated or contradicted facts.',
    '2. COVERAGE — balanced across the lesson; no over-testing of one portion.',
    '3. DIFFICULTY — tier A is genuinely foundational, B application-oriented, C analytical; complexity rises across tiers.',
    "4. ASSESSMENT — question types used correctly; marks sum to each tier's totalMarks; workload fits the time window.",
    '5. INTEGRITY — no answers leaked in question wording; MCQ options plausible, distinct, clue-free, exactly 4.',
    '6. LANGUAGE — grammar and spelling correct in the target language; instructions age-appropriate.',
    ...(shape.length > 0 ? ['Known structural problems you MUST fix:', ...shape.map((s) => `- ${s}`)] : []),
    'If you find fixable problems, return pass=false with the issues AND a fully corrected paper in fixedPaper (same schema). If it is fine, return pass=true, empty issues, fixedPaper=null.',
    '',
    'ASSESSMENT JSON:',
    JSON.stringify(paper),
  ].join('\n');
  return [...mediaBlocks(input), { type: 'text', text: checklist }];
}
