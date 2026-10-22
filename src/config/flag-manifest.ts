/**
 * Every env flag the code reads, with its default, owning area and kind.
 *
 * Seeded on 2026-10-11 from the flag audit (voiceai-evidence/cleanup-2026-10-11
 * /flags.md) and from a scan of src/. `default` is what the code does when the
 * variable is unset. The manifest test (__tests__/flag-manifest.test.ts) fails
 * when src/ reads an env flag that is not listed here, and flagOn (env-flag.ts)
 * only accepts names listed here.
 *
 * Kinds:
 * - experiment: off by default, being tried; ends as deleted or made permanent.
 * - kill-switch: guards live behaviour (usually on); kept so ops can turn it off.
 * - config: a mode, debug or platform knob rather than a feature switch.
 * @module config/flag-manifest
 */

import {
  FLAG_KINDS,
  FLAG_OWNERS,
  FLAGS_ACTION_TO_BYPASS,
  FLAGS_HONEST_TO_IDENTITY,
  FLAGS_MOVE_TO_PHONE_AUDIO,
  FLAGS_SHORT_GOODBYE_TO_SMS,
  type FlagSpec,
} from './flag-manifest-entries.js';

import {
  FLAGS_DISABLE_TO_EOT,
  FLAGS_PUBSUB_TO_REQUIRE,
  FLAGS_STYLE_TO_TOOL,
  FLAGS_USE_TO_VOICE,
} from './flag-manifest-blocks.js';
import { assembleManifest } from './flag-assembly.js';
import * as FLAG_FILES from './flags/index.generated.js';
export { FLAG_KINDS, FLAG_OWNERS, type FlagSpec };

