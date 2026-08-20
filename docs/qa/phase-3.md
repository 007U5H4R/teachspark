# Phase 3 QA Gate — TeachSpark

**Scope:** Tasks 10–12 (Anthropic generator + plain-text post-processing · pdfkit PDF builder + Supabase Storage PDF store + `try:generate` script · Twilio WhatsApp messenger).
**Tester:** Independent QA agent (did not write the Phase 3 implementation).
**Repo state:** branch `main`, HEAD `9710afd` (`test(whatsapp): cover statusCallback omission and non-numeric error-code fallback`). Working tree clean before and after this gate except for this file.
**Environment:** macOS (Darwin 25.5.0), Node `v26.7.0`, vitest `4.1.11`, TypeScript `7.0.2`.
**Date:** 2026-08-20.
**Credentials:** this QA agent has no access to `.env` and did not read, source, export or commit it. Cases that need live credentials or paid Anthropic calls (2, 3, 5, and the PDF structural check) were executed beforehand by the controller; this document transcribes that evidence verbatim, attributed **controller-run**, from `.superpowers/sdd/implementation/qa3-controller-evidence.md`. Cases 1 and 4 were executed directly by this QA agent, attributed **QA-tester**.
**New QA artefacts:** this checklist only (`docs/qa/phase-3.md`). No source or existing test file was modified. Case 4 used one throwaway `npx tsx` script outside the repo (in the session scratchpad) to get live runtime evidence; it was deleted immediately after and was never committed.

## Phase 3 regression scope

Case 1 runs `npm run typecheck && npm test` — the **entire** suite, so it exercises Tasks 1–12 together, not just the newest task. A green Case 1 is simultaneously the regression gate for Phase 1 and Phase 2, plus the three Phase 3 modules:

- `test/anthropic.test.ts` — Task 10 (`buildMessageParams`, `AnthropicGenerator.generate`)
- `test/postprocess.test.ts` — Task 10 (Markdown-to-plain-text cleanup, `splitIntoSections`)
- `test/pdf.test.ts` — Task 11 (`toPdfSafe`, `PdfkitBuilder` A4 rendering + pagination)
- `test/storage.test.ts` — Task 11 (`SupabasePdfStore`, `ensurePublicBucket`, unit-level with a faked client)
- `test/storage.int.test.ts` — Task 11 (live Supabase Storage round-trip; `describe.skipIf(!url || !key)`, skips cleanly with no env)
- `test/twilio.test.ts` — Task 12 (`TwilioMessenger`: text/document sends, `MAX_BODY` guard, `RestException` mapping)

Six test files were added since the Phase 2 gate (HEAD `2113c93`, which ended at 10 files / 132 passed / 1 skipped): the five above plus the new `storage.int.test.ts` skip target. That accounts for the file and skip-count deltas measured in Case 1 below.

## What Phase 3 proves

The full generation-to-delivery pipeline now works end to end against real services, per the controller-run evidence: **Claude (`claude-sonnet-5`) → cleaned plain text (no Markdown, no emoji) → parsed sections (title + level/answer-key headers) → a paginated A4 PDF → a public Supabase Storage URL (verified HTTP 200, `content-type: application/pdf`) → a WhatsApp-ready message/document, built by `TwilioMessenger` and verified at the transport boundary against a mocked Twilio client (`test/twilio.test.ts`)**. A real Twilio send to a live WhatsApp number was not exercised by this gate. Three real generations against three different skill/subject/grade/board combinations all produced correctly-sectioned, grade-appropriate, plain-text output within budget and latency targets.

---

## Case 1 — Suite green (QA-tester)

**Steps:** `npm run typecheck && npm test`
**Expected:** both succeed; all green with 2 skipped (both `.int.test.ts` files, which skip without env — correct, not a failure).

**Actual:**
- `npm run typecheck` (`tsc -p tsconfig.json`) → exit `0`, no output. No type errors anywhere in `src/` or `test/`.
- `npm test` (`vitest run`) → exit `0`. Exact summary lines:
  ```
   Test Files  15 passed | 2 skipped (17)
        Tests  159 passed | 2 skipped (161)
     Start at  20:02:08
     Duration  1.11s (transform 540ms, setup 0ms, import 1.95s, tests 484ms, environment 2ms)
  ```
  The 2 skipped files are `test/supabase.int.test.ts` and `test/storage.int.test.ts`, both guarded by `describe.skipIf(!url || !key)` (confirmed by inspection — `grep -n "skipIf" test/*.int.test.ts` shows the guard in both files). Skipping with no `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` set is the expected, correct behaviour for this QA agent's credential-less environment, not a failure — the controller ran these live under Case 2 below.

