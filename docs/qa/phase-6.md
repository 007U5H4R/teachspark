# Phase 6 QA Gate — TeachSpark · AI Question Paper Generator

**Scope:** Tasks 20–26 (paper domain types + events · Supabase persistence for `teachers.school_*`/`paper_*` and the `papers` table · inbound media parsing and fetching · paper prompts + generator + QC · the `.docx` renderer · the paper wizard state machine and copy · executor actions `store_logo` / `generate_paper` / `render_paper` and the composition-root wiring).
**Tester:** Independent QA agent (did **not** write the Phase 6 implementation).
**Repo state:** branch `phase-6-paper`, HEAD `89ee2b9` (`feat(paper): wire the real paper adapters into the composition root`). Working tree clean before this gate except for the two files it adds.
**Environment:** macOS (Darwin 25.5.0), Node `v26.7.0`, vitest `4.1.11`, TypeScript `7.0.2`.
**Date:** 2026-08-21 (session began the evening of 2026-08-20; the run timestamps below cross midnight).
**Credentials:** this QA agent has no access to `.env` and did not read, print, source, export or commit it. Nothing touching live Supabase / Twilio / Anthropic was run: no `*.int.test.ts`, no `npm run dev`, no `node dist/index.js`, no `try:paper` / `try:render` / `try:generate`, no `railway` command. **No merge to `main` and no deploy was performed** — see Case 8.
**New QA artefacts:** `test/qa-paper-e2e.test.ts` (15 new tests) and this checklist. No source file and no existing test file was modified.

---

## Phase 6 regression scope

Case 1 runs `npm test` — the **entire** suite — so it exercises **Tasks 1–26 together**, not just the newest slice. A green Case 1 is simultaneously the regression gate for Phases 1–5. The load-bearing question for Phase 6 is *"is a teacher who never types `PAPER` unaffected?"*, so the five core-loop suites are additionally run on their own and reported separately below.

Test files covering Phase 6 specifically:

- `test/paper-fakes.test.ts` — the in-memory paper fakes and `samplePaperJson` shape
- `test/paper-storage.test.ts` / `test/supabase-mappers.test.ts` — Task 21 persistence mapping (`paper_request`, `paper_json`, `papers` rows)
- `test/media.test.ts` — Task 22 inbound media parsing + `MediaFetcher`
- `test/paper-prompts.test.ts` / `test/anthropic-paper.test.ts` — Task 23 prompts, structured output, `paperShapeIssues`, QC wiring
- `test/docx.test.ts` — Task 24 `.docx` renderer (header, logo magic-byte gate, tier banners, answer key)
- `test/paper-wizard.test.ts` / `test/paper-copy.test.ts` — Task 25 pure wizard transitions and copy
- `test/paper-executor.test.ts` — Task 26 executor actions
- `test/qa-paper-e2e.test.ts` — **this gate** (Cases 2 and 3 below)

Case 2 is the layer no unit test reaches: it drives the **real Express app → real inbound handler → real executor → real core state machine → real paper wizard → real adapters-facing action dispatch** as one system over HTTP, with only the I/O edges (Twilio send, Twilio media download, Anthropic, Supabase rows, Supabase Storage) replaced by the in-memory fakes in `src/adapters/memory.ts`. Nothing about the conversation logic is mocked, and the suite has zero live side effects and zero cost.

---

## What Phase 6 proves — and what it does not

**Proves.** A teacher can now walk the entire question-paper journey through the HTTP surface Twilio actually calls. Sixteen Twilio-shaped urlencoded POSTs — one of them carrying a `NumMedia=1` image attachment — take her from first contact to a delivered, editable Word file and an answered impact question, ACKing 200 with empty TwiML every time. The sixteen `paper_*` events fire in exactly the PRD order with no rejections and no `error_occurred`; a Devanagari chapter name survives the urlencoded webhook intact; the paper name is delivered as a **text immediately before** the document (load-bearing, since WhatsApp documents carry no caption) and the impact question immediately after; a `papers` row is written that matches the delivered `.docx`; every outbound body stays inside the 1500-character WhatsApp limit even though the three-tier preview is genuinely over it and had to be chunked; and the one-time school/logo setup is asked once and never again. Every paper-specific failure edge was then failed on purpose — the media download, the model call, and the Storage upload — and in each case the webhook still ACKed 200, the teacher got a plain-language message rather than silence, and she landed in a state she could act from. The redo cap holds at 3, `RESTART` wipes every scrap of paper state, and the core worksheet loop still completes normally after a paper wizard is abandoned mid-flight.

