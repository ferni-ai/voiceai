# Menu green program (2026-10-12)

> Seth: "Lets get it all green e2e, fully implemented, on brand, on mission and on
> principal aligned to our brand strategy."

This plan turns that goal into a checkable list. It takes the 41 rows of the menu
end-to-end audit, gives each a target state and an acceptance test, and groups the
work into waves that parallel agents can run without editing the same files.

- **Rubric**: `docs/brand/MENU-BRAND-RUBRIC.md`. Every fix agent applies it to its item.
- **Evidence**: `~/Documents/voiceai-evidence/menu-e2e-2026-10-12/` (tracer-reports.md,
  spot-checks.md, prod_*.tsv) and `~/Documents/voiceai-evidence/api-audit-2026-10-12/`.
  File:line references are from the audit's code, origin/main 35bcda129. Re-read the
  line before you edit, because main has moved since.
- **Store counts** are Firestore aggregation counts on project johnb-2025, read 2026-10-12.

## What "green e2e" means for one item

An item is green when all of these hold:

1. Its target state below is merged on main, behind an off-by-default flag if it changes behaviour.
2. Its acceptance tests exist, run in the `menu-contract` CI job (see "CI gate"), and
   **fail when the fix is reverted**. Prove that with a mutation check and paste the result in the PR.
3. It passes the rubric: the four states, honesty, visual checks, and the memory promise where it applies.
4. The live probe shows its route answering for the probe user on prod (see "Live check").

Target states:

- **BUILD**: make it real end to end.
- **CONNECT**: point it at the real store that already exists.
- **HONEST-EMPTY**: the data is real but thin. Fix the empty, error and loading states, and remove anything invented.
- **HIDE**: put it behind an off-by-default flag, with the reason in the flag's comment.
- **KEEP**: it already works. Add the test that keeps it working.

## Test harnesses (repo conventions)

| Kind | Where | Pattern to copy |
|---|---|---|
| (a) write→read contract | `src/api/__tests__/menu-<slug>.emulator.test.ts` | `src/api/__tests__/seeds-routes-ledger.emulator.test.ts`: the real route handler on a `node:http` server on port 0, and the real `firebase-admin` on the Firestore emulator (`FIRESTORE_EMULATOR_HOST`). Write with the **production writer function the voice agent calls**, then read through the **exact path and query the panel sends**, and assert the same data comes back. |
| (b) UI | `apps/web/tests/ui/menu-<slug>.test.ts` (jsdom; `apps/web/vitest.config.ts` only includes `tests/**`) | `apps/web/tests/ui/no-invented-numbers.test.ts` (on the honest-panels branch). Render the real panel with the route mocked three ways (rows, `[]`, 500). Assert the data is shown, `data-state` is `ready`, `empty` or `error` as expected, the empty copy matches the rubric, and after 10 s on fake timers nothing has `aria-busy="true"`. |
| (b′) web-to-route contract | `apps/web/tests/contracts/menu-<slug>.contract.test.ts` | `apps/web/tests/contracts/journal-sync.contract.test.ts`: the real handler behind its real `requireAuth`, with only the persistence mocked, read by the **real web service**. Use this when the bug is a mismatch between the response shape and what the client reads. |
| (c) ban | `apps/web/tests/ui/no-invented-numbers.test.ts` plus the lint in "CI gate" | Assert that the item's banned strings never render. |

The `menu-` prefix is how the CI job finds these tests. Nearly every panel file is over
500 lines (calendar-view.ui.ts 3,677, marketplace.ui.ts 2,498, wellbeing-dashboard.ui.ts
1,990, and so on), and those files may not grow. Put new code in a new module next to
the panel and call it from there.

## The 41 items

Each entry gives the current state, the target and why, the acceptance tests, and the
size and files. Writers are named as they appear in the code.

### Let's Practice

**1. Your Day (hub)**: BROKEN → **CONNECT**, S, wave 1 lane A
- Now: the hub sends `GET /api/commitments?status=pending`. The route filters on `'pending'` (src/api/routes/commitments.ts:41), but `loadUserCommitments` loads only `'active'` (commitment-keeper.ts:545), so "On your mind" is always `[]` and shows "All caught up". The thread card's threadId is also dropped (conversation-starter.ts:9-10).
- Why: commitments are the memory promise ("Commitment Keeper tracks every promise").
- Tests: (a) `menu-your-day.emulator.test.ts`: call `saveCommitment()` (commitment-keeper.ts:366) the way the voice tool does (tools/domains/productivity/commitments.ts:105), then GET `/api/commitments` with the hub's exact query, and the same statement comes back. (b) `menu-your-day.test.ts`: the commitment renders; a 500 shows the error state, not "All caught up".
- Files: apps/web/src/ui/ferni-hub.ui.ts, src/api/routes/commitments.ts, apps/web/src/app/conversation-starter.ts. Coordinate with open #1181 and #1191, which touch commitments.

