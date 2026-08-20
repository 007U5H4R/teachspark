# Phase 4 QA Gate — TeachSpark

**Scope:** Tasks 13–16 (executor + inbound handler · Express app with the Twilio webhook, status callback, `/admin/metrics` and `/internal/cron/nudges` · nudge sweep + in-process cron + the real composition root · events CSV export).
**Tester:** Independent QA agent (did not write the Phase 4 implementation).
**Repo state:** branch `main`, HEAD `d7d6406` (`fix(jobs): serialize nudge sweeps, drain on shutdown, and stop gating /health on supabase`). Working tree clean before this gate except for the two files it adds.
**Environment:** macOS (Darwin 25.5.0), Node `v26.7.0`, vitest `4.1.11`, TypeScript `7.0.2`.
**Date:** 2026-08-20.
**Credentials:** this QA agent has no access to `.env` and did not read, print, source, export or commit it. Nothing touching live Supabase / Twilio / Anthropic was run here — no `*.int.test.ts`, no `npm run dev`, no `node dist/index.js`, no ngrok, no `scripts/export-events.ts`. The live smoke test of the composition root was executed beforehand by the controller; §4A transcribes that evidence, attributed **controller-run**, from `.superpowers/sdd/implementation/qa4-controller-evidence.md`. Cases 1, 2, 3 and 5 were executed directly by this QA agent, attributed **QA-tester**.
**New QA artefacts:** `test/qa-e2e.test.ts` (18 new tests) and this checklist. No source file and no existing test file was modified. One throwaway `npx tsx` evidence script ran outside the repo in the session scratchpad (in-memory fakes only, no live services); it was never added to git.

## Phase 4 regression scope

Case 1 runs `npm test` — the **entire** suite — so it exercises **Tasks 1–16 together**, not just the newest task. A green Case 1 is simultaneously the regression gate for Phases 1, 2 and 3. Test files covering Phase 4 specifically:

- `test/executor.test.ts` — Task 13 (`Executor.runStep`, send/generation action handling, send-throw and save-failure resilience)
- `test/handle.test.ts` — Task 13 (`createInboundHandler`, teacher creation, per-handler in-flight guard, never-throws contract)
- `test/app.test.ts` / `test/health.test.ts` — Task 14 (webhook ACK + async dispatch, status callback, `/admin/metrics`, `/internal/cron/nudges`, `/health`)
- `test/nudges.test.ts` — Task 15 (`createNudgePass` sweep semantics, serialization, `whenIdle` drain, `startNudgeCron` validation)
- `test/funnel.test.ts` — Task 16 support (`computeFunnel`, the shape `/admin/metrics` and the CSV export both read)
- `test/qa-e2e.test.ts` — **this gate** (cases 2, 3 and 5 below)

Case 2 is the layer no unit test reaches: it drives the **real Express app → real inbound handler → real executor → real state machine → real nudge sweep** as one system over HTTP, with only the four I/O edges (Twilio, Anthropic, Supabase rows, Supabase Storage) replaced by the in-memory fakes in `src/adapters/memory.ts`. Nothing about the conversation logic is mocked, and the suite has zero live side effects.

## What Phase 4 proves

A real WhatsApp teacher's whole journey now runs end to end **through the HTTP surface Twilio actually calls**, not just through the pure machine. A Twilio-shaped urlencoded POST is ACKed inside Twilio's 15 s window with empty TwiML, the work is done off the request path, and seven inbound messages carry one teacher from first contact to an activated, IDLE state with the worksheet skill completed, 27 funnel events logged, 10 outbound messages all inside the 1500-character WhatsApp limit, and a PDF delivered as a document. A due nudge sweep, triggered through the secret-gated cron endpoint exactly as the pilot's scheduler will trigger it, returns `{"sent":1}`, reopens the teacher into skill 2, and she completes it. Every one of the four I/O edges was then failed on purpose — Twilio returning 63016, Twilio throwing, Anthropic down, Supabase Storage down, the events table down, the generations table down — and in every case the webhook still ACKed 200, the teacher got either her material or a plain-language apology, and the process never crashed. The two shared-secret endpoints reject missing, wrong and cross-swapped credentials, and Twilio signature validation rejects forged, replayed and wrong-token signatures while accepting a correctly signed request. The composition root itself was proven separately against real Supabase/Twilio/Anthropic credentials by the controller (§4A). What is **not** proven by this gate is a real message reaching a real phone — that is Case 4B, and it remains open.

