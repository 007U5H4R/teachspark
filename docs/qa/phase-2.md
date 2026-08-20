# Phase 2 QA Gate — TeachSpark

**Scope:** Tasks 5–9 (skills content · input parsing · WhatsApp copy · nudge timing · the pure conversation state machine).
**Tester:** Independent QA agent (did not write this code).
**Repo state:** branch `main`, HEAD `2113c93` (`fix(bot): keep generation clock anchored when help is sent during GENERATING`).
**Environment:** macOS (Darwin 25.5.0), Node `v26.7.0`, vitest `4.1.11`, TypeScript `^7.0.2`.
**Date:** 2026-08-20.
**New QA artefacts:** `test/qa-conversation.test.ts` (14 tests) and this checklist. No source or existing test file was modified.

## Phase 2 regression scope

Cases #1 and #2 each exercise Tasks 5–9 **together**, not just the newest task, so together they are the regression gate for all of Phase 2:

- `test/skills.test.ts` — Task 5 (micro-lessons, generation prompts, reusable prompts)
- `test/parse.test.ts` — Task 6 (commands, numbered menus, topic validation incl. PII, chunking)
- `test/messages.test.ts` — Task 7 (all WhatsApp copy)
- `test/nudge.test.ts` — Task 8 (nudge scheduling inside the 24h window, quiet hours)
- `test/machine.test.ts` — Task 9 (the pure state machine, 28 tests)
- `test/qa-conversation.test.ts` — **new**, this gate: one end-to-end conversation through the real machine plus 9 edge cases

Case #1 also re-runs every Phase 1 suite (`health`, `config`, `memory-adapters`, `supabase-mappers`, and the env-gated `supabase.int`), so a green Case #1 is simultaneously the Phase 1 regression check.
Case #2 is the integration case: it does **not** unit-test one module — it drives Task 9's machine, which in turn pulls in Task 5's skills, Task 6's parser, Task 7's copy and Task 8's nudge clock in a single funnel. A break in any of those five tasks fails Case #2.

---

## Case 1 — Suite green

**Steps:** `npm run typecheck && npm test`
**Expected:** both succeed; 118 passing, 1 skipped (the Supabase integration suite skips with no env).

**Actual — baseline at HEAD `2113c93`, before adding the QA test file:**
- `npm run typecheck` (`tsc -p tsconfig.json`) → exit 0, no output (no type errors).
- `npm test` (`vitest run`) → exit 0. Exact summary lines:
  ```
   Test Files  9 passed | 1 skipped (10)
        Tests  118 passed | 1 skipped (119)
     Start at  19:05:00
     Duration  950ms (transform 1.03s, setup 0ms, import 2.14s, tests 362ms, environment 3ms)
  ```
  118 passing / 1 skipped — matches the expectation exactly. The skipped file is `test/supabase.int.test.ts`, which is guarded by `describe.skipIf(!url || !key)` and skips because no Supabase env is set (unchanged from the Phase 1 gate).

**Actual — after adding `test/qa-conversation.test.ts` (14 new tests):**
- `npm run typecheck` → exit 0, no output. The new test file is type-clean (`tsconfig.json` `include` covers `test`).
- `npm test` → exit 0. Exact summary lines:
  ```
   Test Files  10 passed | 1 skipped (11)
        Tests  132 passed | 1 skipped (133)
     Start at  19:08:11
     Duration  698ms (transform 593ms, setup 0ms, import 1.24s, tests 279ms, environment 2ms)
  ```
  118 + 14 = 132 passing, 1 skipped. No pre-existing test was changed and none regressed.

**Verdict: PASS**

---

## Case 2 — Simulated full conversation (the key case)

**Steps:** `test/qa-conversation.test.ts`, `describe('QA Case 2 …')` drives the **pure** machine with no I/O and no mocks of the machine itself. The only faked thing is the generation *outcome* the (not yet built) executor would hand back:

