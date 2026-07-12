# Fleet Bug Hunt — Cross-Domain Summary

**Date:** 2026-07-12  
**Fleet:** Voice · UI/API · Web · Memory · Security  
**Mode:** Find only (no fixes in this pass)

## Verdict

The highest-urgency issues are **auth bypasses on public APIs** and **silent memory/trust failures**. Latency and UX honesty matter next. Do not treat Wave 1 / BTH docs as “done.”

## CRITICAL (ship-blockers)

| Domain | Issue |
|--------|--------|
| Security | `/api/bth/:userId` — full user knowledge, **no auth** |
| Security | `/token` — LiveKit tokens for arbitrary `firebase_uid`, **no auth** |
| Security | Webhooks `getUserId()` treats Bearer string as userId (no JWT verify) |
| UI/API | Session-context routes + several PII APIs accept spoofable `userId` |
| UI/API | Firestore `lastVoiceSession: undefined` write + unguarded `.length` crashes |
| Memory | STM cleaned **before** human-signal extraction → “remembered” data never persists |
| Voice | GCE `GEMINI_MODEL` = Live-only model → `generateContent` side paths fail |
| Web | Connection error promises reconnect but does not; voice→UI nav dead on Firebase Hosting |

## HIGH (production risk / trust)

- Missing Firestore indexes (outreach, Outlook/Google webhooks, conversation threads)
- In-memory push subs + job queue on Cloud Run
- Fabricated stats: calendar follow-through, Team Huddle demo, B2B admin mocks
- Social graph rarely injected (~1/10 turns); human memory split across 3 stores
- Multi-agent deferred handlers / early speech blind window; verify can pass without heard audio
- Twilio call-status webhook missing signature check; Plaid exchange / agent enable without auth
- OAuth `return_url` open redirect

## MED (debt / false confidence)

- i18n `[NEEDS_TRANSLATION]` leaks; LinkedIn UI without mounted routes
- E2E suite mostly Vitest mocks, not Playwright
- Duplicate session-summary modules; dead `handleEndSession` orchestrator
- Live model retirement (Mar 2026); CLASSIFICATION_MODEL defaults

## Recommended fix order

1. **Auth lockdown** — `requireAuth` on `/token`, `/api/bth/*`, webhooks, session-context, Plaid, agent enable  
2. **Memory honesty** — extract human signals before STM cleanup; one read path for human memory  
3. **Firestore + indexes** — stop undefined writes; deploy missing composites  
4. **Trust UX** — remove fabricated stats; reconnect or honest copy; voice→UI polling on Firebase  
5. **Voice model split** — `LLM_REALTIME_MODEL` vs generateContent-capable `GEMINI_MODEL`

## Implementation status (2026-07-12 — not committed)

| Bucket | Status | Notes |
|--------|--------|-------|
| Auth lockdown | Done | `/token`, BTH, webhooks CRUD, Plaid, agents enable/order, debug, PII routes. Siri trigger still token+userId by design. |
| Memory | Done | Human signals before STM cleanup; profile.humanMemory fallback; social graph persist on end. Tests 32/32. |
| Firestore/API | Done | No undefined writes; load guards; indexes added; CORS `ferni-prod.web.app`. **Deploy indexes to GCP.** |
| Web trust | Done | Auto-reconnect then honest copy; SSE/polling voice events; no fake huddle/calendar/B2B stats; i18n stubs. |
| Voice models | Done | `LLM_REALTIME_MODEL` Live; `GEMINI_MODEL=gemini-2.5-flash`. Needs `ferni deploy gce` to take effect. |

## Agent reports

- [Voice/GCE](97492fe7-9ff4-45e6-a61f-8f79fa00b69d)
- [UI/API](78f0156b-1e6b-4ef7-971b-323172773129)
- [Web](b8681a5c-6b0c-4560-98eb-2e9de3cd3cf6)
- [Memory](eb0bc442-922a-4448-b79f-5bbfc55f11e6)
- [Security](6e309f0c-9922-41b8-8a8c-cb1d971398b1)