---

## Case 1 — Build health (QA-tester)

**Steps:** `npm test`, `npm run typecheck`, `npm run build`.
**Expected:** all three exit 0; 2 skipped test files, both the env-gated `.int.test.ts` suites (correct, not failures).

**Baseline before this gate's additions** (`npm test`, HEAD `d7d6406`, clean tree):
```
 Test Files  20 passed | 2 skipped (22)
      Tests  186 passed | 2 skipped (188)
   Start at  21:14:43
   Duration  1.94s (transform 1.54s, setup 0ms, import 4.49s, tests 957ms, environment 6ms)
```

**Actual, with `test/qa-e2e.test.ts` added:**
- `npm test` (`vitest run`) → exit `0`:
  ```
   Test Files  21 passed | 2 skipped (23)
        Tests  204 passed | 2 skipped (206)
     Start at  21:22:22
     Duration  1.89s (transform 1.23s, setup 0ms, import 4.30s, tests 1.42s, environment 4ms)
  ```
  Delta: **+1 file, +18 tests**, all from this gate. Skips unchanged at 2.
- `npm run typecheck` (`tsc -p tsconfig.json`) → exit `0`, no output. No type errors in `src/` or `test/`, including the new file.
- `npm run build` (`tsc -p tsconfig.build.json`) → exit `0`, no output.

The 2 skipped files are `test/supabase.int.test.ts` and `test/storage.int.test.ts`, both guarded by `describe.skipIf(!url || !key)` (verified by reading both files). Skipping without `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` is the expected, correct behaviour in this credential-less environment — the controller ran the live equivalents under Phase 3 Case 2 and §4A below.

**Verdict: PASS**

---

## Case 2 — Supertest end-to-end over the whole stack (QA-tester)

**Method:** `test/qa-e2e.test.ts`, `describe('QA Case 2 …')`. `createApp` is wired with a **real** `createInboundHandler(execDeps)` and a **real** `createNudgePass(execDeps)` over `InMemoryTeacherRepo` / `InMemoryEventLog` / `InMemoryGenerationStore` / `FakeMessenger` / `FakeGenerator` / `FakePdfBuilder` / `FakePdfStore` / `FixedClock`, signature validation off (`TWILIO_VALIDATE_SIGNATURE: false`). Each step is a Twilio-shaped urlencoded POST to `WEBHOOK_PATH` carrying `From`, `WaId`, `ProfileName`, `Body`, `MessageSid`. Because `createApp` ACKs immediately and dispatches via `setImmediate` (never awaited), every POST is followed by `await vi.waitFor(...)` on a settle counter wrapped around the real handler, so no assertion can race the async work. The clock advances 30 s per message.

**Walk:** `Hi` → `2` (grade) → `1` (subject) → `1` (board) → `"Comparing fractions with unlike denominators"` → `2` (impact) → `1` (referral).

### Required assertions

| # | Assertion | Expected | Actual | Result |
|---|---|---|---|---|
| 2.1 | Final teacher state | `IDLE` | `IDLE` | PASS |
| 2.2 | `skillsCompleted` | `['worksheet']` | `['worksheet']` | PASS |
| 2.3 | Events logged | ≥ 18 | **27** | PASS |
| 2.4 | Every outbound text ≤ 1500 chars | 0 over-limit | 0 over-limit (max **1215**) | PASS |
| 2.5 | A `send_document` (PDF) was sent | 1 | 1, URL ends `.pdf` | PASS |
| 2.6 | Cron sweep after forcing `nudgeDueAt` into the past | `{sent:1}` | HTTP 200 `{"sent":1}` | PASS |
| 2.7 | Teacher continues into skill 2 | `AWAITING_TOPIC` / `quiz` | `AWAITING_TOPIC` / `quiz`, `nudgeCount=1` | PASS |

### Evidence

**All 7 inbound POSTs** returned HTTP `200`, `content-type: text/xml`, body containing `<Response/>` — Twilio never sees a retryable status.

**The 27 events, in the exact order they were logged:**
```
 1 session_started        10 onboarding_completed   19 impact_prompt_sent
 2 message_received       11 microlesson_sent       20 activated
 3 welcome_sent           12 message_received       21 message_received
 4 message_received       13 topic_provided         22 impact_reported
 5 grade_captured         14 generation_started     23 message_received
 6 message_received       15 generation_succeeded   24 referral_reported
 7 subject_captured       16 worksheet_delivered    25 skill_completed
 8 message_received       17 pdf_delivered          26 share_cta_sent
 9 board_captured         18 reusable_prompt_sent   27 nudge_scheduled
```
No `error_occurred`, no `generation_failed`, no `pdf_failed` on the happy path.

