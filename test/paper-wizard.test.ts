import { describe, it, expect } from 'vitest';
import { transition } from '../src/bot/machine.js';
import { afterPaperGeneration, afterPaperRender, afterPaperRenderFailure, buildPreviewText, MAX_PAPER_MEDIA, MAX_PAPER_REDOS, PAPER_STALE_MS, PREVIEW_OPTIONS } from '../src/bot/paper/wizard.js';
import { help } from '../src/bot/messages.js';
import { samplePaperJson } from '../src/adapters/memory.js';
import { EVENT } from '../src/domain/events.js';
import type { InboundMessage, Step, Teacher } from '../src/domain/types.js';

const NOW = new Date('2026-08-23T14:00:00+05:30');
const JOIN = 'https://wa.me/14155238886?text=join%20clever-tiger';
const TZ = 'Asia/Kolkata';

function teacher(over: Partial<Teacher> = {}): Teacher {
  return {
    id: 't1', waFrom: 'whatsapp:+911', waId: '911', profileName: 'Meera',
    grade: 'High (Classes 9-12)', subject: 'Hindi', board: 'CBSE', state: 'IDLE', currentSkillId: null, pendingTopic: null,
    skillsCompleted: [], retries: 0, activatedAt: null, lastInboundAt: null, nudgeDueAt: null, nudgeSentAt: null,
    nudgeCount: 0, createdAt: NOW, schoolName: null, schoolLogoUrl: null, paperRequest: null, paperJson: null, paperRedoCount: 0, ...over,
  };
}
const msg = (body: string, media: InboundMessage['media'] = []): InboundMessage =>
  ({ from: 'whatsapp:+911', waId: '911', profileName: 'Meera', body, messageSid: 'SM1', buttonPayload: null, media });
const run = (t: Teacher, m: InboundMessage, now = NOW): Step => transition({ teacher: t, message: m, now, joinLink: JOIN, timezone: TZ });
const texts = (s: Step) => s.actions.filter((a) => a.type === 'send_text').map((a) => (a as { body: string }).body);
const names = (s: Step) => s.events.map((e) => e.name);
const apply = (t: Teacher, s: Step): Teacher => ({ ...t, ...s.updates } as Teacher);
const JPEG = { url: 'https://api.twilio.com/m/ME1', contentType: 'image/jpeg' };

function walkToKey(): Teacher {
  let t = teacher();
  t = apply(t, run(t, msg('paper')));                 // → PAPER_SUBJECT
  t = apply(t, run(t, msg('2')));                     // Hindi → PAPER_CHAPTER
  t = apply(t, run(t, msg('टोपी शुक्ला')));            // → PAPER_MEDIA
  t = apply(t, run(t, msg('', [JPEG])));              // photo 1
  t = apply(t, run(t, msg('DONE')));                  // → PAPER_TYPE
  t = apply(t, run(t, msg('1')));                     // worksheet → PAPER_TIERS
  t = apply(t, run(t, msg('1')));                     // all → PAPER_KEY
  return t;
}

describe('wizard entry', () => {
  it('PAPER command starts the wizard for an onboarded teacher', () => {
    const s = run(teacher(), msg('paper'));
    expect(s.updates.state).toBe('PAPER_SUBJECT');
    expect(s.updates.paperRequest).toMatchObject({ grade: 'High (Classes 9-12)', board: 'CBSE', media: [], tiers: ['A', 'B', 'C'] });
    expect(names(s)).toContain(EVENT.paper_started);
    expect(texts(s)[0].toLowerCase()).toContain('language');
  });
  it('PAPER before onboarding sends the welcome instead', () => {
    const s = run(teacher({ grade: null, subject: null, board: null, state: 'NEW' }), msg('paper'));
    expect(s.updates.state).toBe('AWAITING_CHOICE');
  });
});