const LEGACY_FLAG_MANIFEST = {
  ...FLAGS_ACTION_TO_BYPASS,
  // on: an emotional-arc proactive insight reaches the prompt once, not every third turn (commitment-follow-up-gate.ts)
  ARC_INSIGHT_ONCE: { default: 'off', owner: 'intelligence', kind: 'experiment' },
  // on: a teammate's first line names why the caller came in their words (never re-asks, never repeats an earlier arrival), else a plain hello; kept out of memory (arrival-grounding.ts, arrival-reason.ts)
  ARRIVAL_LINE_GROUNDED: { default: 'off', owner: 'voice', kind: 'experiment' },
  CALLER_ASSERTED_MEMORY: { default: 'off', owner: 'memory', kind: 'experiment' },
  CALLER_CITY_CONTEXT: { default: 'off', owner: 'voice', kind: 'experiment' },
  CALLER_RECOGNITION: { default: 'off', owner: 'voice', kind: 'experiment' },
  // on: a reply the caller didn't prompt ends on a caller turn, not the SDK's "." (caller-turn.ts)
  CALLER_TURN_NOTE: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  // shadow: log where a reply answers its own question for the caller, cut nothing; on: cut there (caller-voice-guard.ts)
  CALLER_VOICE_GUARD: { default: 'off', owner: 'voice', kind: 'experiment' },
  // on: a caller's voice create, update and delete go to their connected calendar, not only Ferni's list (#1749)
  CALENDAR_WRITE_TO_PROVIDER: { default: 'off', owner: 'tools', kind: 'experiment' },
  CALL_CPU_PROFILE: { default: 'off', owner: 'platform', kind: 'config' },
  // on: the per-turn crisis check waits at most 150 ms, then the turn goes on without it (better-than-human-builders.ts)
  CALL_START_TRIM: { default: 'off', owner: 'voice', kind: 'experiment' },
  CALL_FOLLOWTHROUGH: { default: 'off', owner: 'outreach', kind: 'experiment' },
  CALL_HOURS_GUARD: { default: 'off', owner: 'platform', kind: 'experiment' },
  CALL_JOURNAL: { default: 'off', owner: 'memory', kind: 'experiment' },
  CALL_RESULT_TEXT: { default: 'off', owner: 'outreach', kind: 'experiment' },
  CALL_JOURNAL_ASK: { default: 'off', owner: 'memory', kind: 'experiment' },
  CALL_WRAP_UP: { default: 'off', owner: 'voice', kind: 'experiment' },
  CANDOR: { default: 'off', owner: 'voice', kind: 'experiment' },
  CARTESIA_STREAMING_TTS: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  CASCADE_APPEND_ONLY_TOOLS: { default: 'off', owner: 'platform', kind: 'experiment' },
  CASCADE_CACHE_WARM: { default: 'off', owner: 'voice', kind: 'experiment' },
  CASCADE_FAST_LANE: { default: 'off', owner: 'voice', kind: 'kill-switch' },
  CASCADE_TRIM_LEAD_SILENCE: { default: 'off', owner: 'voice', kind: 'experiment' },
  // vad restores the silence timer; anything else is the STT end-of-turn (cartesia-cascade.ts)
  CASCADE_TURN_DETECTION: { default: 'stt', owner: 'voice', kind: 'config' },
  // set by CI runners, not by us
  CI: { default: 'off', owner: 'tools', kind: 'config' },
  CLIP_TRACK_PACED: { default: 'off', owner: 'voice', kind: 'experiment' },
  // on: the after-call extraction keeps the caller's own commitments (needs AFTER_CALL_EXTRACTION)
  COACH_COMMITMENT_CAPTURE: { default: 'on', owner: 'intelligence', kind: 'kill-switch' },
  COACH_FOLLOW_THROUGH: { default: 'off', owner: 'platform', kind: 'experiment' },
  // on: a commitment marked done is stored as a win the next greeting names once
  COACH_WINS: { default: 'off', owner: 'intelligence', kind: 'experiment' },
  COACH_MEDIA: { default: 'off', owner: 'tools', kind: 'experiment' },
  COHORT_FLAGS: { default: 'off', owner: 'platform', kind: 'experiment' },
  // on: once a call, invite one small caller-owned next step (agents/personas/commitment-invite.ts)
  COMMITMENT_INVITE: { default: 'off', owner: 'voice', kind: 'experiment' },
  // adds what Ferni and the caller both know to the first recall note
  COMMON_GROUND: { default: 'off', owner: 'memory', kind: 'experiment' },
  // The user's own "in memory" mark on a contact (services/contacts/in-memory.ts)
  CONTACT_IN_MEMORY: { default: 'off', owner: 'outreach', kind: 'experiment' },
  CONTEXT_PACKET: { default: 'off', owner: 'intelligence', kind: 'experiment' },
  CONVERSATION_RULES: { default: 'on', owner: 'voice', kind: 'config' },
  CRISIS_ADJUDICATOR: { default: 'off', owner: 'intelligence', kind: 'experiment' },
  CRISIS_AGREEMENT_GATE: { default: 'off', owner: 'intelligence', kind: 'experiment' },
  // crisis classifier: everyday call business (call requests, goodbyes, meta talk) reads none
  CRISIS_CLASSIFIER_EVERYDAY_RULES: { default: 'off', owner: 'intelligence', kind: 'experiment' },
  // a classifier-only imminent read the call plainly explains (two reads + a shared word) gets the soft check
  CRISIS_GROUNDED_RELEASE: { default: 'off', owner: 'intelligence', kind: 'experiment' },
  // a classifier-only crisis read of a bare "pass me to Nayan", with no risk on the call, gets the soft check-in
  CRISIS_TRANSFER_EVERYDAY: { default: 'off', owner: 'intelligence', kind: 'experiment' },
  CURIOUS_DETAIL: { default: 'off', owner: 'voice', kind: 'experiment' },
  // after-call date extraction into world_facts (nothing reads them in a call yet)
  DATES_THAT_MATTER: { default: 'off', owner: 'intelligence', kind: 'experiment' },
  DEBUG_AGENT: { default: 'off', owner: 'voice', kind: 'config' },
  DEBUG_BUILDER_PRIORITIZATION: { default: 'off', owner: 'intelligence', kind: 'config' },
  DEBUG_GEMINI_ALL: { default: 'off', owner: 'voice', kind: 'config' },
  DEBUG_GEMINI_MESSAGES: { default: 'off', owner: 'voice', kind: 'config' },
  DEBUG_GEMINI_TRANSCRIPTS: { default: 'off', owner: 'voice', kind: 'config' },
  DEBUG_INJECTIONS: { default: 'off', owner: 'intelligence', kind: 'config' },
  DEBUG_ROUTING: { default: 'off', owner: 'voice', kind: 'config' },
  DEBUG_TTS_PIPELINE: { default: 'off', owner: 'voice', kind: 'config' },
  DEBUG_TURN_TIMING: { default: 'off', owner: 'voice', kind: 'config' },
  DEBUG_VOICE_AGENT: { default: 'off', owner: 'voice', kind: 'config' },
  DEEP_ANALYSIS_IN_CALL: { default: 'off', owner: 'intelligence', kind: 'experiment' },
  DEFER_TOOL_UPDATES: { default: 'on', owner: 'voice', kind: 'config' },
  DELIBERATION: { default: 'off', owner: 'voice', kind: 'experiment' },
  DEMO_CALL_CAP: { default: 'off', owner: 'voice', kind: 'experiment' },
  DEMO_RATE_LIMIT_SHARED: { default: 'off', owner: 'platform', kind: 'experiment' },
  DEV_TELEMETRY: { default: 'off', owner: 'voice', kind: 'config' },
  DEV_TELEMETRY_VERBOSE: { default: 'off', owner: 'voice', kind: 'config' },
  // on speaks the actor's line; shadow writes it without speaking; off skips it (speech/direction/director.ts)
  DIRECTED_SPEECH: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  DIRECTOR_ANSWER_TURN_GUARD: { default: 'off', owner: 'voice', kind: 'experiment' },
  DIRECTOR_ESCALATE: { default: 'off', owner: 'voice', kind: 'experiment' },
  DIRECTOR_LOOK_BACK: { default: 'off', owner: 'voice', kind: 'experiment' },
  DIRECTOR_NOTES: { default: 'off', owner: 'voice', kind: 'experiment' },
  DIRECTOR_PERSONA_AWARE: { default: 'off', owner: 'voice', kind: 'experiment' },
  // director + deliberator framed for the persona speaking, with a SCENE block (director-scene.ts)
  DIRECTOR_SEES_SCENE: { default: 'off', owner: 'voice', kind: 'experiment' },
  DIRECTOR_TOOL_STATE: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  DISABLE_BUILDER_PRIORITIZATION: { default: 'off', owner: 'intelligence', kind: 'config' },
  ...FLAGS_DISABLE_TO_EOT,
  // errands as durable workflows: owner-confirmed calls, verified bookings (services/errands, errands-flag.ts)
  ERRANDS: { default: 'off', owner: 'outreach', kind: 'experiment' },
  EVALOPS_FIRESTORE_ENABLED: { default: 'off', owner: 'platform', kind: 'experiment' },
  // set only by vitest.config.external.ts: lets ALLOW_PRODUCTION_DATA unguard that suite
  EXTERNAL_TEST_SUITE: { default: 'off', owner: 'platform', kind: 'config' },
  EXTRACTION_CONTEXT: { default: 'off', owner: 'memory', kind: 'experiment' },
  FACT_SUPERSESSION: { default: 'off', owner: 'memory', kind: 'experiment' },
  FACT_SWEEP: { default: 'off', owner: 'memory', kind: 'experiment' },
  // scheduled family check-in calls; each also needs the family member's own consent
  FAMILY_CHECKIN_CALLS: { default: 'off', owner: 'outreach', kind: 'experiment' },
  // agent: a family member's "stop calling" withdraws their consent; server: refuses do-not-call numbers
  FAMILY_CHECKIN_STOP: { default: 'off', owner: 'outreach', kind: 'experiment' },
  // a handoff says one fond, canon line about the teammate (multi-agent/family-table.ts)
  FAMILY_TABLE: { default: 'off', owner: 'voice', kind: 'experiment' },
  // on (with FERNI_THREADS): now and then he asks the caller a small hand with his thread (ferni-asks-help.ts)
  FERNI_ASKS_HELP: { default: 'off', owner: 'voice', kind: 'experiment' },
  // never on when NODE_ENV=production
  FERNI_DEVELOPER_TOOLS: { default: 'off', owner: 'tools', kind: 'config' },
  // Ferni's laughter lever reachable (floor 0.15) and a director that stops discouraging upbeat (director/team-laughter.ts, director-notes.ts)
  FERNI_LIGHT_TOUCH: { default: 'off', owner: 'voice', kind: 'experiment' },
  FERNI_LOCAL_CLOCK: { default: 'off', owner: 'voice', kind: 'experiment' },
  FERNI_PERSONA_SLIP_GUARD: { default: 'off', owner: 'voice', kind: 'experiment' },
  // one reaction word on easy turns, a playful line on neutral ones, a bright opener kept, a warmer hello (agents/personas/ferni-playful.ts)
  FERNI_PLAYFUL: { default: 'off', owner: 'voice', kind: 'experiment' },
  FERNI_SCRIPTED_HINT_LINES: { default: 'off', owner: 'intelligence', kind: 'experiment' },
  FERNI_SELF_MEMORY: { default: 'off', owner: 'voice', kind: 'experiment' },
  FERNI_SELF_RECALL: { default: 'off', owner: 'voice', kind: 'experiment' },
  FERNI_STATE: { default: 'off', owner: 'voice', kind: 'experiment' },
  FERNI_TASK_MOOD_ALONE_TRIGGERS: { default: 'off', owner: 'platform', kind: 'config' },
  FERNI_TASK_SCRIPTED_TRANSITIONS: { default: 'off', owner: 'platform', kind: 'experiment' },
  // on (with FERNI_STATE): his day holds this week's beat of a written life thread (ferni-life-threads.ts)
  FERNI_THREADS: { default: 'off', owner: 'voice', kind: 'experiment' },
  // unset: the Director's tones. A Sonic 3 emotion: Ferni's resting tone (director/ferni-resting-voice.ts)
  FERNI_VOICE_EMOTION: { default: 'off', owner: 'voice', kind: 'config' },
  // unset: resting pace 1. A number, clamped to 0.85-1.2: Ferni's resting pace (same module)
  FERNI_VOICE_SPEED: { default: 'off', owner: 'voice', kind: 'config' },
  // report | refuse | off: a client bound to another database than FIRESTORE_DATABASE (utils/firestore-db-pin.ts)
  FIRESTORE_DB_PIN: { default: 'report', owner: 'platform', kind: 'kill-switch' },
  // on: a first call's hello says who is calling, and "who are you?" gets a plain answer (greeting-direction.ts, first-call-rapport.ts)
  FIRST_CALL_INTRO: { default: 'off', owner: 'voice', kind: 'experiment' },
  FIRST_CALL_RAPPORT: { default: 'off', owner: 'voice', kind: 'experiment' },
  // a reply's first clause goes to tts at a comma, not its sentence's end (agents/personas/first-clause-flush.ts)
  FIRST_CLAUSE_FLUSH: { default: 'off', owner: 'voice', kind: 'experiment' },
  FIRST_TURN_DEFER_BACKGROUND: { default: 'off', owner: 'voice', kind: 'experiment' },
  FIRST_TURN_FAST: { default: 'off', owner: 'voice', kind: 'experiment' },
  // which flight search backs searchFlights and getFlightPrice: amadeus (default) or ignav (travel/flight-provider.ts)
  FLIGHT_PROVIDER: { default: 'amadeus', owner: 'tools', kind: 'config' },
  // on: after a call, the verified owner's reminders, commitments and threads become follow-ups (agents/follow-through-import.ts)
  FOLLOW_THROUGH_IMPORT: { default: 'off', owner: 'outreach', kind: 'experiment' },
  FOLLOW_THROUGH_JOB: { default: 'off', owner: 'outreach', kind: 'kill-switch' },
  // on: the opener asks about one follow_through row and the caller's answer closes it (follow-through-opener.ts)
  FOLLOW_THROUGH_OPENER: { default: 'off', owner: 'outreach', kind: 'experiment' },
  // on: GET /api/follow-through/upcoming lists what Ferni's holding for the signed-in person (follow-through-upcoming-route.ts)
  FOLLOW_THROUGH_UPCOMING: { default: 'off', owner: 'outreach', kind: 'experiment' },
  // on: the greeting may say once that it's been three months, a year, since the first call (friendship-anniversary.ts)
  FRIEND_CELEBRATIONS: { default: 'off', owner: 'memory', kind: 'experiment' },
  // on: at call start, ask once about a date the caller told us (dates/recall.ts; needs DATES_THAT_MATTER)
  FRIEND_FOLLOWUPS: { default: 'off', owner: 'memory', kind: 'experiment' },
  // on: a fact the caller corrects is kept with its words and the old fact retired; next call recalls it (friend-repair.ts)
  FRIEND_REPAIR: { default: 'off', owner: 'memory', kind: 'experiment' },
  FTIS_ENABLED: { default: 'off', owner: 'platform', kind: 'config' },
  GAME_STATE: { default: 'off', owner: 'platform', kind: 'experiment' },
  // read by the @google/genai SDK itself (getEnv), not by src/
  GOOGLE_GENAI_USE_VERTEXAI: { default: 'off', owner: 'voice', kind: 'experiment' },
  // on: a goodbye (or "hang up") ends the call after Ferni's goodbye plays, app and phone; never on crisis risk (call-farewell.ts)
  GOODBYE_ENDS_CALL: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  // on: good news gets a react, name it, ask about the moment note (agents/personas/good-news-bigger.ts)
  GOOD_NEWS_BIGGER: { default: 'off', owner: 'voice', kind: 'experiment' },
  // off: a process on a non-prod Firestore database (dev) skips Spanner graph writes; the graph is prod's (spanner-graph/client.ts)
  GRAPH_WRITES_ON_DEV_DB: { default: 'off', owner: 'memory', kind: 'config' },
  GREETING_WIRE_AFTER: { default: 'off', owner: 'voice', kind: 'experiment' },
  GTM_AUTO_PUBLISH: { default: 'off', owner: 'platform', kind: 'experiment' },
  GTM_ENABLED: { default: 'on', owner: 'platform', kind: 'kill-switch' },
  GTM_PLATFORM_BLOG: { default: 'off', owner: 'platform', kind: 'experiment' },
  GTM_PLATFORM_DISCORD: { default: 'on', owner: 'platform', kind: 'kill-switch' },
  GTM_PLATFORM_LINKEDIN: { default: 'on', owner: 'platform', kind: 'kill-switch' },
  GTM_PLATFORM_TWITTER: { default: 'on', owner: 'platform', kind: 'kill-switch' },
  GTM_REQUIRE_APPROVAL: { default: 'on', owner: 'platform', kind: 'kill-switch' },
  HANDOFF_ARRIVAL_CONTEXT: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  HANDOFF_ASK_FIRST: { default: 'off', owner: 'voice', kind: 'experiment' },
  // the first handoff's goodbye plays and its teammate arrives once (missed-greeting-end.ts)
  HANDOFF_FIRST_FIX: { default: 'off', owner: 'voice', kind: 'experiment' },
  // a handed-to persona gets the first agent's essential tool set, not Tier 0 (essential-tool-set.ts)
  HANDOFF_FULL_TOOLS: { default: 'off', owner: 'tools', kind: 'experiment' },
  // the caller can talk through a handoff goodbye (handoff-talk-through.ts)
  HANDOFF_TALK_THROUGH: { default: 'off', owner: 'voice', kind: 'experiment' },
  HAPPY_EXITS: { default: 'off', owner: 'voice', kind: 'experiment' },
  HEADS_UP_TEXT: { default: 'off', owner: 'outreach', kind: 'experiment' },
  ...FLAGS_HONEST_TO_IDENTITY,
  INSIDE_JOKES: { default: 'off', owner: 'memory', kind: 'experiment' },
  INTELLIGENCE_PUBSUB_ENABLED: { default: 'off', owner: 'platform', kind: 'experiment' },
  // on: the voice agent publishes intelligence events; nothing consumes intelligence_queue (intelligence-publisher.ts)
  INTELLIGENCE_QUEUE: { default: 'off', owner: 'platform', kind: 'experiment' },
  INTERRUPT_TRACE: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  IN_PROCESS_SCHEDULERS: { default: 'off', owner: 'platform', kind: 'kill-switch' },
  // on for a person (cohort flag, read per person): pushes that reach their browser also reach
  // their iPhone over APNs (services/ios-push.ts); needs the APNS_* secrets
  IOS_PUSH: { default: 'off', owner: 'outreach', kind: 'experiment' },
  // every journal surface reads and writes bogle_users/{uid}/journal (old twin arrays merged in)
  JOURNAL_ONE_STORE: { default: 'off', owner: 'memory', kind: 'experiment' },
  // voice journal speech-to-text through Gemini on Vertex when Deepgram and Whisper have no key
  JOURNAL_TRANSCRIBE_VERTEX: { default: 'off', owner: 'memory', kind: 'experiment' },
  // public landing-page Gemini calls; off until the chat has per-IP and daily limits
  LANDING_AI: { default: 'off', owner: 'platform', kind: 'experiment' },
  LAUGH_ALONG: { default: 'off', owner: 'voice', kind: 'experiment' },
  LAZY_FIRESTORE: { default: 'on', owner: 'platform', kind: 'kill-switch' },
  LIFE_LEDGER: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  LIFE_MOVES_ON: { default: 'off', owner: 'voice', kind: 'experiment' },
  LISTEN_FIRST: { default: 'off', owner: 'voice', kind: 'experiment' },
  // on: a reply's "I'm here if you want to vent" / "safe space" clause is dropped (listen-offer.ts)
  LISTEN_OFFER_STRIP: { default: 'off', owner: 'voice', kind: 'experiment' },
  // the look-up rule rides the two replies after a live-data question (turn-shape.ts)
  LIVE_DATA_CARRYOVER: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  LIVE_SUMMARIES: { default: 'off', owner: 'memory', kind: 'experiment' },
  // on: calls record audio and transcript to LiveKit Cloud, for debugging; never on when NODE_ENV=production (session-recording.ts)
  LK_SESSION_RECORDING: { default: 'off', owner: 'voice', kind: 'config' },
  // the cascade's prompt-cache settings in one switch (llm-context-cache-flag.ts)
  LLM_CONTEXT_CACHE: { default: 'off', owner: 'voice', kind: 'experiment' },
  LLM_DYNAMIC_CONTENT_ENABLED: { default: 'on', owner: 'platform', kind: 'config' },
  // a caller's retry429 option overrides it
  LLM_RETRY_429: { default: 'off', owner: 'platform', kind: 'experiment' },
  LOG_BUILDER_CATEGORIES: { default: 'off', owner: 'intelligence', kind: 'config' },
  LOG_CONTEXT_BUILDS: { default: 'off', owner: 'voice', kind: 'config' },
  LOG_FULL_RESPONSES: { default: 'off', owner: 'platform', kind: 'config' },
  LOG_PHONE_REDACTION: { default: 'on', owner: 'platform', kind: 'kill-switch' },
  // the answer after a look-up hedges sooner and gets a short bridge line instead of dead air (lookup-bridge.ts)
  LOOKUP_BRIDGE: { default: 'off', owner: 'voice', kind: 'experiment' },
  MAYA_PROACTIVE_CHECKS: { default: 'off', owner: 'platform', kind: 'experiment' },
  MEMORY_DIAGNOSTICS: { default: 'off', owner: 'platform', kind: 'config' },
  MEMORY_RECALL: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  // which store holds caller memory: memory, firestore or postgres; unset auto-detects (memory/index.ts)
  MEMORY_STORE_TYPE: { default: 'auto', owner: 'memory', kind: 'config' },
  // on: the caller can see, forget and correct what Ferni knows (/api/memories/remembered).
  // Turn on with the web app's switch for the view that calls it: VITE_MEMORY_CONTROL, or the
  // memory view (VITE_MEMORY_VIEW / localStorage ferni:flag:memory-view, web known.ts).
  MEMORY_VIEW: { default: 'off', owner: 'memory', kind: 'experiment' },
  // on (with MEMORY_VIEW): the memory view also shows what Ferni has been pondering.
  MEMORY_VIEW_PONDERING: { default: 'off', owner: 'memory', kind: 'experiment' },
  // on: one consent record per phone, consent/{phoneHash} (services/messaging/consent.ts):
  // inbound STOP/START writes it, texts and calls read it, third parties need their own opt-in
  MESSAGING_PIPELINE: { default: 'off', owner: 'outreach', kind: 'experiment' },
  // on: mid-call system notes reach Gemini framed as private, not the caller's words
  // (patches/@livekit__agents@1.9.3.patch), and save tools refuse them (tools/utils/own-note.ts)
  MID_CALL_NOTE_FRAME: { default: 'off', owner: 'voice', kind: 'experiment' },
  // Alex's 8am text brief, with MORNING_BRIEF_USERS (services/outreach/morning-brief/brief-job.ts)
  // on: mirroring keeps English: "nah" only for a standalone no, no clause-final contractions (conversation/superhuman/mirroring-grammar.ts)
  MIRROR_GRAMMAR_GUARD: { default: 'off', owner: 'voice', kind: 'experiment' },
  MORNING_BRIEF: { default: 'off', owner: 'outreach', kind: 'experiment' },
  MORNING_BRIEF_COMMITMENTS: { default: 'off', owner: 'outreach', kind: 'experiment' },
  // on: the caller can name the tune Ferni whistles, or ask him to stop (personas/named-tune-note.ts)
  NAMED_TUNE: { default: 'off', owner: 'voice', kind: 'experiment' },
  ...FLAGS_MOVE_TO_PHONE_AUDIO,
  // on: a caller who says they're under 18 (and isn't a verified owner): nothing personal stored, a care note (minor-care.ts)
  MINOR_CARE: { default: 'off', owner: 'memory', kind: 'experiment' },
  PHONE_GOODBYE: { default: 'off', owner: 'voice', kind: 'experiment' },
  PHONE_PARITY: { default: 'off', owner: 'voice', kind: 'experiment' },
  PHONE_VERIFY: { default: 'off', owner: 'voice', kind: 'experiment' },
  PHONE_VOICE_PROFILE: { default: 'off', owner: 'voice', kind: 'experiment' },
  // a placeholder last summary is told as unknown, not as a topic (services/session/placeholder-summary.ts)
  PLACEHOLDER_SUMMARY_UNKNOWN: { default: 'off', owner: 'memory', kind: 'experiment' },
  // Keep off: needs #1855, the privacy-page wording, and a legal read of the Maps terms for storing the place ID. #1760 merged with an unverified head.
  PLACES_LOCATION: { default: 'off', owner: 'tools', kind: 'experiment' },
  // findBusiness with no known caller location asks where they are instead of searching (local-search/caller-city.ts)
  PLACES_NEEDS_LOCATION: { default: 'off', owner: 'tools', kind: 'experiment' },
  PLAYOUT_DRIFT_GUARD: { default: 'off', owner: 'voice', kind: 'experiment' },
  // read in patches/@livekit__agents@1.9.3.patch: resumes a reply paused at playout launch or by
  // leftover caller audio when nothing else will (PAUSE_RESUME_WATCHDOG, paused-lead-in.sdk.test.ts)
  PLAYOUT_LAUNCH_RESUME: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  PONDERING: { default: 'off', owner: 'intelligence', kind: 'experiment' },
  // late-night calls: a softer reply line and the LATE_NIGHT layer in attune.ts (porch-light.ts)
  PORCH_LIGHT: { default: 'off', owner: 'voice', kind: 'experiment' },
  PREDICTIONS_USE_ASYNC: { default: 'off', owner: 'voice', kind: 'experiment' },
  // on: preemptive replies are also synthesized before the commit (multi-agent/preemptive-tts.ts)
  PREEMPTIVE_TTS: { default: 'off', owner: 'voice', kind: 'experiment' },
  PRESENCE_CHECK_CAP: { default: 'off', owner: 'voice', kind: 'experiment' },
  PRESENCE_HUM: { default: 'off', owner: 'voice', kind: 'experiment' },
  PRESENCE_SNORE: { default: 'off', owner: 'voice', kind: 'experiment' },
  PRESENCE_SOUND_ASSETS: { default: 'off', owner: 'voice', kind: 'experiment' },
  PRESENCE_SOUNDS: { default: 'off', owner: 'voice', kind: 'experiment' },
  PRE_STT_SIP: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  PROACTIVE_CHANNELS: { default: 'off', owner: 'outreach', kind: 'experiment' },
  // at most one check-in per commitment every 3 days, kept across calls (superhuman/commitment-checkin-cooldown.ts)
  PROACTIVE_COOLDOWN: { default: 'off', owner: 'memory', kind: 'experiment' },
  PROACTIVE_REASON_OPENER: { default: 'off', owner: 'voice', kind: 'experiment' },
  // on: GET /api/promises, the Today panel's follow-through list (api/routes/promises.ts)
  PROMISES_PANEL: { default: 'off', owner: 'outreach', kind: 'experiment' },
  // character loads a short character sheet instead of the full prompt (prompt-loader.ts)
  PROMPT_MODE: { default: 'full', owner: 'voice', kind: 'config' },
  PROMPT_STABLE_PREFIX: { default: 'off', owner: 'voice', kind: 'experiment' },
  ...FLAGS_PUBSUB_TO_REQUIRE,
  RESUME_AFTER_DROP: { default: 'off', owner: 'voice', kind: 'experiment' },
  // unverified phone callers: hashed number → first name + one-line summary, 30 days (returning-caller.ts)
  RETURNING_CALLER: { default: 'off', owner: 'memory', kind: 'experiment' },
  REVIVED_INTELLIGENCE: { default: 'off', owner: 'intelligence', kind: 'experiment' },
  ROOM_GUESTS: { default: 'off', owner: 'voice', kind: 'experiment' },
  ROTATED_SEGMENT_FIX: { default: 'off', owner: 'voice', kind: 'experiment' }, // 1.9.3 patch, #2566
  ROUNDTABLE_VOICE: { default: 'off', owner: 'voice', kind: 'config' },
  SAVED_INTERESTS: { default: 'off', owner: 'platform', kind: 'experiment' },
  // off: scheduled jobs skip the run-once Firestore lock (job-run-guard.ts)
  SCHEDULED_JOB_LOCK: { default: 'on', owner: 'platform', kind: 'kill-switch' },
  SCHEDULED_JOBS_AUTH: { default: 'on', owner: 'platform', kind: 'kill-switch' },
  // on: the scheduled-outreach job may text, call or email a member's contacts (founder opt-in); off holds them
  SCHEDULED_OUTREACH_THIRD_PARTY: { default: 'off', owner: 'outreach', kind: 'experiment' },
  // on: the per-turn reminder drops the shared style lines and quoted examples (agents/personas/script-free.ts)
  SCRIPT_FREE_REMINDER: { default: 'off', owner: 'voice', kind: 'experiment' },
  SEEDS_SERVER_LEDGER: { default: 'off', owner: 'platform', kind: 'experiment' },
  // on (with FERNI_STATE): his own day only when asked, never on his first reply (self-share-asked.ts)
  SELF_SHARE_WHEN_ASKED: { default: 'off', owner: 'voice', kind: 'experiment' },
  SEMANTIC_RECALL: { default: 'off', owner: 'memory', kind: 'experiment' },
  SEMANTIC_ROUTER_AUTO_EXECUTE_ENABLED: { default: 'on', owner: 'tools', kind: 'config' },
  SEMANTIC_ROUTER_CHAIN_PREDICTION_ENABLED: { default: 'on', owner: 'tools', kind: 'config' },
  SEMANTIC_ROUTER_DEBUG: { default: 'off', owner: 'tools', kind: 'config' },
  SEMANTIC_ROUTER_DISTRIBUTED_CACHE: { default: 'off', owner: 'tools', kind: 'config' },
  SEMANTIC_ROUTER_ENABLED: { default: 'on', owner: 'tools', kind: 'config' },
  SEMANTIC_ROUTER_HINTS_ENABLED: { default: 'on', owner: 'tools', kind: 'config' },
  SEMANTIC_ROUTER_LEARNING_ENABLED: { default: 'on', owner: 'tools', kind: 'config' },
  SEMANTIC_ROUTER_METRICS_ENABLED: { default: 'on', owner: 'tools', kind: 'config' },
  SEMANTIC_ROUTER_PERSONALIZATION_ENABLED: { default: 'on', owner: 'tools', kind: 'config' },
  SEMANTIC_ROUTER_UNCERTAINTY_ENABLED: { default: 'on', owner: 'tools', kind: 'config' },
  SEMANTIC_ROUTER_WARMUP: { default: 'on', owner: 'tools', kind: 'config' },
  SEMANTIC_ROUTING_DEBUG: { default: 'off', owner: 'tools', kind: 'config' },
  SESSION_CONTINUITY_WRITE: { default: 'off', owner: 'memory', kind: 'experiment' },
  // on: tell the caller's app when the agent session ends without them (session-ended-signal.ts)
  SESSION_ENDED_SIGNAL: { default: 'off', owner: 'voice', kind: 'experiment' },
  ...FLAGS_SHORT_GOODBYE_TO_SMS,
  SONATA_STT_ENABLE_VAD: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  // on: every reply says the 988 crisis line as "nine eight eight" (safety/crisis-line-speech.ts)
  SPEAK_988_DIGITS: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  // speculative TTS warmup + per-turn pre-render: Cartesia calls the gateway reply path never reads
  SPECULATIVE_TTS: { default: 'off', owner: 'voice', kind: 'experiment' },
  // off, shadow or live; the default is off under tests (speech/tts-gateway/director/gate.ts)
  SPEECH_DIRECTOR: { default: 'shadow', owner: 'voice', kind: 'experiment' },
  // opt-in lever, read as SPEECH_DIRECTOR_<LEVER> from gate.ts (not a literal read)
  SPEECH_DIRECTOR_LAUGHTER: { default: 'off', owner: 'voice', kind: 'experiment' },
  // streaks count days from the summaries subcollection (up to 400 reads per profile load)
  STREAK_FROM_SUMMARIES: { default: 'off', owner: 'memory', kind: 'experiment' },
  STREAMING_TTS_OVERLAP: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  // on: a persona handoff keeps the call's STT stream instead of reopening it (stt-handoff-reuse.ts)
  STT_HANDOFF_REUSE: { default: 'off', owner: 'voice', kind: 'experiment' },
  // read in patches/@livekit__agents@1.9.3.patch: an STT attempt resets the retry count
  // only after 60 s up (1.9.x resets after timeoutMs, 10 s)
  STT_RETRY_MIN_UPTIME: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  ...FLAGS_STYLE_TO_TOOL,
  // hourly pool shared by anonymous journal transcriptions (api/journal-transcribe-limits.ts)
  TRANSCRIBE_ANON_MAX_PER_HOUR: { default: '200', owner: 'memory', kind: 'config' },
  // on: the nightly job deletes transcripts past TRANSCRIPT_RETENTION_DAYS. Off: kept for the
  // life of the account, as the privacy policy says (tasks/scheduled/transcript-cleanup-job.ts)
  TRANSCRIPT_CLEANUP: { default: 'off', owner: 'memory', kind: 'config' },
  // "pass me to 9" may be Nayan: transfer-only speech-to-text aliases (transfer-aliases.ts)
  TRANSFER_NAME_ALIASES: { default: 'off', owner: 'voice', kind: 'experiment' },
  // on: the anonymous device fallback trusts an unsigned device_id (the one /token copies from its query)
  TRUST_UNSIGNED_DEVICE_ID: { default: 'on', owner: 'platform', kind: 'kill-switch' },
  // on: inner TTS failures reach the agent session (which closes after 4 in a row)
  TTS_FORWARD_ERRORS: { default: 'off', owner: 'voice', kind: 'experiment' },
  // cartesia by default; sonata only when its native addon is built (speech/tts-gateway/providers/index.ts)
  TTS_PROVIDER: { default: 'cartesia', owner: 'voice', kind: 'config' },
  TTS_REPLY_CONTINUATIONS: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  // ping the shared Cartesia TTS socket and reopen it when it drops (tts-gateway/providers/cartesia-socket.ts)
  TTS_SOCKET_WARM: { default: 'off', owner: 'voice', kind: 'experiment' },
  TTS_WHOLE_TEXT_STREAMING: { default: 'off', owner: 'voice', kind: 'experiment' },
  // troubles talk: no shift to his own life during a trouble, replies no longer than what they told (troubles-talk.ts)
  TROUBLES_TALK: { default: 'off', owner: 'voice', kind: 'experiment' },
  // a mode: off | cloud | local (turn-patience.ts)
  TURN_DETECTOR: { default: 'off', owner: 'voice', kind: 'experiment' },
  TURN_DETECTOR_SOLE: { default: 'off', owner: 'voice', kind: 'experiment' },
  TURN_INTELLIGENCE: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  TURN_KEEPER: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  TURN_KEEPER_SPOKE: { default: 'off', owner: 'voice', kind: 'experiment' },
  TURN_OPENING_SOUND: { default: 'off', owner: 'voice', kind: 'experiment' },
  TURN_LENGTH: { default: 'off', owner: 'voice', kind: 'experiment' },
  // on: per-turn memory search gates on the vector leg's cosine (0.55), not the RRF score no memory reaches (turn-memory-scale.ts)
  TURN_MEMORY_RRF_SCALE: { default: 'off', owner: 'memory', kind: 'experiment' },
  TURN_SHAPE: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  TURN_STYLE_REMINDER: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  TURN_TEXTURE: { default: 'off', owner: 'voice', kind: 'experiment' },
  // on: a turn_input_tokens line per turn, the model's input in four parts (turn-input-tokens.ts)
  TURN_TOKEN_RECEIPT: { default: 'off', owner: 'voice', kind: 'config' },
  UI_EVENTS_OVER_CALL: { default: 'off', owner: 'platform', kind: 'experiment' },
  UNFINISHED_TURN_HOLD: { default: 'on', owner: 'voice', kind: 'config' },
  USE_GENERATED_TOOL_DOCS: { default: 'off', owner: 'voice', kind: 'config' },
  ...FLAGS_USE_TO_VOICE,
  VOICE_PATTERN_ENGINE: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  // which voice pipeline runs; anything unrecognised is the Cartesia cascade (model-provider-config.ts)
  VOICE_PIPELINE: { default: 'cartesia-cascade', owner: 'voice', kind: 'config' },
  WAITLIST_GATE: { default: 'off', owner: 'platform', kind: 'kill-switch' },
  // with WAITLIST_GATE=on: accounts created before this ISO date stay admitted; unset = none by date (api/admission.ts)
  WAITLIST_GATE_SINCE: { default: 'unset', owner: 'platform', kind: 'config' },
  // current weather is reused 10 min per place and answered within 3 s (information/weather.ts)
  WEATHER_FAST_ANSWER: { default: 'on', owner: 'tools', kind: 'kill-switch' },
  // weather with no place named: saved home, then profile, then this call's city (weather-location.ts)
  WEATHER_SAVED_HOME: { default: 'on', owner: 'tools', kind: 'kill-switch' },
  // on: web callers' audio gets BVC noise cancellation (multi-agent/room-input-options.ts)
  WEB_NOISE_CANCEL: { default: 'off', owner: 'voice', kind: 'experiment' },
  // on for a person (cohort flag, read per person): outreach and the after-call card reach their
  // browser by web push (outreach/web-push-delivery.ts, web-push-flag.ts)
  WEB_PUSH_DELIVERY: { default: 'off', owner: 'outreach', kind: 'experiment' },
  // on: searchWeb answers from Vertex Google Search grounding, not DuckDuckGo (information/web-search.ts);
  // caps SEARCH_MAX_PER_PERSON_HOUR (20), SEARCH_MAX_ANON_PER_HOUR (10, all unverified callers)
  // and SEARCH_MAX_PER_DAY (150 Google queries)
  WEB_SEARCH: { default: 'off', owner: 'tools', kind: 'experiment' },
  // on: "predict my week" loads Peter's game; a week-old prediction is asked about once a call
  WEEKLY_PREDICTION: { default: 'off', owner: 'tools', kind: 'experiment' },
  WELCOME_BACK_BOTH_SIDES: { default: 'off', owner: 'voice', kind: 'experiment' },
  WORKER_DRAIN_TIMEOUT_MS: { default: '1800000', owner: 'platform', kind: 'config' },
  WORKER_PUBSUB: { default: 'off', owner: 'platform', kind: 'experiment' },
  WORLD_FACTS_IN_CALL: { default: 'off', owner: 'intelligence', kind: 'experiment' },
  WORLD_MODEL_SNAPSHOT: { default: 'off', owner: 'intelligence', kind: 'experiment' },
  WORLD_MODEL_TEMPORAL: { default: 'off', owner: 'intelligence', kind: 'experiment' },
  WORLD_NOW: { default: 'off', owner: 'voice', kind: 'experiment' },
  // the goodbye closes the loop on what the call decided
  WRAP_UP: { default: 'off', owner: 'voice', kind: 'experiment' },
} as const satisfies Record<string, FlagSpec>;
// New flags go in src/config/flags/<NAME>.ts: pnpm flags:new (flag-assembly.ts sorts the keys).
export const FLAG_MANIFEST = assembleManifest(LEGACY_FLAG_MANIFEST, FLAG_FILES);
export type FlagName = keyof typeof FLAG_MANIFEST;
