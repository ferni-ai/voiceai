/**
 * List prices behind finops' per-call cost records (updated 2026-11-10).
 *
 * Each vendor row names its source page and the date it was read. These are
 * public list prices, not our negotiated bill. They also feed the after-call
 * tip card (api/conversation-cost-routes.ts) by wiring, so check what that card
 * shows before changing a price. The finops test fails when a model the default
 * voice cascade uses has no row here.
 *
 * @module services/observability/finops-prices
 */

/**
 * Dollars per Cartesia credit. Assumes the Scale plan: $299/month for 8M
 * credits (https://cartesia.ai/pricing, read 2026-11-10). The plan is an
 * assumption: if we are on another plan, correct it here and only here. The
 * same page lists overage at $38 per 1M credits on Scale and $45 on Startup.
 */
const CARTESIA_DOLLARS_PER_CREDIT = 299 / 8_000_000;

/** Sonic TTS: 1 credit per character (https://cartesia.ai/pricing, read 2026-11-10). */
const SONIC_CREDITS_PER_CHARACTER = 1;

/** Ink STT: 3 credits per second of audio (https://cartesia.ai/pricing, read 2026-11-10). */
const INK_CREDITS_PER_SECOND = 3;

/**
 * Cost per unit for each service. `models` names the exact model ids a speech
 * row prices. The Sonic id is written out rather than read from
 * CARTESIA_SNAPSHOT (config/voice-ids.ts) on purpose: when the pin moves, the
 * finops test fails until someone checks the new model's price here.
 */
export const PRICING = {
  // Vertex AI, Standard, Global endpoint (the cascade's default location), per 1M tokens:
  // https://cloud.google.com/vertex-ai/generative-ai/pricing (read 2026-11-10). Non-global is 10% higher.
  llm: {
    'gemini-3.5-flash': { inputPer1KTokens: 0.0015, outputPer1KTokens: 0.009 }, // $1.50 in / $9.00 out
    'gemini-3.5-flash-lite': { inputPer1KTokens: 0.0003, outputPer1KTokens: 0.0025 }, // $0.30 in / $2.50 out
    // An unpriced model (e.g. a GEMINI_MODEL override) is charged as the main model.
    default: { inputPer1KTokens: 0.0015, outputPer1KTokens: 0.009 },
  },

  tts: {
    cartesia: {
      perCharacter: SONIC_CREDITS_PER_CHARACTER * CARTESIA_DOLLARS_PER_CREDIT,
      models: ['sonic-3.6-2026-08-27'],
    },
    // 'sonata' (tts-gateway/providers/sonata.ts) is self-hosted with no list price,
    // so it lands here, charged at the Sonic rate.
    default: { perCharacter: SONIC_CREDITS_PER_CHARACTER * CARTESIA_DOLLARS_PER_CREDIT },
  },

  stt: {
    cartesia: {
      perMinute: INK_CREDITS_PER_SECOND * 60 * CARTESIA_DOLLARS_PER_CREDIT,
      models: ['ink-2'],
    },
    default: { perMinute: INK_CREDITS_PER_SECOND * 60 * CARTESIA_DOLLARS_PER_CREDIT },
  },

  // LiveKit Cloud agent session minutes past the plan's included allotment:
  // https://livekit.io/pricing (read 2026-11-10). Telephony is billed separately.
  livekit: {
    perMinute: 0.01,
  },

  // Infrastructure (amortized)
  infrastructure: {
    gcePerHour: 0.1, // n1-standard-2 ~$73/mo = $0.10/hr
    firestorePerRead: 0.0000006, // $0.06/100K
    firestorePerWrite: 0.0000018, // $0.18/100K
    firestorePerGB: 0.18,
  },

  // ============================================================================
  // OPERATING OVERHEAD - The "true cost" beyond API calls
  // ============================================================================
  // This captures all the invisible costs that make Ferni possible:
  // - Cloud infrastructure (Firebase, Cloud Run, monitoring, storage)
  // - Development & maintenance time
  // - Support & operations
  // - Error handling, retries, redundancy
  overhead: {
    // Multiplier on API costs for cloud infrastructure overhead
    // API costs are typically 30-40% of total cloud bill
    // (networking, storage, monitoring, logging, build, etc.)
    cloudInfraMultiplier: 1.5, // 1.5x = API + 50% cloud overhead

    // Fixed per-minute overhead for session infrastructure
    // (LiveKit rooms, Firestore writes, monitoring, etc.)
    perMinuteInfra: 0.002, // $0.002/min = $0.12/hr session overhead

    // Operator cost - your time, monitoring, support
    // Small bootstrapped operation: ~$0.01 per conversation minute
    // This represents the human element keeping Ferni running
    operatorPerMinute: 0.01, // $0.01/min = $0.60/hr of your time

    // Minimum floor per conversation (covers fixed costs for very short convos)
    // Even a 1-minute call has setup/teardown costs
    minimumPerSession: 0.02, // $0.02 minimum per conversation
  },
} as const;
