import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { DocxPaperBuilder } from '../src/adapters/docx.js';
import type { PaperJson } from '../src/domain/types.js';

// usage: npm run try:render -- [out/paper.json] ["School Name"] [logo.png]
const [paperPath = 'out/paper.json', schoolName = 'Ryan International School, Raipur (CBSE)', logoPath] = process.argv.slice(2);
const paper = JSON.parse(readFileSync(paperPath, 'utf8')) as PaperJson;
const logo = logoPath
  ? { data: readFileSync(logoPath), contentType: logoPath.endsWith('.png') ? 'image/png' : 'image/jpeg' }
  : null;

const student = await new DocxPaperBuilder().buildPaperDocx(paper, { schoolName, logo }, false);
const teacher = await new DocxPaperBuilder().buildPaperDocx(paper, { schoolName, logo }, true);
mkdirSync('out', { recursive: true });
writeFileSync('out/paper-student.docx', student);
writeFileSync('out/paper-teacher.docx', teacher);
console.log(`wrote out/paper-student.docx (${student.length} b) and out/paper-teacher.docx (${teacher.length} b)`);