**Does not prove.** No real photograph has ever been OCR'd by this system — every "lesson page" in this gate is the string `fake-bytes:<url>` returned by `FakeMediaFetcher`, and every paper is a hand-written fixture, not model output. No real `.docx` has ever been opened, on a phone or anywhere else: `FakeDocBuilder` returns the 21-byte buffer `PK-fake-docx:<title>`, so nothing here says whether Word or Google Docs can open the file `src/adapters/docx.ts` actually produces, whether Devanagari renders instead of tofu, or whether the header table and tier banners survive a round-trip. No real Anthropic call has been made, so the token counts and the 2–3 minute latency promise in the copy are unverified, as is the real cost per paper. No `papers` row has ever been written to Postgres — the Phase 6 migration is still unapplied — so the `papers` insert path and the widened `teachers` select have never met a real database. Cases 4–8 exist precisely to close these gaps and are all **PENDING**.

---

## Case 1 — Core regression first, then build health (QA-tester)

**Steps:** `npm test`, then the five core-loop suites on their own, then `npm run typecheck` and `npm run build`.
**Expected:** all exit 0; 2 skipped test files, both the env-gated `.int.test.ts` suites (correct, not failures); the core-loop suites all green.

**Baseline before this gate's additions** (`npm test`, HEAD `89ee2b9`, clean tree):
```
 Test Files  30 passed | 2 skipped (32)
      Tests  320 passed | 2 skipped (322)
   Start at  23:55:49
   Duration  3.75s (transform 2.73s, setup 0ms, import 8.53s, tests 3.33s, environment 13ms)
```
This matches the expected pre-gate figure exactly (~320 passed / 2 skipped).

**Actual, with `test/qa-paper-e2e.test.ts` added:**
```
 Test Files  31 passed | 2 skipped (33)
      Tests  335 passed | 2 skipped (337)
   Start at  00:02:24
   Duration  2.91s (transform 1.90s, setup 0ms, import 6.17s, tests 3.19s, environment 7ms)
```
Delta: **+1 file, +15 tests**, all from this gate. Skips unchanged at 2.

**Core-loop suites run explicitly** (`npx vitest run test/machine.test.ts test/executor.test.ts test/handle.test.ts test/qa-conversation.test.ts test/qa-e2e.test.ts`):
```
 Test Files  5 passed (5)
      Tests  74 passed (74)
   Start at  00:02:30
   Duration  878ms (transform 803ms, setup 0ms, import 1.45s, tests 356ms, environment 5ms)
```
All five suites that guard the worksheet/quiz journey are green — **a teacher who never types `PAPER` is unaffected by Phase 6.** Case 3(f) below re-proves this end to end over HTTP.

- `npm run typecheck` (`tsc -p tsconfig.json`) → exit `0`, no output. `tsc --listFiles` confirms `test/qa-paper-e2e.test.ts` is inside the typecheck program, so the new file is genuinely type-checked, not merely present.
- `npm run build` (`tsc -p tsconfig.build.json`) → exit `0`, no output.

The 2 skipped files are `test/supabase.int.test.ts` and `test/storage.int.test.ts`, both guarded by `describe.skipIf(!url || !key)` (verified by grep). Skipping without `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` is the expected, correct behaviour in this credential-less environment.

**Verdict: PASS**

---

## Case 2 — Supertest end-to-end paper flow (QA-tester)

**Harness.** `createApp` wired with a **real** `createInboundHandler` over `ExecutorDeps` built entirely from `src/adapters/memory.ts` fakes, `TWILIO_VALIDATE_SIGNATURE: false`. Every POST is a Twilio-style urlencoded form; the photo turn sends `NumMedia=1`, `MediaUrl0`, `MediaContentType0=image/jpeg`. Because `createApp` ACKs 200 and dispatches via an un-awaited `setImmediate`, every POST goes through a `post()` helper that `await vi.waitFor(...)`s on a settle counter before any assertion runs.

