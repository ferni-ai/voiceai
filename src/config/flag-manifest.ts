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
 *
 * @module config/flag-manifest
 */

export const FLAG_OWNERS = [
  'voice',
  'tools',
  'memory',
  'intelligence',
  'outreach',
  'billing',
  'platform',
] as const;
export const FLAG_KINDS = ['experiment', 'kill-switch', 'config'] as const;

export interface FlagSpec {
  /** 'on' or 'off' when unset; a mode flag names its default mode. */
  readonly default: string;
  readonly owner: (typeof FLAG_OWNERS)[number];
  readonly kind: (typeof FLAG_KINDS)[number];
}

export const FLAG_MANIFEST = {
  ACTION_CLAIM_GUARD: { default: 'on', owner: 'tools', kind: 'kill-switch' },
  ACTION_CLAIM_STREAM: { default: 'off', owner: 'voice', kind: 'experiment' },
  AFTER_CALL_EXTRACTION: { default: 'off', owner: 'intelligence', kind: 'experiment' },
  // set by the job runner for its child processes
  AGENT_JOB_CHILD: { default: 'off', owner: 'voice', kind: 'config' },
  AI_HONESTY_STORY: { default: 'off', owner: 'voice', kind: 'experiment' },
  ALLOW_CLIENT_DEV_MODE: { default: 'off', owner: 'voice', kind: 'kill-switch' },
  ALLOW_PRODUCTION_DATA: { default: 'off', owner: 'platform', kind: 'kill-switch' },
  ALLOW_SOTA_SEED: { default: 'off', owner: 'voice', kind: 'config' },
  // every persona starts with getNews, getWeather, getWeatherForecast, searchWeb (multi-agent/always-on-info-tools.ts)
  ALWAYS_ON_INFO_TOOLS: { default: 'off', owner: 'tools', kind: 'experiment' },
  AMBIENT_MUSIC_ENABLED: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  // logs ANNOUNCED_CHECK_NO_TOOL: a reply said "I'll check" and called no tool (announced-check.ts)
  ANNOUNCED_CHECK_LOG: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  APPLE_ONLINE_CHECKS: { default: 'on', owner: 'billing', kind: 'kill-switch' },
  APPROVALS_PAGE: { default: 'off', owner: 'platform', kind: 'experiment' },
  // only with APPROVALS_PAGE=on
  APPROVALS_PASSKEYS: { default: 'off', owner: 'platform', kind: 'experiment' },
  ASK_ADVICE: { default: 'off', owner: 'voice', kind: 'experiment' },
  ASK_WHEN_UNCLEAR: { default: 'off', owner: 'voice', kind: 'experiment' },
  ASSISTANT_ACTIONS_REAL: { default: 'off', owner: 'platform', kind: 'experiment' },
  ATTUNE: { default: 'off', owner: 'voice', kind: 'experiment' },
  // Loop experiment, not live: attunement's own reply-length cap (turn-attunement.ts
  // attunedLengthOn). Learned TURN_LENGTH owns reply length and wins when both are set.
  // Candidate experiment for the humanness loop (#1377): ATTUNE_LENGTH=on vs TURN_LENGTH=learned.
  ATTUNE_LENGTH: { default: 'off', owner: 'voice', kind: 'experiment' },
  AVATAR_LISTEN_SIGNALS: { default: 'off', owner: 'voice', kind: 'experiment' },
  AVATAR_REPLY_TONE: { default: 'off', owner: 'voice', kind: 'experiment' },
  // getCurrentContext / getTodaySignificance in the caller's zone, with the cached weather
  AWARENESS_CALLER_TIME: { default: 'on', owner: 'tools', kind: 'kill-switch' },
  BACKCHANNELS: { default: 'off', owner: 'platform', kind: 'experiment' },
  BACKCHANNEL_CLIPS: { default: 'on', owner: 'voice', kind: 'config' },
  BACKCHANNEL_CONTEXT: { default: 'off', owner: 'voice', kind: 'experiment' },
  BACKGROUND_TURN_LATENCY_WARNINGS: { default: 'off', owner: 'voice', kind: 'experiment' },
  BARGE_IN_ACK_WORDS: { default: 'off', owner: 'voice', kind: 'experiment' },
  BARGE_IN_FASTPATH: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  BARGE_IN_GUARD: { default: 'off', owner: 'voice', kind: 'experiment' },
  BRIEFED_HANDOFF: { default: 'off', owner: 'voice', kind: 'experiment' },
  BYPASS_INJECTION_FILTER: { default: 'off', owner: 'intelligence', kind: 'experiment' },
  BYPASS_TEAM_UNLOCKS: { default: 'off', owner: 'tools', kind: 'kill-switch' },
  CALLER_ASSERTED_MEMORY: { default: 'off', owner: 'memory', kind: 'experiment' },
  CALLER_CITY_CONTEXT: { default: 'off', owner: 'voice', kind: 'experiment' },
  CALLER_RECOGNITION: { default: 'off', owner: 'voice', kind: 'experiment' },
  // on: a reply the caller didn't prompt ends on a caller turn, not the SDK's "." (caller-turn.ts)
  CALLER_TURN_NOTE: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  CALL_CPU_PROFILE: { default: 'off', owner: 'platform', kind: 'config' },
  CALL_FOLLOWTHROUGH: { default: 'off', owner: 'outreach', kind: 'experiment' },
  CALL_HOURS_GUARD: { default: 'off', owner: 'platform', kind: 'experiment' },
  CALL_JOURNAL: { default: 'off', owner: 'memory', kind: 'experiment' },
  CALL_WRAP_UP: { default: 'off', owner: 'voice', kind: 'experiment' },
  CANDOR: { default: 'off', owner: 'voice', kind: 'experiment' },
  CARTESIA_STREAMING_TTS: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  CASCADE_APPEND_ONLY_TOOLS: { default: 'off', owner: 'platform', kind: 'experiment' },
  CASCADE_CACHE_WARM: { default: 'off', owner: 'voice', kind: 'experiment' },
  CASCADE_FAST_LANE: { default: 'off', owner: 'voice', kind: 'kill-switch' },
  CASCADE_TRIM_LEAD_SILENCE: { default: 'off', owner: 'voice', kind: 'experiment' },
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
  CONDITIONAL_BUILDERS: { default: 'off', owner: 'intelligence', kind: 'experiment' },
  // The user's own "in memory" mark on a contact (services/contacts/in-memory.ts)
  CONTACT_IN_MEMORY: { default: 'off', owner: 'outreach', kind: 'experiment' },
  CONTEXT_PACKET: { default: 'off', owner: 'intelligence', kind: 'experiment' },
  CONVERSATION_RULES: { default: 'on', owner: 'voice', kind: 'config' },
  CRISIS_AGREEMENT_GATE: { default: 'off', owner: 'intelligence', kind: 'experiment' },
  // crisis classifier: everyday call business (call requests, goodbyes, meta talk) reads none
  CRISIS_CLASSIFIER_EVERYDAY_RULES: { default: 'off', owner: 'intelligence', kind: 'experiment' },
  // a bare request to call someone, or a bare goodbye, with no risk in the call gets a soft check (crisis-relay.ts)
  CRISIS_RELAY_SOFT: { default: 'off', owner: 'intelligence', kind: 'experiment' },
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
  DEV_TELEMETRY: { default: 'off', owner: 'voice', kind: 'config' },
  DEV_TELEMETRY_VERBOSE: { default: 'off', owner: 'voice', kind: 'config' },
  DIRECTOR_ANSWER_TURN_GUARD: { default: 'off', owner: 'voice', kind: 'experiment' },
  DIRECTOR_ESCALATE: { default: 'off', owner: 'voice', kind: 'experiment' },
  DIRECTOR_LOOK_BACK: { default: 'off', owner: 'voice', kind: 'experiment' },
  DIRECTOR_NOTES: { default: 'off', owner: 'voice', kind: 'experiment' },
  DIRECTOR_PERSONA_AWARE: { default: 'off', owner: 'voice', kind: 'experiment' },
  DIRECTOR_TOOL_STATE: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  DISABLE_BATCHED_SUMMARIZATION: { default: 'off', owner: 'platform', kind: 'config' },
  DISABLE_BUILDER_PRIORITIZATION: { default: 'off', owner: 'intelligence', kind: 'config' },
  DISABLE_DYNAMIC_STRATEGY: { default: 'off', owner: 'tools', kind: 'config' },
  DISABLE_INTERRUPT_TRANSFORM: { default: 'off', owner: 'voice', kind: 'config' },
  DISABLE_LINGUISTIC_MIRRORING: { default: 'off', owner: 'voice', kind: 'config' },
  DISABLE_NOISE_FILTER: { default: 'off', owner: 'voice', kind: 'config' },
  DISABLE_ONNX_CLASSIFIER: { default: 'off', owner: 'tools', kind: 'config' },
  DISABLE_PROSODY_ROUTING: { default: 'off', owner: 'tools', kind: 'config' },
  DISABLE_RUST_ACCELERATOR: { default: 'off', owner: 'memory', kind: 'config' },
  DISABLE_USER_SEGMENTATION: { default: 'off', owner: 'tools', kind: 'config' },
  DISABLE_VAD: { default: 'off', owner: 'voice', kind: 'config' },
  DISPUTE_DENIED_FACTS: { default: 'off', owner: 'memory', kind: 'experiment' },
  ENABLE_EMBEDDING_WORKER: { default: 'off', owner: 'platform', kind: 'experiment' },
  ENABLE_INTELLIGENT_ROUTING: { default: 'on', owner: 'tools', kind: 'kill-switch' },
  ENABLE_PROFILING: { default: 'off', owner: 'voice', kind: 'config' },
  ENDPOINT_FAST_FINISHED: { default: 'off', owner: 'voice', kind: 'experiment' },
  // late turn-1 words join that turn instead of opening a new one
  EOT_CONTINUED_MERGE: { default: 'off', owner: 'voice', kind: 'experiment' },
  EVALOPS_FIRESTORE_ENABLED: { default: 'off', owner: 'platform', kind: 'experiment' },
  EXTRACTION_CONTEXT: { default: 'off', owner: 'memory', kind: 'experiment' },
  FACT_SUPERSESSION: { default: 'off', owner: 'memory', kind: 'experiment' },
  FACT_SWEEP: { default: 'off', owner: 'memory', kind: 'experiment' },
  // scheduled family check-in calls; each also needs the family member's own consent
  FAMILY_CHECKIN_CALLS: { default: 'off', owner: 'outreach', kind: 'experiment' },
  // agent: a family member's "stop calling" withdraws their consent; server: refuses do-not-call numbers
  FAMILY_CHECKIN_STOP: { default: 'off', owner: 'outreach', kind: 'experiment' },
  // never on when NODE_ENV=production
  FERNI_DEVELOPER_TOOLS: { default: 'off', owner: 'tools', kind: 'config' },
  FERNI_LOCAL_CLOCK: { default: 'off', owner: 'voice', kind: 'experiment' },
  FERNI_PERSONA_SLIP_GUARD: { default: 'off', owner: 'voice', kind: 'experiment' },
  FERNI_SCRIPTED_HINT_LINES: { default: 'off', owner: 'intelligence', kind: 'experiment' },
  FERNI_SELF_MEMORY: { default: 'off', owner: 'voice', kind: 'experiment' },
  FERNI_SELF_RECALL: { default: 'off', owner: 'voice', kind: 'experiment' },
  FERNI_STATE: { default: 'off', owner: 'voice', kind: 'experiment' },
  // on (with FERNI_STATE): his day holds this week's beat of a written life thread (ferni-life-threads.ts)
  FERNI_THREADS: { default: 'off', owner: 'voice', kind: 'experiment' },
  FERNI_TASK_MOOD_ALONE_TRIGGERS: { default: 'off', owner: 'platform', kind: 'config' },
  FERNI_TASK_SCRIPTED_TRANSITIONS: { default: 'off', owner: 'platform', kind: 'experiment' },
  FIRST_CALL_RAPPORT: { default: 'off', owner: 'voice', kind: 'experiment' },
  FIRST_TURN_DEFER_BACKGROUND: { default: 'off', owner: 'voice', kind: 'experiment' },
  FIRST_TURN_FAST: { default: 'off', owner: 'voice', kind: 'experiment' },
  FOLLOW_THROUGH_JOB: { default: 'off', owner: 'outreach', kind: 'kill-switch' },
  // on: the greeting may say once that it's been three months, a year, since the first call (friendship-anniversary.ts)
  FRIEND_CELEBRATIONS: { default: 'off', owner: 'memory', kind: 'experiment' },
  // on: at call start, ask once about a date the caller told us (dates/recall.ts; needs DATES_THAT_MATTER)
  FRIEND_FOLLOWUPS: { default: 'off', owner: 'memory', kind: 'experiment' },
  FTIS_COLLECT_TRAINING_DATA: { default: 'off', owner: 'tools', kind: 'experiment' },
  FTIS_ENABLED: { default: 'off', owner: 'platform', kind: 'config' },
  FTIS_ONLY_MODE: { default: 'off', owner: 'tools', kind: 'experiment' },
  FTIS_PRIMARY: { default: 'off', owner: 'tools', kind: 'experiment' },
  GAME_STATE: { default: 'off', owner: 'platform', kind: 'experiment' },
  GEMINI_LIVE_USE_VERTEX_AI: { default: 'off', owner: 'voice', kind: 'experiment' },
  GEMMA3N_USE_VERTEX_AI: { default: 'off', owner: 'voice', kind: 'experiment' },
  // read by the @google/genai SDK itself (getEnv), not by src/
  GOOGLE_GENAI_USE_VERTEXAI: { default: 'off', owner: 'voice', kind: 'experiment' },
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
  // a handed-to persona gets the first agent's essential tool set, not Tier 0 (essential-tool-set.ts)
  HANDOFF_FULL_TOOLS: { default: 'off', owner: 'tools', kind: 'experiment' },
  // the caller can talk through a handoff goodbye (handoff-talk-through.ts)
  HANDOFF_TALK_THROUGH: { default: 'off', owner: 'voice', kind: 'experiment' },
  HAPPY_EXITS: { default: 'off', owner: 'voice', kind: 'experiment' },
  HEADS_UP_TEXT: { default: 'off', owner: 'outreach', kind: 'experiment' },
  HONEST_FRIEND: { default: 'off', owner: 'voice', kind: 'experiment' },
  HUMAN_TEXTURE: { default: 'off', owner: 'voice', kind: 'experiment' },
  INSIDE_JOKES: { default: 'off', owner: 'memory', kind: 'experiment' },
  INTELLIGENCE_PUBSUB_ENABLED: { default: 'off', owner: 'platform', kind: 'experiment' },
  INTERRUPT_TRACE: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  IN_PROCESS_SCHEDULERS: { default: 'off', owner: 'platform', kind: 'kill-switch' },
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
  // the look-up rule rides the two replies after a live-data question (turn-shape.ts)
  LIVE_DATA_CARRYOVER: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  LIVE_SUMMARIES: { default: 'off', owner: 'memory', kind: 'experiment' },
  // the cascade's prompt-cache settings in one switch (llm-context-cache-flag.ts)
  LLM_CONTEXT_CACHE: { default: 'off', owner: 'voice', kind: 'experiment' },
  LLM_DYNAMIC_CONTENT_ENABLED: { default: 'on', owner: 'platform', kind: 'config' },
  // a caller's retry429 option overrides it
  LLM_RETRY_429: { default: 'off', owner: 'platform', kind: 'experiment' },
  LOG_BUILDER_CATEGORIES: { default: 'off', owner: 'intelligence', kind: 'config' },
  LOG_CONTEXT_BUILDS: { default: 'off', owner: 'voice', kind: 'config' },
  LOG_FULL_RESPONSES: { default: 'off', owner: 'platform', kind: 'config' },
  LOG_PHONE_REDACTION: { default: 'on', owner: 'platform', kind: 'kill-switch' },
  MAYA_PROACTIVE_CHECKS: { default: 'off', owner: 'platform', kind: 'experiment' },
  MEMORY_DIAGNOSTICS: { default: 'off', owner: 'platform', kind: 'config' },
  MEMORY_RECALL: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  // on: the caller can see, forget and correct what Ferni knows (/api/memories/remembered).
  // Turn on with the web app's switch for the view that calls it: VITE_MEMORY_CONTROL, or the
  // memory view (VITE_MEMORY_VIEW / localStorage ferni:flag:memory-view, web known.ts).
  MEMORY_VIEW: { default: 'off', owner: 'memory', kind: 'experiment' },
  // on (with MEMORY_VIEW): the memory view also shows what Ferni has been pondering.
  MEMORY_VIEW_PONDERING: { default: 'off', owner: 'memory', kind: 'experiment' },
  // on: mid-call system notes reach Gemini framed as private, not the caller's words
  // (patches/@livekit__agents@1.6.4.patch), and save tools refuse them (tools/utils/own-note.ts)
  MID_CALL_NOTE_FRAME: { default: 'off', owner: 'voice', kind: 'experiment' },
  // on: log which moves each reply made and what followed, saved after the call (move-log.ts)
  MOVE_OUTCOMES: { default: 'off', owner: 'voice', kind: 'experiment' },
  MULTI_AGENT_ESSENTIAL_TOOLS_FIRST: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  MULTI_AGENT_MODE: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  // off: a handoff closes the call's session and starts another, as before (agents/multi-agent/persona-swap.ts)
  MULTI_AGENT_SINGLE_SESSION: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  MUSIC_CONTINUE_AS_ASKED: { default: 'off', owner: 'voice', kind: 'experiment' },
  MUSIC_ENABLED: { default: 'on', owner: 'platform', kind: 'kill-switch' },
  NAME_CORRECTION: { default: 'off', owner: 'memory', kind: 'experiment' },
  // on: an opening "Hey Seth, ..." is voiced as "Hey Seth." so the name falls (speech/tts-gateway/name-intonation.ts);
  // a name kept later in a reply ends its sentence the same way (agents/personas/name-gate.ts)
  NAME_FALLING_INTONATION: { default: 'off', owner: 'voice', kind: 'experiment' },
  // off: the caller's name may follow every reply again (agents/personas/name-gate.ts)
  NAME_GATE: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  // sends the app a name lift when the caller names someone remembered
  NAME_LIFT: { default: 'off', owner: 'memory', kind: 'experiment' },
  NAME_MISHEAR_NORMALIZE: { default: 'off', owner: 'voice', kind: 'experiment' },
  // only with NAME_MISHEAR_NORMALIZE=on: "transfer me to Fern" asks for Ferni on any persona
  NAME_MISHEAR_HANDOFF: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  // a mode: on speaks a fallback when a reply fails, shadow only logs it
  NEVER_SILENT: { default: 'off', owner: 'voice', kind: 'experiment' },
  // getNews topic search with no NewsData/GNews key says so and gives RSS headlines (news.ts)
  NEWS_HEADLINES_FALLBACK: { default: 'on', owner: 'tools', kind: 'kill-switch' },
  ONNX_USE_COREML: { default: 'on', owner: 'platform', kind: 'kill-switch' },
  ON_BEHALF_TEXTS: { default: 'off', owner: 'outreach', kind: 'experiment' },
  OPENER_FOLLOW_UP: { default: 'off', owner: 'memory', kind: 'experiment' },
  OPENER_GATE: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  OPENER_GATE_EARLY: { default: 'off', owner: 'voice', kind: 'experiment' },
  OUTBOUND_CONFIRM: { default: 'on', owner: 'outreach', kind: 'kill-switch' },
  // ms, 10-1000: the room audio output queue; unset keeps the SDK default (1000 ms in 1.5.1)
  OUTPUT_QUEUE_MS: { default: 'sdk', owner: 'voice', kind: 'config' },
  OUTREACH_DRY_RUN: { default: 'off', owner: 'platform', kind: 'kill-switch' },
  // on: the daily scheduler sends no generic "thinking of you" check-ins
  OUTREACH_GROUNDED_CHECKINS: { default: 'on', owner: 'outreach', kind: 'kill-switch' },
  // on: pondered follow-ups go out as in-app notes (also a per-person cohort flag)
  OUTREACH_PONDERED_NOTES: { default: 'off', owner: 'outreach', kind: 'experiment' },
  OVERLAP_GREETING_WITH_PREWARM: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  PACE_MATCHING: { default: 'on', owner: 'voice', kind: 'config' },
  PAUSE_HOLD: { default: 'off', owner: 'voice', kind: 'experiment' },
  PAYWALL: { default: 'off', owner: 'billing', kind: 'kill-switch' },
  PERSONA_BEATS: { default: 'off', owner: 'voice', kind: 'experiment' },
  PERSIST_AGENT_PROFILES: { default: 'off', owner: 'memory', kind: 'experiment' },
  PERSONA_MOOD_NOT_CALLERS: { default: 'on', owner: 'memory', kind: 'kill-switch' },
  PHONE_AUDIO_MODE: { default: 'off', owner: 'voice', kind: 'experiment' },
  PHONE_GOODBYE: { default: 'off', owner: 'voice', kind: 'experiment' },
  PHONE_PARITY: { default: 'off', owner: 'voice', kind: 'experiment' },
  PHONE_VERIFY: { default: 'off', owner: 'voice', kind: 'experiment' },
  PHONE_VOICE_PROFILE: { default: 'off', owner: 'voice', kind: 'experiment' },
  PIPELINE_SWITCHING: { default: 'off', owner: 'voice', kind: 'experiment' },
  PLAYOUT_DRIFT_GUARD: { default: 'off', owner: 'voice', kind: 'experiment' },
  // read in patches/@livekit__agents@1.6.4.patch
  PLAYOUT_LAUNCH_RESUME: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  PONDERING: { default: 'off', owner: 'intelligence', kind: 'experiment' },
  // late-night calls: a softer reply line and the LATE_NIGHT layer in attune.ts (porch-light.ts)
  PORCH_LIGHT: { default: 'off', owner: 'voice', kind: 'experiment' },
  POST_TTS_ADAPTIVE_PACING: { default: 'off', owner: 'voice', kind: 'experiment' },
  POST_TTS_ENHANCEMENT_ENABLED: { default: 'off', owner: 'voice', kind: 'experiment' },
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
  PROACTIVE_REASON_OPENER: { default: 'off', owner: 'voice', kind: 'experiment' },
  PROMPT_STABLE_PREFIX: { default: 'off', owner: 'voice', kind: 'experiment' },
  PUBSUB_ENABLED: { default: 'off', owner: 'voice', kind: 'config' },
  QUIET_CALLER: { default: 'off', owner: 'voice', kind: 'experiment' },
  QUIET_HOURS_UNIFIED: { default: 'off', owner: 'outreach', kind: 'experiment' },
  QUIRK_AWARENESS: { default: 'off', owner: 'voice', kind: 'experiment' },
  RECALL_BRIDGE: { default: 'off', owner: 'voice', kind: 'experiment' },
  RECALL_EPISODES: { default: 'off', owner: 'memory', kind: 'experiment' },
  RECALL_PEOPLE: { default: 'off', owner: 'memory', kind: 'experiment' },
  RECALL_RARE_WORDS: { default: 'off', owner: 'memory', kind: 'experiment' },
  RECALL_SUMMARIES: { default: 'off', owner: 'memory', kind: 'experiment' },
  RECENT_CALL_RESTRAINT: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  // shows "I'll remember" in the app after a fact is stored
  REMEMBER_MOMENT: { default: 'off', owner: 'memory', kind: 'experiment' },
  REMINDER_SCHEDULER_IN_PROCESS: { default: 'off', owner: 'platform', kind: 'experiment' },
  REPAIR_MODE: { default: 'off', owner: 'voice', kind: 'experiment' },
  REQUIRE_FIX_OUTREACH: { default: 'off', owner: 'outreach', kind: 'experiment' },
  REQUIRE_FIX_OUTREACH_NAME: { default: 'off', owner: 'outreach', kind: 'experiment' },
  // read as 'true', not 'on' (adaptive echo window)
  REQUIRE_FIX_VOICE: { default: 'off', owner: 'voice', kind: 'experiment' },
  RESUME_AFTER_DROP: { default: 'off', owner: 'voice', kind: 'experiment' },
  REVIVED_INTELLIGENCE: { default: 'off', owner: 'intelligence', kind: 'experiment' },
  ROOM_GUESTS: { default: 'off', owner: 'voice', kind: 'experiment' },
  ROUNDTABLE_VOICE: { default: 'off', owner: 'voice', kind: 'config' },
  SAVED_INTERESTS: { default: 'off', owner: 'platform', kind: 'experiment' },
  SCHEDULED_JOBS_AUTH: { default: 'on', owner: 'platform', kind: 'kill-switch' },
  SEEDS_SERVER_LEDGER: { default: 'off', owner: 'platform', kind: 'experiment' },
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
  // once the caller said bye, Ferni's goodbye is one or two short sentences (short-goodbye.ts)
  SHORT_GOODBYE: { default: 'off', owner: 'voice', kind: 'experiment' },
  SILENCE_REMARK_GUARD: { default: 'off', owner: 'voice', kind: 'experiment' },
  SILENT_LINE_HANGUP: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  SKIP_CONVERSATIONAL_PREWARM: { default: 'off', owner: 'voice', kind: 'config' },
  SKIP_GEMINI_PREWARM: { default: 'off', owner: 'voice', kind: 'config' },
  SKIP_PERSONA_INDEXING: { default: 'off', owner: 'platform', kind: 'config' },
  SKIP_TWILIO_VALIDATION: { default: 'off', owner: 'platform', kind: 'config' },
  SONATA_STT_ENABLE_VAD: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  // speculative TTS warmup + per-turn pre-render: Cartesia calls the gateway reply path never reads
  SPECULATIVE_TTS: { default: 'off', owner: 'voice', kind: 'experiment' },
  // streaks count days from the summaries subcollection (up to 400 reads per profile load)
  STREAK_FROM_SUMMARIES: { default: 'off', owner: 'memory', kind: 'experiment' },
  STREAMING_TTS_OVERLAP: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  STT_REFRESH_AFTER_GREETING: { default: 'off', owner: 'voice', kind: 'experiment' },
  // read in patches/@livekit__agents@1.6.4.patch
  STT_RETRY_RESET: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  STYLE_PROFILE: { default: 'off', owner: 'voice', kind: 'experiment' },
  TAP_INTERRUPT: { default: 'off', owner: 'voice', kind: 'experiment' },
  TEAMMATE_IDENTITY_NOTE: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  TEAM_VOICES: { default: 'off', owner: 'voice', kind: 'experiment' },
  THINK_ALOUD: { default: 'off', owner: 'voice', kind: 'experiment' },
  TOLD_THIS_CALL: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  // topic tools go to the agent on the call now, and a handed-to agent gets the call's
  // loaded domains (voice-agent/deferred-tool-update.ts)
  TOOLS_FOLLOW_AGENT: { default: 'off', owner: 'tools', kind: 'experiment' },
  // callUser places a real call to the verified phone; off keeps the honest stub
  TOOLS_REAL_CALL_USER: { default: 'off', owner: 'tools', kind: 'experiment' },
  TOOL_ACK: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  TOOL_CORE_STATIC: { default: 'off', owner: 'tools', kind: 'experiment' },
  TOOL_EMPTY_RESULT_GUARD: { default: 'on', owner: 'tools', kind: 'kill-switch' },
  TOOL_HUM: { default: 'off', owner: 'voice', kind: 'experiment' },
  TOOL_LEAD_IN: { default: 'on', owner: 'voice', kind: 'config' },
  // a tool whose requiresEnv keys are unset is not registered (tools/registry/tool-availability.ts)
  TOOL_REQUIRES_ENV: { default: 'on', owner: 'tools', kind: 'kill-switch' },
  // hourly pool shared by anonymous journal transcriptions (api/journal-transcribe-limits.ts)
  TRANSCRIBE_ANON_MAX_PER_HOUR: { default: '200', owner: 'memory', kind: 'config' },
  // on: the anonymous device fallback trusts an unsigned device_id (the one /token copies from its query)
  TRUST_UNSIGNED_DEVICE_ID: { default: 'on', owner: 'platform', kind: 'kill-switch' },
  // on: inner TTS failures reach the agent session (which closes after 4 in a row)
  TTS_FORWARD_ERRORS: { default: 'off', owner: 'voice', kind: 'experiment' },
  TTS_REPLY_CONTINUATIONS: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  TTS_WHOLE_TEXT_STREAMING: { default: 'off', owner: 'voice', kind: 'experiment' },
  TURN_INTELLIGENCE: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  TURN_KEEPER: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  TURN_KEEPER_SPOKE: { default: 'off', owner: 'voice', kind: 'experiment' },
  TURN_OPENING_SOUND: { default: 'off', owner: 'voice', kind: 'experiment' },
  TURN_LENGTH: { default: 'off', owner: 'voice', kind: 'experiment' },
  TURN_SHAPE: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  TURN_STYLE_REMINDER: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  TURN_TEXTURE: { default: 'off', owner: 'voice', kind: 'experiment' },
  UI_EVENTS_OVER_CALL: { default: 'off', owner: 'platform', kind: 'experiment' },
  UNFINISHED_TURN_HOLD: { default: 'on', owner: 'voice', kind: 'config' },
  USE_FIRESTORE_BILLING: { default: 'off', owner: 'billing', kind: 'experiment' },
  USE_FIRESTORE_MARKETPLACE: { default: 'off', owner: 'billing', kind: 'experiment' },
  USE_FIRESTORE_REVIEWS: { default: 'off', owner: 'billing', kind: 'experiment' },
  USE_GENERATED_TOOL_DOCS: { default: 'off', owner: 'voice', kind: 'config' },
  USE_NATIVE_AUDIO: { default: 'on', owner: 'platform', kind: 'kill-switch' },
  USE_NEW_TEAM_HANDLERS: { default: 'off', owner: 'tools', kind: 'experiment' },
  USE_OPENAI_REALTIME: { default: 'off', owner: 'platform', kind: 'experiment' },
  USE_PRE_STT_PROCESSING: { default: 'on', owner: 'platform', kind: 'kill-switch' },
  // SERVICE_MODE=remote also turns it on
  USE_RUNTIME: { default: 'off', owner: 'platform', kind: 'experiment' },
  USE_SIMPLIFIED_ROUTING: { default: 'off', owner: 'tools', kind: 'experiment' },
  USE_SMART_CONTEXT_ROUTING: { default: 'off', owner: 'voice', kind: 'experiment' },
  USE_SONATA_STT: { default: 'off', owner: 'voice', kind: 'experiment' },
  USE_TOOL_GATEWAY: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  USE_TTS_GATEWAY: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  // readers disagree: on in memory and Gemini config, off in Gemini Live and Gemma
  USE_VERTEX_AI: { default: 'on', owner: 'platform', kind: 'kill-switch' },
  VERTEX_KEEPALIVE: { default: 'off', owner: 'voice', kind: 'experiment' },
  VITEST: { default: 'off', owner: 'tools', kind: 'experiment' },
  VOCAL_BURSTS: { default: 'off', owner: 'voice', kind: 'experiment' },
  VOICED_PRESENCE: { default: 'off', owner: 'voice', kind: 'experiment' },
  VOICEMAIL_DETECT: { default: 'off', owner: 'voice', kind: 'experiment' },
  // the reply's pace, loudness and tone answer the caller's mood (director/attune.ts)
  VOICE_ATTUNE: { default: 'off', owner: 'voice', kind: 'experiment' },
  // clone and voice-upload routes answer 403 until a consent design exists (api/custom-agent/voice-routes.ts)
  VOICE_CLONE_CREATION: { default: 'off', owner: 'voice', kind: 'experiment' },
  // local voice-eval workers only: lets an eval set Ferni's state clock
  VOICE_EVAL_CLOCK: { default: 'off', owner: 'voice', kind: 'config' },
  VOICE_HUMANIZATION_DISABLED: { default: 'off', owner: 'platform', kind: 'kill-switch' },
  VOICE_PATTERN_ENGINE: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  WAITLIST_GATE: { default: 'off', owner: 'platform', kind: 'kill-switch' },
  // current weather is reused 10 min per place and answered within 3 s (information/weather.ts)
  WEATHER_FAST_ANSWER: { default: 'on', owner: 'tools', kind: 'kill-switch' },
  // weather with no place named: saved home, then profile, then this call's city (weather-location.ts)
  WEATHER_SAVED_HOME: { default: 'on', owner: 'tools', kind: 'kill-switch' },
  // on: web callers' audio gets BVC noise cancellation (multi-agent/room-input-options.ts)
  WEB_NOISE_CANCEL: { default: 'off', owner: 'voice', kind: 'experiment' },
  // on: searchWeb answers from Vertex Google Search grounding, not DuckDuckGo (information/web-search.ts);
  // caps SEARCH_MAX_PER_PERSON_HOUR (20), SEARCH_MAX_ANON_PER_HOUR (10, all unverified callers)
  // and SEARCH_MAX_PER_DAY (150 Google queries)
  WEB_SEARCH: { default: 'off', owner: 'tools', kind: 'experiment' },
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

export type FlagName = keyof typeof FLAG_MANIFEST;