**2. Sanctuary**: WORKS, with a fake fallback → **HONEST-EMPTY** (fallback in flight) plus a CONNECT follow-up, S, wave 2 lane G
- Now: live insights work. The fallback `getDefaultInsights` (sanctuary.ui.ts:479-512) and canned practice replies (practice-experience.ui.ts:1263-1279) are being removed by **fix-honest-claims**. `/api/sanctuary/practice/start|complete` are never called, so `practice_sessions` and `sanctuary_stats` are 0.
- Follow-up: call `practice/complete` when a practice ends, so Sanctuary's own counts are real.
- Tests: (a) `menu-sanctuary.emulator.test.ts`: POST `practice/complete`, then GET `/api/sanctuary`, and the completed practice is counted. (c) "Your mornings set the tone" and "I hold your story complete" never render.
- Files: apps/web/src/ui/sanctuary.ui.ts, practice-experience.ui.ts. Wait for fix-honest-claims to merge.

**3. What I Do For You**: WORKS, but an error shows as empty → **HONEST-EMPTY**, S, wave 1 lane D
- Now: `life-automation.service.ts:169` turns a failure into `[]`, which shows the empty state.
- Tests: (a) `menu-automations.emulator.test.ts`: write a routine with the voice routines tool's writer (tools/domains/routines/index.ts:187), then GET `/api/life-automation/workflows`, and the routine comes back. (b) `menu-automations.test.ts`: a 500 shows the error state.
- Files: apps/web/src/services/life-automation.service.ts, apps/web/src/ui/ferni-care/dashboard.ui.ts.

**4. Build a Ritual**: UI ONLY (write-only) → **BUILD**, M, split into 4a (wave 2 lane G) and 4b (wave 3 lane D)
- Now: rituals are saved to `bogle_users/{uid}/saved_rituals` (0 docs) and `users/{uid}/practices` (0), and nothing reads them back. The time-suggestion parse throws and the error is swallowed (ritual-builder.ui.ts:877-880). The fake study stats are being removed by **fix-honest-panels**.
- Why: anything entered in a panel must reach Ferni (the memory promise).
- 4a: the panel lists saved rituals from the server, and the time parse is fixed. 4b: the agent reads due rituals into call context, behind `RITUALS_IN_CONTEXT` (off by default).
- Tests: (a) `menu-rituals.emulator.test.ts`: PUT `/api/synced/rituals/:id`, then GET the list, and it comes back. 4b: the context builder returns that ritual for its due time. (b) A saved ritual renders after a reload.
- Files: apps/web/src/services/rituals.service.ts, ritual-builder.ui.ts (wait for fix-honest-panels), and a new context builder module.

**5. What's Ahead (calendar)**: WORKS, but the spinner never ends when signed out → **HONEST-EMPTY**, S, wave 1 lane D
- Now: `loadCalendarData` returns before rendering when signed out (calendar-view.ui.ts:409-412), and `renderDisconnected` (:461) has no callers. Data is real: `users/{uid}/calendar_events` has 11,232 docs across 106 users.
- Tests: (a) `menu-calendar.emulator.test.ts`: `createEvent()` (services/calendar/unified-calendar-store.ts:254, via services/calendar/index.ts, as smart-calendar-tools.ts:244 calls it), then GET `/api/calendar/today`, and the event comes back. (b) `menu-calendar.test.ts`: signed out or not connected shows the disconnected state within 10 s, with no `aria-busy`.
- Files: apps/web/src/ui/calendar-view.ui.ts (3,677 lines; extract the state logic).

**6. When I'll Check In**: BROKEN → **BUILD**, M, wave 2 lane E
- Now: `/upcoming` reads an in-memory Map (decision-engine.ts:123). The quiet-hours save does nothing, because `initializeOutreachSystem()` is commented out (global-services.ts:195-206), and the async runner hardcodes 22:00-08:00 (daily-outreach-runner.ts:38-46). The fake samples are being removed by **fix-honest-panels**.
- Why: a preference set in a panel must change what Ferni does.
- Fix: persist quiet hours on the user record, and have the runner read them, behind `OUTREACH_QUIET_HOURS_FROM_PREFS` (off by default).
- Tests: (a) `menu-check-in.emulator.test.ts`: POST quiet hours to `/api/user/preferences`; the runner's quiet-hours function returns that window, then GET returns it. (b) The saved hours show after a reload.
- Files: apps/web/src/ui/notification-settings.ui.ts, src/api/user-routes.ts, src/services/global-services.ts, apps/async/src/outreach/daily-outreach-runner.ts.