**The wizard sequence was derived by reading `src/bot/paper/wizard.ts` and `src/bot/paper/copy.ts`, not guessed.** Two things the original sketch got wrong and the source corrected:

1. `PAPER_SUBJECT` does **not** ask for a school subject — it asks which **language** the paper is for (`copy.askLanguage()`, `LANGUAGE_OPTIONS` = English / Hindi / free-text regional name). It writes both `request.subject` and `request.language`.
2. The answer-key question is followed by the school/logo prompts **only while `teacher.schoolName === null`** (`wizard.ts` `case 'PAPER_KEY'`). On a second paper, `PAPER_KEY` calls `startGeneration` directly. Case 2(h) pins this.

The real sequence exercised: `paper` → language `2` (Hindi) → chapter `टोपी शुक्ला` → photo → `DONE` → type `3` (Question paper) → tiers `1` (all three) → key `1` (yes) → school name → `SKIP` (logo) → generation → preview → `1` (Get the Word file) → impact `2` (about an hour) → IDLE.

### Required assertions

| # | Required | Result |
|---|---|---|
| 1 | Ordered `paper_*` event sequence | PASS — exact 16-name `toEqual`, test (b) |
| 2 | Paper-name TEXT immediately **before** `send_document` | PASS — test (c) |
| 3 | A `papers` row was saved | PASS — test (d) |
| 4 | Every outbound text ≤ 1500 chars | PASS — test (e) |
| 5 | Final teacher state | PASS — `IDLE`, test (g) |

### Evidence

`npx vitest run test/qa-paper-e2e.test.ts --reporter=verbose` — all 15 green:
```
 ✓ QA Case 2 … > (a) every inbound POST — including the photo — is ACKed 200 with empty TwiML 56ms
 ✓ QA Case 2 … > (b) emits the paper_* events in exactly the PRD order, with no rejections or errors 15ms
 ✓ QA Case 2 … > (b2) the captured event payloads round-trip the teacher's real answers, Devanagari included 14ms
 ✓ QA Case 2 … > (c) the paper-name TEXT is delivered immediately BEFORE the document (WhatsApp docs carry no caption) 13ms
 ✓ QA Case 2 … > (d) a papers row is saved, matching the delivered docx 14ms
 ✓ QA Case 2 … > (e) every outbound text is within the 1500-char WhatsApp limit — and the preview really was split 12ms
 ✓ QA Case 2 … > (f) the media, generator, docx builder and store all received the real request 12ms
 ✓ QA Case 2 … > (g) lands the teacher IDLE with the school remembered and no core skill falsely completed 12ms
 ✓ QA Case 2 … > (h) a SECOND paper skips the one-time school/logo setup entirely 17ms
 ✓ QA Case 3 … > (a) media download fails: she is returned to PAPER_MEDIA with a clear retry ask, not stranded 21ms
 ✓ QA Case 3 … > (b) paper generation throws: apology + IDLE, paper_generation_failed and error_occurred logged 12ms
 ✓ QA Case 3 … > (c) docx upload fails: no crash, error_occurred logged, and she is told — not left silently empty-handed 12ms
 ✓ QA Case 3 … > (d) the redo cap is enforced — she cannot loop forever 14ms
 ✓ QA Case 3 … > (e) RESTART mid-wizard wipes every scrap of paper state 10ms
 ✓ QA Case 3 … > (f) the CORE worksheet flow still completes normally after an abandoned paper wizard 32ms

 Test Files  1 passed (1)
      Tests  15 passed (15)
```

**(a) Every POST ACKs 200.** All 16 inbound POSTs (4 onboarding + 12 wizard turns) return `200`, `content-type` containing `xml`, body containing `<Response/>` — including the attachment turn. Twilio never sees a retryable error.

**(b) The `paper_*` sequence is asserted as an exact ordered list**, not a containment check:
```
paper_started · paper_subject_captured · paper_chapter_captured · paper_media_received ·
paper_media_done · paper_type_captured · paper_tiers_captured · paper_key_captured ·
paper_school_captured · paper_logo_captured · paper_generation_started · paper_generated ·
paper_qc_completed · paper_preview_sent · paper_exported · paper_minutes_saved
```
plus `not.toContain` on `error_occurred`, `paper_media_rejected` and `paper_generation_failed`.

