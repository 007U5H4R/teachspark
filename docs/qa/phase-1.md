# Phase 1 QA Gate — TeachSpark

**Scope:** Tasks 1–4 (project scaffold + `/health`, zod-validated config, domain types/events/ports/in-memory adapters, Supabase migration + adapters).
**Tester:** Independent QA agent (did not write this code).
**Repo state:** branch `main`, HEAD `f5c7b0d` (`feat(db): supabase schema migration and teacher/event/generation adapters`).
**Environment:** macOS (Darwin 25.5.0), Node `v26.7.0`.
**Date:** 2026-08-20.

## Phase 1 regression scope

Cases #1 and #2 each re-run the *entire* test suite / build, not just Task 4's new code, so together they act as the regression gate for all of Phase 1:

- `test/health.test.ts` — Task 1 (scaffold + `GET /health`)
- `test/config.test.ts` — Task 2 (zod config)
- `test/memory-adapters.test.ts` — Task 3 (domain types/events/ports + in-memory adapters)
- `test/supabase-mappers.test.ts` — Task 4 (Supabase row↔domain mappers, no live DB)
- `test/supabase.int.test.ts` — Task 4 (live Supabase integration; skips without env — see Case #4)

A single green run of `npm run typecheck && npm test` plus a clean `npm run build` + working `/health` therefore exercises every task shipped in Phase 1, not just the latest one.

---

## Case 1 — Suite green

**Steps:** `npm run typecheck && npm test`
**Expected:** both succeed; test summary shows 17 passing, 1 skipped (Supabase integration suite skips with no env).

**Actual:**
- `npm run typecheck` (`tsc -p tsconfig.json`) → exit 0, no output (no type errors).
- `npm test` (`vitest run`) → exit 0. Exact summary lines:
  ```
   Test Files  4 passed | 1 skipped (5)
        Tests  17 passed | 1 skipped (18)
     Start at  16:23:05
     Duration  392ms (transform 221ms, setup 0ms, import 598ms, tests 49ms, environment 1ms)
  ```
  Matches the expected 17 passing / 1 skipped exactly. The skipped file is `test/supabase.int.test.ts` (see Case #4).

**Verdict: PASS**

---

## Case 2 — Build + health

**Steps:**
1. `rm -rf dist && npm run build`
2. Confirm `dist/index.js` exists.
3. `PORT=3111 node dist/index.js &` (background), capture PID, wait ~1s.
4. `curl -s localhost:3111/health`
5. Kill the server by PID.

**Expected:** build succeeds, `dist/index.js` exists, health endpoint returns `{"ok":true}`.

**Actual:**
- `npm run build` (`tsc -p tsconfig.build.json`) → exit 0.
- `dist/index.js` present (confirmed via `ls -la dist/`, 276 bytes, alongside `dist/http/`, `dist/domain/`, `dist/adapters/`, `dist/config.js`, `dist/ports.js`).
- Server started on PORT=3111, PID 4066, log line: `teachspark listening on :3111`.
- `curl -s -w "\nHTTP_STATUS:%{http_code}\n" localhost:3111/health`:
  ```
  {"ok":true}
  HTTP_STATUS:200
  ```
- Server killed cleanly: `kill 4066` → process confirmed gone (`ps -p 4066` found nothing) — logged as "KILLED PID 4066".

**Verdict: PASS**

---

## Case 3 — Config validation

**Steps:** Inline `tsx` script (not committed — scratch file outside the repo) importing `loadConfig` from `src/config.ts`, using SYNTHETIC env values mirroring the `valid` fixture in `test/config.test.ts` (no real `.env` read or sourced). Checks:
1. A complete valid env is **accepted**.
2. Env missing `ANTHROPIC_API_KEY` is **rejected**, error names the key.
3. Env missing `SUPABASE_URL` is **rejected**, error names the key.
4. Env missing `PUBLIC_BASE_URL` is **rejected**, error names the key.

**Expected:** complete env passes; each of the 3 incomplete envs throws with the missing key named in the message.

**Actual** (`npx tsx qa-config-check.ts`, exit 0):
```
=== Case 3: config validation spot-check ===
[ACCEPT] complete valid env -> OK, PORT default = 3000  NODE_ENV = development
[REJECT] missing ANTHROPIC_API_KEY -> threw, names key: true
  message: Invalid environment: | ✖ Invalid input: expected string, received undefined |   → at ANTHROPIC_API_KEY
[REJECT] missing SUPABASE_URL -> threw, names key: true
  message: Invalid environment: | ✖ Invalid input: expected string, received undefined |   → at SUPABASE_URL
[REJECT] missing PUBLIC_BASE_URL -> threw, names key: true
  message: Invalid environment: | ✖ Invalid input: expected string, received undefined |   → at PUBLIC_BASE_URL
```
All three spot-checked keys threw with the missing key named via zod's `prettifyError` (`→ at <KEY>`); the complete env was accepted and applied expected defaults (`PORT=3000`, `NODE_ENV=development`).

**Verdict: PASS**

---

## Case 4 — Supabase live (migration applied, RLS, integration test) — NOT EXECUTED

**Why not executed:** requires a live Supabase project with the migration applied (human step, in progress) and real credentials. Per QA scope, this case is documented only — the controller runs the live integration test after the human migration step is applied. `.env` was not read, sourced, or printed, and `test/supabase.int.test.ts` was not run against a live DB.

**Static verification performed instead:**
- Migration file `supabase/migrations/20260820000000_init.sql` exists and defines all 3 required tables:
  ```
  2:create table if not exists public.teachers (
  24:create table if not exists public.events (
  33:create table if not exists public.generations (
  ```
- The same file enables RLS on all 3 tables:
  ```
  53:alter table public.teachers    enable row level security;
  54:alter table public.events      enable row level security;
  55:alter table public.generations enable row level security;
  ```
- `test/supabase.int.test.ts` exists and is guarded with `describe.skipIf(!url || !key)(...)` (line 7), which is exactly why it reports as the 1 skipped test in Case #1's suite run when `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are absent from the environment.

**Verdict: PENDING** — controller runs the live integration test (`test/supabase.int.test.ts` with real `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` env) against the migrated Supabase project once the human migration-apply step is complete, and confirms all 3 tables exist with RLS enabled in the live project (not just in the migration file) before Case #4 can be marked PASS.

---

## Case 5 — `.env` ignored

**Steps:** `git check-ignore .env`
**Expected:** prints `.env`.

**Actual:**
```
$ git check-ignore .env
.env
$ git check-ignore -v .env
.gitignore:4:.env	.env
```
Exit code 0. Confirmed matched by line 4 of `.gitignore` (`.env`).

**Verdict: PASS**

---

## Summary

| Case | Description | Verdict |
|---|---|---|
| 1 | Suite green (typecheck + test, 17 passing / 1 skipped) | PASS |
| 2 | Build + health (`{"ok":true}` on `/health`) | PASS |
| 3 | Config validation (accepts complete env, rejects 3 spot-checked missing keys by name) | PASS |
| 4 | Supabase live (3 tables + RLS + integration test) | PENDING (needs live migrated project — controller to run after human step) |
| 5 | `.env` git-ignored | PASS |

**Overall Phase 1 gate: all executable cases (1, 2, 3, 5) PASS.** Case 4 is correctly deferred pending the live Supabase migration; migration file and test-skip wiring are verified statically and are correct.
