# TeachSpark pilot — live observation sheet

For watching 3–5 teachers use TeachSpark live (in person or on a screen-share),
start to finish: join → grade/subject/board → topic → worksheet + PDF →
reusable prompt → impact/referral questions.

## How to run the session

- Don't coach her. Let her read each message and decide what to reply without
  hints, even if she pauses for a while — the pause itself is data.
- The moment she hesitates — stares at the screen, re-reads a message, asks
  "wait, what do I do here?" — note the exact step it happened at. That's more
  useful than any impression you form afterward.
- Capture what she actually says, word for word, in the moment. Don't
  paraphrase or clean it up — her exact phrasing is what's worth quoting later.
- Save "why did you do that?" / "what did you expect?" questions for **after**
  she finishes the flow, not mid-task — interrupting to ask changes her
  behavior for the rest of the session.

## What to watch for

Specific risks in this build worth confirming with real teachers, not just
tests:

- **Does she understand the numbered menus?** Grade / subject / board are
  presented as `1) 2) 3)` lists — does she reply with the number, or try to
  type the answer in words (both work, but which does she reach for first)?
- **Does she type an actual topic, or an acknowledgement like "ok"?** The bot
  re-prompts on filler replies ("ok", "sure", "hi", "great", etc.) — watch
  whether that re-prompt lands as a normal step or as a confusing dead end.
- **Does the PDF actually open on her phone?** It arrives as a WhatsApp
  document attachment, not a link — confirm it downloads and opens cleanly on
  her device and network, not just in a good-network test.
- **Does she notice the reusable prompt?** After the worksheet, the bot hands
  her the exact prompt to reuse in ChatGPT/Gemini next time (the "keep the
  skill, not just the sheet" message). Does she read it, react to it, save it,
  or scroll straight past?
- **Does she come back for the next-day nudge?** Skill 2 (the exit ticket) is
  offered the next day, not in this session — note whether she says anything
  that predicts she will (or won't) engage with a follow-up message tomorrow.

## Observation log

| # | Entry source | Time to first worksheet | Where she hesitated | What she said (verbatim) | Impact answer (15/30/45) | Referral answer (yes/no) | Opened the PDF? | Follow-up notes |
|---|---|---|---|---|---|---|---|---|
| 1 |  |  |  |  |  |  |  |  |
| 2 |  |  |  |  |  |  |  |  |
| 3 |  |  |  |  |  |  |  |  |
| 4 |  |  |  |  |  |  |  |  |
| 5 |  |  |  |  |  |  |  |  |

- **Entry source** — which group or DM she joined from (so you can tell later
  which recruit message/channel actually converts).
- **Impact answer** matches the bot's own menu: 15 = "About 15 minutes",
  30 = "About 30 minutes", 45 = "45 minutes or more".
- **Referral answer** matches the bot's own menu: yes = "a colleague forwarded
  it", no = "I found it myself".

## Funnel snapshot

Run before the first session (baseline) and after each session, so you can
see the funnel move:

```bash
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" <BASE_URL>/admin/metrics | jq
```

```bash
npm run export:events
```

`export:events` writes `out/events.csv` and prints the same funnel JSON to
the terminal. `<BASE_URL>` is the deployed app's public URL; `$ADMIN_TOKEN`
must be set in your shell environment — neither is committed anywhere.

## After each session

1. Finish this teacher's row completely — entry source, hesitation point,
   verbatim quote, impact/referral answers, PDF opened y/n, follow-up notes —
   before starting the next session. Details fade fast.
2. Save any screenshots you took (join flow, worksheet, PDF) somewhere you
   can find them again, named with the teacher number from this sheet.
3. Re-run the funnel snapshot above so you have a metrics checkpoint tied to
   each session.