**(b2) Payloads round-trip.** `paper_subject_captured{value:'Hindi'}`, `paper_chapter_captured{value:'टोपी शुक्ला'}` (**UTF-8 Devanagari survives the urlencoded webhook**), `paper_media_received{count:1}`, `paper_type_captured{value:'question_paper'}`, `paper_tiers_captured{tiers:['A','B','C']}`, `paper_key_captured{teacherVersion:true}`, `paper_school_captured{skipped:false}`, `paper_logo_captured{stored:false}`, `paper_generation_started{chapter:'टोपी शुक्ला',mediaCount:1}`, `paper_generated{tiers:3,totalMarks:60}`, `paper_qc_completed{pass:true,repaired:false}`, `paper_preview_sent{tiers:3,qcPass:true}`, `paper_minutes_saved{minutes:60}`.

**(c) Delivery ordering.** Exactly one document is sent, its URL ends `.docx`, and on the `sent` array: `sent[docIdx-1]` is a **text** containing `Here comes your paper`, the paper's title, and `AI can make mistakes`; `sent[docIdx+1]` is a **text** containing `how long would making this paper have taken you by hand`. This is `afterPaperRender`'s three-action ordering proven through the real messenger, not asserted on the pure step.

**(d) The `papers` row.** One row; `docxUrl` identical to the URL actually sent as the document; `totalMarks: 60` (3 tiers × 20); `redoCount: 0`; `pageCount: 1`; `request` matching `{subject:'Hindi', language:'Hindi', chapter:'टोपी शुक्ला', assessmentType:'question_paper', tiers:['A','B','C'], teacherVersion:true, adjustment:null}`.

**(e) The 1500-char limit has teeth.** The fixture is a deliberately large **three-tier** paper (`BIG_PAPER`), not `samplePaperJson`'s single tier. The test asserts `buildPreviewText(BIG_PAPER, []).length > MAX_CHUNK` — i.e. the preview genuinely exceeds 1500 and `chunkText` *had* to split it — and separately that no outbound body exceeds 1500, and that at least two distinct texts carry tier headings (proving the split actually happened rather than the whole preview landing in one message). `MAX_CHUNK` is pinned at `1500`.

**(f) The edges received the real request.** `mediaFetcher.fetched` = `[the photo URL]`; one `generatePaper` call with one fetched media item and profile `{grade:'High (Classes 9-12)', subject:'Other', board:'CBSE'}`; exactly one `qcPaper` call; one `buildPaperDocx` call with `teacherVersion: true`, `branding` exactly `{schoolName:'Zilla Parishad High School, Wardha', logo:null}` and a 3-tier paper; one stored docx with non-zero bytes; zero stored logos (she skipped it).

**(g) Final state.** `state: 'IDLE'`, `schoolName` persisted, `schoolLogoUrl: null`, `paperRedoCount: 0`, `paperJson.title` retained, `retries: 0`, and `skillsCompleted: []` — the paper flow correctly does **not** mark a core skill complete. The last text carries the join link and `Type *PAPER* for another paper`.

**(h) Second paper.** After the first paper completes, a second run emits `paper_started … paper_key_captured` then jumps **straight to `paper_generation_started`** with no `paper_school_captured` / `paper_logo_captured`, landing in `PAPER_PREVIEW`. The second request is `{tiers:['A'], teacherVersion:false, media:[]}` — chapter-knowledge mode via `SKIP` at the media step also works.

### Anti-vacuity check (negative control)

To prove the two load-bearing assertions are not passing trivially, both were deliberately mutated **in this gate's own new file** (no existing file was touched), re-run, and reverted:

- swapped `paper_exported` and `paper_preview_sent` in the expected event list;
- changed the "text before document" index from `docIdx - 1` to `docIdx + 2`.

