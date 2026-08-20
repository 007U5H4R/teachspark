# TeachSpark — WhatsApp bot (Case Study 4 MVP)

Teaches a teacher one AI skill and makes a differentiated worksheet for her class, on WhatsApp.

## Run locally
1. `cp .env.example .env` and fill keys (see Task 0 of implementation.md).
2. `npm install && npm run dev`
3. `ngrok http 3000 --url https://<your-dev-domain>` and set the Twilio sandbox webhook to `https://<your-dev-domain>/webhooks/twilio/whatsapp` (POST).

## Test
`npm test` · `npm run typecheck`
