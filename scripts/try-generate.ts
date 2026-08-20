import { mkdirSync, writeFileSync } from 'node:fs';
import { loadConfig } from '../src/config.js';
import { AnthropicGenerator } from '../src/adapters/anthropic.js';
import { PdfkitBuilder } from '../src/adapters/pdf.js';
import { splitIntoSections } from '../src/bot/postprocess.js';
import { chunkText } from '../src/bot/parse.js';
import { SKILLS } from '../src/bot/skills.js';
import type { SkillId } from '../src/domain/types.js';

// usage: npm run try:generate -- worksheet "Comparing fractions" "Middle (Classes 6-8)" Maths CBSE
const [skillArg = 'worksheet', topic = 'Comparing fractions with unlike denominators', grade = 'Middle (Classes 6-8)', subject = 'Maths', board = 'CBSE'] = process.argv.slice(2);
const skillId = skillArg as SkillId;
const config = loadConfig();
const gen = new AnthropicGenerator({ apiKey: config.ANTHROPIC_API_KEY, model: config.WORKSHEET_MODEL });

const r = await gen.generate({ skillId, topic, grade, subject, board });
console.log(`\n===== MODEL ${r.model} · ${r.latencyMs} ms · in ${r.inputTokens} / out ${r.outputTokens} tokens =====\n`);
console.log(r.text);
const parsed = splitIntoSections(r.text, SKILLS[skillId].sectionHeaders);
console.log(`\n===== parsed title: ${parsed.title ?? '(none)'} · sections: ${parsed.sections.map((s) => s.heading).join(' | ')}`);
console.log(`===== whatsapp chunks (≤1500): ${chunkText(r.text, 1500).length}`);
const pdf = await new PdfkitBuilder().build({
  title: parsed.title ?? `${SKILLS[skillId].title}: ${topic}`,
  subtitle: `${grade} · ${subject} · ${board} · ${topic}`,
  sections: parsed.sections,
  footer: 'AI can make mistakes — please review before using in class. Made with TeachSpark.',
});
mkdirSync('out', { recursive: true });
writeFileSync('out/worksheet.pdf', pdf);
console.log(`===== wrote out/worksheet.pdf (${pdf.length} bytes)`);
