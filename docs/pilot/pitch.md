# TeachSpark — send-ready pitch

Open this file, copy the block, send. The join link below is already filled in —
nothing to substitute.

> **Before a recruiting session, confirm the join link still matches production.**
> The sandbox join code changes if the Twilio sandbox is reset, and a stale link
> fails silently — the teacher sends `join <old-code>`, gets nothing back, and
> assumes the pilot is broken. Check the deployed app's boot log:
>
> ```
> railway logs -n 30 | grep "join link"
> ```
>
> Verified `2026-08-21`: `https://wa.me/14155238886?text=join%20captain-cheese`

---

## Variant 1 — Personal DM

Replace `[name]`. DMs convert far better than group posts — lead with these.

```
Hi [name] 👋
I'm piloting *TeachSpark* on WhatsApp — it writes a ready-to-use worksheet for your own class in about 2 minutes, free.
You give it your grade, subject, board and topic, and it sends back a 3-level worksheet (Support / On-level / Challenge, with an answer key) as a WhatsApp message and a PDF — plus the exact prompt, so you can do this yourself in ChatGPT or Gemini next time.
It can also turn photos of a textbook chapter into a complete question paper — editable Word file, answer key included. Just type *PAPER* once you're in.

To join: tap https://wa.me/14155238886?text=join%20captain-cheese → send the "join" message that pops up → then type *Hi*.

It's a small pilot, so if it ever stops replying, just tap the link again to rejoin.
It never asks for student data — please don't send any — and you can stop anytime.
Would really value your honest feedback 🙏
```

## Variant 2 — Staff-room / teacher-group post

```
📚 For anyone prepping worksheets tonight —
I'm piloting *TeachSpark*, a WhatsApp bot that writes a ready-to-use worksheet for YOUR class in about 2 minutes. Free, nothing to install.
Give it your grade, subject, board and topic, and it sends back a 3-level worksheet (Support / On-level / Challenge + answer key) as text and a PDF — plus the exact prompt, so you can do it yourself in ChatGPT or Gemini next time.
It can also turn photos of a textbook chapter into a complete question paper — editable Word file, answer key included. Just type *PAPER* once you're in.

To join: tap https://wa.me/14155238886?text=join%20captain-cheese → send the "join" message that pops up → then type *Hi*.

It's a small pilot, so if it ever stops replying, just tap the link again to rejoin.
It never asks for student data — please don't send any — and you can leave anytime.
Try it before your next lesson prep and let me know what you think!
```

---

## If she asks "how does it work?"

```
It's a WhatsApp bot — you tap your grade, subject and board from a short menu, type your topic, and in under a minute it sends back a 3-level worksheet (Support / On-level / Challenge, plus an answer key) as a WhatsApp message and a PDF. Then it gives you the exact prompt so you can do the same thing yourself in ChatGPT or Gemini next time. No login, no app — just WhatsApp.
```

## If she asks about the question paper

```
Type PAPER, tell it the subject and chapter, then send photos of the chapter pages — as many as you like. It reads them and builds a full question paper at the difficulty levels you pick, with an answer key, and sends it back as a Word file you can edit. You can add your school name and logo once and it remembers them.
```

---

## Sending notes

- **Send in waves of 10–15, spaced out.** Twilio's sandbox caps outbound at one
  message every 3 seconds. If 40 teachers join at once, replies queue — and a
  teacher waiting 90 seconds for a reply to `Hi` assumes it's broken and leaves.
- **The join tap is the drop-off point.** The link only *pre-fills* `join
  captain-cheese`; she still has to press send. That is why the instruction spells
  out all three steps. Don't shorten it.
- **Front-load recruiting.** D1 return needs the next-day nudge to land inside
  WhatsApp's 24-hour window, so a teacher who joins on the last day contributes to
  user count but not to retention.
- **Sandbox joins lapse after ~72h idle.** If someone says it stopped replying,
  the fix is to tap the link again — that is what the "small pilot" line preempts.
- Track who you sent to and what came back in
  [`observation-sheet.md`](./observation-sheet.md); pull the funnel any time with
  `/admin/metrics` or `npm run export:events`.
