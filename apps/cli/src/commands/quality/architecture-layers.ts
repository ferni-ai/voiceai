/**
 * Ferni's layer map: which layer (and, in L3, which bounded context) each src/ path
 * belongs to TODAY. architecture-gate.ts checks every import against it.
 *
 * Target (approved 2026-10-11), dependencies pointing inward:
 *   L5 Experiences    web/API routes, phone, job and worker entrypoints     → may import anything
 *   L4 Orchestration  call session, turn pipeline, after-call use cases, flags → L4..L1
 *   L3 Capabilities   the 10 CONTEXTS below; another context only via its index.ts → L3, L2
 *   L2 Shared kernel  Persona, User, Relationship, Turn, Moment, Time, domain events → L2
 *   L1 Platform       LiveKit, STT, TTS, LLM, Firestore, Redis, telemetry adapters → L1, L2, L3 ports
 *
 * Keys are path prefixes; the longest wins. Values: 'L1'..'L5', 'L3:<context>' or
 * 'unassigned' (mixed dirs: reported, not checked, until their files move). A context's
 * public API is the index.ts of each prefix it owns. Moving a dir? Update its entry here
 * in the same PR, then `pnpm quality:arch --update`.
 */

export const CONTEXTS = [
  'identity', // who Ferni and the team are: personas, character
  'perception', // sensing the user: prosody, biomarkers, detectors
  'memory', // capture, recall, knowledge graph
  'understanding', // making sense of the user and the conversation
  'affect', // emotion: arcs, concern, wellbeing
  'judgment', // safety, alignment, when to surface something
  'expression', // how Ferni speaks: humanization, SSML, speech shaping, music
  'relationship', // trust, rapport, the people in the user's life
  'agency', // acting in the world: tools, tasks, integrations
  'growth', // helping the user change: coaching, habits, commitments
] as const;
export type Context = (typeof CONTEXTS)[number];
export type Layer = 'L1' | 'L2' | 'L3' | 'L4' | 'L5';

/** Every child of `parent` in `names` gets `value`. */
const under = (parent: string, value: string, names: string[]): Record<string, string> =>
  Object.fromEntries(names.map((n) => [`${parent}/${n}`, value]));