```
hi                     @ NOW+0s    → transition
2      (grade)         @ NOW+30s   → transition
maths  (subject)       @ NOW+60s   → transition
1      (board)         @ NOW+90s   → transition
Comparing fractions    @ NOW+120s  → transition   (emits the `generate` action)
                       @ NOW+150s  → afterGeneration(t, {ok:true, result:{…}, pdfUrl:'https://x.test/a.pdf'}, now)
2      (impact)        @ NOW+180s  → transition
1      (referral)      @ NOW+210s  → transition
```

`NOW = 2026-08-23T14:00:00+05:30`, `joinLink = https://wa.me/14155238886?text=join%20clever-tiger`, `timezone = Asia/Kolkata`. After **every** step the step's `updates` are applied to the teacher with an `apply()` helper — exactly what the executor does — so each turn sees the state the previous turn wrote.

**Expected:**
(a) the ordered list of emitted event names equals the PRD funnel exactly;
(b) every `send_text` body across the whole conversation is ≤ 1500 chars;
(c) final state `IDLE`, `skillsCompleted === ['worksheet']`, and a `nudgeDueAt` scheduled < 24h after now.

### (a) Event order

**Expected vs actual — identical, no diff:**

| # | Expected | Actual | # | Expected | Actual |
|---|---|---|---|---|---|
| 1 | message_received | message_received | 13 | worksheet_delivered | worksheet_delivered |
| 2 | welcome_sent | welcome_sent | 14 | pdf_delivered | pdf_delivered |
| 3 | message_received | message_received | 15 | reusable_prompt_sent | reusable_prompt_sent |
| 4 | grade_captured | grade_captured | 16 | impact_prompt_sent | impact_prompt_sent |
| 5 | message_received | message_received | 17 | activated | activated |
| 6 | subject_captured | subject_captured | 18 | message_received | message_received |
| 7 | message_received | message_received | 19 | impact_reported | impact_reported |
| 8 | board_captured | board_captured | 20 | message_received | message_received |
| 9 | onboarding_completed | onboarding_completed | 21 | referral_reported | referral_reported |
| 10 | microlesson_sent | microlesson_sent | 22 | skill_completed | skill_completed |
| 11 | message_received | message_received | 23 | share_cta_sent | share_cta_sent |
| 12 | topic_provided | topic_provided | 24 | nudge_scheduled | nudge_scheduled |

The assertion is a strict `toEqual` on the full 24-element array built from `EVENT.*` constants, so ordering, omissions and extras all fail it. Notes on the two things this case existed to catch:
- **`activated` lands where the design says** — inside `afterGeneration`, after `impact_prompt_sent` and before the impact reply's `message_received`. It fires only when `activatedAt` was previously null, so it appears exactly once.
- **No `message_received` is missing, and none is spurious.** There are 7 inbound turns but only 7 `message_received` events, and the `afterGeneration` block (13–17) correctly carries none, because it is not an inbound message.

### (b) Chunk limit

Actual `send_text` body lengths across the whole conversation (9 bodies, `MAX_CHUNK = 1500`):

```
 1.  273 chars   welcome + grade menu
 2.  101 chars   askSubject
 3.   79 chars   askBoard
 4.  511 chars   worksheet micro-lesson
 5.   48 chars   generatingAck
 6.  108 chars   worksheet text + disclaimer (1 chunk)
 7.  455 chars   reusable prompt + impact menu
 8.  155 chars   referral question
 9.  300 chars   share CTA
max = 511 chars · bodies over 1500 = 0
```

### (c) Final state

```
state = IDLE
skillsCompleted = ["worksheet"]
currentSkillId = null   pendingTopic = null   nudgeSentAt = null
activatedAt = 2026-08-23T08:32:30.000Z  (= NOW+150s, the generation time)
nudgeDueAt  = 2026-08-24T04:33:30.000Z  (= +20.00h after the last inbound → inside the Twilio 24h window)
```

**Verdict: PASS** — all three assertions hold, and the emitted event order matches the PRD funnel with **no diff**. Nothing was bent in either direction: the expected array is hard-coded from `EVENT.*` constants in the test and would have failed loudly on any reordering.

---

## Case 3 — Edge cases

All nine live in `test/qa-conversation.test.ts`, `describe('QA Case 3 — edge cases')`. Each asserts real behaviour (state, events, and copy), not just "did not throw".