```
     × (b) emits the paper_* events in exactly the PRD order, with no rejections or errors 21ms
     × (c) the paper-name TEXT is delivered immediately BEFORE the document (WhatsApp docs carry no caption) 16ms
AssertionError: expected [ 'paper_started', …(15) ] to deeply equal [ 'paper_started', …(15) ]
AssertionError: expected '🙏 That\'s time back in your week! Kn…' to contain 'Here comes your paper'
      Tests  2 failed | 13 passed (15)
```
Both mutations failed as required; both were reverted and the suite returned to 15/15 green.

**Verdict: PASS**

---

## Case 3 — Failure injection on the paper path (QA-tester)

Every case below asserts the webhook still returns **200** so Twilio never retries, and that the teacher is left somewhere she can act from.

### 3(a) Media download fails — `FakeMediaFetcher.failWith`

`runPaperGeneration` catches each per-item fetch failure, logs `paper_media_rejected{reason:'fetch_failed', url}`, and — because `request.media.length > 0 && fetched.length === 0` — produces `{ok:false, reason:'no_readable_media'}` **without ever calling the model**. `afterPaperGeneration` then returns her to `PAPER_MEDIA` with `paperRequest.media` cleared and sends `copy.mediaUnreadable()`.

Asserted: ACK 200; `state === 'PAPER_MEDIA'` (not stranded in `PAPER_GENERATING`); `paperRequest.media === []`; `retries === 0`; `paper_media_rejected{reason:'fetch_failed'}` and `paper_generation_failed{reason:'no_readable_media'}` both logged; **`paperGenerator.calls === []`** — no billable model call is made for unreadable pages; last text contains `I couldn't read those pages`; no document sent. Recovery is then proven: with the fetcher healthy she sends a clearer photo, `DONE`, and re-answers type/tiers/key, reaching `PAPER_PREVIEW` with exactly one model call — and is **not** re-asked for her school name.

**Verdict: PASS** (see F3 for the UX friction this recovery path carries.)

### 3(b) Paper generation throws — `FakePaperGenerator.failWith`

Asserted: ACK 200; `state === 'IDLE'` (a sane terminal state, not a dead-end `PAPER_GENERATING`); `retries === 0`; `paper_generation_started` logged, `paper_generation_failed{reason:'error'}` logged, `paper_generated` and `paper_preview_sent` **not** logged; `error_occurred{where:'generate_paper', message:'anthropic 529 overloaded'}` captures the underlying cause; last text contains `that paper didn't come together`; no document; no `papers` row. She then types `paper` and is immediately back in `PAPER_SUBJECT`.

**Verdict: PASS**

### 3(c) Render/upload fails — `FakePaperStore.failWith`

`FakeDocBuilder` succeeds and `storePaperDocx` throws, which is the realistic shape (Supabase Storage 5xx after a successful build).

Asserted: ACK 200; `error_occurred{where:'render_paper', message:'supabase storage 503'}` logged; `paper_exported` **not** logged; no document delivered; **`papers.saved === []`** — correct, the row is only written after a successful upload, so the table never points at a non-existent file; `docBuilder.builds` has length 1, confirming the docx really was built and only the upload failed; the last text is an explicit apology (`that paper didn't come together`), so she is **not** silently left with nothing; the preview she already received is still in her thread (a text containing `TIER A`); all texts ≤ 1500; terminal state `IDLE`, and `paper` restarts cleanly.

**Verdict: PASS** — with finding **F1** recorded below: the already-generated paper is unrecoverable after this failure.

### 3(d) The redo cap is enforced

`MAX_PAPER_REDOS` is pinned at `3`. Three consecutive redo requests each increment `paperRedoCount` and trigger exactly one further generation (`calls.length === i + 1`), and after the third the preview menu reads `used all the redos`. A **fourth** request (`3` — "Make it harder") is refused: `paperGenerator.calls` stays at `4` (1 original + 3 redos), `paperRedoCount` stays at `3`, `state` stays `PAPER_PREVIEW`, exactly three `paper_redo_requested` events exist, and the capped menu is re-sent. She can still take the file, and the saved `papers` row records `redoCount: 3`.

**Verdict: PASS** — the loop is bounded; a teacher cannot burn unlimited model spend.

### 3(e) `RESTART` mid-wizard cleans up paper state