export const LAYER_MAP: Record<string, string> = {
  // L5: entrypoints; they wire everything together.
  ...under('src', 'L5', ['agent.ts', 'startup.ts', 'api', 'servers', 'cli', 'workers', 'jobs', 'scripts']),
  ...under('src/agents', 'L5', ['gce', 'voice-agent-entry', 'outbound-call', 'gce-voice-worker.ts', 'worker.ts', 'voice-agent-entry.ts']),
  'src/services/pubsub/worker-main.ts': 'L5',

  // L4: session and turn pipeline. Context builders assemble each turn's prompt from
  // every context, so they are pipeline steps, not a context of their own.
  'src/agents': 'L4',
  ...under('src', 'L4', ['context', 'runtime', 'handoff', 'intelligence/context-builders']),
  ...under('src/services', 'L4', ['session', 'session-manager', 'session-ext', 'di', 'outreach', 'messaging']),
  // Flags live in L4: an L3 import of a flag module is debt (have L4 pass the decision in).
  ...under('src/config', 'L4', ['feature-flags.ts', 'voice-humanization-flags.ts', 'linkedin-flag.ts']),
  ...under('src/config', 'L4', ['assistant-actions-flag.ts', 'call-opening-flag.ts', 'gmail-send-flag.ts']),
  ...under('src/services/platform', 'L4', ['feature-flags.ts', 'feature-rollout.ts']),

  // L3 contexts. Dirs named for a quality ("superhuman") go to the closest context.
  ...under('src', 'L3:identity', ['personas', 'personality']),
  ...under('src/services', 'L3:identity', ['persona', 'persona-service', 'cameo', 'custom-agent']),
  ...under('src/speech', 'L3:perception', ['audio-prosody', 'fft-analyzer', 'voice-biomarkers', 'human-listening-pipeline']),
  ...under('src/speech', 'L3:perception', ['audio-processing', 'audio-dsp', 'ambient-reactivity']),
  ...under('src', 'L3:perception', ['intelligence/detectors', 'services/biometrics']),
  'src/memory': 'L3:memory',
  'src/memory/credential-redaction.ts': 'L3:memory', // public: every context's writers redact through it (#2385)
  ...under('src', 'L3:memory', ['intelligence/memory-intelligence', 'intelligence/superhuman-memory', 'conversation/conversational-memory']),
  ...under('src', 'L3:memory', ['conversation/proactive-memory', 'services/memory', 'services/memory-lane', 'services/visual-memory', 'services/voice-memory']),
  ...under('src', 'L3:understanding', ['intelligence', 'conversation']),
  ...under('src/services', 'L3:understanding', ['context-awareness', 'semantic', 'cognitive-intelligence', 'intelligence', 'conversation-thread']),
  ...under('src/services', 'L3:understanding', ['world-awareness', 'language']),
  ...under('src/conversation', 'L3:affect', ['emotional-arc', 'concern-detection']),
  ...under('src/services', 'L3:affect', ['emotion-analysis', 'wellbeing-tracking', 'somatic-intelligence', 'vibe']),
  ...under('src/intelligence', 'L3:judgment', ['triggers', 'proactive', 'surfacing', 'pondering']),
  ...under('src', 'L3:judgment', ['conversation/response-mode', 'services/safety', 'services/principal-alignment']),
  ...under('src/services', 'L3:judgment', ['better-than-human-validation', 'message-validation']),
  ...under('src', 'L3:expression', ['speech', 'ssml', 'audio', 'services/humanization']),
  ...under('src/conversation', 'L3:expression', ['humanization', 'humanizer', 'speech-naturalizer', 'active-listening']),
  ...under('src/conversation', 'L3:expression', ['rhythm-intelligence', 'question-patterns']),
  ...under('src/services', 'L3:relationship', ['trust-systems', 'trust', 'trust-and-identity', 'social', 'social-graph']),
  ...under('src/services', 'L3:relationship', ['contacts', 'family', 'cross-persona', 'team-engagement', 'milestones', 'engagement']),
  ...under('src', 'L3:relationship', ['intelligence/relationship', 'intelligence/collective', 'conversation/rapport']),
  ...under('src', 'L3:agency', ['tools', 'tasks', 'marketplace']),
  ...under('src/services', 'L3:agency', ['calendar', 'scheduling', 'email', 'gmail', 'smart-home', 'actions', 'action-tracker']),
  ...under('src/services', 'L3:agency', ['workflows', 'automation', 'background-agents', 'concierge', 'integrations', 'games']),
  ...under('src/services', 'L3:agency', ['music', 'books', 'podcasts', 'finance', 'meals', 'page-generator', 'sharing']),
  ...under('src', 'L3:growth', ['tools/habit-coaching', 'tools/financial-habits', 'intelligence/coaching']),
  ...under('src/services', 'L3:growth', ['superhuman', 'coaching', 'habits', 'personal-journey', 'life-thesis', 'rituals', 'journal']),
  ...under('src/services', 'L3:growth', ['group-coaching', 'therapeutic-frameworks', 'wisdom', 'wisdom-synthesis', 'ceo-coaching']),
  ...under('src/services', 'L3:growth', ['creative-you', 'musical-you', 'predictive-insights', 'revelation-moments']),
  ...under('src/services', 'L3:growth', ['seeds', 'behavior', 'behavioral-economics', 'follow-through']),

  // L2: types, errors, translations and pure helpers (including the logger facade).
  ...under('src', 'L2', ['types', 'errors', 'i18n', 'utils']),

  // L1: adapters for storage, models, speech engines and telemetry.
  ...under('src', 'L1', ['agents/model-provider', 'diagnostics']),
  ...under('src/speech', 'L1', ['tts-gateway', 'providers', 'sonata', 'tts']),
  ...under('src/memory', 'L1', ['storage', 'vectors', 'firestore-vector-store', 'spanner-graph']),
  ...under('src/services', 'L1', ['redis', 'cache', 'persistence', 'stores', 'data', 'data-layer', 'llm', 'tts', 'pubsub']),
  ...under('src/services', 'L1', ['external-apis', 'apple', 'linkedin', 'observability', 'analytics', 'performance']),
  ...under('src/services', 'L1', ['self-healing', 'async-events', 'webhooks', 'email-transport']),
  ...under('src/utils', 'L1', ['firebase-admin-app.ts', 'firestore-query.ts', 'firestore-utils.ts', 'safe-firestore.ts']),
  ...under('src/utils', 'L1', ['transformers-loader.ts', 'native-binding-guard.ts']),

  // Unassigned: mixed dirs, reported but not checked until they are split.
  'src/services': 'unassigned', // 115 loose files, plus business/ops dirs (billing, gtm, ceo, admin, ...)
  'src/services/identity': 'unassigned', // user sign-in and OAuth next to Oura/Ecobee clients (L1)
  'src/services/voice': 'unassigned', // speaker ID (perception) next to Twilio/LiveKit bridges (L1)
  'src/config': 'unassigned', // constants, env reading and provider settings in one dir
};