| # | Case | Expected | Actual | Verdict |
|---|---|---|---|---|
| 3.1 | double `hi` while in `NEW` | second must not crash; still welcomes | Both calls on the same un-advanced `NEW` teacher return exactly `[welcome()]` and `state → AWAITING_GRADE` (this is the duplicate-webhook case: state not yet persisted). If the first step **was** applied, the second `hi` is instead a menu miss: events `[message_received, unrecognized_input]`, reply `"Please reply with just the number 🙂"` + grade menu, no crash, no state change. Both paths asserted. | PASS |
| 3.2 | `restart` mid-onboarding | profile cleared, back to `AWAITING_GRADE` | From `AWAITING_BOARD` with grade+subject set and `retries: 2`: updates are `{grade: null, subject: null, board: null, currentSkillId: null, pendingTopic: null, state: 'AWAITING_GRADE', retries: 0}`; events `[message_received, restarted, welcome_sent]`; after `apply()` all three profile fields are `null`. | PASS |
| 3.3 | `help` while `GENERATING` | replies help, state unchanged, does **not** refresh `lastInboundAt` | Reply is exactly `help()`; events `[message_received, help_requested]`; `updates.state` undefined; `updates.lastInboundAt` **undefined** (the recent fix deletes it), so after `apply()` `lastInboundAt` is still the topic message's timestamp — the 120s stale-generation escape stays reachable. | PASS |
| 3.4 | topic `ok` | rejected as `ack` | `topic_rejected` with `reason: 'ack'`; no state change, no `pendingTopic`, no `generate` action. | PASS |
| 3.5 | topic `👍` | rejected | `topic_rejected` with `reason: 'ack'` — emoji-only input strips to zero letters/digits, so `validateTopic` classifies it as an acknowledgement rather than `too_short`. Reply: `"Just tell me the topic in a few words, e.g. …"`. | PASS |
| 3.6 | topic containing an email | rejected as `pii` | `Fractions, ask priya@school.in` → `topic_rejected` with `reason: 'pii'`; reply contains `"don't share student"`; no `generate` action. | PASS |
| 3.7 | 3 misses on a menu → free text accepted (grade) | grade captured from free text | `MAX_MENU_RETRIES === 2`, so misses 1–2 re-prompt (`unrecognized_input`, no state change) and miss 3 resolves: `grade = 'Multiple classes'`, `state → AWAITING_SUBJECT`, `grade_captured.properties.via === 'free_text'`. | PASS |
| 3.8 | 3 misses on a menu → skipped (impact, referral) | menus skipped, never free-texted | Impact: after 2 misses the 3rd gives `impact_reported {minutes: null, via: 'skipped'}` and `state → AWAITING_REFERRAL`. Referral: after 2 misses the 3rd gives `referral_reported {forwarded: null, via: 'skipped'}`, then `skill_completed` and `state → IDLE` with `skillsCompleted: ['worksheet']`. Free text is correctly **not** stored for either menu (`allowFreeText: false`). | PASS |
| 3.9 | nudge reopened | reply after `nudgeSentAt` with no intervening inbound → `nudge_reopened` | With `nudgeSentAt = NOW−1h` and `lastInboundAt = NOW−20h`, the reply logs `nudge_reopened`. Control: the same teacher with `lastInboundAt = NOW−60s` (i.e. already replied after the nudge) does **not** log it. | PASS |
| 3.10 | second skill after a nudge | `buildNudgeStep` → `AWAITING_TOPIC` with the quiz micro-lesson | `buildNudgeStep` returns `{state: 'AWAITING_TOPIC', currentSkillId: 'quiz', retries: 0, pendingTopic: null, nudgeSentAt: NOW, nudgeCount: 1}`, events `[nudge_sent]`, body exactly `nudge(SKILLS.quiz, profile)` (642 chars, ≤ 1500) containing "exit ticket". Extended one turn further: the teacher's reply logs `nudge_reopened` and routes to the **quiz** skill — `{state: 'GENERATING', currentSkillId: 'quiz'}` plus `{type: 'generate', skillId: 'quiz', topic: 'Photosynthesis: inputs and outputs'}`. | PASS |
| 3.11 | both skills done | **no** `nudge_scheduled` | Completing the quiz from `AWAITING_REFERRAL` gives `skillsCompleted: ['worksheet','quiz']`, no `nudge_scheduled` event, `updates.nudgeDueAt` undefined (so the stored `nudgeDueAt` stays `null`), and the share CTA reads "That was the last skill for now". | PASS |