**7. When I'll Reach Out**: BACKEND NEVER FED, plus an IDOR → **CONNECT** plus a security fix, M, wave 1 lane B
- Now: `/upcoming` and `/history` read process memory (decision-engine.ts:123, engagement-metrics.ts:73), so the panel always shows "No outreach history yet". The real history is `bogle_users/{uid}/outreach_attempts`, 5,612 docs, written by `recordOutreachAttempt` (outreach-history.ts:65). Also, `DELETE /pending/:id` and reschedule search every user's items with no owner check (decision-engine.ts:220-247). Nobody is fixing that IDOR yet.
- Fix: PR 1 is the owner check. PR 2 reads `/history` from `outreach_attempts`.
- Tests: (a) `menu-outreach.emulator.test.ts`: `recordOutreachAttempt()`, then GET `/api/outreach/history?limit=20`, and the attempt comes back. User B's DELETE of user A's id returns 404 and leaves A's item in place. (b) `menu-outreach.test.ts`: history renders, and an error shows the error state.
- Files: src/services/outreach/decision-engine.ts, src/api/outreach.routes.ts, apps/web/src/ui/outreach-schedule.ui.ts.

**8. Staying in Touch**: BROKEN (loads the wrong route) → **CONNECT**, S, wave 2 lane B
- Now: the panel reads `context.personal` from `GET /api/outreach/context`, which never returns it (outreach.routes.ts:528). The form always opens blank. Saving to `POST /api/user/contact` works.
- Tests: (b′) `menu-staying-in-touch.contract.test.ts`: POST `/api/user/contact`, then the real panel service loads from `GET /api/user/contact` (user-routes.ts:779), and the form is prefilled with the masked values.
- Files: apps/web/src/ui/contact-settings.ui.ts. Wait for fix-dark-contrast, which is editing this file.

### Our Story

**9. Our Story So Far**: WORKS → **KEEP**, plus a small CONNECT, S, wave 2 lane H
- Now: `/api/your-story/full` reads `relationship_arc` (538 docs, written by `executeSessionCleanup`, cleanup-handler.ts:652). Milestones are dropped on the client (your-story.service.ts:155). Why `ferni_actions` has 0 docs is UNCONFIRMED.
- Tests: (a) `menu-our-story.emulator.test.ts`: write the arc the way cleanup does, then GET `/full`, and the arc and milestones come back. (b) Milestones render.
- Files: apps/web/src/services/your-story.service.ts.

**10. Trust & Growth**: WORKS → **KEEP**, S, wave 2 lane H
- Tests: (a) `menu-trust.emulator.test.ts`: `cleanupTrustProfiles()` (cleanup-handler.ts:1542), then the six `/api/trust/*` GETs, and the profile comes back.
- Files: tests only.

**11. How You're Feeling**: WORKS, with a fake number → **HONEST-EMPTY**, S, wave 2 lane C
- Now: the hardcoded "+5% from last month" is being removed by **fix-honest-panels**. Two things remain. A trends failure draws a flat line (`Array(7).fill`, wellbeing-dashboard.ui.ts:1354). The empty preview lists "Hope", which nothing measures (:1581).
- Tests: (a) `menu-wellbeing.emulator.test.ts`: `persistSnapshot()` (services/wellbeing-tracking/persistence.ts:78), then GET `/api/wellbeing/trends`, and the snapshot comes back. (b) A trends 500 shows the error state, not a line.
- Files: apps/web/src/ui/wellbeing-dashboard.ui.ts. Wait for fix-honest-panels.

**12. Memory Lane**: WORKS but thin, and an error looks empty → **HONEST-EMPTY** (12a, wave 2 lane C) then **BUILD** (12b, wave 3 lane C), S then M
- Now: `memory_highlights` has 123 docs. Calls never feed it, and the real-time collector has no caller. A fetch error falls into the empty state (:436, :540-562).
- 12b: after a call, the post-call pipeline saves highlights with `saveMemory()` (memory-collector.ts:455), behind `MEMORY_LANE_FROM_CALLS` (off by default).
- Tests: (a) `menu-memory-lane.emulator.test.ts`: `saveMemory()`, then GET `/api/memories/highlights`, and the highlight comes back. 12b: running the post-call step on a fixture call writes a highlight. (b) An error shows the error state.
- Files: apps/web/src/ui/memory-lane.ui.ts. 12b also needs a new post-call module; coordinate before touching cleanup-handler.ts.

**13. Your Patterns**: UI ONLY → **HIDE**, in flight
- Being hidden by **fix-honest-claims**. Behind the panel, `extractLearnedMemories` is a stub and the response shape doesn't match what the panel reads. Rebuild it only after #30 exists.
- Test: (c) the fixed welcome card never shows to a real user.

**14. When We've Talked**: shows web calls only → **CONNECT**, M, wave 1 lane E
- Now: `GET /api/conversations` reads `engagement_profiles/{uid}/conversation_sessions`, which has 8 docs in total. The agent's `bogle_users/{uid}/conversations` has 4,903 docs, written by `startConversation` (services/memory/realtime-memory.ts). Phone calls never appear.
- Tests: (a) `menu-history.emulator.test.ts`: `startConversation()` plus one turn, then GET `/api/conversations`, and the call is listed, including a phone call. (b) Rows render, and an error shows the error state.
- Files: src/api/routes/conversations.ts, apps/web/src/ui/conversation-history.ui.ts.

