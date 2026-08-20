import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { loadConfig } from '../src/config.js';
import { AnthropicPaperGenerator } from '../src/adapters/anthropic-paper.js';
import { paperShapeIssues } from '../src/bot/paper/prompts.js';
import type { PaperGenInput } from '../src/ports.js';

// usage: npm run try:paper -- ./lesson-photos "टोपी शुक्ला" Hindi "High (Classes 9-12)" CBSE worksheet ABC
const [dir = './lesson-photos', chapter = 'टोपी शुक्ला', language = 'Hindi', grade = 'High (Classes 9-12)', board = 'CBSE', type = 'worksheet', tiersArg = 'ABC'] = process.argv.slice(2);
const config = loadConfig();

const TYPES: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.pdf': 'application/pdf' };
const media = readdirSync(dir)
  .filter((f) => TYPES[extname(f).toLowerCase()])
  .sort()
  .slice(0, 10) // MAX_PAPER_MEDIA (the Task 25 wizard constant)
  .map((f) => ({ data: readFileSync(join(dir, f)), contentType: TYPES[extname(f).toLowerCase()] }));
console.log(`loaded ${media.length} media file(s) from ${dir}`);

const input: PaperGenInput = {
  request: {
    subject: language, language, grade, board, chapter,
    assessmentType: type as PaperGenInput['request']['assessmentType'],
    tiers: [...tiersArg.toUpperCase()].filter((t): t is 'A' | 'B' | 'C' => 'ABC'.includes(t)),
    teacherVersion: true, media: [], adjustment: null,
  },
  profile: { grade, subject: language, board },
  media,
};

const g = new AnthropicPaperGenerator({ apiKey: config.ANTHROPIC_API_KEY, model: config.PAPER_MODEL });
const r = await g.generatePaper(input);
console.log(`\n===== ${r.model} · ${(r.latencyMs / 1000).toFixed(1)} s · in ${r.inputTokens} / out ${r.outputTokens} tokens =====`);
for (const tier of r.paper.tiers) {
  console.log(`\nTIER ${tier.tier} — ${tier.tierLabel} · ${tier.timeMinutes} min · ${tier.totalMarks} marks`);
  for (const task of tier.tasks) console.log(`  ${task.heading} (${task.headingEnglish}) — ${task.questions.length} Q, ${task.questions.reduce((s, q) => s + q.marks, 0)} marks`);
}
console.log(`\nsourceNotes: ${JSON.stringify(r.paper.sourceNotes)}`);
console.log(`shape issues: ${JSON.stringify(paperShapeIssues(r.paper))}`);
const qc = await g.qcPaper(r.paper, input);
console.log(`QC: pass=${qc.pass} issues=${JSON.stringify(qc.issues)} fixed=${qc.fixedPaper !== null}`);
mkdirSync('out', { recursive: true });
writeFileSync('out/paper.json', JSON.stringify(qc.fixedPaper ?? r.paper, null, 2));
console.log('wrote out/paper.json (input for try:render, Task 24)');