Driven all the way to `PAPER_PREVIEW` (so both `paperRequest` **and** `paperJson` are populated), then `restart`. Asserted: ACK 200; `state === 'AWAITING_GRADE'`; `paperRequest === null`; `paperJson === null`; `paperRedoCount === 0`; `grade`/`subject`/`board` all cleared; `restarted` logged. `schoolName` deliberately **survives** — it is profile data, not wizard state — and that intent is asserted explicitly so a future change to it is a conscious one.

**Verdict: PASS**

### 3(f) The core worksheet flow still completes after an abandoned paper wizard

She starts a paper, reaches `PAPER_MEDIA`, then types `new`. Asserted: she lands in `AWAITING_TOPIC`, supplies a topic, answers impact and referral, and finishes at `state: 'IDLE'` with `skillsCompleted: ['worksheet']`, `currentSkillId: null`, `pendingTopic: null`; `generation_succeeded`, `worksheet_delivered`, `pdf_delivered` and `skill_completed` all logged; **no** `error_occurred` and **no** `generation_failed`; the worksheet text (`LEVEL 1 - SUPPORT`, `ANSWER KEY`) delivered in chunks all ≤ 1500 from a fixture proven longer than 1500; exactly one `.pdf` document delivered; and `paperGenerator.calls === []` / `papers.saved === []` — the abandoned wizard produced no paper artifact and cost nothing.

**Verdict: PASS**

---

## Cases 4–8 — PENDING (not executed by this gate)

### Case 4 — Human phone walkthrough — **PENDING-HUMAN**

**Why pending:** it requires a real phone, real textbook photographs, and a human's eyes. Only Tushar can do it.
**What it must cover:** send real lesson-page photos from WhatsApp; confirm the paper generated from them is faithful to those pages; open the delivered `.docx` **on the phone** in Word and in Google Docs; confirm Devanagari renders as text and not tofu boxes, that the header table and logo lay out correctly, that tier banners and the answer-key section survive; then request a **harder** regeneration and confirm the difficulty genuinely shifts.
**What unblocks it:** nothing technical — it needs the merge + deploy (Case 8), which needs the migration (below), and then a human with a phone.
**Note:** this is the single largest gap. `FakeDocBuilder` returns a 21-byte stub, so **no `.docx` this project has ever produced has been opened by any reader.**

### Case 5 — `curl -sI <docx public url>` → OOXML content-type — **PENDING**

**Why pending:** it needs a real `.docx` uploaded to a real Supabase Storage bucket at a real public URL. This gate uploads to `FakePaperStore`, which returns the fabricated URL `https://example.test/papers/<id>/1.docx`; there is nothing to `curl`.
**Expected when run:** `content-type: application/vnd.openxmlformats-officedocument.wordprocessingml.document` (not `application/octet-stream`, which is what makes WhatsApp and iOS refuse to preview it).
**What unblocks it:** migration applied → merge + deploy → one real paper generated → then `curl -sI` the resulting URL.

### Case 6 — Supabase spot-check of `papers` rows and `paper_*` events — **PENDING**

**Why pending:** `supabase/migrations/20260822000000_paper.sql` has **not been applied to the live database**, so neither the `papers` table nor the five new `teachers` columns exist there. There is also no automated migration runner anywhere in `src/`, `scripts/`, `railway.json` or `package.json` (verified by grep) — applying it is a manual SQL-editor step.
**What it must cover:** a real `papers` row whose `docx_url`, `total_marks`, `tiers`, `page_count` and `redo_count` match the delivered file; and the `paper_*` event rows for that session in order with sane properties.
**What unblocks it:** running the migration in the Supabase SQL editor, then Case 8, then one real paper.

### Case 7 — Cost sanity from real `paper_generated` token counts — **PENDING**

**Why pending:** no paid generation has been made. Every token figure in this gate is `FakePaperGenerator`'s hard-coded `{inputTokens: 5000, outputTokens: 4000}` — a fixture, not a measurement. The `paper_generated` event already carries `model`, `inputTokens`, `outputTokens` and `latencyMs`, so the instrumentation is in place; only the data is missing.
**What it must cover:** real input/output token counts for a photo-fed 3-tier paper (image tokens dominate and are the cost risk), multiplied out to a per-paper rupee figure and checked against the pilot budget; plus whether real latency matches the "2–3 minutes" the copy promises.
**What unblocks it:** one real paid generation after Case 8.

