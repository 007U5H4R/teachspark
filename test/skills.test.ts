import { describe, it, expect } from 'vitest';
import { SKILLS, SKILL_ORDER, GENERATION_SYSTEM_PROMPT, nextSkillFor, hasNextSkill } from '../src/bot/skills.js';

const profile = { grade: 'Middle (Classes 6-8)', subject: 'Maths', board: 'CBSE' };

describe('skills content', () => {
  it('defines exactly two skills in order', () => {
    expect(SKILL_ORDER).toEqual(['worksheet', 'quiz']);
    expect(Object.keys(SKILLS).sort()).toEqual(['quiz', 'worksheet']);
  });
  it('system prompt enforces plain text and no student data', () => {
    expect(GENERATION_SYSTEM_PROMPT).toMatch(/plain text/i);
    expect(GENERATION_SYSTEM_PROMPT).toMatch(/no Markdown/i);
    expect(GENERATION_SYSTEM_PROMPT).toMatch(/LaTeX/);
    expect(GENERATION_SYSTEM_PROMPT).toMatch(/student/i);
  });
  for (const id of SKILL_ORDER) {
    const s = SKILLS[id];
    it(`${id}: user prompt names profile, topic and every section header`, () => {
      const p = s.userPrompt(profile, 'Comparing fractions');
      expect(p).toContain('Middle (Classes 6-8)');
      expect(p).toContain('Maths');
      expect(p).toContain('CBSE');
      expect(p).toContain('Comparing fractions');
      expect(p).toContain('TITLE:');
      for (const h of s.sectionHeaders) expect(p).toContain(h);
    });
    it(`${id}: micro-lesson asks for the topic and fits one WhatsApp message`, () => {
      const m = s.microLesson(profile);
      expect(m.toLowerCase()).toContain('topic');
      expect(m.length).toBeLessThan(900);
      expect(s.topicExample.length).toBeGreaterThan(5);
    });
    it(`${id}: reusable prompt is copy-pasteable and names the topic`, () => {
      const r = s.reusablePrompt(profile, 'Comparing fractions');
      expect(r).toContain('Comparing fractions');
      expect(r.length).toBeLessThan(400);
      expect(r).not.toMatch(/[*_#`]/);
    });
  }
  it('worksheet has 3 levels + answer key; quiz has exit ticket + answer key', () => {
    expect(SKILLS.worksheet.sectionHeaders).toEqual(['LEVEL 1 - SUPPORT', 'LEVEL 2 - ON LEVEL', 'LEVEL 3 - CHALLENGE', 'ANSWER KEY']);
    expect(SKILLS.quiz.sectionHeaders).toEqual(['EXIT TICKET', 'ANSWER KEY']);
  });
  it('nextSkillFor / hasNextSkill follow SKILL_ORDER', () => {
    expect(nextSkillFor([])).toBe('worksheet');
    expect(nextSkillFor(['worksheet'])).toBe('quiz');
    expect(nextSkillFor(['worksheet', 'quiz'])).toBe('worksheet');
    expect(hasNextSkill([])).toBe(true);
    expect(hasNextSkill(['worksheet'])).toBe(true);
    expect(hasNextSkill(['worksheet', 'quiz'])).toBe(false);
  });
});