**15. This Year Together**: BACKEND NEVER FED → **CONNECT**, S, wave 1 lane E
- Now: the route reads `bogle_users/{uid}/conversation_summaries`, which has 0 docs and no Firestore writer (year-in-review-routes.ts:165). Summaries actually live in `summaries` (1,518 docs), written by `saveSummary` (memory/storage/firestore-store.ts:312). An API failure shows the same empty state (:272).
- Fix: read through `readCallSummaries()` (memory/storage/call-summaries.ts:87).
- Tests: (a) `menu-year.emulator.test.ts`: `saveSummary()`, then GET `/api/year-in-review/:uid`, and the summary shows in the year. (b) An error shows the error state.
- Files: src/api/year-in-review-routes.ts, apps/web/src/ui/your-year-with-ferni.ui.ts.

### Let's Do Something

**16. The Chronicle (journal)**: BROKEN → **BUILD**, L, split into three PRs, wave 3 lane A
- Now: entries are kept in the UI server's RAM (profile-store.ts:30-42; there is no `PERSIST_AGENT_PROFILES` on john-bogle-ui, which runs up to 10 instances) and are lost on restart. `POST /twin-response` always returns 500 (`profile` is undefined at journal-routes.ts:648). Journal entries made in calls never reach the panel: `startJournal` saves nothing, and `completeJournal`, `addGratitude` and `saveNote` write the agent process's in-memory store (notes.ts:378, 520, 585). The canned "past self" replies are being removed by **fix-honest-panels**.
- Why: the journal is the clearest case of the memory promise.
- 16a: twin chat shows an honest error instead of a 500 (S). 16b: one Firestore journal store, `bogle_users/{uid}/journal`, which the legacy `addJournal` already writes. Point the route and the voice tools at it, behind `JOURNAL_FIRESTORE` (off by default) (M). 16c: the panel reads it and the entries can be edited and deleted (S).
- Tests: (a) `menu-journal.emulator.test.ts`: run the voice `completeJournal` tool's execute against a fixture user, then GET `/api/journal/chronicle`, and the entry comes back. A web POST of an entry is read back too. (b) Entries render after a reload; twin chat shows the error state on failure. (c) The `chronicle.fallback.*` keys never render.
- Files: src/api/journal-routes.ts, src/tools/domains/productivity/notes.ts and index.ts, apps/web/src/ui/chronicle.ui.ts, and a new journal store module.

**17. Knowledge Quiz**: WORKS but thin → **CONNECT**, S, wave 2 lane H
- Now: memory questions filter on `memory.content`, but persona memories have `name` and `details` (quiz.ts:~210). When signed out, it silently does nothing.
- Tests: (a) `menu-quiz.emulator.test.ts`: a persona memory on the profile produces a memory question from GET `/api/quiz/knowledge`. (b) Signed out shows the sign-in state.
- Files: src/api/routes/quiz.ts, apps/web/src/ui/knowledge-quiz.ui.ts.

**18. Music Together**: BACKEND NEVER FED, fake, with dead buttons → **CONNECT** the buttons and **HIDE** Spotify, S, wave 2 lane D
- Now: the `Math.random` stats are being removed by **fix-honest-panels**. `setCallbacks` is never called, so Play, Start and Share do nothing (music-dashboard.ui.ts:206, :885). Spotify has no prod credentials.
- Tests: (b) `menu-music.test.ts`: each button dispatches its real action (for example, a game start request on the data channel). The Spotify tile is absent while its flag is off.
- Files: apps/web/src/ui/music-dashboard.ui.ts, lazy-screens.ts. Wait for fix-honest-panels.

**19. Let's Play**: WORKS to start → **HIDE** the library-mode choice until the agent honours it, S, wave 2 lane B
- Now: all 19 game IDs match, but the agent ignores the library mode. Whether the continuation tools are in the prod tool set is UNCONFIRMED. Offering a choice that does nothing is a hollow version.
- Tests: (b) `menu-games.test.ts`: starting a game sends the matching `game_start_request`, and no mode selector shows.
- Files: apps/web/src/ui/game-picker.ui.ts. Wait for fix-dark-contrast.

**20. Set the Mood (vibe)**: BACKEND NEVER FED, but honest → **HIDE**, S, wave 2 lane A, **Seth to confirm**
- Why: there are no credentials for lights or Ecobee in prod. `smart_home` and `ecobee_tokens` are 0.
- Test: (b) the menu entry is absent while `VITE_VIBE` is off.

**21. Meet More Friends (marketplace)**: BROKEN → **HIDE**, S, wave 2 lane A, **Seth to confirm**
- Now: the 5.0 stars and agents without bundles are being handled by **fix-honest-claims**. None of the 15 registry IDs has a persona bundle; unknown IDs fall back to Ferni (persona-ids.ts:248, UNCONFIRMED live). The review-stats and manifest shapes don't match what the client reads (marketplace.ui.ts:2066-2070, marketplace.service.ts:485-493).
- Hide the entry until at least one agent has a bundle, then CONNECT the shapes (b′).