### Case 8 — Merge `phase-6-paper` into `main` + redeploy — **PENDING, GATED. NOT PERFORMED.**

**Why pending — and why this gate deliberately did not do it:** `src/adapters/supabase.ts` `TEACHER_COLUMNS` (line 32) now selects `school_name, school_logo_url, paper_request, paper_json, paper_redo_count`. Those five columns are added **only** by `supabase/migrations/20260822000000_paper.sql`, which is unapplied on the live database. Merging and redeploying before the migration would make **every** teacher read fail with Postgres `42703 column does not exist` — including `findByWaFrom`, which runs on the very first line of every inbound message — taking the live bot down for all users, not just paper users. The controller reports having hit exactly this once already and having had to roll back.

**Ordering that unblocks it (controller + human, in this order):**
1. **Human:** run `supabase/migrations/20260822000000_paper.sql` in the Supabase SQL editor. It is idempotent (`add column if not exists`, `create table if not exists`).
2. **Verify** the five `teachers` columns and the `papers` table exist.
3. **Controller:** merge `phase-6-paper` → `main` and redeploy.
4. Then Cases 5, 6, 7 and 4 become runnable, in that order.

This QA agent ran no `git checkout main`, no `git merge`, no `git push`, and no `railway` command.

---

## Findings raised by this gate

### F1 — A Storage failure at render time permanently strands an already-generated paper (MEDIUM)

In `Executor.runPaperRender`'s catch block (`src/bot/executor.ts`), the teacher is moved to `state: 'IDLE'` and apologised to. Her `paperJson` is *not* cleared, but nothing can reach it any more: there is no path from `IDLE` back into `PAPER_PREVIEW`, and typing `paper` calls `startPaperWizard`, which resets `paperJson: null` and `paperRequest` to a fresh request. So a transient Supabase Storage blip costs her a paper she waited 2–3 minutes for and costs the project a paid generation, and her only option is to redo the whole wizard and pay for it again. Contrast the worksheet path, which deliberately isolates its failures so a billed generation is never lost (the `generations.save` and PDF try/catch blocks). Proven by Case 3(c). **Suggested fix (not applied):** on a `render_paper` failure, leave her in `PAPER_PREVIEW` rather than `IDLE` so the "Get the Word file" option can simply be retried against the paper already in `paperJson`. Not a launch blocker — the failure is rare and she is told — but worth one line before the pilot scales.

### F2 — `currentSkillId` is left set throughout the paper flow (LOW, cosmetic)

`startPaperWizard` and `paperTransition` never touch `currentSkillId`, so a teacher who was in `AWAITING_TOPIC` for the worksheet skill and typed `paper` finishes her paper still carrying `currentSkillId: 'worksheet'`. Harmless today (nothing in the paper path reads it, and the core machine recomputes it via `nextSkillFor` on re-entry), but it makes `teachers` rows read misleadingly during a paper session and could confuse a future funnel query. Observed in Case 2(g).

### F3 — `no_readable_media` recovery re-asks type/tiers/key (LOW, UX friction)

`afterPaperGeneration`'s `no_readable_media` branch returns the teacher to `PAPER_MEDIA` with only `media` cleared — the rest of `paperRequest` (assessment type, tiers, teacher version) is preserved in state, but the wizard's linear ordering walks her through `PAPER_TYPE → PAPER_TIERS → PAPER_KEY` again anyway, so she re-answers three questions she has already answered. The preserved values are simply overwritten with the same answers. Not incorrect, and the school/logo setup *is* correctly skipped, but on a flaky connection this is three extra round-trips per retry. Observed in Case 3(a).

### F4 — An abandoned paper wizard leaves `paperRequest` populated (INFORMATIONAL, not a defect)

`new` (and any core-loop re-entry) does not clear `paperRequest`, so a half-filled request can sit in the row indefinitely. This is safe because `startPaperWizard` always writes `freshRequest(profile)` before the next paper begins — verified by reading `wizard.ts` and exercised by Case 3(f). Recorded so a future reader does not mistake stale `paper_request` JSON in the `teachers` table for live state.