**The 10 outbound messages and their lengths** (limit 1500):
```
273  welcome + grade menu
101  subject menu
 79  board menu
511  worksheet micro-lesson
 48  "making your worksheet now"
1215 worksheet chunk 1/2
548  worksheet chunk 2/2 + AI disclaimer
480  reusable prompt + impact menu
155  referral question
279  share CTA (contains the join link and names skill #2)
```
The fixture model output is 1701 characters — genuinely longer than `MAX_CHUNK`, so `chunkText` really did split it into 2 chunks and the ≤ 1500 assertion was actually exercised rather than trivially satisfied.

**Final teacher row:** `state=IDLE`, `grade='Middle (Classes 6-8)'`, `subject='Maths'`, `board='CBSE'`, `skillsCompleted=['worksheet']`, `currentSkillId=null`, `pendingTopic=null`, `activatedAt` set, `nudgeDueAt` set, `nudgeSentAt=null`.

**PDF path:** 1 document sent, `https://example.test/worksheets/<teacherId>/1.pdf`; `FakePdfStore.stored` has 1 entry with a non-zero byte count; `InMemoryGenerationStore.saved` has 1 row whose `pdfUrl` matches the URL actually sent.

**Nudge sweep.** The clock was first advanced 20 h (matching `NUDGE_DELAY_HOURS`, i.e. the real overnight gap), `nudgeDueAt` was then forced 60 s into the past, and `POST /internal/cron/nudges` was sent with the correct `x-cron-secret`:
```
[nudges] due=1 sent=1
cron response: 200 {"sent":1}
after nudge: state=AWAITING_TOPIC  currentSkillId=quiz  nudgeCount=1
```
The nudge text names the exit ticket. Replying with `"Photosynthesis: inputs and outputs"` logged `nudge_reopened`, called the generator a second time with `skillId='quiz'` and that exact topic, and moved her to `AWAITING_IMPACT`; finishing the impact and referral menus left her `IDLE` with `skillsCompleted=['worksheet','quiz']`, with every message still ≤ 1500 chars.

**`/admin/metrics` for the walked conversation:**
```json
{"teachers":1,"onboarded":1,"activated":1,"impactReported":1,"returnedForSkill2":0,
 "completedBoth":0,"medianMinutesSaved":30,"referredCount":1,"nudgesSent":0,"nudgesReopened":0}
```
(`returnedForSkill2` and `nudgesSent` are 0 here because this snapshot is taken before the nudge sweep in that test; after the sweep they become 1.)

### One deviation worth recording (test-side, not a product defect)

The first draft of assertion 2.7 ran the sweep with **no elapsed time** between the teacher's last reply and the nudge, and `nudge_reopened` was not logged. Investigated before changing anything: `machine.ts:31` gates that event on `lastInboundAt.getTime() < nudgeSentAt.getTime()` — a **strict** `<`. With a `FixedClock` that had not advanced, both timestamps were identical, so the gate was correctly false. In production `computeNudgeDueAt` schedules the nudge `NUDGE_DELAY_HOURS = 20` hours after her last inbound, so equality is unreachable. The fix was to advance the test clock 20 h — i.e. to make the test realistic — **not** to loosen the assertion or touch `machine.ts`. Recorded here for transparency, not as a finding.

**Verdict: PASS**

---

## Case 3 — Failure injection (QA-tester)

Each edge is failed on purpose mid-conversation. Bar for every sub-case: **the app never crashes, the webhook still ACKs 200, and the teacher is never silently stranded.**

### 3(a) Twilio returns 63016 — teacher outside the 24-hour session window

`FakeMessenger.failWith = 63016` (an `ok:false` `SendResult`, exactly what `TwilioMessenger` maps a `RestException` to). Two messages sent through the webhook.

- Both POSTs → HTTP **200**. Twilio never sees a retryable status, so it will not redeliver.
- `FakeMessenger.sent` is **empty** — nothing was actually delivered, as expected.
- **2 `error_occurred` events logged**, the first with `properties = { action: 'send_text', errorCode: 63016 }`.
- Conversation state still advanced correctly to `AWAITING_SUBJECT`: the state updates are persisted before the sends, so nothing is lost while she is outside the window.
- Recovery verified: clearing `failWith` and sending the next message delivered normally and advanced her to `AWAITING_BOARD`.

