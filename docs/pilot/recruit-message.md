# TeachSpark pilot — recruit message

> **To actually send these, use [`pitch.md`](./pitch.md)** — same copy with the
> join link already filled in, plus sending notes. This file is the source with
> the `{{JOIN_LINK}}` placeholder discipline intact; keep the two in sync when
> either changes.

Two forwardable variants: a personal DM and a staff-room / teacher-group post.
Copy the text inside the fenced block only — everything outside the fences
(these notes, the headings) is for Tushar, not for teachers.

> **Verify `{{JOIN_LINK}}` before every send.** As of the last deploy it is:
>
> `https://wa.me/14155238886?text=join%20captain-cheese`
>
> The sandbox join code can change if the Twilio sandbox is reset. Re-check it
> in the deployed app's boot log (`join link: ...`, printed on startup — see
> `src/index.ts`) before sending any message below, and substitute the real
> value for every `{{JOIN_LINK}}`. Never hardcode last week's link.

## Variant 1 — Personal DM

Replace `[name]` with the teacher's first name. Leave `{{JOIN_LINK}}` as the
literal placeholder until you swap in the verified link above.

```
Hi [name] 👋
I'm piloting *TeachSpark* on WhatsApp — it writes a ready-to-use worksheet for your own class in about 2 minutes, free.
You give it your grade, subject, board and topic, and it sends back a 3-level worksheet (Support / On-level / Challenge, with an answer key) as a WhatsApp message and a PDF — plus the exact prompt, so you can do this yourself in ChatGPT or Gemini next time.
It can also turn photos of a textbook chapter into a complete question paper — editable Word file, answer key included. Just type *PAPER* once you're in.

To join: tap {{JOIN_LINK}} → send the "join" message that pops up → then type *Hi*.

It's a small pilot, so if it ever stops replying, just tap the link again to rejoin.
It never asks for student data — please don't send any — and you can stop anytime.
Would really value your honest feedback 🙏
```

## Variant 2 — Staff-room / teacher-group post

Same substitutions as above. Written for a group, so it doesn't address anyone
by name.

```
📚 For anyone prepping worksheets tonight —
I'm piloting *TeachSpark*, a WhatsApp bot that writes a ready-to-use worksheet for YOUR class in about 2 minutes. Free, nothing to install.
Give it your grade, subject, board and topic, and it sends back a 3-level worksheet (Support / On-level / Challenge + answer key) as text and a PDF — plus the exact prompt, so you can do it yourself in ChatGPT or Gemini next time.
It can also turn photos of a textbook chapter into a complete question paper — editable Word file, answer key included. Just type *PAPER* once you're in.

To join: tap {{JOIN_LINK}} → send the "join" message that pops up → then type *Hi*.

It's a small pilot, so if it ever stops replying, just tap the link again to rejoin.
It never asks for student data — please don't send any — and you can leave anytime.
Try it before your next lesson prep and let me know what you think!
```

## If she asks "how does it work?"

Paste this:

> It's a WhatsApp bot — you tap your grade, subject and board from a short
> menu, type your topic, and in under a minute it sends back a 3-level
> worksheet (Support / On-level / Challenge, plus an answer key) as a WhatsApp
> message and a PDF. Then it gives you the exact prompt so you can do the same
> thing yourself in ChatGPT or Gemini next time. No login, no app — just
> WhatsApp.
