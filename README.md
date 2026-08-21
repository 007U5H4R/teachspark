# TeachSpark

A WhatsApp bot that helps a time-poor Indian K–12 teacher use AI for real classroom work.

She sends a message, answers a few short questions, and gets back a **differentiated worksheet
for her own class** in about two minutes — as a WhatsApp message and a PDF, with the answer key
and the exact prompt so she can do it herself next time. Typing `PAPER` instead lets her
photograph a textbook chapter and get a complete **question paper** back as an editable Word
file.

No app, no login — just WhatsApp.

Built as the MVP for a product case study, and running a live pilot with real teachers.

```
WhatsApp → Twilio → Express → pure state machine → Claude → PDF/DOCX → back to WhatsApp
```

**Stack:** TypeScript · Express · Twilio WhatsApp · Claude · Supabase · Railway

---

Setup, environment variables, deployment and operations: [`docs/runbook.md`](docs/runbook.md).
Pilot recruiting material: [`docs/pilot/`](docs/pilot/).