**Verdict: PASS**

---

## Case 2 — Integration tests against LIVE Supabase (controller-run)

**Command** (env pulled individually with `grep`/`cut` — `source .env` breaks because `NUDGE_CRON=*/10 * * * *` is unquoted):
```
export SUPABASE_URL=$(grep '^SUPABASE_URL=' .env|cut -d= -f2-)
export SUPABASE_SERVICE_ROLE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env|cut -d= -f2-)
export SUPABASE_PDF_BUCKET=$(grep '^SUPABASE_PDF_BUCKET=' .env|cut -d= -f2-)
npx vitest run test/supabase.int.test.ts test/storage.int.test.ts
```

**Actual output:**
```
 Test Files  2 passed (2)
      Tests  2 passed (2)
   Duration  3.58s
```

Proves, end to end, against the live project: the `worksheets` bucket was created; a real pdfkit-built PDF was uploaded with `contentType: application/pdf`; `fetch(publicUrl)` returned **HTTP 200** with a `content-type` containing `application/pdf` (asserted inside `storage.int.test.ts`); and a full teacher → event → generation DB round-trip completed with cascade cleanup (`supabase.int.test.ts`).

**Verdict: PASS** (transcribed from controller evidence; not re-run by this QA agent — no credentials available)

---

## Case 3 — Real generation look-check, 3 runs against live `claude-sonnet-5` (controller-run)

**Command shape:** `npx tsx scripts/try-generate.ts <skill> "<topic>" "<grade>" <subject> <board>`

| Run | Config | Latency | Tokens in/out | Sections parsed | Chunks | Cost |
|---|---|---|---|---|---|---|
| A | worksheet · Maths · Middle (6-8) · CBSE · "Comparing fractions with unlike denominators" | 9,726 ms | 637 / 911 | 4/4 — LEVEL 1 - SUPPORT \| LEVEL 2 - ON LEVEL \| LEVEL 3 - CHALLENGE \| ANSWER KEY | 2 | ~$0.0104 |
| B | quiz · Science · Middle (6-8) · CBSE · "Photosynthesis: inputs and outputs" | 5,155 ms | 558 / 356 | 2/2 — EXIT TICKET \| ANSWER KEY | 1 | ~$0.0047 |
| C | worksheet · English · Primary (1-5) · State board · "Using is, am and are correctly" | not captured (output tail truncated the header line) | ~same magnitude as A | 4/4 — all headers | 2 | ~$0.01 |

Criteria check (all three runs):
- Sections parsed: **PASS** — 4/4 for worksheets, 2/2 for the quiz; titles parsed correctly.
- No Markdown / no emoji in model output: **PASS** — all output plain text (no `**`, `#`, backticks, LaTeX).
- Answer key present: **PASS** — all three, with working shown for Level 3 in run A.
- Grade-appropriate: **PASS** — run A scaffolds LCM/equivalent fractions at L1 → standard comparison at L2 → multi-step word problems at L3 (Indian names used). Run B is 3 recall + 2 application exactly as prompted. Run C (Primary English) is age-appropriate: fill-in-the-blank → choose-the-word → error-correction+explain.
- Latency < 30 s: **PASS** (9.7 s and 5.2 s measured).
- Chunks ≤ 3: **PASS** (2, 1, 2).
- No prompt tweaks needed — no fix task raised against Task 5's skill prompts.

**Verdict: PASS (automatable portion)** (transcribed from controller evidence; not re-run by this QA agent — real paid API calls are out of scope for QA)

---

## Case 4 — Negative/guard checks (QA-tester)

Method: read the source guarantee, point at the existing unit test that pins it, and additionally run a throwaway `npx tsx` script (outside the repo, in the session scratchpad) that imports the three adapter modules directly by file URL — deliberately bypassing `src/config.ts` so no environment variables are needed — and exercises each guarantee live. The script printed the transcript below, then was deleted; it was never added to git.

### a. `buildMessageParams` never sends `temperature`/`top_p`/`top_k`, and only Sonnet gets `thinking`+`output_config`

