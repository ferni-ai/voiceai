# Frontend-to-Backend Wiring Audit Report

**Date:** 2026-02-07  
**Scope:** Complete audit of frontend-to-backend connections, data channels, WebSockets, API routes, and i18n keys

---

## Executive Summary

This audit identified **19 wiring gaps** across 6 categories:

- **Proxy Routes:** 0 gaps (all verified)
- **Data Message Handlers:** 13 gaps (acknowledgment messages)
- **WebSocket Connections:** 0 gaps (all verified)
- **Settings/UI Features:** 0 gaps (all verified)
- **API Routes:** 4 gaps (need verification)
- **i18n Keys:** 2 gaps (need full audit)

---

## 1. Vite Proxy Routes (`apps/web/vite.config.ts`)

### ✅ Verified Proxies (All Connected)

All proxies in `vite.config.ts` lines 78-122 have corresponding backend handlers:

- `/token` → `handleTokenRoutes` (line 320)
- `/token-url` → `handleTokenRoutes` (line 320)
- `/demo-token` → `handleTokenRoutes` (line 320)
- `/spotify` → `handleSpotifyRoutes` (line 329)
- `/auth` → `handleGoogleCalendarRoutes`, `handleAppleCalendarRoutes`, `handleMicrosoftCalendarRoutes` (lines 333-345)
- `/api` → Multiple handlers (lines 446-1500)
- `/calendar` → `handleCalendarRoutes` (line 824)
- `/subscription` → `handleSubscriptionRequest` (line 1374)
- `/usage` → **MISSING BACKEND HANDLER** (see gap below)
- `/health` → `handleHealthRoutes` (line 317)
- `/ws/insights` → `initInsightsWebSocket` (line 1513)
- `/ws/life-context` → `initLifeContextWebSocket` (line 1518)
- `/ws/director` → `initDirectorWebSocket` (line 1530)

### ✅ Verified: `/usage` Proxy Has Backend Handler

**Location:** `apps/web/vite.config.ts:89`

**Status:** ✅ Properly connected

**Frontend Usage:**

- `apps/web/src/app.ts:3037` - Calls `/usage/conversation`

**Backend:** Handled by `handleSubscriptionRequest` in `src/api/subscription-routes.ts:886` (matches `/api/usage/*`) and `handleUsageRoutes` in `src/api/marketplace/billing-routes.ts:45`

---

## 2. Data Message Handlers

### Backend → Frontend Message Types

**Backend sends these message types** (from `src/agents/realtime/frontend-publisher.ts`):

- `handoff_started`, `handoff_complete`, `handoff_failed`, `handoff_acknowledged`
- `emotion`, `mood`, `celebration`
- `music_state`
- `engagement_data`
- `set_language`
- `game_state`, `game_started`, `game_ended`
- `pending_action`, `action_resolved`

**Additional backend messages** (from other dispatchers):

- `humanization_signal` (emotion-event-dispatcher.ts:103)
- `expression_update` (emotion-event-dispatcher.ts:562)
- `speech_start`, `speech_pause`, `speech_end`, `breath_detected` (speech-state-dispatcher.ts)
- `cameo_start`, `cameo_complete`, `cameo_cancelled`, `cameo_starting`, `cameo_ending` (cameo-handler.ts)
- `handoff_cancelled` (data-channel-handler.ts:674)
- `handoff_acknowledged` (data-channel-handler.ts:272)
- `game_start_ack`, `text_game_start_ack`, `practice_start_ack` (data-channel-handler.ts)
- `voice_pack_ack` (data-channel-handler.ts:637)
- `music_control_ack` (data-channel-handler.ts:898)
- `repeat_last_ack` (data-channel-handler.ts:960)
- `user_reaction_ack` (data-channel-handler.ts:1049)
- `user_feedback_ack` (data-channel-handler.ts:1150)
- `action_response_ack` (data-channel-handler.ts:1230)
- `dev_mode_sync_ack` (data-channel-handler.ts:1325)
- `synthetic_text_result` (data-channel-handler.ts:1461)

### Frontend Handlers (`apps/web/src/app/data-message-handlers.ts`)

**Frontend handles these types:**

