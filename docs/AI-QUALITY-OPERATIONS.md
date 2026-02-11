# AI Quality Operations (Phase 3)

## Goals

- Log unresolved and low-confidence AI responses.
- Review AI quality weekly with a report.

## Telemetry

- Source table: `ai_chat_telemetry`
- Insert point: `app/api/chat/route.ts` (`onFinish` and error fallback)
- Captured fields include:
  - intent (`finance`, `app_instructions`, `mixed`, `unknown`)
  - user query
  - route hint
  - tool names/count
  - finish reason
  - response length
  - `is_unanswered`
  - `is_low_confidence`
  - issue labels

## User report API

- Endpoint: `GET /api/ai/quality-report`
- Auth: signed-in user
- Optional query: `days` (default `7`, max handled by server helper)
- Output: weekly-style quality summary for the current user.

## Weekly cron report

- Endpoint: `GET /api/cron/ai-quality-report`
- Auth: `Authorization: Bearer <CRON_SECRET>`
- Schedule: weekly in `vercel.json` (`0 9 * * 1`, Monday 09:00 UTC)
- Persists report rows in `ai_quality_reports`.

## Local checks

- Type check: `npx tsc --noEmit`
- Prompt eval: `npm run eval:app-instructions`
