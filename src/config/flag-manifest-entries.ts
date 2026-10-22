/**
 * Part of the flag manifest (flag-manifest.ts), kept here so that file stays under
 * the 500-line limit. FLAG_MANIFEST spreads these blocks back in at their
 * alphabetical place, so key order and types are unchanged: add a new flag to
 * flag-manifest.ts unless it sorts into one of these blocks.
 *
 * @module config/flag-manifest-entries
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
/** ACTION_CLAIM_GUARD .. BYPASS_TEAM_UNLOCKS */
export const FLAGS_ACTION_TO_BYPASS = {
  ACTION_CLAIM_GUARD: { default: 'on', owner: 'tools', kind: 'kill-switch' },
  ACTION_CLAIM_STREAM: { default: 'off', owner: 'voice', kind: 'experiment' },
  AFTER_CALL_EXTRACTION: { default: 'off', owner: 'intelligence', kind: 'experiment' },
  // set by the job runner for its child processes
  AGENT_JOB_CHILD: { default: 'off', owner: 'voice', kind: 'config' },
  AI_HONESTY_STORY: { default: 'off', owner: 'voice', kind: 'experiment' },
  // Alex keeps the caller's todos, goals, calendar and agenda; Ferni hands planning to him (alex-chief-of-staff-flag.ts)
  ALEX_CHIEF_OF_STAFF: { default: 'off', owner: 'voice', kind: 'experiment' },
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
  // on: live backchannels time the caller's pause on the audio clock and skip stale frames
  BACKCHANNEL_AUDIO_CLOCK: { default: 'off', owner: 'voice', kind: 'experiment' },
  BACKCHANNEL_CLIPS: { default: 'on', owner: 'voice', kind: 'config' },
  BACKCHANNEL_CONTEXT: { default: 'off', owner: 'voice', kind: 'experiment' },
  BARGE_IN_ACK_WORDS: { default: 'off', owner: 'voice', kind: 'experiment' },
  BARGE_IN_FASTPATH: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  BARGE_IN_GUARD: { default: 'off', owner: 'voice', kind: 'experiment' },
  // on: pseudonymous call and outreach rows go to BigQuery ferni_events (analytics/bq-events.ts)
  BQ_EVENTS: { default: 'off', owner: 'platform', kind: 'experiment' },
  // on: account deletion queues the BigQuery user_hash and the daily job deletes its rows (analytics/bq-erasure.ts)
  BQ_ERASURE: { default: 'off', owner: 'platform', kind: 'experiment' },
  BRIEFED_HANDOFF: { default: 'off', owner: 'voice', kind: 'experiment' },
  BYPASS_TEAM_UNLOCKS: { default: 'off', owner: 'tools', kind: 'kill-switch' },
} as const satisfies Record<string, FlagSpec>;

/** HONEST_FRIEND .. IDENTITY_MERGE_ANON */
export const FLAGS_HONEST_TO_IDENTITY = {
  HONEST_FRIEND: { default: 'off', owner: 'voice', kind: 'experiment' },
  // on: once the hour or part of day has come up, the turn's "Right now" line drops the clock (hour-once.ts)
  HOUR_ONCE: { default: 'off', owner: 'voice', kind: 'experiment' },
  HUMAN_TEXTURE: { default: 'off', owner: 'voice', kind: 'experiment' },
  // on: POST /api/identity/merge-anonymous moves an anonymous account's data into the signed-in one
  IDENTITY_MERGE_ANON: { default: 'off', owner: 'platform', kind: 'experiment' },
} as const satisfies Record<string, FlagSpec>;