describe('subject, chapter, media', () => {
  it('captures language, chapter, then collects photos until DONE', () => {
    let t = apply(teacher(), run(teacher(), msg('paper')));
    let s = run(t, msg('2'));
    expect(s.updates.paperRequest).toMatchObject({ subject: 'Hindi', language: 'Hindi' });
    expect(s.updates.state).toBe('PAPER_CHAPTER');
    t = apply(t, s);
    s = run(t, msg('टोपी शुक्ला'));
    expect(s.updates.paperRequest).toMatchObject({ chapter: 'टोपी शुक्ला' });
    expect(s.updates.state).toBe('PAPER_MEDIA');
    t = apply(t, s);
    s = run(t, msg('', [JPEG]));
    expect((s.updates.paperRequest as { media: unknown[] }).media).toHaveLength(1);
    expect(names(s)).toContain(EVENT.paper_media_received);
    t = apply(t, s);
    s = run(t, msg('done'));
    expect(s.updates.state).toBe('PAPER_TYPE');
    expect(names(s)).toContain(EVENT.paper_media_done);
  });
  it('a free-text language names a regional language', () => {
    const t = apply(teacher(), run(teacher(), msg('paper')));
    const s = run(t, msg('Marathi'));
    expect(s.updates.paperRequest).toMatchObject({ language: 'Marathi' });
    // regression: "Bengali" must NOT substring-match an English alias
    expect(run(t, msg('Bengali')).updates.paperRequest).toMatchObject({ language: 'Bengali' });
  });
  it('rejects unsupported media and enforces the cap', () => {
    let t = walkToKey();
    t = teacher({ state: 'PAPER_MEDIA', paperRequest: { ...(t.paperRequest as object), media: Array.from({ length: MAX_PAPER_MEDIA }, (_, i) => ({ url: `u${i}`, contentType: 'image/jpeg' })) } as Teacher['paperRequest'] });
    const over = run(t, msg('', [JPEG]));
    expect(names(over)).toContain(EVENT.paper_media_rejected);
    const bad = run(teacher({ state: 'PAPER_MEDIA', paperRequest: t.paperRequest }), msg('', [{ url: 'v', contentType: 'video/mp4' }]));
    expect(names(bad)).toContain(EVENT.paper_media_rejected);
  });
  it('SKIP proceeds with zero media (chapter-knowledge mode)', () => {
    let t = apply(teacher(), run(teacher(), msg('paper')));
    t = apply(t, run(t, msg('1')));
    t = apply(t, run(t, msg('The Fun They Had')));
    const s = run(t, msg('skip'));
    expect(s.updates.state).toBe('PAPER_TYPE');
    expect(s.events.find((e) => e.name === EVENT.paper_media_done)?.properties).toMatchObject({ count: 0 });
  });
});

describe('type, tiers, key, school, logo → generation', () => {
  it('asks school + logo on the first paper, then fires generate_paper', () => {
    let t = walkToKey();
    let s = run(t, msg('1'));                          // key yes → PAPER_SCHOOL (schoolName null)
    expect(s.updates.state).toBe('PAPER_SCHOOL');
    t = apply(t, s);
    s = run(t, msg('Ryan International School'));
    expect(s.updates.schoolName).toBe('Ryan International School');
    expect(s.updates.state).toBe('PAPER_LOGO');
    t = apply(t, s);
    s = run(t, msg('', [JPEG]));                       // logo image
    expect(s.actions.some((a) => a.type === 'store_logo')).toBe(true);
    expect(s.updates.state).toBe('PAPER_GENERATING');
    expect(s.actions.at(-1)).toEqual({ type: 'generate_paper' });
  });
  it('skips school + logo on later papers', () => {
    const t = { ...walkToKey(), schoolName: 'Ryan' };
    const s = run(t, msg('2'));                        // key no → straight to generation
    expect((s.updates.paperRequest as { teacherVersion: boolean }).teacherVersion).toBe(false);
    expect(s.updates.state).toBe('PAPER_GENERATING');
    expect(s.actions.at(-1)).toEqual({ type: 'generate_paper' });
  });
  it('while generating, replies still-working and recovers from stale', () => {
    const t = teacher({ state: 'PAPER_GENERATING', lastInboundAt: NOW });
    expect(texts(run(t, msg('hello?')))[0].toLowerCase()).toContain('working');
    const stale = teacher({ state: 'PAPER_GENERATING', lastInboundAt: new Date(NOW.getTime() - 10 * 60_000) });
    const s = run(stale, msg('hello?'));
    expect(s.updates.state).toBe('IDLE');
    expect(s.events.find((e) => e.name === EVENT.paper_generation_failed)?.properties).toMatchObject({ reason: 'stale' });
  });
  it('does not refresh lastInboundAt on a still-working ping, so an impatient teacher still hits the paper stale escape', () => {
    const t = teacher({ state: 'PAPER_GENERATING', lastInboundAt: NOW });
    const s1 = run(t, msg('are you there?'), new Date(NOW.getTime() + 90_000));
    expect(texts(s1)[0].toLowerCase()).toContain('working');
    expect(s1.updates.lastInboundAt).toBeUndefined();
    const t2 = apply(t, s1);
    expect(t2.lastInboundAt).toEqual(NOW);
    const s2 = run(t2, msg('hello?'), new Date(NOW.getTime() + PAPER_STALE_MS + 30_000));
    expect(s2.updates.state).toBe('IDLE');
    expect(s2.events.find((e) => e.name === EVENT.paper_generation_failed)?.properties).toMatchObject({ reason: 'stale' });
  });
});

