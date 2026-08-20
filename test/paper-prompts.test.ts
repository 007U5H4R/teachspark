import { describe, it, expect } from 'vitest';
import { PAPER_SYSTEM_PROMPT, PaperJsonZ, paperShapeIssues, buildPaperUserContent, buildQcUserContent, TIER_TIME, TIER_LABEL } from '../src/bot/paper/prompts.js';
import { samplePaperJson } from '../src/adapters/memory.js';
import type { PaperGenInput } from '../src/ports.js';

const input: PaperGenInput = {
  request: { subject: 'Hindi', language: 'Hindi', grade: 'High (Classes 9-12)', board: 'CBSE', chapter: 'टोपी शुक्ला', assessmentType: 'worksheet', tiers: ['A', 'B', 'C'], teacherVersion: true, media: [{ url: 'u1', contentType: 'image/jpeg' }], adjustment: null },
  profile: { grade: 'High (Classes 9-12)', subject: 'Hindi', board: 'CBSE' },
  media: [
    { data: Buffer.from('img1'), contentType: 'image/jpeg' },
    { data: Buffer.from('%PDF-1.4'), contentType: 'application/pdf' },
  ],
};

describe('PAPER_SYSTEM_PROMPT', () => {
  it('encodes the four-task map, the difficulty ladder and the grounding rules', () => {
    for (const s of [
      'Task 1', 'Task 2', 'Task 3', 'Task 4',
      'Reading Comprehension', 'Language in Use', 'Textual Analysis', 'Creative',
      'Foundational', 'Proficient', 'Advanced',
      'recall', 'application', 'analysis',
      'cognitive complexity',
    ]) expect(PAPER_SYSTEM_PROMPT).toContain(s);
    expect(PAPER_SYSTEM_PROMPT).toMatch(/never invent|do not invent/i);       // grounding
    expect(PAPER_SYSTEM_PROMPT).toMatch(/unreadable|blurry/i);                // flag, don't hallucinate
    expect(PAPER_SYSTEM_PROMPT).toMatch(/do not reveal|never reveal/i);       // no answers in question text
    expect(PAPER_SYSTEM_PROMPT).toMatch(/plausible/i);                        // MCQ distractors
    expect(PAPER_SYSTEM_PROMPT).toMatch(/student/i);                          // no student data
  });

  // MANDATORY EXTRA SCOPE (pre-flight scan finding): structured outputs constrain JSON SHAPE
  // only, never string CONTENT — so PAPER_SYSTEM_PROMPT must say plain text explicitly, mirroring
  // GENERATION_SYSTEM_PROMPT in src/bot/skills.ts (same wording style + "every ... not just the
  // first one" emphasis), or Markdown/emoji/LaTeX can leak into question text and into the .docx.
  it('forbids Markdown, emoji and LaTeX inside every JSON string field, not just the first one', () => {
    expect(PAPER_SYSTEM_PROMPT).toMatch(/plain text/i);
    expect(PAPER_SYSTEM_PROMPT).toMatch(/no Markdown/i);
    expect(PAPER_SYSTEM_PROMPT).toContain('**');   // literal bold marker called out
    expect(PAPER_SYSTEM_PROMPT).toContain('#');    // literal heading marker called out
    expect(PAPER_SYSTEM_PROMPT).toMatch(/no emoji/i);
    expect(PAPER_SYSTEM_PROMPT).toMatch(/LaTeX/);
    expect(PAPER_SYSTEM_PROMPT).toMatch(/apply this to every/i);
    expect(PAPER_SYSTEM_PROMPT).toMatch(/not just the first/i);
  });
});

describe('buildPaperUserContent', () => {
  it('puts image and document blocks before the request text and names every request field', () => {
    const blocks = buildPaperUserContent(input);
    expect(blocks[0]).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg' } });
    expect(blocks[1]).toMatchObject({ type: 'document', source: { type: 'base64', media_type: 'application/pdf' } });
    const text = (blocks.at(-1) as { type: 'text'; text: string }).text;
    for (const s of ['Hindi', 'High (Classes 9-12)', 'CBSE', 'टोपी शुक्ला', 'worksheet', 'A, B, C']) expect(text).toContain(s);
    expect(text).toContain(TIER_TIME.A);
    expect(text).not.toMatch(/harder|easier/i); // no adjustment requested
  });
  it('includes the adjustment note when redoing harder/easier', () => {
    const blocks = buildPaperUserContent({ ...input, request: { ...input.request, adjustment: 'harder' } });
    expect((blocks.at(-1) as { type: 'text'; text: string }).text).toMatch(/harder/i);
  });
  it('states chapter-knowledge mode when no media was supplied', () => {
    const blocks = buildPaperUserContent({ ...input, media: [], request: { ...input.request, media: [] } });
    expect(blocks).toHaveLength(1);
    expect((blocks[0] as { type: 'text'; text: string }).text).toMatch(/no lesson pages|from your knowledge/i);
  });
});