**Source** (`src/adapters/anthropic.ts:27-30`):
```ts
// Never send temperature/top_p/top_k (400 on Sonnet 5).
return supportsAdaptiveEffort(model)
  ? ({ ...base, thinking: { type: 'adaptive' }, output_config: { effort: 'low' } } as Anthropic.MessageCreateParamsNonStreaming)
  : base;
```
`supportsAdaptiveEffort` returns `!model.startsWith('claude-haiku')`, so every model except Haiku gets the `thinking`/`output_config` branch, and `base` (built at line 21-26) never sets `temperature`, `top_p` or `top_k` in either branch — there is no code path that adds them.

**Pinned by:** `test/anthropic.test.ts:18-32`, `describe('buildMessageParams', …)` — two `it` blocks: "uses adaptive thinking + low effort on Sonnet and never sends temperature" and "omits thinking/effort on Haiku (unsupported there)". Both pass under Case 1.

**Live verification (throwaway script):**
```
sonnet keys: max_tokens, messages, model, output_config, system, thinking
sonnet has temperature/top_p/top_k: false false false
sonnet thinking: {"type":"adaptive"}  output_config: {"effort":"low"}
haiku keys: max_tokens, messages, model, system
haiku has temperature/top_p/top_k: false false false
haiku has thinking/output_config: false false
```

**Verdict: PASS** — this guard is load-bearing (Sonnet 5 returns HTTP 400 if `temperature` is sent) and holds for both models.

### b. `toPdfSafe` strips emoji and swaps ₹ → `"Rs. "`

**Source** (`src/adapters/pdf.ts:5-13`):
```ts
export function toPdfSafe(s: string): string {
  return s
    .replace(/\p{Extended_Pictographic}|\uFE0F|\u200D/gu, '')
    .replace(/\u20B9\s?/g, 'Rs. ')
    .replace(/→/g, '->')
    .replace(/←/g, '<-')
    .replace(/[ \t]+$/gm, '')
    .trim();
}
```

**Pinned by:** `test/pdf.test.ts:4-9`, `describe('toPdfSafe', …)`: `toPdfSafe('Pay ₹100 ✅ today 🎉')` → `'Pay Rs. 100  today'`, and `toPdfSafe('a → b')` → `'a -> b'`.

**Live verification (throwaway script):**
```
input : "Pay ₹100 for the trip ✅ 🎉 → done ← back"
output: "Pay Rs. 100 for the trip   -> done <- back"
rupee sign gone: true  "Rs. " present: true
emoji gone: true
```

