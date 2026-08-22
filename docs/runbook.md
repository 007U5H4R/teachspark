# TeachSpark — WhatsApp bot (Case Study 4 MVP)

## What it is

TeachSpark is a WhatsApp bot that teaches a time-poor Indian K–12 teacher one reusable AI
skill — writing a differentiated worksheet, or an exit-ticket quiz — and, in the same
conversation, produces a ready-to-use PDF for her own class in about two minutes. No app to
install, no login: just WhatsApp.

## Architecture

```
   Teacher's WhatsApp
          |
          | Twilio-signed POST
          v
+-----------------------------------------+
|  Express app  (src/http/app.ts)          |
|  POST /webhooks/twilio/whatsapp          |
+---------------------+---------------------+
                       |
                       v
+-----------------------------------------+
|  transition()  (src/bot/machine.ts)      |
|  PURE function, no I/O                   |
|  (Teacher, Message, now) -> Step         |
|    { updates, events, actions }          |
+---------------------+---------------------+
                       |
                       v
+-----------------------------------------+
|  Executor.runStep(teacher, step)         |
|  (src/bot/executor.ts)                   |
|  1. persist `updates`                    |
|  2. log `events`                         |
|  3. run each `action` through a PORT     |
|     (src/ports.ts)                       |
+---------------------+---------------------+
                       |
                       v
        adapters in src/adapters/ implement the ports:
          TeacherRepo, EventLog, GenerationStore -> Supabase (postgres)
          PdfStore                               -> Supabase Storage
          Messenger                              -> Twilio (WhatsApp send)
          Generator                              -> Anthropic (Claude)
          PdfBuilder                             -> pdfkit (local, no I/O)
```

The core is a **pure state machine**: `transition()` takes a `Teacher`, the inbound
`Message`, and the current time, and returns a `Step` — a plain data value describing what
should happen next (`updates` to persist, `events` to log, `actions` to run). It does no I/O
and reads no clock itself, which is why the entire conversation flow is unit-testable without
a network connection (see `test/machine.test.ts`, `test/qa-conversation.test.ts`). An
`Executor` is the only thing that turns a `Step` into real effects, and it only ever talks to
the small PORT interfaces in `src/ports.ts` — never directly to Supabase, Twilio, or
Anthropic. `src/adapters/memory.ts` implements those same ports in memory, which is what the
test suite runs against.

A second, independent trigger reaches the same `Step` → `Executor` core: the nudge sweep in
`src/jobs/nudges.ts` calls `buildNudgeStep()` (also in `machine.ts`) instead of
`transition()`, either from an in-process `node-cron` schedule (`NUDGE_CRON`, default every
10 minutes) or from `POST /internal/cron/nudges`. Both call the exact same closure, which
serializes concurrent sweeps in-process — but that guard has no visibility across replicas,
which is why `railway.json` pins `numReplicas: 1` (see **Deploy**, below): a second replica
would run its own cron and could double-fire a nudge to the same teacher.

## Local development

1. `cp .env.example .env` and fill in the keys (Twilio, Anthropic, Supabase — see the
   environment variable table below). `.env` is git-ignored; never commit it.
2. `npm install`
3. `npm run dev` — starts the Express app on `PORT` (default `3000`) with `tsx watch`,
   restarting on file changes, plus the in-process nudge cron.
4. Expose it publicly for Twilio: `ngrok http 3000 --url https://<your-dev-domain>`. Set
   `PUBLIC_BASE_URL` in `.env` to that exact URL (no trailing slash) and restart `npm run dev`.
5. In the Twilio Console, set the WhatsApp Sandbox "when a message comes in" webhook to
   `https://<your-dev-domain>/webhooks/twilio/whatsapp` (POST) and save.
6. From your own WhatsApp, send `join <TWILIO_SANDBOX_JOIN_CODE>` to `+1 415 523 8886`, then
   send `Hi` to the bot.

## Environment variables