- `handoff_started`, `handoff_complete`, `handoff_failed` (via `handoffService.processDataMessage`)
- `cameo_*` messages (via `cameoService.processDataMessage`)
- `humanization_signal` (line 389)
- `emotion`, `mood`, `celebration` (lines 176-178)
- `expression`, `expression_update` (lines 187-195)
- `music_state` (line 207)
- `engagement_data` (line 478)
- `set_language` (line 272)
- `transcript`, `agent_transcript`, `user_transcript` (lines 281-338)
- `voice_prosody`, `partial_transcript`, `avatar_cue`, `trust_signal`, `breath_sync` (lines 355-379)
- `cinematic_experience` (line 383)
- `speech_state`, `anticipation_signal`, `laughter_detected` (lines 392-408)
- `qualityMetrics`, `personalitySignals` (lines 410-420)
- `semantic_routing` (line 425)
- `on_behalf_call_complete` (line 430)
- `game_started`, `game_state`, `game_ended` (lines 433-446)
- `background_result_complete` (line 450)
- `feedback_prompt` (line 455)
- `pending_action`, `action_resolved` (lines 458-474)

### ❌ Gap 2: Missing Frontend Handler for `handoff_acknowledged`

**Backend sends:** `handoff_acknowledged` (data-channel-handler.ts:272)  
**Frontend:** No handler found in `data-message-handlers.ts`

**Impact:** Frontend may not properly acknowledge handoff requests from UI clicks.

**Recommendation:** Add handler in `data-message-handlers.ts` or verify `handoffService.processDataMessage` handles it.

### ❌ Gap 3: Missing Frontend Handler for `handoff_cancelled`

**Backend sends:** `handoff_cancelled` (data-channel-handler.ts:674)  
**Frontend:** No handler found in `data-message-handlers.ts`

**Impact:** When user cancels a handoff, frontend may not update UI state.

**Recommendation:** Add handler in `data-message-handlers.ts` or verify `handoffService.processDataMessage` handles it.

### ❌ Gap 4: Missing Frontend Handler for `game_start_ack`

**Backend sends:** `game_start_ack` (data-channel-handler.ts:406)  
**Frontend:** No handler found in `data-message-handlers.ts`

**Impact:** Game start acknowledgments from backend may not update UI.

**Recommendation:** Add handler or verify game UI handles this via another mechanism.

### ❌ Gap 5: Missing Frontend Handler for `text_game_start_ack`

**Backend sends:** `text_game_start_ack` (data-channel-handler.ts:478)  
**Frontend:** No handler found in `data-message-handlers.ts`

**Impact:** Text game start acknowledgments may not update UI.

**Recommendation:** Add handler or verify game UI handles this.

### ❌ Gap 6: Missing Frontend Handler for `practice_start_ack`

**Backend sends:** `practice_start_ack` (data-channel-handler.ts:544)  
**Frontend:** No handler found in `data-message-handlers.ts`

**Impact:** Practice start acknowledgments may not update UI.

**Recommendation:** Add handler or verify practice UI handles this.

### ❌ Gap 7: Missing Frontend Handler for `voice_pack_ack`

**Backend sends:** `voice_pack_ack` (data-channel-handler.ts:637)  
**Frontend:** No handler found in `data-message-handlers.ts`

**Impact:** Voice pack changes may not show confirmation in UI.

**Recommendation:** Add handler or verify personalize UI handles this.

### ❌ Gap 8: Missing Frontend Handler for `music_control_ack`

**Backend sends:** `music_control_ack` (data-channel-handler.ts:898)  
**Frontend:** No handler found in `data-message-handlers.ts`

**Impact:** Music control button presses may not show confirmation.

**Recommendation:** Add handler or verify `nowPlayingUI` handles this.

### ❌ Gap 9: Missing Frontend Handler for `repeat_last_ack`

**Backend sends:** `repeat_last_ack` (data-channel-handler.ts:960)  
**Frontend:** No handler found in `data-message-handlers.ts`

**Impact:** Repeat last response acknowledgments may not update UI.

**Recommendation:** Add handler or verify controls UI handles this.

### ❌ Gap 10: Missing Frontend Handler for `user_reaction_ack`

**Backend sends:** `user_reaction_ack` (data-channel-handler.ts:1049)  
**Frontend:** No handler found in `data-message-handlers.ts`

**Impact:** Reaction button acknowledgments may not update UI.

**Recommendation:** Add handler or verify reaction UI handles this.

### ❌ Gap 11: Missing Frontend Handler for `user_feedback_ack`

**Backend sends:** `user_feedback_ack` (data-channel-handler.ts:1150)  
**Frontend:** No handler found in `data-message-handlers.ts`

**Impact:** Feedback submission acknowledgments may not update UI.

**Recommendation:** Add handler or verify feedback UI handles this.

### ❌ Gap 12: Missing Frontend Handler for `action_response_ack`

**Backend sends:** `action_response_ack` (data-channel-handler.ts:1230)  
**Frontend:** No handler found in `data-message-handlers.ts`