**Verdict: PASS**

### 3(a2) Twilio *throws* (e.g. `ECONNRESET`) rather than returning `ok:false`

`FakeMessenger.throwWith = new Error('ECONNRESET')`. POST → HTTP **200**, `error_occurred` logged, teacher still advanced to `AWAITING_GRADE`. The throw is absorbed inside `Executor.runAction` and treated like a failed `SendResult`, so later actions in the same step (remaining chunks, the PDF, the impact prompt) are not aborted.

**Verdict: PASS**

### 3(b) Anthropic down

Driven to `AWAITING_TOPIC`, then `FakeGenerator.failWith = new Error('api down')`, then the topic is sent.

- POST → HTTP **200**.
- Teacher returned to **`AWAITING_TOPIC`** with `pendingTopic = null` and `retries = 0` — invited to retry, never stranded in `GENERATING`.
- **`generation_failed` logged** with `skillId='worksheet'`, `properties = { reason: 'error' }`.
- `generation_started` logged; `generation_succeeded` **not** logged.
- The underlying cause is captured too: `error_occurred` with `properties = { where: 'generate', message: 'api down' }`.
- Teacher-visible apology: last message contains `"Sorry, that one didn't work"`. No PDF was sent.
- Recovery verified: clearing `failWith` and resending the topic produced `generation_succeeded` and moved her to `AWAITING_IMPACT`.

**Verdict: PASS**

### 3(c) Supabase Storage down — the PDF must never cost her the worksheet

Driven to `AWAITING_TOPIC`, then `FakePdfStore.failWith = new Error('bucket down')`, then the topic is sent.

- POST → HTTP **200**.
- **`generation_succeeded` still logged** — a billed, successful model call is not demoted to a failure by a storage blip.
- **`worksheet_delivered` logged, `pdf_failed` logged, `pdf_delivered` NOT logged.**
- The **worksheet text still lands**: outbound messages contain `LEVEL 1 - SUPPORT` and `ANSWER KEY`, plus the plain-language note `"(The PDF could not be made this time — the text above is complete.)"`. All chunks ≤ 1500 chars. No document was sent.
- The funnel continues normally: she reached `AWAITING_IMPACT`, and answering the impact and referral menus completed the skill (`skillsCompleted = ['worksheet']`).
- `generations.saved[0].pdfUrl` is `null`, so the row records the truth.

**Verdict: PASS**

### 3(d) Events table down

`events.log` replaced with a thrower. POST → HTTP **200**; the handler catches, attempts the telemetry write (which also fails and is swallowed), and still sends her `"Something went wrong on my side. Please send that again in a moment."` Telemetry failure never breaks the ACK or the reply.

**Verdict: PASS**

### 3(d2) Generations table down — pins a carried-forward deferred item

`InMemoryGenerationStore.failWith = new Error('generations table down')`, then the topic is sent.

- POST → HTTP **200**; `worksheet_delivered` and `pdf_delivered` both logged; the PDF document **was** sent; she reached `AWAITING_IMPACT`. Delivery is correctly unaffected.
- But **`generation_succeeded` is not logged either**, and **no** `error_occurred` is written — nothing about the failure reaches the events table at all. The `generations.save` call and the `generation_succeeded` write share one `try` block in `executor.ts:88-99`, and the catch is `console.error` only.
- Consequence for the pilot: `/admin/metrics` and the CSV export would show `worksheet_delivered` without a matching `generation_succeeded`, silently under-counting successes. See deferred item **D3** below — now pinned by an assertion rather than only a code read.

**Verdict: PASS** (graceful degradation confirmed; the telemetry gap is recorded as a known deferred item, not a gate failure)

---

## Case 4 — Live composition root and the human phone walkthrough

### 4A — Controller-run live smoke test of the composition root (controller-run)

Transcribed from `.superpowers/sdd/implementation/qa4-controller-evidence.md`. The **real built server** (`PORT=3111 node --env-file-if-exists=.env dist/index.js`) was run against the real `.env` — real Supabase, real Twilio credentials, real Anthropic key — and stopped immediately afterwards (it starts a live `*/10 * * * *` cron). No stray process remains. **This QA agent did not re-run any of it and has no credentials.**