**Verdict: PASS.** Observation (not a failure, not a new deferred item — noted only because it's visible in the transcript above): removing an emoji leaves its surrounding whitespace in place, so a run of emoji can leave a double space in the PDF body text (e.g. `"the trip   -> done"` above). Cosmetic only; pdfkit will render a slightly wider gap, nothing garbled.

### c. `MAX_BODY` in `src/adapters/twilio.ts` throws before any network call for a body over 1500 chars

**Source** (`src/adapters/twilio.ts:8, 26`):
```ts
export const MAX_BODY = 1500; // Twilio hard limit is 1600 (error 21617)
...
async sendText(to: string, body: string): Promise<SendResult> {
  if (body.length > MAX_BODY) throw new Error(`message body too long (${body.length} > ${MAX_BODY})`);
  return this.send({ from: this.opts.from, to, body, ...this.callback() });
}
```
The throw happens before `this.send(...)` is ever called, so the injected Twilio client's `messages.create` is provably never reached for an over-limit body.

**Pinned by:** `test/twilio.test.ts:26-31`, "refuses bodies over MAX_BODY": asserts the call rejects with `/too long/` **and** `expect(create).not.toHaveBeenCalled()`.

**Live verification (throwaway script, using a fake client that flips a flag on `create()`):**
```
MAX_BODY = 1500
threw as expected: message body too long (1501 > 1500)
network call attempted: false
body === MAX_BODY was sent to client (no throw): true
```
This also confirms the exact boundary: a body of precisely 1500 chars is accepted and reaches the client; 1501 throws. `MAX_BODY` leaves a 100-char margin below Twilio's real hard cap of 1600 (error 21617).

**Verdict: PASS**

---

## Case 5 — Cost sanity (controller-run)

Pricing `claude-sonnet-5` = $2 / MTok in, $10 / MTok out.
- Run A: (637/1e6 × 2) + (911/1e6 × 10) = $0.00127 + $0.00911 = **$0.0104**
- Run B: (558/1e6 × 2) + (356/1e6 × 10) = $0.00112 + $0.00356 = **$0.0047**

Both ≤ the $0.02/generation budget. Projected pilot spend (50 teachers × 3 generations × ~$0.01) ≈ **$1.50**.

**Verdict: PASS** (transcribed from controller evidence)

---

## PDF structural verification (controller-run, on `out/worksheet.pdf` from Case 3 run C)

```
magic          : %PDF-1.3
bytes          : 3683
ends with EOF  : true
page objects   : 2          <- pagination genuinely works on real content
fonts embedded : Helvetica, Helvetica-Bold, Helvetica-Oblique
has Title meta : true
```
`out/` is git-ignored (`git check-ignore -q out` succeeds); working tree clean; no PDFs committed.

**Verdict: PASS** (transcribed from controller evidence; this QA agent did not open or re-derive `out/worksheet.pdf`)

### PDF visual check — STILL A TRUE HUMAN STEP

Visually opening the PDF to judge layout/legibility. `pdftoppm`/poppler is not installed on this machine and the controller did not install system packages unprompted. Tushar should run:
```
npm run try:generate -- worksheet "Comparing fractions with unlike denominators"
open out/worksheet.pdf
```
and confirm the layout reads well on a phone and in print.

**Verdict: PENDING-HUMAN**

---

## Known deferred minors (carried forward into Phase 3)

None of these are regressions from this gate's changes — they are pre-existing behaviours worth keeping visible so they aren't lost before the pilot:

1. **`splitIntoSections` requires an exact header match.** `src/bot/postprocess.ts:44`: `const h = wanted.get(normHeader(trimmed));` looks up the normalized line in a fixed map built from the skill's declared headers. `normHeader` (lines 22-30) only folds dash variants, strips trailing `:`/`.`, collapses whitespace and upper-cases — it does **not** strip trailing annotations. So a model-emitted header like `"LEVEL 1 - SUPPORT (5Q)"` would **not** match `"LEVEL 1 - SUPPORT"` and would fall through into the body of whatever section preceded it, rather than starting a new section. Not observed in the three live runs in Case 3 (all headers came back exactly as prompted), but the prompt does not structurally forbid the model from adding a suffix.
2. **`ensurePublicBucket` ignores `getBucket`'s error.** `src/adapters/storage.ts:6-7`: `const { data } = await sb.storage.getBucket(name); if (data) return;` discards the `error` half of the response. A transient network fault on `getBucket` (not just a genuine "bucket does not exist") is indistinguishable from "bucket missing" and falls through to `createBucket`, which is caught only if Supabase's error message happens to match `/already exists/i`. A different transient failure shape on `createBucket` would throw a possibly-confusing error instead of a clean retry.
3. **`src/adapters/twilio.ts:47` logs `console.error` for every `RestException`, including the routine, expected codes 63016 (outside the 24h session window) and 63015 (sandbox join expired).** Sandbox joins expire after 3 days, so 63015 will recur routinely during the pilot. Logging these at ERROR level risks masking genuine faults in log noise/alerting; a WARN or INFO level (or filtering these two codes) would better match their "expected, handled" status — the code already correctly maps both to `{ok: false, errorCode}` instead of throwing, so this is a log-hygiene note, not a correctness bug.

---

## Summary

| Case | Description | Attribution | Verdict |
|---|---|---|---|
| 1 | Suite green — typecheck + full test run (159 passed / 2 skipped, 17 files) | QA-tester | PASS |
| 2 | Integration tests against live Supabase (DB round-trip + Storage upload/public URL) | controller-run | PASS |
| 3 | Real generation look-check, 3 runs against live `claude-sonnet-5` | controller-run | PASS |
| 4 | Negative/guard checks — no temperature/top_p/top_k; Sonnet-only thinking; `toPdfSafe`; `MAX_BODY` guard | QA-tester | PASS |
| 5 | Cost sanity (both runs within $0.02/generation budget) | controller-run | PASS |
| — | PDF structural verification (`%PDF-1.3`, 2 pages, fonts embedded, Title meta) | controller-run | PASS |
| — | PDF visual/layout check | — | PENDING-HUMAN (Tushar) |

**Overall Phase 3 gate: all executable cases (1, 2, 3, 4, 5, PDF structural) PASS.** The full generation → PDF → storage → delivery-ready pipeline is verified against real services. Only the human PDF layout look-check remains open. Three non-blocking, pre-existing minors are carried forward above for pilot awareness, none of which blocks this gate.