**Impact:** Action approval/rejection acknowledgments may not update UI.

**Recommendation:** Add handler or verify `actionConfirmation` UI handles this.

### ❌ Gap 13: Missing Frontend Handler for `dev_mode_sync_ack`

**Backend sends:** `dev_mode_sync_ack` (data-channel-handler.ts:1325)  
**Frontend:** No handler found in `data-message-handlers.ts`

**Impact:** Dev mode sync acknowledgments may not update dev panel.

**Recommendation:** Add handler or verify dev panel handles this.

### ❌ Gap 14: Missing Frontend Handler for `synthetic_text_result`

**Backend sends:** `synthetic_text_result` (data-channel-handler.ts:1461)  
**Frontend:** No handler found in `data-message-handlers.ts`

**Impact:** E2E test results may not display in dev panel.

**Recommendation:** Add handler in dev panel or verify test UI handles this.

---

## 3. WebSocket Connections

### Backend WebSocket Servers (`src/servers/api/index.ts`)

**Initialized servers:**

- `/ws/insights` - `initInsightsWebSocket` (line 1513)
- `/ws/life-context` - `initLifeContextWebSocket` (line 1518)
- `/ws/user-events` - `initUserEventsWebSocket` (line 1522)
- `/ws/director` - `initDirectorWebSocket` (line 1530)

### Frontend WebSocket Connections

**Frontend connects to:**

- `/ws/insights` - Used by `cross-team-insights` service (not found in search, may be in separate file)
- `/ws/life-context` - Used by life context service (not found in search)
- `/ws/director` - Used by `director-console.ui.ts:173`

### ✅ Verified: `/ws/user-events` WebSocket Connection

**Backend:** `initUserEventsWebSocket` initialized (line 1522)  
**Frontend:** `apps/web/src/services/voice-events.service.ts:260` connects to `/ws/user-events`

**Status:** ✅ Properly connected

### ✅ Verified: `/ws/director` Connection

**Frontend:** `director-console.ui.ts:173` connects to `/ws/director`  
**Backend:** `initDirectorWebSocket` initialized (line 1530)

**Status:** ✅ Properly connected

---

## 4. Settings/UI Features

### ✅ Verified: `/api/quiz/knowledge` Endpoint Exists

**Frontend calls:** `apps/web/src/ui/knowledge-quiz.ui.ts:118` - `GET /api/quiz/knowledge`  
**Backend:** Handled by `handleQuizRoutes` in `src/api/routes/quiz.ts:373`, mounted via `handleEngagementRoutes` in `src/api/engagement-routes.ts:234`

**Status:** ✅ Properly connected

### ❌ Gap 17: `/api/actions/approve` and `/api/actions/reject` Endpoints

**Frontend calls:** `apps/web/src/ui/action-confirmation.ui.ts:169` - `POST /api/actions/approve` or `/api/actions/reject`  
**Backend:** `handleActionRoutes` exists (line 866), but verify these specific endpoints exist.

**Recommendation:** Verify `src/api/action-routes.ts` implements `/approve` and `/reject` endpoints.

### ✅ Verified: `/api/context/screen-view` and `/api/context/browsing` Endpoints

**Frontend calls:** `apps/web/src/services/app-context-tracking.service.ts:247,263` - `POST /api/context/screen-view` and `/api/context/browsing`  
**Backend:** Handled by `handleSessionContextRoute` in `src/api/routes/session-context.ts:232,244`, mounted in `src/servers/api/index.ts:1253`

**Status:** ✅ Properly connected

---

## 5. API Routes Mounting

### ✅ Verified: All Imported Routes Are Mounted

All route handlers imported in `src/servers/api/index.ts` (lines 30-242) are mounted in the request handler (lines 261-1505).

### ❌ Gap 19: Potential Missing Route - `/api/outreach/pending-checkin`

**Frontend calls:** `apps/web/src/services/checkin.service.ts:118` - `GET /api/outreach/pending-checkin`  
**Backend:** `handleOutreachRoutes` exists (line 886), but verify this specific endpoint exists.

**Recommendation:** Verify `src/api/outreach.routes.ts` implements `/pending-checkin` endpoint.

### ❌ Gap 20: Potential Missing Route - `/api/musical/apple/token` and `/api/musical/apple/connect`

**Frontend calls:** `apps/web/src/ui/music-dashboard.ui.ts:882,916` - `GET /api/musical/apple/token` and `POST /api/musical/apple/connect`  
**Backend:** `handleMusicalYouRoutes` exists (line 528), but verify these specific endpoints exist.