**Boot — PASS.** Up in ~2 s:
```
teachspark listening on :3111 (development)
join link: https://wa.me/14155238886?text=join%20captain-cheese
```
This proves what fakes cannot: `loadConfig()` accepts the real `.env` (all 17 vars pass zod validation, no placeholder rejected); `ensurePublicBucket(sb, 'worksheets')` succeeded, and because it is awaited at module top level before `app.listen`, a successful boot is itself proof that Supabase Storage is reachable with the real secret key; the composition root wires cleanly (Supabase repo/events/generations + Twilio messenger + Anthropic generator + pdfkit + `SupabasePdfStore` + `SystemClock` all construct without error); and `buildJoinLink()` produces the correct wa.me deep link with the real sandbox code.

> **QA-tester annotation — one inference above is now stale at HEAD.** The claim that *"a successful boot is itself proof that Supabase Storage is reachable"* was true when the controller ran the smoke test, but it is **no longer true at HEAD `d7d6406`**. That commit (`…stop gating /health on supabase`) deliberately changed the call site:
> ```
> git show HEAD~1:src/index.ts →  38: await ensurePublicBucket(sb, config.SUPABASE_PDF_BUCKET);
>                                 40: const server = app.listen(...)
> git show HEAD:src/index.ts   →  38: const server = app.listen(...)
>                                 47: ensurePublicBucket(sb, ...).catch((err) => { console.error('[boot] ...') });
> ```
> `ensurePublicBucket` is now fire-and-forget **after** `listen`, so at HEAD the server boots green whether or not Storage is reachable, and a failure appears only as a `[boot] ensurePublicBucket failed; PDF delivery may be degraded…` line on stderr. The change itself is correct and intentional — `/health` must not depend on Supabase — but the **boot-as-proof inference is void**, and it has not been re-established at HEAD. Everything else in this section is unaffected: the composition root still constructs, and live Storage reachability is independently proven by Phase 3's `storage.int.test.ts` (real upload, public URL served HTTP 200 `application/pdf`), while a Storage outage is proven to degrade gracefully by Case 3(c) above. **Operational note for the 4B walkthrough:** watch the `npm run dev` console for `[boot] ensurePublicBucket failed` — at HEAD that line, not a failed boot, is the only signal that PDFs will not upload.

**`GET /health` — PASS.** `{"ok":true}`.

**Auth on both protected endpoints — PASS.** `GET /admin/metrics` with no credentials → **HTTP 401**. `POST /internal/cron/nudges` with no secret → **HTTP 401**.

**`POST /internal/cron/nudges` with the real `CRON_SECRET` — PASS.** Returned `{"sent":0}`. A real end-to-end exercise of the nudge sweep against live Supabase: `teachers.findNudgeDue(now)` ran and correctly found nothing due. A 200 rather than a 500 proves the query path works with real credentials.

**`GET /admin/metrics` with the real `ADMIN_TOKEN` — TRANSIENT FAILURE, then clean.** The first call returned a 500 with `{"error":"teachers.listAll failed [PGRST303]: JWT issued at future"}`. Investigated rather than dismissed: the local clock was verified exact against an authoritative HTTPS `Date` header (`2026-08-20T15:25:56Z` local vs `Thu, 20 Aug 2026 15:25:56 GMT` remote — zero skew, so not a local clock problem); `teachers.listAll()` and `events.listAll()` were then re-probed through the same real adapters **8 times in a row, 8/8 OK** (0 rows each, as expected for an empty pilot DB); and both integration suites had passed against the same project minutes earlier. Conclusion: a **transient Supabase-side JWT/clock condition, not a defect in this code**. Not reproducible.

It degrades gracefully everywhere it matters. On the webhook path the same transient surfaces inside `createInboundHandler`, which catches it, logs `error_occurred` and sends the teacher `somethingWentWrong()` — she simply resends (behaviour independently confirmed by Case 3(d) above). On `/admin/metrics` it surfaces as a 500 that a refresh clears. **Operational note for Tushar:** if `/admin/metrics` ever returns `PGRST303: JWT issued at future`, just retry — it is a Supabase-side blip, not lost data. Worth a small retry wrapper only if it recurs during the pilot.

**Deliberately not run, and why:** a full simulated conversation against the live stack was declined on purpose — it would spend Anthropic credit, write real rows into the `teachers` / `events` / `generations` tables that the case study's own funnel reports on (polluting the pilot's numbers), and attempt a real Twilio send that would most likely fail with 63015 anyway while the phone sandbox join is still an open to-do. The conversation logic is covered instead by Case 2 above, which has zero side effects.