describe('preview, redo, render, impact', () => {
  const paper = samplePaperJson();
  it('afterPaperGeneration sends a chunked preview + menu and stores the paper', () => {
    const t = teacher({ state: 'PAPER_GENERATING', paperRedoCount: 0 });
    const s = afterPaperGeneration(t, { ok: true, paper, qc: { pass: true, issues: [], fixedPaper: null } }, NOW);
    expect(s.updates).toMatchObject({ state: 'PAPER_PREVIEW', paperJson: paper });
    expect(names(s)).toContain(EVENT.paper_preview_sent);
    expect(texts(s).join('\n')).toContain('टोपी शुक्ला');
    expect(texts(s).at(-1)).toContain('1)');
    expect(texts(s).every((b) => b.length <= 1500)).toBe(true);
  });
  it('surfaces QC issues and source notes in the preview', () => {
    const flagged = { ...paper, sourceNotes: ['Page 3 was too blurry to read.'] };
    const text = buildPreviewText(flagged, ['Tier B Q2 wording ambiguous']);
    expect(text).toContain('Page 3');
    expect(text).toContain('ambiguous');
  });
  it('1 renders; 3 regenerates harder; redos are capped', () => {
    const t = teacher({ state: 'PAPER_PREVIEW', paperJson: paper, paperRequest: walkToKey().paperRequest, paperRedoCount: 0 });
    const send = run(t, msg('1'));
    expect(send.actions.at(-1)).toEqual({ type: 'render_paper' });
    const harder = run(t, msg('3'));
    expect(harder.updates.paperRedoCount).toBe(1);
    expect((harder.updates.paperRequest as { adjustment: string }).adjustment).toBe('harder');
    expect(harder.updates.state).toBe('PAPER_GENERATING');
    expect(names(harder)).toContain(EVENT.paper_redo_requested);
    const capped = run({ ...t, paperRedoCount: MAX_PAPER_REDOS }, msg('2'));
    expect(capped.updates.state).toBeUndefined();      // stays in preview
    expect(capped.actions.some((a) => a.type === 'generate_paper')).toBe(false);
  });
  it('afterPaperRender sends intro text, then the document, then the impact question', () => {
    const t = teacher({ state: 'PAPER_PREVIEW', paperJson: paper });
    const s = afterPaperRender(t, 'https://x.test/p.docx', NOW);
    expect(s.actions.map((a) => a.type)).toEqual(['send_text', 'send_document', 'send_text']);
    expect(names(s)).toContain(EVENT.paper_exported);
    expect(s.updates.state).toBe('PAPER_IMPACT');
  });
  it('impact answer logs minutes and lands in IDLE with the paper share CTA', () => {
    const t = teacher({ state: 'PAPER_IMPACT' });
    const s = run(t, msg('2'));
    expect(s.events.find((e) => e.name === EVENT.paper_minutes_saved)?.properties).toMatchObject({ minutes: 60 });
    expect(s.updates.state).toBe('IDLE');
    expect(texts(s)[0]).toContain(JOIN);
  });
  it('M1: PAPER_IMPACT clears paperJson/paperRequest on its terminal IDLE transition (read on every inbound via TEACHER_COLUMNS)', () => {
    const t = teacher({ state: 'PAPER_IMPACT', paperJson: paper, paperRequest: walkToKey().paperRequest });
    const s = run(t, msg('2'));
    expect(s.updates.state).toBe('IDLE');
    expect(s.updates.paperJson).toBeNull();
    expect(s.updates.paperRequest).toBeNull();
  });
});