**Verdict: PASS (all cases)**

### Observation (not a failure) — lenient menu matching

While authoring 3.8, the miss text `"no idea really"` was **matched** as the referral option *"No — I found it myself"*, because `parseOption` falls back to a leading-token alias match (`no` → the No option) and then to a substring match for aliases ≥ 3 chars. That is deliberate leniency and is right for a WhatsApp audience — a teacher typing "no idea" on a yes/no question almost certainly means "no". Flagged only so the controller knows the behaviour is intentional and that a genuinely-miss string (`"not sure at all"`) is required to exercise the skip path. No code change requested.

---

## Case 4 — Copy look-check (HUMAN: Tushar) — DOCUMENT ONLY, not executed

**Why not executed:** tone is a human judgement. This QA agent renders the copy; it does not rate it.

**What Tushar does:** read every message below on a **phone-width screen** and confirm for each one — (1) tone is warm, short and jargon-free; (2) it reads naturally in a WhatsApp bubble; (3) the ⚠️ AI disclaimer is present on AI-generated output. The rendered text below is the *real* output of every function in `src/bot/messages.ts` (plus both skill micro-lessons, which are sent as bot copy), called with the sample profile `{grade: 'Middle (Classes 6-8)', subject: 'Maths', board: 'CBSE'}`, `joinLink = https://wa.me/14155238886?text=join%20clever-tiger` and topic `"Comparing fractions"`. Character counts are shown so the phone-width read is calibrated; every message is far under the 1500-char WhatsApp chunk limit.

**Disclaimer check (mechanical part, already verified):** `afterGeneration` appends `disclaimer()` to the generated text *before* chunking, so it rides on the AI output itself — asserted in Case 2 and in `test/machine.test.ts`. `help()` repeats the caution in its last line. Tushar confirms the *wording*, not the presence.

<details>
<summary><b>Full rendered copy — 27 renders covering every function in <code>messages.ts</code> plus both micro-lessons</b></summary>