**Verdict: PASS** (transcribed from controller evidence; not re-run by this QA agent)

### 4B — Human phone walkthrough — **PENDING-HUMAN**

A genuine human step (Task 16 Step 3). Only Tushar can do this; it is **not** marked PASS.

1. `npm run dev` (terminal 1) and `ngrok http 3000 --url https://cavalier-populate-tinderbox.ngrok-free.dev` (terminal 2).
2. Twilio Console → Messaging → Try it out → Send a WhatsApp message → Sandbox settings → **"When a message comes in"** = `https://cavalier-populate-tinderbox.ngrok-free.dev/webhooks/twilio/whatsapp` (POST) → Save. `PUBLIC_BASE_URL` in `.env` must match that domain **exactly** (restart `npm run dev` after any change) — see finding **F2** below for why a mismatch produces a silent 403 rather than an obvious error.
3. Join the sandbox from the phone first: send `join captain-cheese` to **+1 415 523 8886** (joins expire after 3 days).
4. Walk the full flow: `Hi` → grade `2` → subject `1` → board `1` → topic `"Comparing fractions with unlike denominators"` → worksheet text (≤ 3 chunks) → **PDF arrives and opens on the phone** → reusable prompt + impact menu → `2` → referral `2` → share CTA containing the join link.
5. Then: `curl -s -H "Authorization: Bearer $ADMIN_TOKEN" localhost:3000/admin/metrics | jq` → 1 teacher, activated 1, `medianMinutesSaved` 30.
6. Force the nudge: in the Supabase SQL editor run
   `update teachers set nudge_due_at = now() - interval '1 minute' where wa_from like 'whatsapp:+%';`
   then `curl -s -X POST -H "x-cron-secret: $CRON_SECRET" localhost:3000/internal/cron/nudges` → `{"sent":1}` and the phone receives the skill-2 nudge. Reply with a topic → the quiz flow completes.
7. Also try `help`, `restart`, `new`, and gibberish at each menu.

**Verdict: PENDING-HUMAN** (steps 4–7 are the only part of the pilot path no automated case can stand in for: a real Twilio send reaching a real handset, and the PDF opening on a phone)

---

## Case 5 — Security (QA-tester)

### 5(a) `GET /admin/metrics`

| Request | Expected | Actual | Result |
|---|---|---|---|
| No `Authorization` header | 401 | **401** `{"error":"unauthorized"}` | PASS |
| `Bearer wrong-token` | 401 | **401** | PASS |
| `Bearer <ADMIN_TOKEN>x` (one char appended) | 401 | **401** | PASS |
| Raw token with no `Bearer ` prefix | 401 | **401** | PASS |
| `Basic <base64(ADMIN_TOKEN)>` | 401 | **401** | PASS |
| `Bearer <CRON_SECRET>` (cross-swapped secret) | 401 | **401** | PASS |
| `Bearer <ADMIN_TOKEN>` | 200 + funnel JSON | **200**, body has `eventCounts` and `teachers` | PASS |

### 5(b) `POST /internal/cron/nudges`

| Request | Expected | Actual | Result |
|---|---|---|---|
| No `x-cron-secret` header | 401 | **401** `{"error":"unauthorized"}` | PASS |
| `x-cron-secret: wrong-secret` | 401 | **401** | PASS |
| `x-cron-secret: <CRON_SECRET>x` | 401 | **401** | PASS |
| `x-cron-secret:` (empty) | 401 | **401** | PASS |
| `x-cron-secret: <ADMIN_TOKEN>` (cross-swapped secret) | 401 | **401** | PASS |
| `x-cron-secret: <CRON_SECRET>` | 200 `{sent:n}` | **200** `{"sent":0}` | PASS |

Neither secret opens the other's endpoint.

### 5(c) Twilio signature validation

App built with `TWILIO_VALIDATE_SIGNATURE: true`.