describe('whole-branch review fixes (C1/I1/I3/I5/funnel/M1)', () => {
  const paper = samplePaperJson();

  it('I1: a failed redo returns her to PAPER_PREVIEW with the existing paper intact, not IDLE', () => {
    const existing = samplePaperJson({ title: 'पुराना पत्र' });
    const t = teacher({ state: 'PAPER_GENERATING', paperJson: existing, paperRedoCount: 1 });
    const s = afterPaperGeneration(t, { ok: false, reason: 'error' }, NOW);
    expect(s.updates.state).toBe('PAPER_PREVIEW');
    expect(names(s)).toContain(EVENT.paper_generation_failed);
    const after = apply(t, s);
    expect(after.paperJson).toEqual(existing); // she still has the paper she started with
    expect(after.paperRedoCount).toBe(1); // not reset by the failure itself
  });
  it('I1: a FIRST-EVER generation failure (no prior paper) still goes to IDLE with the apology', () => {
    const t = teacher({ state: 'PAPER_GENERATING', paperJson: null });
    const s = afterPaperGeneration(t, { ok: false, reason: 'error' }, NOW);
    expect(s.updates.state).toBe('IDLE'); // unchanged behavior when there is nothing to fall back to
  });
  it('I1: looping a failing redo still exhausts the cap after MAX_PAPER_REDOS attempts', () => {
    let t = teacher({ state: 'PAPER_PREVIEW', paperJson: samplePaperJson(), paperRequest: walkToKey().paperRequest, paperRedoCount: 0 });
    for (let i = 1; i <= MAX_PAPER_REDOS; i++) {
      const redo = run(t, msg('2')); // 2) Try a fresh version
      expect(redo.updates.paperRedoCount).toBe(i);
      t = apply(t, redo); // now PAPER_GENERATING
      const failed = afterPaperGeneration(t, { ok: false, reason: 'error' }, NOW);
      expect(failed.updates.state).toBe('PAPER_PREVIEW'); // back to preview every time, not IDLE
      t = apply(t, failed);
      expect(t.paperJson).not.toBeNull();
    }
    const capped = run(t, msg('2')); // one more redo attempt: cap is exhausted
    expect(capped.updates.state).toBeUndefined();
    expect(capped.actions.some((a) => a.type === 'generate_paper')).toBe(false);
  });

  it('I3: a genuinely-repaired paper shows NO residual warning (the pre-repair issue must not resurface)', () => {
    const fixed = samplePaperJson({ title: 'सुधारा हुआ' }); // structurally valid
    const t = teacher({ state: 'PAPER_GENERATING' });
    const s = afterPaperGeneration(t, { ok: true, paper: fixed, qc: { pass: false, issues: ['marks off by 2'], fixedPaper: fixed } }, NOW);
    expect(texts(s).join('\n')).not.toContain('marks off by 2');
  });
  it('I3: a fixedPaper that still violates a shape rule DOES show the RE-CHECKED residual, not the stale pre-repair issue', () => {
    const base = samplePaperJson();
    const stillBroken = { ...base, tiers: [{ ...base.tiers[0], totalMarks: 999 }] }; // question-mark sum stays 20, now mismatched
    const t = teacher({ state: 'PAPER_GENERATING' });
    const s = afterPaperGeneration(t, { ok: true, paper: stillBroken, qc: { pass: false, issues: ['stale pre-repair note'], fixedPaper: stillBroken } }, NOW);
    const body = texts(s).join('\n');
    expect(body).not.toContain('stale pre-repair note');
    expect(body).toContain('does not equal the question-mark sum');
  });
  it('I3: an UNREPAIRED failing QC (fixedPaper null) still shows its own issues unchanged', () => {
    const t = teacher({ state: 'PAPER_GENERATING' });
    const s = afterPaperGeneration(t, { ok: true, paper, qc: { pass: false, issues: ['Tier B Q2 wording ambiguous'], fixedPaper: null } }, NOW);
    expect(texts(s).join('\n')).toContain('ambiguous');
  });

  it('funnel: afterPaperRender activates a paper-only teacher on her first export', () => {
    const t = teacher({ state: 'PAPER_PREVIEW', paperJson: paper, activatedAt: null });
    const s = afterPaperRender(t, 'https://x.test/p.docx', NOW);
    expect(s.updates.activatedAt).toEqual(NOW);
    expect(names(s)).toContain(EVENT.activated);
  });
  it('funnel: does not re-activate or re-emit for an already-activated teacher', () => {
    const already = new Date('2026-08-01T00:00:00Z');
    const t = teacher({ state: 'PAPER_PREVIEW', paperJson: paper, activatedAt: already });
    const s = afterPaperRender(t, 'https://x.test/p.docx', NOW);
    expect(s.updates.activatedAt).toBeUndefined();
    expect(names(s)).not.toContain(EVENT.activated);
  });

  it('M1: afterPaperRenderFailure keeps holding paperJson/paperRequest (not cleared)', () => {
    const t = teacher({ state: 'PAPER_PREVIEW', paperJson: paper, paperRequest: walkToKey().paperRequest });
    const s = afterPaperRenderFailure(t, NOW);
    expect(s.updates.paperJson).toBeUndefined(); // untouched -- neither set nor cleared
    expect(s.updates.paperRequest).toBeUndefined();
  });

  it('I5: skipping the school name persists a sentinel ("") so a later paper does not re-ask', () => {
    const atSchool = teacher({ state: 'PAPER_SCHOOL', paperRequest: walkToKey().paperRequest });
    const skipped = run(atSchool, msg('SKIP'));
    expect(skipped.updates.schoolName).toBe(''); // sentinel, not left undefined/null
    expect(skipped.updates.state).toBe('PAPER_LOGO');
    expect(skipped.events.find((e) => e.name === EVENT.paper_school_captured)?.properties).toMatchObject({ skipped: true });

    // a LATER paper: PAPER_KEY's `schoolName === null` gate must treat '' as "already asked"
    const t2 = { ...walkToKey(), schoolName: apply(atSchool, skipped).schoolName };
    const s2 = run(t2, msg('1')); // key: yes
    expect(s2.updates.state).toBe('PAPER_GENERATING'); // straight to generation, no PAPER_SCHOOL re-ask
  });

  it('M2: PREVIEW_OPTIONS no longer advertises the dead "again" alias', () => {
    // parseCommand('again') already resolves to the global `new` command BEFORE paperTransition
    // ever runs (checked earlier in machine.ts's transition()), so 'again' listed as a redo alias
    // here was unreachable and misleading -- typing it actually misroutes into the core worksheet
    // flow, not a redo. Direct data check: the wizard-level behavior can't distinguish "removed"
    // from "always dead", so this pins the alias list itself.
    const redo = PREVIEW_OPTIONS.find((o) => o.id === 'redo');
    expect(redo?.aliases).not.toContain('again');
    expect(redo?.aliases).toEqual(expect.arrayContaining(['redo', 'fresh', 'retry']));
  });

  it('M3: PAPER_CHAPTER explains the rejection reason instead of one generic re-ask', () => {
    let t = apply(teacher(), run(teacher(), msg('paper')));
    t = apply(t, run(t, msg('2'))); // Hindi → PAPER_CHAPTER
    const piiBody = texts(run(t, msg('call me at 9876543210')))[0];
    expect(piiBody).toContain("don't share");
    const tooLongBody = texts(run(t, msg('x'.repeat(210))))[0];
    expect(tooLongBody).toContain('under 200 characters');
    expect(piiBody).not.toBe(tooLongBody); // genuinely reason-specific, not one generic reprompt
  });
});