All 17 read from `.env.example` (the authoritative list). Required variables have no default
and boot fails fast (`loadConfig()` in `src/config.ts`) if they're missing.

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | Runtime mode; Railway sets `production`. |
| `PORT` | `3000` | HTTP port the Express app binds to. |
| `PUBLIC_BASE_URL` | — (required) | Public HTTPS origin Twilio calls back to; no trailing slash. Must exactly match the deployed URL or Twilio signature validation fails. |
| `TWILIO_ACCOUNT_SID` | — (required) | Twilio account SID. |
| `TWILIO_AUTH_TOKEN` | — (required) | Twilio auth token; signs/verifies inbound webhook requests. |
| `TWILIO_WHATSAPP_FROM` | `whatsapp:+14155238886` | Twilio WhatsApp sender number (sandbox number by default). |
| `TWILIO_SANDBOX_JOIN_CODE` | — (required) | The two-word sandbox join code (without the word "join"); used to build the wa.me deep link. |
| `TWILIO_VALIDATE_SIGNATURE` | `true` | Verify the Twilio request signature on inbound webhooks; keep `true` in production. |
| `ANTHROPIC_API_KEY` | — (required) | Claude API key used to generate worksheets/quizzes. |
| `WORKSHEET_MODEL` | `claude-sonnet-5` | Model id passed to the Anthropic API. |
| `SUPABASE_URL` | — (required) | Supabase project URL (Postgres + Storage). |
| `SUPABASE_SERVICE_ROLE_KEY` | — (required) | Supabase service-role key (server-side only — never expose client-side). |
| `SUPABASE_PDF_BUCKET` | `worksheets` | Storage bucket generated PDFs are uploaded to (created on boot if missing). |
| `ADMIN_TOKEN` | — (required, min 8 chars) | Full admin. Signs in at `/admin`, and is still accepted as a Bearer token by `GET /api/admin/metrics` and the deprecated `GET /admin/metrics`. **Also the signing key for every session cookie — rotating it signs everyone out, which is the revocation mechanism.** |
| `DEMO_TOKEN` | — (optional, min 8 chars) | Read-only demo access to `/admin`. Same real numbers, but names, schools and phone numbers are withheld **server-side** before the payload leaves. Cannot use `?phones=full` and is refused by the deprecated `/admin/metrics` alias. Must differ from `ADMIN_TOKEN` or the app refuses to boot. Omit it entirely and demo login is unavailable. |
| `CRON_SECRET` | — (required, min 8 chars) | Shared secret (header `x-cron-secret`) guarding `POST /internal/cron/nudges`. |
| `NUDGE_TIMEZONE` | `Asia/Kolkata` | IANA timezone used to schedule nudges and compute quiet hours. |
| `NUDGE_CRON` | `*/10 * * * *` | Cron expression for the in-process nudge sweep. |

## Testing

- `npm test` — runs the full Vitest suite (unit tests plus two integration suites).
- `npm run typecheck` — `tsc` against `tsconfig.json`, no emit.
- `npm run build` — builds the web app (`npm run build -w web`) and then compiles the server to
  `dist/` via `tsconfig.build.json`; this is what Railway runs before `node dist/index.js`.
  The web build reads `PUBLIC_BASE_URL` at **build** time and fails fast when it is missing, not
  `https://`, or has a trailing slash — so on Railway it must be set as a *service* variable
  (build environment), not only at runtime. A failed build leaves the previous container serving.

`test/storage.int.test.ts` and `test/supabase.int.test.ts` wrap their suite in
`describe.skipIf(!url || !key)` and only run when `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` are set in the environment. Locally and in CI without those set,
both report as skipped — that's expected, not a failure.

## Deploy (Railway)