| Request | Expected | Actual | Result |
|---|---|---|---|
| `X-Twilio-Signature: bogus-signature` | 403 | **403**, body `Twilio Request Validation Failed.` | PASS |
| A signature valid for a **different body**, replayed onto this one | reject | **403** | PASS |
| A signature computed with the **wrong auth token** | reject | **403** | PASS |
| **No** `X-Twilio-Signature` header at all | reject | **400** (twilio's own "no signature header" branch) | PASS |
| Correctly signed via `twilio.getExpectedTwilioSignature(authToken, url, params)` | 200 + processed | **200** `<Response/>`, `welcome_sent` logged, teacher `AWAITING_GRADE` | PASS |

The positive case **was** executed rather than documented away. After every rejected request, `teachers.listAll()` was empty and no events were logged — a forged request never reaches the handler.

### 5(d) Incidental

`x-powered-by` is disabled (`app.disable('x-powered-by')`) — verified absent on a live response. `/health` needs no auth and returns `{"ok":true}`, which is correct for a platform health probe.

**Verdict: PASS** — with finding **F1** below recorded against the same code path.

---

## Findings raised by this gate

### F1 — `authToken` passed to `twilio.webhook()` is silently ignored; `process.env.TWILIO_AUTH_TOKEN` wins (LOW risk today, latent trap)

`src/http/app.ts:49-53` passes the validated config value:
```ts
twilioWebhook({
  validate: config.TWILIO_VALIDATE_SIGNATURE,
  authToken: config.TWILIO_AUTH_TOKEN,
  url: `${config.PUBLIC_BASE_URL}${WEBHOOK_PATH}`,
})
```
But `node_modules/twilio/lib/webhooks/webhooks.js` unconditionally overwrites it when the token is not supplied as a **positional string** argument:
```js
options.authToken = tokenString ? tokenString : process.env.TWILIO_AUTH_TOKEN;
```
Since `createApp` passes an options object only, `tokenString` is `undefined` and the configured token is discarded. Verified empirically against the real middleware with a correctly signed request:
```
valid sig, process.env.TWILIO_AUTH_TOKEN UNSET -> 500 "Webhook Error - we attempted to validate this request
                                                       without first configuring our auth token."
valid sig, process.env.TWILIO_AUTH_TOKEN SET   -> 200 "<?xml version=\"1.0\" ...<Response/>"
valid sig, process.env holds a DIFFERENT token -> 403 "Twilio Request Validation Failed."
```
**Why it works today:** both `npm run dev` (`tsx --env-file-if-exists=.env`) and `npm start` (`node --env-file-if-exists=.env`) load `.env` into `process.env`, so `process.env.TWILIO_AUTH_TOKEN` happens to equal `config.TWILIO_AUTH_TOKEN`. The pilot is unaffected.
**Why it is worth recording:** the coupling is invisible and load-bearing. If the token is ever supplied to `loadConfig` from anywhere other than `process.env` under that exact name — a secrets manager, a differently-named platform variable, a test harness — **every inbound webhook fails**: 500 if the env var is absent, 403 if it holds a stale value. Both look like "the bot is dead" with no clue pointing at the token.
**Suggested one-line fix (NOT applied — this QA agent modified no source):** pass the token positionally so `tokenString` wins:
```ts
twilioWebhook(config.TWILIO_AUTH_TOKEN, { validate: config.TWILIO_VALIDATE_SIGNATURE, url: `${config.PUBLIC_BASE_URL}${WEBHOOK_PATH}` })
```
`test/qa-e2e.test.ts` currently works around this with `vi.stubEnv('TWILIO_AUTH_TOKEN', …)` before `createApp`, with a comment pointing here. **For the controller to rule on.**

### F2 — A `PUBLIC_BASE_URL` / ngrok mismatch fails as a silent 403 (operational, no code change proposed)

Signature validation is computed against the fixed `${PUBLIC_BASE_URL}${WEBHOOK_PATH}` string, not against the URL actually requested. If `PUBLIC_BASE_URL` and the URL configured in the Twilio console differ by even a trailing character, every message is rejected 403 and the bot appears silently dead — no log line names the cause. Already flagged as a setup step in 4B step 2; repeated here as the most likely cause of a "nothing happens" report during the phone walkthrough. First diagnostic: confirm `PUBLIC_BASE_URL` matches the ngrok domain exactly, or set `TWILIO_VALIDATE_SIGNATURE=false` temporarily to isolate.

### F3 — Shared-secret comparisons are not constant-time (accepted for the pilot)

`src/http/app.ts:74` and `:83` use `!==` on the credential strings. A timing side-channel against a high-entropy secret over HTTP is not practically exploitable, and both endpoints are internal. Recorded for completeness; **no change recommended for the pilot**.

### F4 — The controller's boot-time Storage proof was invalidated by the HEAD commit (evidence gap, not a code defect)

The live smoke test in §4A ran against `src/index.ts` as it stood at `HEAD~1`, where `ensurePublicBucket` was awaited before `app.listen`. HEAD `d7d6406` correctly made it fire-and-forget after `listen`, so "the server booted" no longer implies "Supabase Storage is reachable". No code change is warranted — the commit did the right thing. What is worth noting is that **the smoke test's Storage claim has not been re-verified at HEAD**, and a Storage outage is now visible only as a single stderr line. Live Storage reachability is still independently covered by Phase 3's `storage.int.test.ts`; graceful degradation is covered by Case 3(c). Full detail and the git evidence are inline in §4A. **For the controller's awareness** — flagged because a reader of the controller evidence alone would draw a conclusion that no longer holds.

---

## Known deferred items carried forward

Pre-existing, non-blocking, and deliberately kept visible so they are not lost before the pilot:

- **D1 — The nudge sweep reads a stale snapshot.** `createNudgePass` calls `teachers.findNudgeDue(now)` once and then iterates the returned array, re-checking `t.state !== 'IDLE'` against the **snapshot**, not against a fresh read. A teacher who moves `IDLE → GENERATING` after the snapshot but before her turn in the loop can still receive a nudge mid-generation. The window is roughly 10–20 s at pilot scale (one sweep, a handful of due rows). **Accepted for the pilot.** The sweep is already serialized against double-sends by the closure-scoped `running` promise, so this is the only remaining race and its blast radius is one slightly mistimed message.
- **D2 — `error_occurred` carries several different property shapes.** Four distinct producers, two disjoint key sets: `handle.ts:46` writes `{ where: 'handle', message }`; `executor.ts:46` writes `{ action, errorCode }`; `executor.ts:56` writes `{ action, errorCode: null, message }`; `executor.ts:105` writes `{ where: 'generate', message }`. Anything consuming these properties (the CSV export, any future dashboard) must handle all four. Counting `error_occurred` by name is unaffected.
- **D3 — A `generations.save` failure is logged only to console, never to the events table.** `executor.ts:88-99` wraps the `generations.save` call and the `generation_succeeded` event write in one `try`, whose catch is `console.error` only. A save failure therefore **also suppresses `generation_succeeded`**, so `/admin/metrics` and the CSV export under-count successes relative to `worksheet_delivered`, with nothing in the events table to explain the gap. Delivery to the teacher is correctly unaffected. Now pinned by Case 3(d2) above, which asserts this exact behaviour so any future change to it is caught by the suite.

Phase 3's three deferred minors (exact-header matching in `splitIntoSections`; `ensurePublicBucket` discarding `getBucket`'s error; `console.error` level for the routine Twilio codes 63015/63016) remain open and unchanged by Phase 4.