describe('global commands still work inside the wizard', () => {
  it('help answers without leaving the wizard; restart clears paper fields', () => {
    const t = teacher({ state: 'PAPER_MEDIA', paperRequest: walkToKey().paperRequest });
    const h = run(t, msg('help'));
    expect(h.updates.state).toBeUndefined();
    const r = run(t, msg('restart'));
    expect(r.updates).toMatchObject({ state: 'AWAITING_CHOICE', paperRequest: null, paperJson: null, paperRedoCount: 0 });
  });
  it('help during PAPER_GENERATING keeps the generation clock anchored, so the paper stale escape stays reachable', () => {
    const t = teacher({ state: 'PAPER_GENERATING', lastInboundAt: NOW });
    const s1 = run(t, msg('help'), new Date(NOW.getTime() + 90_000));
    expect(texts(s1)).toEqual([help()]);
    expect(s1.updates.state).toBeUndefined();
    expect(s1.updates.lastInboundAt).toBeUndefined();
    const t2 = apply(t, s1);
    expect(t2.lastInboundAt).toEqual(NOW);
    const s2 = run(t2, msg('hello?'), new Date(NOW.getTime() + PAPER_STALE_MS + 30_000));
    expect(s2.updates.state).toBe('IDLE');
    expect(s2.events.find((e) => e.name === EVENT.paper_generation_failed)?.properties).toMatchObject({ reason: 'stale' });
  });
});
