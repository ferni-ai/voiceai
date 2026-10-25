/**
 * More of the flag manifest (flag-manifest.ts), moved out so that file has room for
 * new flags under the 500-line limit. Each block is a run of entries no open PR was
 * editing when it moved (2026-10-20), and FLAG_MANIFEST spreads it back in at its
 * alphabetical place, so key order and types are unchanged. Add new flags to
 * flag-manifest.ts, not here.
 *
 * @module config/flag-manifest-blocks
 */

import type { FlagSpec } from './flag-manifest-entries.js';

/** DISABLE_DYNAMIC_STRATEGY .. EOT_CONTINUED_MERGE */
export const FLAGS_DISABLE_TO_EOT = {
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
  // Ferni rests calm and lifts on bright words (director/emotion-lift.ts)
  EMAIL_PROVIDER: { default: 'sendgrid', owner: 'platform', kind: 'config' },
  EMOTION_LIFT: { default: 'off', owner: 'voice', kind: 'experiment' },
  ENABLE_EMBEDDING_WORKER: { default: 'off', owner: 'platform', kind: 'experiment' },
  ENABLE_INTELLIGENT_ROUTING: { default: 'on', owner: 'tools', kind: 'kill-switch' },
  ENABLE_PROFILING: { default: 'off', owner: 'voice', kind: 'config' },
  ENDPOINT_FAST_FINISHED: { default: 'off', owner: 'voice', kind: 'experiment' },
  // on: extracted entities that are numbers, placeholders, the team or requests to Ferni are not stored (memory/entity-hygiene.ts)
  ENTITY_HYGIENE: { default: 'off', owner: 'memory', kind: 'experiment' },
  // with ENTITY_HYGIENE: role labels for Ferni ("Assistant", "user's interlocutor") are not stored (entity-hygiene.ts)
  ENTITY_ROLE_LABELS: { default: 'off', owner: 'memory', kind: 'experiment' },
  // late turn-1 words join that turn instead of opening a new one
  EOT_CONTINUED_MERGE: { default: 'off', owner: 'voice', kind: 'experiment' },
} as const satisfies Record<string, FlagSpec>;

/** PUBSUB_ENABLED .. REQUIRE_FIX_VOICE */
export const FLAGS_PUBSUB_TO_REQUIRE = {
  PUBSUB_ENABLED: { default: 'off', owner: 'voice', kind: 'config' },
  // no question right after a reply that ended on one (question-pace.ts)
  QUESTION_PACE: { default: 'off', owner: 'voice', kind: 'experiment' },
  QUIET_CALLER: { default: 'off', owner: 'voice', kind: 'experiment' },
  QUIET_HOURS_UNIFIED: { default: 'off', owner: 'outreach', kind: 'experiment' },
  QUIRK_AWARENESS: { default: 'off', owner: 'voice', kind: 'experiment' },
  // direct: reaction clips play on this track, as VOICED_PRESENCE requires (direct-clip-track.ts)
  REACTION_SIDETRACK: { default: 'off', owner: 'voice', kind: 'experiment' },
  RECALL_BRIDGE: { default: 'off', owner: 'voice', kind: 'experiment' },
  RECALL_EPISODES: { default: 'off', owner: 'memory', kind: 'experiment' },
  RECALL_PEOPLE: { default: 'off', owner: 'memory', kind: 'experiment' },
  RECALL_RARE_WORDS: { default: 'off', owner: 'memory', kind: 'experiment' },
  RECALL_SUMMARIES: { default: 'off', owner: 'memory', kind: 'experiment' },
  // on (with SEMANTIC_RECALL): facts are stored with their vectors, and recall finds older ones by meaning (stored-fact-vectors.ts)
  RECALL_VECTOR_INDEX: { default: 'off', owner: 'memory', kind: 'experiment' },
  RECENT_CALL_RESTRAINT: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  // shows "I'll remember" in the app after a fact is stored
  REMEMBER_MOMENT: { default: 'off', owner: 'memory', kind: 'experiment' },
  // on: a reminder saved to the app's inbox also gets a push (reminder-reach.ts)
  REMINDER_IN_APP_PUSH: { default: 'off', owner: 'outreach', kind: 'experiment' },
  REMINDER_SCHEDULER_IN_PROCESS: { default: 'off', owner: 'platform', kind: 'experiment' },
  // on: reminders go by text to the verified phone, via guarded-text (reminder-sms-flag.ts, reminder-reach.ts)
  REMINDER_SMS_DEFAULT: { default: 'off', owner: 'outreach', kind: 'experiment' },
  // on: setReminder saves only a time the caller said, and a new time for the same thing moves it (reminder-time-heard.ts)
  REMINDER_TIME_FROM_CALLER: { default: 'off', owner: 'tools', kind: 'experiment' },
  REPAIR_MODE: { default: 'off', owner: 'voice', kind: 'experiment' },
  REQUIRE_FIX_OUTREACH: { default: 'off', owner: 'outreach', kind: 'experiment' },
  REQUIRE_FIX_OUTREACH_NAME: { default: 'off', owner: 'outreach', kind: 'experiment' },
  // read as 'true', not 'on' (adaptive echo window)
  REQUIRE_FIX_VOICE: { default: 'off', owner: 'voice', kind: 'experiment' },
} as const satisfies Record<string, FlagSpec>;