---

## Summary

| Case | Description | Attribution | Verdict |
|---|---|---|---|
| 1 | Build health — `npm test` (204 passed / 2 skipped, 23 files), `npm run typecheck`, `npm run build`, all exit 0 | QA-tester | **PASS** |
| 2 | Supertest end-to-end: 7-message funnel over HTTP → IDLE, `['worksheet']`, 27 events, all texts ≤ 1500, PDF delivered, cron sweep `{sent:1}`, continues into skill 2 | QA-tester | **PASS** |
| 3 | Failure injection — Twilio 63016, Twilio throw, Anthropic down, Storage down, events table down, generations table down | QA-tester | **PASS** |
| 4A | Live composition-root smoke test against real Supabase / Twilio / Anthropic (boot, `/health`, 401s, real cron sweep `{"sent":0}`, investigated transient `PGRST303`) | controller-run | **PASS** |
| 4B | Human phone walkthrough — real Twilio send to a real handset, PDF opening on the phone | — | **PENDING-HUMAN** (Tushar) |
| 5 | Security — `/admin/metrics` and `/internal/cron/nudges` credential matrices, Twilio signature validation (forged, replayed, wrong-token, missing, and valid) | QA-tester | **PASS** |

**Overall Phase 4 gate: all executable cases (1, 2, 3, 4A, 5) PASS.** The full pilot path is verified end to end through the real HTTP surface, and every I/O edge has been failed on purpose without crashing the app or stranding the teacher. Four findings (F1–F4) and three carried-forward deferred items (D1–D3) are recorded above; none blocks this gate. **F1 is the one worth a controller decision** — a one-line change that removes a silent, load-bearing dependency on an environment variable name. **F4 is worth a read before relying on the §4A transcript** — one of the controller's boot-time inferences no longer holds at HEAD. Only the human phone walkthrough (4B) remains open.