```
----- welcome()  (273 chars) -----
👋 Hi! I'm *TeachSpark*. In about 2 minutes I'll teach you one AI skill and we'll make a ready-to-use worksheet for YOUR class — free.

First, which grade do you mainly teach?
1) Primary (Classes 1-5)
2) Middle (Classes 6-8)
3) High (Classes 9-12)

Reply with the number 🙂

----- restarted()  (297 chars) -----
Okay — starting fresh.

👋 Hi! I'm *TeachSpark*. In about 2 minutes I'll teach you one AI skill and we'll make a ready-to-use worksheet for YOUR class — free.

First, which grade do you mainly teach?
1) Primary (Classes 1-5)
2) Middle (Classes 6-8)
3) High (Classes 9-12)

Reply with the number 🙂

----- askSubject()  (101 chars) -----
Great 👍 Which subject do you mainly teach?
1) Maths
2) Science
3) English
4) Social Studies
5) Other

----- askBoard()  (79 chars) -----
And which board?
1) CBSE
2) ICSE / ISC
3) State board
4) Other (IB / IGCSE / …)

----- pleaseReplyWithNumber(renderMenu(GRADE_OPTIONS))  (108 chars) -----
Please reply with just the number 🙂
1) Primary (Classes 1-5)
2) Middle (Classes 6-8)
3) High (Classes 9-12)

----- acceptedFreeText('Multiple classes', askSubject())  (131 chars) -----
Got it — "Multiple classes".

Great 👍 Which subject do you mainly teach?
1) Maths
2) Science
3) English
4) Social Studies
5) Other

----- SKILLS.worksheet.microLesson(profile)  (511 chars) -----
💡 *Today's skill (30 seconds): the 3-level worksheet*

AI writes great worksheets when you ask for *three levels* of the same topic — Support, On-level and Challenge — so one sheet fits your whole mixed-ability class.

You give it four things: topic · grade · board · number of questions. It does the rest. I already know you teach Maths (Middle (Classes 6-8), CBSE).

Let's try it on YOUR class. What topic are you teaching this week? (e.g. "Comparing fractions with unlike denominators" or "The water cycle")

----- generatingAck('worksheet')  (48 chars) -----
✍️ Making your worksheet now — about 30 seconds…

----- stillWorking()  (46 chars) -----
Still working on it — about 20 more seconds ✍️

----- disclaimer()  (62 chars) -----
⚠️ AI can make mistakes — please review before using in class.

----- pdfFailedNote()  (67 chars) -----
(The PDF could not be made this time — the text above is complete.)

----- reusablePromptAndImpact(worksheet.reusablePrompt(profile, "Comparing fractions"))  (455 chars) -----
🎁 *Keep the skill, not just the sheet.* Here is the exact prompt you just used — paste it into ChatGPT, Gemini or any AI tool next time:

"Create a differentiated Middle (Classes 6-8) CBSE Maths worksheet on "Comparing fractions" with 3 levels (support, on-level, challenge), 5 questions each, and an answer key. Plain text, no tables."

⏱️ Roughly how long would this have taken you by hand?
1) About 15 minutes
2) About 30 minutes
3) 45 minutes or more

----- referralQuestion('About 30 minutes')  (155 chars) -----
🎉 You just saved about 30 minutes! One last thing — did a colleague forward TeachSpark to you?
1) Yes — a colleague forwarded it
2) No — I found it myself

----- referralQuestion(null)  [impact skipped]  (128 chars) -----
🎉 Done! One last thing — did a colleague forward TeachSpark to you?
1) Yes — a colleague forwarded it
2) No — I found it myself

----- shareCta(JOIN, 'exit ticket')  [skill 1 done]  (300 chars) -----
🙏 Thank you! Know a teacher who'd want this? Forward this link 👉 https://wa.me/14155238886?text=join%20clever-tiger
(They tap it, send the "join" message that appears, then type Hi.)

Tomorrow I'll message you skill #2: the *exit ticket*.
Reply *NEW* anytime for another one, or *HELP* for options.

----- shareCta(JOIN, null)  [last skill done]  (302 chars) -----
🙏 Thank you! Know a teacher who'd want this? Forward this link 👉 https://wa.me/14155238886?text=join%20clever-tiger
(They tap it, send the "join" message that appears, then type Hi.)

That was the last skill for now — thank you for testing!
Reply *NEW* anytime for another one, or *HELP* for options.

----- help()  (424 chars) -----
ℹ️ *TeachSpark* teaches you one AI skill at a time and makes classroom material for YOUR class.

Commands:
• *NEW* — make another worksheet or quiz
• *RESTART* — change your grade / subject / board
• *HELP* — this message

What I store: your WhatsApp number, your grade, subject and board, and the topics you ask for. Never student details — please don't send any.
AI can make mistakes — always review before using in class.

----- topicRejected('ack', worksheet)  (111 chars) -----
Just tell me the topic in a few words, e.g. "Comparing fractions with unlike denominators" or "The water cycle"

----- topicRejected('too_short', worksheet)  (111 chars) -----
Just tell me the topic in a few words, e.g. "Comparing fractions with unlike denominators" or "The water cycle"

----- topicRejected('too_long', worksheet)  (63 chars) -----
That is a bit long — give me the topic in under 200 characters.

----- topicRejected('pii', worksheet)  (171 chars) -----
Please don't share student names, phone numbers or emails — I only need the topic 🙂 What topic? (e.g. "Comparing fractions with unlike denominators" or "The water cycle")

----- generationFailed()  (101 chars) -----
😔 Sorry, that one didn't work. Let's try again — send me the topic once more (or try a simpler one).

----- generationRefused()  (110 chars) -----
I can't make material on that topic. Try a classroom topic like "Fractions" or "The water cycle" — what topic?

----- somethingWentWrong()  (71 chars) -----
😔 Something went wrong on my side. Please send that again in a moment.

----- SKILLS.quiz.microLesson(profile)  (521 chars) -----
💡 *Today's skill (30 seconds): the exit ticket*

An exit ticket is a 5-question quiz students finish in the last 5 minutes of class, so you know who actually got today's lesson before they leave.

AI writes one in seconds if you tell it the *objective* of the lesson, not just the chapter name. I'll use your Maths (Middle (Classes 6-8), CBSE) context.

What did you teach today (or will teach next)? Send me the topic or lesson objective (e.g. "Photosynthesis: inputs and outputs" or "Linear equations in one variable")

----- generatingAck('exit ticket')  (50 chars) -----
✍️ Making your exit ticket now — about 30 seconds…

----- nudge(SKILLS.quiz, profile)  (642 chars) -----
👋 Good morning! Yesterday you made a ready-to-use TeachSpark sheet with AI. Today's 2-minute skill: the *exit ticket*.

💡 *Today's skill (30 seconds): the exit ticket*

An exit ticket is a 5-question quiz students finish in the last 5 minutes of class, so you know who actually got today's lesson before they leave.

AI writes one in seconds if you tell it the *objective* of the lesson, not just the chapter name. I'll use your Maths (Middle (Classes 6-8), CBSE) context.

What did you teach today (or will teach next)? Send me the topic or lesson objective (e.g. "Photosynthesis: inputs and outputs" or "Linear equations in one variable")
```