/** STYLE_PROFILE .. TTFW_METRIC */
export const FLAGS_STYLE_TO_TOOL = {
  STYLE_PROFILE: { default: 'off', owner: 'voice', kind: 'experiment' },
  TAP_INTERRUPT: { default: 'off', owner: 'voice', kind: 'experiment' },
  TEAMMATE_IDENTITY_NOTE: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  // on: talk to a teammate is not stored as the caller's life (utils/teammate-talk.ts, #1507)
  TEAMMATE_TALK_FILTER: { default: 'off', owner: 'memory', kind: 'experiment' },
  // off: teammates unlock with conversations and streaks; on: every teammate is on every team (team-by-need-flag.ts)
  TEAM_BY_NEED: { default: 'off', owner: 'tools', kind: 'experiment' },
  TEAM_VOICES: { default: 'off', owner: 'voice', kind: 'experiment' },
  // on: the hello reads a commitment's or topic's day with the deterministic resolver
  // ("on the 30th", "in two weeks") instead of word lists (understanding/temporal, #2452)
  TEMPORAL_RESOLVER: { default: 'off', owner: 'voice', kind: 'experiment' },
  THEORY_OF_MIND: { default: 'off', owner: 'memory', kind: 'experiment' },
  THINK_ALOUD: { default: 'off', owner: 'voice', kind: 'experiment' },
  // a call or text read back and waiting for the owner's yes is kept as a follow-up (outreach/confirm-thread.ts)
  THREADS_PENDING_CONFIRM: { default: 'off', owner: 'outreach', kind: 'experiment' },
  TOLD_THIS_CALL: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  // topic tools go to the agent on the call now, and a handed-to agent gets the call's
  // loaded domains (voice-agent/deferred-tool-update.ts)
  TOOLS_FOLLOW_AGENT: { default: 'off', owner: 'tools', kind: 'experiment' },
  // a turn's topic tools go into that turn's own request, and a call starts from a
  // lean always-on set and stays within 64 + 24 tools (config/same-turn-tools-config.ts)
  TOOLS_SAME_TURN: { default: 'off', owner: 'tools', kind: 'experiment' },
  // callUser places a real call to the verified phone; off keeps the honest stub
  TOOLS_REAL_CALL_USER: { default: 'off', owner: 'tools', kind: 'experiment' },
  // that call rings with the persona's live agent (LiveKit SIP), not Twilio <Say>
  CALL_USER_LIVE_AGENT: { default: 'off', owner: 'tools', kind: 'experiment' },
  // every other call to the user's own verified phone rings live too (live-agent-call.ts)
  CALL_PROACTIVE_LIVE_AGENT: { default: 'off', owner: 'tools', kind: 'experiment' },
  // callUser's reply says whether the persona or a recorded message rang (call-placed-reply.ts)
  CALL_PLACED_HONEST_REPLY: { default: 'off', owner: 'tools', kind: 'experiment' },
  // an answered "call me" from the app ends the app call; the phone agent carries on (call-me-moves-to-phone.ts)
  CALL_ME_MOVES_TO_PHONE: { default: 'off', owner: 'tools', kind: 'experiment' },
  TOOL_ACK: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  TOOL_CORE_STATIC: { default: 'off', owner: 'tools', kind: 'experiment' },
  TOOL_EMPTY_RESULT_GUARD: { default: 'on', owner: 'tools', kind: 'kill-switch' },
  TOOL_HUM: { default: 'off', owner: 'voice', kind: 'experiment' },
  TOOL_LEAD_IN: { default: 'on', owner: 'voice', kind: 'config' },
  // a tool whose requiresEnv keys are unset is not registered (tools/registry/tool-availability.ts)
  TOOL_REQUIRES_ENV: { default: 'on', owner: 'tools', kind: 'kill-switch' },
  // one "Time to first word" line per call: where a launch's wait goes (agents/shared/time-to-first-word.ts)
  TTFW_METRIC: { default: 'off', owner: 'platform', kind: 'config' },
} as const satisfies Record<string, FlagSpec>;

/** USE_NATIVE_AUDIO .. VOICE_HUMANIZATION_DISABLED */
export const FLAGS_USE_TO_VOICE = {
  USE_NATIVE_AUDIO: { default: 'on', owner: 'platform', kind: 'kill-switch' },
  USE_PRE_STT_PROCESSING: { default: 'on', owner: 'platform', kind: 'kill-switch' },
  // SERVICE_MODE=remote also turns it on
  USE_RUNTIME: { default: 'off', owner: 'platform', kind: 'experiment' },
  USE_SMART_CONTEXT_ROUTING: { default: 'off', owner: 'voice', kind: 'experiment' },
  USE_SONATA_STT: { default: 'off', owner: 'voice', kind: 'experiment' },
  USE_TOOL_GATEWAY: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  USE_TTS_GATEWAY: { default: 'on', owner: 'voice', kind: 'kill-switch' },
  // readers disagree: on in memory and Gemini config, off in Gemini Live and Gemma
  USE_VERTEX_AI: { default: 'on', owner: 'platform', kind: 'kill-switch' },
  // on: per-person allowances (web search's hour) follow the verified-caller signal, an allowlist,
  // not the user id's shape (identity/verified-caller.ts)
  VERIFIED_CALLER_ALLOWANCE: { default: 'off', owner: 'platform', kind: 'experiment' },
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
} as const satisfies Record<string, FlagSpec>;