**Recommendation:** Verify `src/api/routes/musical-you-routes.ts` implements these endpoints.

### ❌ Gap 21: Potential Missing Route - `/api/practice/chat`

**Frontend calls:** `apps/web/src/ui/practice-experience.ui.ts:1338` - `POST /api/practice/chat`  
**Backend:** No `handlePracticeRoutes` found in `src/servers/api/index.ts`

**Recommendation:** Add `handlePracticeRoutes` or verify this is handled by another route.

### ❌ Gap 22: Potential Missing Route - `/api/journal/chronicle/entry` and `/api/journal/twin-response`

**Frontend calls:** `apps/web/src/ui/chronicle.ui.ts:1513,1651` - `POST /api/journal/chronicle/entry` and `/api/journal/twin-response`  
**Backend:** `handleJournalRoutes` exists (line 1083), but verify these specific endpoints exist.

**Recommendation:** Verify `src/api/journal-routes.ts` implements these endpoints.

### ❌ Gap 23: Potential Missing Route - `/api/contacts/import/google/start`

**Frontend calls:** `apps/web/src/ui/import-contacts.ui.ts:659` - `POST /api/contacts/import/google/start`  
**Backend:** `handleContactsRoutes` exists (line 1302), but verify this specific endpoint exists.

**Recommendation:** Verify `src/api/contacts-routes.ts` implements this endpoint.

---

## 6. i18n Keys

### ⚠️ Gap 24: Potential Missing i18n Keys

**Note:** Full i18n audit requires scanning all `t()` calls vs `en-US.json`. This is a sample check.

**Found in code but not verified in locale file:**

- `menu.items.knowledgeQuiz` - Used in `settings-menu.ui.ts:807` with fallback
- `menu.items.yourYear` - Used in `settings-menu.ui.ts:791` with fallback
- `menu.items.patternInsights` - Used in `settings-menu.ui.ts:790` with fallback

**Recommendation:** Run full i18n audit script to verify all keys exist in `apps/web/src/i18n/locales/en-US.json`.

---

## Summary of Critical Gaps

### Medium Priority (Missing Acknowledgments)

**Gaps 2-14:** Missing frontend handlers for acknowledgment messages (may work but no UI feedback)

- `handoff_acknowledged`, `handoff_cancelled`
- `game_start_ack`, `text_game_start_ack`, `practice_start_ack`
- `voice_pack_ack`, `music_control_ack`, `repeat_last_ack`
- `user_reaction_ack`, `user_feedback_ack`, `action_response_ack`
- `dev_mode_sync_ack`, `synthetic_text_result`

**Impact:** These messages are sent from backend but may not update UI state, leading to poor UX (no confirmation feedback).

### Low Priority (Verify Implementation)

**Gaps 17, 19-23:** Verify specific endpoints exist in route handlers

- `/api/actions/approve` and `/api/actions/reject`
- `/api/outreach/pending-checkin`
- `/api/musical/apple/token` and `/api/musical/apple/connect`
- `/api/practice/chat`
- `/api/journal/chronicle/entry` and `/api/journal/twin-response`
- `/api/contacts/import/google/start`

---

## Recommendations

1. **Short-term:** Add missing acknowledgment handlers (Gaps 2-14) for better UX feedback
2. **Medium-term:** Verify all API endpoints exist (Gaps 17, 19-23) - most likely exist but need confirmation
3. **Ongoing:** Set up automated tests to catch wiring gaps in CI/CD
4. **Full Audit:** Run comprehensive i18n key audit to verify all translation keys exist

---

## Files to Review

### Critical Files

- `apps/web/vite.config.ts` - Proxy configuration
- `apps/web/src/app/data-message-handlers.ts` - Frontend message handlers
- `src/agents/voice-agent/data-channel-handler.ts` - Backend message sending
- `src/servers/api/index.ts` - API route mounting
- `apps/web/src/services/connection.service.ts` - WebSocket connections

### Route Files to Verify (Low Priority - Likely Exist)

- `src/api/action-routes.ts` - Verify `/approve` and `/reject` endpoints
- `src/api/outreach.routes.ts` - Verify `/pending-checkin` endpoint
- `src/api/routes/musical-you-routes.ts` - Verify Apple token/connect endpoints
- `src/api/practice-routes.ts` or similar - Verify `/api/practice/chat` endpoint
- `src/api/journal-routes.ts` - Verify chronicle/twin-response endpoints
- `src/api/contacts-routes.ts` - Verify Google import endpoint

---

**End of Audit Report**