Prereqs: Railway CLI installed and `railway login` done, and the values from your local
`.env` on hand to copy in (never commit `.env` — it's git-ignored).

1. **Create the project and a domain**

   ```bash
   railway init            # new project "teachspark"
   railway domain          # generates https://<something>.up.railway.app -- note it
   ```

2. **Set production environment variables** — every variable from the table above, with
   `PUBLIC_BASE_URL` set to the *exact* domain from step 1 (HTTPS, no trailing slash):

   ```bash
   railway variable set \
     NODE_ENV=production \
     PUBLIC_BASE_URL=https://<your-app>.up.railway.app \
     TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... \
     TWILIO_WHATSAPP_FROM="whatsapp:+14155238886" \
     TWILIO_SANDBOX_JOIN_CODE=... TWILIO_VALIDATE_SIGNATURE=true \
     ANTHROPIC_API_KEY=... WORKSHEET_MODEL=claude-sonnet-5 \
     SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_PDF_BUCKET=worksheets \
     ADMIN_TOKEN=... CRON_SECRET=... \
     NUDGE_TIMEZONE=Asia/Kolkata "NUDGE_CRON=*/10 * * * *"
   ```

3. **Deploy and verify**

   ```bash
   railway up --detach && railway logs -n 50
   curl -s https://<your-app>.up.railway.app/health
   curl -s -H "Authorization: Bearer $ADMIN_TOKEN" https://<your-app>.up.railway.app/admin/metrics | head -c 300
   ```

   Expect `{"ok":true}` from `/health`, and the logs to show `teachspark listening` plus the
   join link, with no error lines. Railway builds with Railpack (`npm run build`) and starts the
   container with `node dist/index.js`, per `railway.json`.

   **Do not put `npm ci` back in `buildCommand`.** Railpack runs its own install first — verified
   to include devDependencies (607 packages vs 608 for a full local install), so `vite` and `tsc`
   are present despite `NODE_ENV=production`. A second `npm ci` wipes `node_modules` before
   reinstalling, and Railpack mounts a Vite build cache at `web/node_modules/.vite`; a mount point
   cannot be removed, so the build dies with
   `EBUSY: resource busy or locked, rmdir '/app/web/node_modules/.vite'`. This only started once
   `web/` became an npm workspace — the single-package repo had no such cache to collide with.

4. **Point the Twilio sandbox at production** — Twilio Console → Sandbox settings → "When a
   message comes in" → `https://<your-app>.up.railway.app/webhooks/twilio/whatsapp` (POST) →
   Save. Send `Hi` from a joined phone and confirm the full flow runs against production.

Two things that will bite you if skipped:

- **`numReplicas` must stay `1`.** The nudge sweep runs as an in-process `node-cron`
  schedule, not a separate worker (see **Architecture**, above). A second replica runs its
  own copy of that cron with no cross-replica coordination, so teachers would get every
  nudge twice. Don't scale this service horizontally without first moving the cron out of
  the app process.
- **`PUBLIC_BASE_URL` must exactly equal the deployed origin** Twilio is calling — same
  scheme and host, no trailing slash, no typos. With `TWILIO_VALIDATE_SIGNATURE=true`,
  Twilio's webhook signature is checked against `${PUBLIC_BASE_URL}${path}`; any mismatch
  fails validation and every inbound message is silently rejected. If teachers report no
  replies, check `railway logs` for `Twilio Request Validation Failed` — that's the tell.

## Operations / pilot notes

Real constraints for the pilot (40–50 teachers), not hypothetical edge cases:

- **Sandbox joins expire after 3 days.** When a teacher's join lapses, she must re-send
  `join <TWILIO_SANDBOX_JOIN_CODE>` to `+1 415 523 8886` before the bot can message her again.
- **24-hour messaging window.** Twilio only allows free-form WhatsApp messages within 24h of
  the teacher's last inbound message; outside that window a send fails with error `63016`.
  This is why the next-day nudge is scheduled at last-inbound + 20h (`computeNudgeDueAt`,
  `src/bot/nudge.ts`) — a safety margin inside the window — and pulled back to the previous
  21:xx local time if the +20h point would land in quiet hours (22:00–07:59 IST).
- **Sandbox throughput is ~1 outbound message per 3 seconds.** Don't fan out a broadcast to
  all teachers at once; the nudge sweep processes its due-list sequentially, which naturally
  respects this.
- **Error `63015`** means the recipient has not (or is no longer) joined the sandbox —
  expected for anyone who let their 3-day join lapse.
- **Supabase free-tier projects pause after ~1 week of inactivity.** The nudge cron queries
  Supabase every `NUDGE_CRON` tick (default every 10 minutes) regardless of whether anything
  is due, which keeps the project warm for the duration of the pilot.
- **Cost is roughly $0.01 per generation** on `claude-sonnet-5` (`WORKSHEET_MODEL`).

## Analytics

- `GET /admin/metrics` (header `Authorization: Bearer $ADMIN_TOKEN`) returns the funnel as
  JSON — computed by `computeFunnel()` (`src/metrics/funnel.ts`): total teachers, onboarded,
  activated, impact reported, returned for skill 2, completed both skills, median minutes
  saved, referrals, nudges sent/reopened, and raw per-event counts.
- `npm run export:events` (needs `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` etc. in `.env`)
  pulls every event and teacher from Supabase, writes `out/events.csv`
  (`teacher_id,name,skill_id,properties,created_at`), and prints the same funnel JSON to
  stdout — for the case-study write-up.

## Endpoints

| Method & path | Auth | Notes |
|---|---|---|
| `GET /health` | none | Liveness probe. Deliberately does not touch Supabase, so a database blip can't fail the platform health check and trigger a restart loop. |
| `POST /webhooks/twilio/whatsapp` | Twilio request signature (`TWILIO_VALIDATE_SIGNATURE`) | Inbound WhatsApp message. ACKs Twilio with empty TwiML immediately; the real work runs after the response, off the request path. |
| `POST /webhooks/twilio/status` | none (Twilio delivery callback) | Message status callback; logs `failed`/`undelivered` with the Twilio error code. |
| `GET /admin/metrics` | `Authorization: Bearer $ADMIN_TOKEN` | Returns the funnel JSON (see **Analytics**). |
| `POST /internal/cron/nudges` | header `x-cron-secret: $CRON_SECRET` | Runs one nudge sweep on demand (same code path as the in-process cron); returns `{ "sent": <n> }`. |