describe('buildQcUserContent', () => {
  it('splices the real paperShapeIssues findings into the "Known structural problems" block', () => {
    const p = samplePaperJson();
    p.tiers[0].tasks = p.tiers[0].tasks.slice(0, 3); // violates the "exactly 4 tasks" rule
    const issues = paperShapeIssues(p);
    expect(issues.length).toBeGreaterThan(0); // guard against a vacuous pass below
    const text = (buildQcUserContent(p, input).at(-1) as { type: 'text'; text: string }).text;
    expect(text).toContain('Known structural problems you MUST fix:');
    for (const issue of issues) expect(text).toContain(`- ${issue}`); // the ACTUAL issue text, not a guess
    expect(text).toMatch(/must have exactly 4 tasks/);
  });
  it('omits the "Known structural problems" block for a structurally valid paper', () => {
    const p = samplePaperJson();
    expect(paperShapeIssues(p)).toEqual([]);
    const text = (buildQcUserContent(p, input).at(-1) as { type: 'text'; text: string }).text;
    expect(text).not.toContain('Known structural problems');
  });
  it('embeds the exact serialized paper JSON so a broken serialization is caught', () => {
    const p = samplePaperJson();
    const text = (buildQcUserContent(p, input).at(-1) as { type: 'text'; text: string }).text;
    expect(text).toContain(JSON.stringify(p));
  });
  it('puts image and document blocks before the checklist text, same ordering as buildPaperUserContent', () => {
    const blocks = buildQcUserContent(samplePaperJson(), input);
    expect(blocks).toHaveLength(3); // 2 media blocks (image + pdf) + 1 text block
    expect(blocks[0]).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg' } });
    expect(blocks[1]).toMatchObject({ type: 'document', source: { type: 'base64', media_type: 'application/pdf' } });
    expect(blocks.at(-1)).toMatchObject({ type: 'text' });
  });
});

describe('PaperJsonZ + paperShapeIssues', () => {
  it('accepts the sample paper with no shape issues', () => {
    expect(PaperJsonZ.safeParse(samplePaperJson()).success).toBe(true);
    expect(paperShapeIssues(samplePaperJson())).toEqual([]);
  });
  it('rejects unknown question types at the schema level', () => {
    const bad = samplePaperJson();
    (bad.tiers[0].tasks[0].questions[0] as { type: string }).type = 'ESSAY';
    expect(PaperJsonZ.safeParse(bad).success).toBe(false);
  });
  it('catches structural problems the API schema cannot express', () => {
    const p = samplePaperJson();
    p.tiers[0].tasks = p.tiers[0].tasks.slice(0, 3);                    // only 3 tasks
    p.tiers[0].totalMarks = 999;                                        // marks mismatch
    const issues = paperShapeIssues(p);
    expect(issues.some((i) => /4 tasks/.test(i))).toBe(true);
    expect(issues.some((i) => /totalMarks/.test(i))).toBe(true);
    const q = samplePaperJson();
    q.tiers[0].tasks[0].questions[0].options = ['only', 'three', 'options'];
    expect(paperShapeIssues(q).some((i) => /4 options/.test(i))).toBe(true);
  });
});

describe('paperShapeIssues — remaining structural rules', () => {
  const cases = [
    {
      name: 'an empty tiers list',
      build: () => samplePaperJson({ tiers: [] }),
      expected: 'paper has no tiers',
    },
    {
      name: 'a task with no questions',
      build: () => {
        const p = samplePaperJson();
        p.tiers[0].tasks[0].questions = [];
        return p;
      },
      expected: 'tier A task 1 has no questions',
    },
    {
      name: 'a question with non-positive marks',
      build: () => {
        const p = samplePaperJson();
        p.tiers[0].tasks[0].questions[0].marks = 0;
        return p;
      },
      expected: 'tier A task 1 Q1 has non-positive marks',
    },
    {
      name: 'an MTF question with fewer than 2 match pairs',
      build: () => {
        const p = samplePaperJson();
        p.tiers[0].tasks[0].questions[0] = {
          ...p.tiers[0].tasks[0].questions[0],
          type: 'MTF',
          options: null,
          matchPairs: [{ left: 'a', right: 'b' }],
        };
        return p;
      },
      expected: 'tier A task 1 Q1 is MTF but has fewer than 2 pairs',
    },
    {
      name: 'a question with empty answer text',
      build: () => {
        const p = samplePaperJson();
        p.tiers[0].tasks[0].questions[0].answer = '   ';
        return p;
      },
      expected: 'tier A task 1 Q1 has no answer',
    },
  ];

  it.each(cases)('flags $name', ({ build, expected }) => {
    expect(paperShapeIssues(build())).toContain(expected);
  });

  it('is empty for the unmodified sample paper (baseline for every case above)', () => {
    expect(paperShapeIssues(samplePaperJson())).toEqual([]);
  });
});

describe('tier constants', () => {
  it('match the PRD time allocations', () => {
    expect(TIER_TIME).toEqual({ A: '35–40', B: '40–45', C: '50–60' });
    expect(TIER_LABEL).toEqual({ A: 'Foundational', B: 'Proficient', C: 'Advanced' });
  });
});