### Your World

**22. People You've Told Me About**: BROKEN for anyone the voice agent adds → **CONNECT**, M, two PRs, wave 1 lane C
- Now: `GET /api/contacts` reads `contact_relationships` (30 docs). The voice `addContact` tool writes `user_contacts` (9,432 docs) through `createContact` from services/contacts.ts (contacts-tools.ts:59). The process cache is never cleared (contact-relationship-service.ts:1061). `birthday` and `howWeMet` are dropped on create (contacts-routes.ts:161-183). "professional" contacts vanish, because that group has no heading (your-people.ui.ts:1161).
- Why: this is the relationship network promise.
- Tests: (a) `menu-people.emulator.test.ts`: run the `addContact` tool's execute, then GET `/api/contacts`, and the person is listed. A POST with a birthday reads the birthday back. A write after the first read is visible on the second read (the cache is cleared). (b) A professional contact renders under a heading.
- Files: src/api/contacts-routes.ts, src/services/contacts/contact-relationship-service.ts, apps/web/src/ui/your-people.ui.ts, add-person.ui.ts.

**23. Home & Family**: BROKEN → **HIDE**, S, wave 2 lane A, **Seth to confirm**
- Now: the POST response has no `members`, so render throws and the spinner sticks (household-manager.ui.ts:992). The settings toggle writes `households/{uid}`, which nobody reads. The agent never calls `identifyHouseholdSpeaker` or `getHousehold`.
- Why hide: it needs voice recognition (#28) to mean anything, and that isn't built.
- Test: (b) the entry is absent while the flag is off.

**24. Family Phone Access**: WORKS for create, read, update and delete → **KEEP**, plus verify inbound, M, wave 3 lane E
- Now: `sponsored_identities` has 9 docs. Inbound recognition only works when signed dispatch metadata carries a phone (dispatch-phone.ts:17). Whether call-ins are recognized is UNCONFIRMED. Depends on #1212 (signed identity).
- Tests: (a) `menu-family-phone.emulator.test.ts`: POST `/api/sponsored-identities`, then `identifyByPhone(phone)` returns that identity.
- Files: tests, plus dispatch-phone.ts if the check fails.

**25. Everything Connected**: BROKEN in prod → **HONEST-EMPTY** for Google Calendar, **HIDE** the rest, S, wave 2 lane A, **Seth to confirm**
- Now: only Google Calendar has prod credentials. Oura and Eight Sleep return 503, Ecobee 500, Spotify "not available". Apple Health posts to `/api/health/sync`, which has no route. The Vibe tile is hardcoded "Connected" (connected-life.ui.ts:337).
- Tests: (b) `menu-connected.test.ts`: only tiles with credentials render, and the Vibe tile reflects a real status check.
- Files: apps/web/src/ui/connected-life.ui.ts.

### How This Works (settings) and quick actions

**26. Make It Yours**: themes are local and fine; voice packs are BROKEN → **HIDE** voice packs, S, wave 2 lane F, **Seth to confirm**
- Now: voice packs sell for 200-300 seeds and never apply. `window.__livekitRoom` is never set (cosmetics.service.ts:684-711), and `applyVoicePackToParameters` has no callers. Selling something that doesn't work fails the honesty rubric.
- Tests: (b) voice packs are absent from the shop while the flag is off; themes still apply.
- Files: apps/web/src/services/cosmetics.service.ts (shared with #35, so the same lane).

**27. Look & Feel**: local and fine; the locale is not sent → **CONNECT**, S, wave 2 lane H
- Now: `/token` picks the locale from the caller's IP (routes/token.ts:236, 610), and the web never sends it (token-fetch.service.ts:21-51). The sound-mute toggle isn't persisted (sound.ui.ts:77, 572).
- Tests: (b′) `menu-locale.contract.test.ts`: the web token fetch sends the chosen locale, and the real `/token` handler uses it. Mute survives a reload.
- Files: apps/web/src/services/token-fetch.service.ts, src/servers/api/routes/token.ts (the security agent is editing /token room ownership; wait for it), apps/web/src/ui/sound.ui.ts.

**28. Recognizing You (voice ID)**: BACKEND NEVER FED → **HIDE**, S, wave 2 lane A, **Seth to confirm**
- Now: `voice_profile` is 0. `processVoiceAuth` and `processAudioForAuth` have no callers, and enrollment sessions live in memory. Building it is L and a privacy decision.
- Test: (b) the entry is absent while the flag is off.

**29. Your Contribution**: WORKS, but the copy misleads → in flight with **fix-honest-claims** (the "Founders get unlimited time" note)
- Test: (c) no plan or tier names, and no "unlimited".

**30. What Ferni Knows**: DEAD in prod → **BUILD**, M, wave 3 lane B
- Now: `VITE_MEMORY_CONTROL` is unset, and `/api/memories/remembered` has no server route.
- Why: this is the memory promise's "visible and correctable" panel. Related: #1178 (the "I'll remember" chip) and #1207 (a denied fact is disputed).
- Fix: add the route over the real memory stores, with edit and delete that the next call's recall respects. Then turn the flag on in dev, and in prod after it has been seen there.
- Tests: (a) `menu-remembered.emulator.test.ts`: a fact stored by the agent's memory writer is listed by GET. A DELETE removes it from what recall serves.
- Files: a new route module, apps/web/src/ui/memory/remembered.ts.

**31. Take Your Story (export)**: WORKS, coverage UNCONFIRMED → **CONNECT** coverage, S, wave 1 lane F
- Tests: (a) `menu-export.emulator.test.ts`: write one doc into every store a menu panel reads (journal, `users/*/shared_memories`, calendar, voice profile, seeds, contacts, outreach). POST `/api/export` includes all of them, and DELETE `/api/account` removes all of them.
- Files: src/services/platform/data-export.ts.

**32. What's Coming (roadmap)**: UI ONLY, with untrue claims → claims in flight with **fix-honest-claims**; **CONNECT** voting, S, wave 2 lane H
- Now: the votes never reach `roadmap-routes.ts:538-600` (`feature_votes` is 0). The fallback balance is 10 (roadmap.service.ts:358). Matching is by substring ("therapist" contains "api", :807).
- Tests: (a) a vote POST is read back in the counts. (c) "actively building" and "Almost ready" never render.
- Files: apps/web/src/services/roadmap.service.ts.

**33. Bring a Friend**: BROKEN → **CONNECT**, S, wave 1 lane G
- Now: the link is `ferni.ai/grow/<code>` (seeds-routes.ts:278, 405), which is a soft 404. Redemption only happens on the app's `/grow/` or `?ref=`, so `referredBy` is 0. The share text puts words in the user's mouth.
- Tests: (a) `menu-referral.emulator.test.ts`: the URL the route builds resolves in the app, and opening it records `referredBy`. (b) The share text is an editable draft.
- Files: src/api/seeds-routes.ts (referral lines only), apps/web/src/ui/referral.ui.ts.

**34. Show Me Around (tour)**: WORKS, but 2 of 3 targets are missing → **HONEST-EMPTY**, S, wave 1 lane G
- Tests: (b) `menu-tour.test.ts`: every step's selector exists in the rendered app shell.
- Files: apps/web/src/ui/onboarding.ui.ts.

**35. Seeds, garden and Ferni Fund**: BROKEN, split across two ledgers → **CONNECT** to the server ledger and **HIDE** card payments, M, wave 2 lane F, **Seth to confirm**
- Now: the menu balance comes from the browser (cosmetics.service.ts:517), while the agent credits the server ledger (`awardDailyConversation`, seeds/earn.ts:107). A gift sends the typed email as a uid ("Recipient not found"). Card payments return 503 (no Stripe key).
- Fix: turn `SEEDS_SERVER_LEDGER` on for john-bogle-ui (an env change, Seth to confirm). Resolve a gift recipient by email, or hide gifting. Hide card payments; Venmo stays.
- Tests: extend the existing `src/api/__tests__/seeds-*.emulator.test.ts`: a call credit is the balance the menu shows. (b′) `menu-seeds.contract.test.ts`: the cosmetics service reads the server balance.
- Files: apps/web/src/services/cosmetics.service.ts, apps/web/src/ui/gift-seeds.ui.ts, src/api/seeds-routes.ts, src/api/garden-routes.ts.

### Bottom sheet and team

**36. Team sheet**: WORKS → **KEEP**. Roster reload is #1165 (merged; verify it is deployed). The Nayan "Partner subscription" copy and handoff are in flight (fix-honest-claims, fix-handoff).
- Tests: (b) a teammate added to the roster is still there after a reload. (c) No "subscription".

**37. What I've learned**: WORKS, but the cache is stale → **CONNECT**, S, wave 2 lane D
- Now: the invented "X% understanding" is being removed by **fix-honest-panels**. `loadMemoriesForUser` caches forever, because its clear hook is never registered (persona-memories.ts:277).
- Tests: (a) `menu-learned.emulator.test.ts`: a persona memory written after the first GET of `/api/cognitive/memories` shows on the second.
- Files: src/services/memory/persona-memories.ts. Once #30 ships, point this mobile entry at it rather than keeping two views.

**38. Daily Practice / What I'm Noticing**: WORKS but barely fed → the fake sample is in flight with **fix-honest-panels**. The completed-commitment celebration depends on #1191.
- Test: (c) "8 times this week" and "Based on 23 conversations" never render.

**39. Team Insights**: WORKS → **KEEP**, with an error state, S, wave 2 lane H
- Now: `team_insights` has 645 docs, written by `addCrossPersonaInsight` (cross-persona-insights.ts:207). Errors fall into the empty state. The web polls it every 2 minutes (api audit).
- Tests: (a) `menu-team-insights.emulator.test.ts`: `addCrossPersonaInsight()`, then GET, and the insight comes back. (b) A 500 shows the error state.
- Files: apps/web/src/ui/team-insights.ui.ts.

**40. Team Huddle and Observations**: DEAD → being deleted by **fix-honest-claims**.

**41. Predictions**: no data has ever existed (`engagement_profiles/*/predictions` is 0) → preview, error state and badge in flight with **fix-honest-panels**; then investigate, S, wave 3 lane F
- Now: the only writer is the `weeklyPrediction` tool (analytics-games.ts:103), and whether it is reachable is UNCONFIRMED.
- Next: if the tool is not in the prod tool set, hide the button (**Seth to confirm**). Otherwise add an (a) test from the tool's execute to `GET /api/predictions`.

## Waves

The rules for a wave:

- At most 8 edit sites per agent. One agent ships its lane's PRs one after another, each from origin/main.
- No two lanes in a wave touch the same file.
- A lane that waits on an in-flight agent starts after that agent's PR merges.

**Wave 0: in flight or done (don't re-plan)**

- #1190, #1194, #1206: speaking state, voice track, tap to hear.
- #1200: Firebase token freshness.
- #1189, #1201, #1212: waitlist secret, migrate auth, signed identity.
- #1165: roster reload.
- Agents now working:
  - fix-anim-perf
  - fix-call-layout
  - fix-sites
  - fix-handoff
  - fix-dark-contrast (contact-settings, game-picker, ...)
  - fix-honest-panels (ritual-builder, music-dashboard, wellbeing, cognitive-insights, memories.ts, insights, predictions, check-in samples, chronicle fallbacks)
  - fix-honest-claims (marketplace, roadmap, sanctuary fallback, subscription copy, team-intro, patterns, huddle, dev panel)
  - fix-reg-security (/token)

**Wave 1: start now (no overlap with wave 0 files)**

| Lane | Items | Size | Files |
|---|---|---|---|
| A | 1 Your Day | S | ferni-hub.ui.ts, routes/commitments.ts, conversation-starter.ts |
| B | 7 IDOR, then 7 history | S + M | services/outreach/decision-engine.ts, outreach.routes.ts, outreach-schedule.ui.ts |
| C | 22 People (read merge; then fields and cache) | M + S | contacts-routes.ts, contact-relationship-service.ts, your-people.ui.ts, add-person.ui.ts |
| D | 5 calendar signed out; 3 automations error | S + S | calendar-view.ui.ts, life-automation.service.ts, ferni-care/dashboard.ui.ts |
| E | 14 history; 15 year | M + S | routes/conversations.ts, conversation-history.ui.ts, year-in-review-routes.ts, your-year-with-ferni.ui.ts |
| F | 31 export coverage | S | platform/data-export.ts |
| G | 33 referral; 34 tour | S + S | seeds-routes.ts (referral lines), referral.ui.ts, onboarding.ui.ts |
| H | CI gate (warnings stage) | S | .github/workflows/ci.yml, check-brand-compliance.ts, ratchet-baseline.json |

**Wave 2: after fix-honest-panels, fix-honest-claims, fix-dark-contrast and security merge, and after Seth's answers**

| Lane | Items | Size | Files |
|---|---|---|---|
| A | Hides: 20, 21, 23, 25, 28 | S | settings-menu.ui.ts, connected-life.ui.ts, menu entry wiring |
| B | 8 Staying in Touch; 19 game mode | S + S | contact-settings.ui.ts, game-picker.ui.ts |
| C | 11 wellbeing error; 12a Memory Lane error | S + S | wellbeing-dashboard.ui.ts, memory-lane.ui.ts |
| D | 18 music buttons; 37 learned cache | S + S | music-dashboard.ui.ts, lazy-screens.ts, persona-memories.ts |
| E | 6 quiet hours (flag) | M | notification-settings.ui.ts, user-routes.ts, global-services.ts, daily-outreach-runner.ts |
| F | 35 seeds ledger and gift; 26 voice packs | M + S | cosmetics.service.ts, gift-seeds.ui.ts, seeds-routes.ts, garden-routes.ts |
| G | 4a ritual read-back; 2 Sanctuary practice | S + S | rituals.service.ts, ritual-builder.ui.ts, sanctuary.ui.ts, practice-experience.ui.ts |
| H | 9, 10, 17, 27, 32, 39 (small connects and keeps); CI gate critical stage | 6 × S | your-story.service.ts, quiz.ts, knowledge-quiz.ui.ts, token-fetch.service.ts, routes/token.ts, sound.ui.ts, roadmap.service.ts, team-insights.ui.ts |

Lane H in wave 2 has six items. If its context runs short, split it into two agents.
The files don't overlap.

**Wave 3: builds behind flags**

| Lane | Items | Size | Files |
|---|---|---|---|
| A | 16 Chronicle (16a, 16b, 16c) | L | journal-routes.ts, productivity/notes.ts and index.ts, chronicle.ui.ts, a new journal store |
| B | 30 What Ferni Knows | M | a new route module, ui/memory/remembered.ts |
| C | 12b Memory Lane fed from calls | M | a new post-call module, memory-collector.ts |
| D | 4b rituals in call context | M | a new context builder |
| E | 24 family phone inbound | M | tests, dispatch-phone.ts |
| F | 41 predictions writer | S | analytics-games.ts, prediction-tracker.ui.ts |
| G | Live probe (below) | S | scripts/menu-probe/, .github/workflows/menu-live-probe.yml |

## Seth to confirm

1. **Hide Set the Mood (#20)** until lights or thermostat credentials exist in prod.
2. **Hide Meet More Friends (#21)** until a marketplace agent has a real persona bundle.
3. **Hide Home & Family (#23) and Recognizing You (#28).** Both need a speaker-ID pipeline that has no callers today, and building it is a privacy decision.
4. **Hide the Oura, Eight Sleep, Ecobee, Spotify and Apple Health tiles (#25, #18)** in prod until credentials are set up.
5. **Hide voice packs (#26)** from the seed shop until they apply on a call. Refund seeds already spent on them?
6. **Turn `SEEDS_SERVER_LEDGER` on for john-bogle-ui (#35).** Hide card payments and gifting-by-uid.
7. **Hide Predictions (#41)** if `weeklyPrediction` is not reachable in the prod tool set.
8. **CI gate**: make `Menu Contract` a required status check (a branch protection change).
9. **Live probe**: may it use a dedicated prod probe account (for example `menu-probe`, seeded with fixture data)? Whether `voice-eval-sam` has a Firebase Auth record is UNCONFIRMED; signing it in with a custom token would create one.

## CI gate: `menu-contract`, plus a banned-content ratchet

The smallest version that would have caught today's findings:

1. **`Menu Contract` job in `.github/workflows/ci.yml`.** Copy the emulator setup from
   `data-layer-e2e.yml` (Java 21, firebase-tools, wait for :8080). Then run
   `pnpm vitest run 'src/api/__tests__/menu-*.emulator.test.ts'` and the web
   `apps/web/tests/{ui,contracts}/menu-*.test.ts`.
   - The job fails if **any test was skipped**. Use `--reporter=json` and check that
     `numPendingTests == 0`. Otherwise `describe.skipIf(!emulator)` passes green
     without an emulator, which is a check that cannot fail.
   - The existing data-layer job is path-filtered and not required, so it can't be the gate.
     The new job must be added to branch protection (Seth to confirm, item 8).
2. **Banned-content patterns in `check-brand-compliance.ts`.** `ratchet.ts` already measures
   this file inside the blocking `Quality Gates (Blocking)` job (ci.yml:746). Critical
   findings must be 0, and warnings may not rise above `ratchet-baseline.json`.
   - **Warning**, scanning `apps/web/src/ui/**` and `apps/web/src/i18n/locales/en-US.json`:
     a literal number next to `%`, `x more likely`, `times this week`, `stars`, `in a row` or
     `streak`, or `Based on <n> conversations`.
   - **Critical**: `Math.random` assigned to a field named count, rate, percent, score or
     participants in `src/services/**` or `src/api/**`.
   - **Critical**: any `rating` in `apps/marketplace-agents/registry.json` whose `downloads`
     is 0 (a rating with no reviews).
   - Ship these as warnings in wave 1 (lane H). Promote them to critical in wave 2, once
     fix-honest-panels and fix-honest-claims have removed today's instances, so main doesn't go red.
3. Each pattern gets a test in `apps/cli/src/commands/quality/__tests__/` that feeds it
   today's real strings and shows each one is caught: "31% (Harvard Business Review)",
   "+5% from last month", "8 times this week", the daily-challenges `Math.random`, and
   the 5.0/0 rating.

## Live check of prod (read-only)

- **What**: `scripts/menu-probe/probe.ts`. It signs in as the probe user and sends a GET to
  each item's route on `https://app.ferni.ai/api/...`. It records the HTTP status and the
  number of rows returned, and it never writes.
  - Unauthenticated probes prove nothing for routes behind the engagement router. Any
    path under its prefixes returns 401, even a path with no handler (spot-checks.md).
- **Probe user**: a dedicated prod account with known fixture rows in each store (Seth to
  confirm, item 9). The repo's eval users (`scripts/voice-eval/eval-users.ts`, with
  `voice-eval-sam` always kept) are Firestore uids used for dev calls.
- **When**: daily, from `.github/workflows/menu-live-probe.yml` (`schedule:` plus
  `workflow_dispatch`), using a service account that can mint a custom token.
  - Alternatively, run it as a scheduled routine that runs the script and only reasons
    when it exits non-zero.
- **Fails when** a route returns non-2xx, a store that had rows for the probe user
  returns 0, or a panel route's response shape no longer has the fields the panel reads.
  Shape checks reuse the (b′) contract fixtures.
- **Output**: one line per item (`item  route  status  rows`) in the job summary.