/** MOVE_OUTCOMES .. PHONE_AUDIO_MODE */
export const FLAGS_MOVE_TO_PHONE_AUDIO = {
  // on: log which moves each reply made and what followed, saved after the call (move-log.ts)
  MOVE_OUTCOMES: { default: 'off', owner: 'voice', kind: 'experiment' },
  MULTI_AGENT_ESSENTIAL_TOOLS_FIRST: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  MULTI_AGENT_MODE: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  // off: a handoff closes the call's session and starts another, as before (agents/multi-agent/persona-swap.ts)
  MULTI_AGENT_SINGLE_SESSION: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  MUSIC_CONTINUE_AS_ASKED: { default: 'off', owner: 'voice', kind: 'experiment' },
  MUSIC_ENABLED: { default: 'on', owner: 'platform', kind: 'kill-switch' },
  // on: every writer of the caller's name takes it from utils/caller-name.ts (capitalised, not a stopword or teammate)
  NAME_CAPTURE_STRICT: { default: 'off', owner: 'memory', kind: 'experiment' },
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
  // First on-behalf dial checks the do-not-call list (first-dial-opt-out.ts)
  ON_BEHALF_DNC_CHECK: { default: 'off', owner: 'outreach', kind: 'experiment' },
  // off: texts to someone else skip the STOP, quiet-hours and 10-minute guards (guarded-text.ts); rollback only
  ON_BEHALF_TEXT_GUARD: { default: 'on', owner: 'outreach', kind: 'kill-switch' },
  OPENER_FOLLOW_UP: { default: 'off', owner: 'memory', kind: 'experiment' },
  OPENER_GATE: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  OPENER_GATE_EARLY: { default: 'off', owner: 'voice', kind: 'experiment' },
  // on: open loops and Ferni's own promises join a call's recall note, once a call (agents/multi-agent/open-loops-recall.ts)
  OPEN_LOOPS_IN_CONTEXT: { default: 'off', owner: 'memory', kind: 'experiment' },
  OUTBOUND_CONFIRM: { default: 'on', owner: 'outreach', kind: 'kill-switch' },
  // ms, 10-1000: the room audio output queue; unset keeps the SDK default (1000 ms in 1.5.1)
  OUTPUT_QUEUE_MS: { default: 'sdk', owner: 'voice', kind: 'config' },
  OUTREACH_DRY_RUN: { default: 'off', owner: 'platform', kind: 'kill-switch' },
  // on: the daily scheduler sends no generic "thinking of you" check-ins
  OUTREACH_GROUNDED_CHECKINS: { default: 'on', owner: 'outreach', kind: 'kill-switch' },
  // on: a daily-outreach note saved in the app also sends a push saying it is there (in-app-push.ts)
  OUTREACH_IN_APP_PUSH: { default: 'off', owner: 'outreach', kind: 'experiment' },
  // on: pondered follow-ups go out as in-app notes (also a per-person cohort flag)
  OUTREACH_PONDERED_NOTES: { default: 'off', owner: 'outreach', kind: 'experiment' },
  OVERLAP_GREETING_WITH_PREWARM: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  PACE_MATCHING: { default: 'on', owner: 'voice', kind: 'config' },
  PAUSE_HOLD: { default: 'off', owner: 'voice', kind: 'experiment' },
  PAYWALL: { default: 'off', owner: 'billing', kind: 'kill-switch' },
  PERSONA_BEATS: { default: 'off', owner: 'voice', kind: 'experiment' },
  // character-spark.md after the character sheet, one "!" on bright turns (agents/personas/prompt-loader.ts, turn-shape.ts)
  PERSONA_SPARK: { default: 'off', owner: 'voice', kind: 'experiment' },
  PERSONA_VOICE: { default: 'off', owner: 'voice', kind: 'experiment' },
  PERSIST_AGENT_PROFILES: { default: 'off', owner: 'memory', kind: 'experiment' },
  PERSONA_MOOD_NOT_CALLERS: { default: 'on', owner: 'memory', kind: 'kill-switch' },
  PHONE_AUDIO_MODE: { default: 'off', owner: 'voice', kind: 'experiment' },
} as const satisfies Record<string, FlagSpec>;

/** SHORT_GOODBYE .. SMS_OPT_IN_CONFIRM */
export const FLAGS_SHORT_GOODBYE_TO_SMS = {
  // once the caller said bye, Ferni's goodbye is one or two short sentences (short-goodbye.ts)
  SHORT_GOODBYE: { default: 'off', owner: 'voice', kind: 'experiment' },
  SILENCE_REMARK_GUARD: { default: 'off', owner: 'voice', kind: 'experiment' },
  // a call with no caller turn is not counted in the profile (services/session/silent-call.ts)
  SILENT_CALL_SKIP_PROFILE: { default: 'off', owner: 'memory', kind: 'experiment' },
  SILENT_LINE_HANGUP: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  SKIP_CONVERSATIONAL_PREWARM: { default: 'off', owner: 'voice', kind: 'config' },
  SKIP_GEMINI_PREWARM: { default: 'off', owner: 'voice', kind: 'config' },
  SKIP_PERSONA_INDEXING: { default: 'off', owner: 'platform', kind: 'config' },
  // anything but 'false' skips the full generateReply prewarm, the quick path (generate-reply-gateway.ts)
  SKIP_PREWARM_GENERATEREPLY: { default: 'true', owner: 'platform', kind: 'config' },
  SKIP_TWILIO_VALIDATION: { default: 'off', owner: 'platform', kind: 'config' },
  // on: a text confirming opt-in when texts go on in settings, and the reminder job releases held texts (opt-in-text.ts)
  SMS_OPT_IN_CONFIRM: { default: 'off', owner: 'outreach', kind: 'experiment' },
} as const satisfies Record<string, FlagSpec>;

/** SPECIALIST_TOOLS .. SPECULATIVE_TTS */
export const FLAGS_SPECIALIST_TO_SPECULATIVE = {
  // a specialist gets its own specialty tools within the 64 cap (multi-agent/specialist-tool-sets.ts)
  SPECIALIST_TOOLS: { default: 'off', owner: 'tools', kind: 'experiment' },
  // speculative TTS warmup + per-turn pre-render: Cartesia calls the gateway reply path never reads
  SPECULATIVE_TTS: { default: 'off', owner: 'voice', kind: 'experiment' },
} as const satisfies Record<string, FlagSpec>;