</details>

*(Generated by a throwaway `npx tsx` script run outside the repo, then deleted — not committed.)*

**Verdict: PENDING-HUMAN** — Tushar's read.

---

## Case 5 — Purity check

**Steps:**
```
grep -rnE '\bawait\b|\bfetch\b|\bsupabase\b|\btwilio\b|process\.env|Math\.random|Date\.now' src/bot/
```
(run from the repo root; `src/bot/` contains `machine.ts`, `messages.ts`, `nudge.ts`, `parse.ts`, `skills.ts`.)

**Expected:** no output — an empty result is a PASS.

**Actual:**
```
$ grep -rnE '\bawait\b|\bfetch\b|\bsupabase\b|\btwilio\b|process\.env|Math\.random|Date\.now' src/bot/
$ echo $?
1
```
Zero matching lines; grep exit code 1 = "no lines selected". Every one of the five files in `src/bot/` is free of I/O, ambient clock reads and randomness. Time enters the machine only as an explicit `now: Date` parameter (`transition`, `afterGeneration`, `buildNudgeStep`, `computeNudgeDueAt`), which is exactly what makes Case 2 reproducible without fake timers.

> Note: `machine.ts` and `nudge.ts` do call `Date.prototype.getTime()` and `new Date(...)` on values that were **passed in**, which is pure arithmetic on caller-supplied instants and is not what this grep targets. No `Date.now()` anywhere.

**Verdict: PASS**

---

## Summary

| Case | Description | Verdict |
|---|---|---|
| 1 | Suite green (typecheck + 118 passing / 1 skipped baseline; 132 / 1 with the new QA tests) | PASS |
| 2 | Simulated full conversation — 24-event PRD funnel in exact order, all bodies ≤ 1500, lands IDLE with a nudge < 24h | PASS |
| 3 | Edge cases — 11 checklist rows, implemented as 9 vitest cases (commands, menus, topic validation, nudges) | PASS |
| 4 | Copy look-check on a phone (tone + disclaimer) | PENDING-HUMAN (Tushar) |
| 5 | Purity — no I/O, clock or randomness in `src/bot/` | PASS |

**Overall Phase 2 gate: all executable cases (1, 2, 3, 5) PASS.** The event order emitted by the machine matches the PRD funnel with no diff, so no adjudication is needed. Case 4 is deferred to Tushar's read; the full copy is rendered above so it needs no tooling. One non-blocking observation is recorded under Case 3 (deliberately lenient `parseOption` matching).