---

## Known deferred items carried forward

These were accepted in earlier phases and remain open. None is a Phase 6 regression.

1. **`image-size` stays in the dependency tree with no upstream fix.** `npm ls image-size` → `image-size@2.0.2`. The advisory (GHSA-w3rx-r6r6-pgpr) is a DoS in its magic-byte-dispatched parsers for formats such as ICNS/JXL/HEIF. It is mitigated at the **only** call site: `src/adapters/docx.ts` gates `imageSize()` behind `logoKind()`, a byte-level JPEG (`FF D8 FF`) / PNG (`89 50 4E 47 0D 0A 1A 0A`) check, and renders without a logo when the check fails. **The mitigation is call-site-local, not library-wide** — any *future* call site that hands `imageSize()` unvalidated bytes reintroduces the exposure and needs the same guard. Worth a comment on the import if a second call site ever appears.
2. **The nudge sweep reads a stale snapshot.** `createNudgePass` in `src/jobs/nudges.ts` calls `findNudgeDue(now)` once and then iterates that array, re-reading nothing; a teacher whose state changes mid-sweep is acted on using the state as of the query. Serialization (`running`) prevents two *sweeps* overlapping, but not a sweep racing an inbound message. Acceptable for a single-instance pilot with a 20-hour nudge delay. Phase 6 touched this file only to add the `isPaperState(t.state) → continue` branch that parks a nudge for a teacher mid-paper-wizard; that branch reads the same snapshot and inherits the same caveat.
3. **`error_occurred` carries several different property shapes depending on origin.** Observed shapes: `{action, errorCode}` and `{action, errorCode, message}` (send failures, `Executor.runAction`), `{where:'generate', message}`, `{where:'logo', message}`, `{where:'generate_paper', message}`, `{where:'render_paper', message}` (executor internals) and `{where:'handle', message}` (`createInboundHandler`). Phase 6 added three of the `where` variants. Any analytics that groups on `error_occurred` must branch on shape rather than assume one.
4. **`generations.save` failure silently drops `generation_succeeded`** (Phase 4 F-item, pinned by `test/qa-e2e.test.ts` case 3(d2)). Unchanged by Phase 6. The paper path has the analogous isolation around `papers.save` — a `papers` table blip is console-only and does not block delivery — but, unlike the worksheet path, no telemetry event is lost with it, because `paper_generated` and `paper_qc_completed` are logged **before** the render step.

---

## Summary

| Case | What | Verdict |
|---|---|---|
| 1 | Core regression + build health | **PASS** — 335 passed / 2 skipped; core-loop suites 74/74; typecheck 0; build 0 |
| 2 | Supertest end-to-end paper flow | **PASS** — 9 tests, all 5 required assertions met |
| 3(a) | Media download failure | **PASS** |
| 3(b) | Paper generation failure | **PASS** |
| 3(c) | Render/upload failure | **PASS** — with finding F1 |
| 3(d) | Redo cap enforced | **PASS** |
| 3(e) | `RESTART` cleans up paper state | **PASS** |
| 3(f) | Core worksheet flow unaffected | **PASS** |
| 4 | Human phone walkthrough, real photos, real `.docx` | **PENDING-HUMAN** |
| 5 | `curl -sI` docx content-type | **PENDING** — needs a live upload |
| 6 | Supabase `papers` / `paper_*` spot-check | **PENDING** — needs the migration applied |
| 7 | Cost sanity from real token counts | **PENDING** — needs a real paid generation |
| 8 | Merge + redeploy | **PENDING, GATED** — blocked on the human migration; **deliberately not performed** |

**Gate outcome: PASS for everything executable without live credentials or a human.** All eight executed cases pass, with four findings recorded (F1 medium, F2–F4 low/informational) and four deferred items carried forward. Phase 6's conversation logic, event instrumentation, delivery ordering, failure handling and core-loop isolation are proven as one system over HTTP. What remains unproven is everything that requires real bytes: a real photograph read by the model, a real `.docx` opened by a real reader, a real row in Postgres, and a real invoice. Cases 4–7 exist to close exactly that, and all of them sit behind the manual migration and the gated merge in Case 8.
