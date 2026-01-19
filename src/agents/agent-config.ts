/**
 * Agent Configuration Module
 *
 * Handles loading and building persona configurations, system prompts,
 * and fallback values for voice agent sessions.
 *
 * @module agents/agent-config
 */

import type { PersonaConfig } from '../personas/types.js';

// ============================================================================
// DEFAULT CONFIGURATION VALUES
// ============================================================================

/**
 * Default communication config for greeting generation
 */
export const DEFAULT_COMMUNICATION = {
  greetingStyle: 'warm-friend' as const,
  returningUserStyle: 'warm-friend' as const,
  formalityLevel: 0.3,
  thinkingPhrases: ['Let me think about that...', 'Hmm...'],
  listeningCues: ['I hear you', 'Go on...'],
  backchannels: { neutral: ['mm-hmm'], engaged: ['right'], empathetic: ['I understand'] },
  silenceFillers: {
    early: ['Take your time'],
    mid: ["I'm here"],
    late: ["Whenever you're ready"],
  },
  selfCorrections: ['Actually, let me rephrase that...'],
  trailingOffs: ['You know...'],
  interruptionRecoveries: ['Sorry, go ahead'],
  humilityPhrases: ['I could be wrong, but...'],
  emotionalExpressions: {
    laughter: ['haha'],
    surprise: ['Oh!'],
    concern: ['Oh no...'],
    joy: ["That's wonderful!"],
    empathy: ['I understand...'],
  },
};

/**
 * Default identity config for greeting generation
 */
export function getDefaultIdentity(personaName: string) {
  return {
    selfReference: personaName,
    coreValues: ['empathy', 'growth', 'authenticity'],
    role: 'life coach',
    priorities: ['user wellbeing', 'genuine connection'],
    desiredUserExperience: 'feeling heard and supported',
  };
}

// ============================================================================
// PERSONA BUILDING
// ============================================================================

export interface BuildPersonaConfigParams {
  personaId: string;
  persona: Partial<PersonaConfig> | null;
  cachedPrompt?: string;
  defaultVoiceId: string;
}

/**
 * Builds a full PersonaConfig with all required fields.
 * Uses provided persona data or falls back to sensible defaults.
 */
export function buildPersonaConfig(params: BuildPersonaConfigParams): PersonaConfig {
  const { personaId, persona, cachedPrompt, defaultVoiceId } = params;

  // Build persona name from ID if needed
  const personaName = personaId
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const defaultIdentity = getDefaultIdentity(personaName);

  // Build fallback persona with all required fields
  const fallbackPersona: PersonaConfig = {
    id: personaId,
    name: personaName,
    description: `${personaName} is a warm and supportive life coach.`,
    voice: { voiceId: defaultVoiceId, provider: 'cartesia' as const },
    systemPrompt: cachedPrompt || `You are ${personaId}, a warm and supportive life coach.`,
    personality: {
      warmth: 0.7,
      humorLevel: 0.4,
      humorStyle: ['observational', 'self-deprecating'],
      directness: 0.6,
      energy: 0.6,
      tangentFrequency: 0.3,
      traits: ['empathetic', 'supportive', 'curious'],
      boundaries: ['Never give medical/legal/financial advice'],
    },
    speechCharacteristics: {
      baseSpeedMultiplier: 1.0,
      pauseMultiplier: 1.0,
      speedVariation: 0.15,
      thinkingSoundFrequency: 0.4,
      emphasisStyle: 'moderate',
      sentenceEndingStyle: 'natural',
      minimumEnergy: 0.8,
      maximumEnergy: 1.1,
    },
    communication: DEFAULT_COMMUNICATION,
    identity: defaultIdentity,
    knowledge: {
      domains: ['life-coaching', 'personal-growth'],
      qualifiedTopics: [
        'goal-setting',
        'habits',
        'motivation',
        'relationships',
        'work-life-balance',
      ],
      outOfScopeTopics: ['medical-diagnosis', 'legal-advice', 'financial-advice'],
      outOfScopeResponse:
        "That's outside my expertise. I'd recommend speaking with a qualified professional for that.",
    },
  };

  // Use provided persona or fallback, ensuring required fields are present
  if (!persona) {
    return fallbackPersona;
  }

  return {
    ...fallbackPersona, // Defaults
    ...persona, // Override with actual persona
    // Ensure critical nested objects exist
    communication: persona.communication ?? DEFAULT_COMMUNICATION,
    identity: persona.identity ?? defaultIdentity,
    knowledge: persona.knowledge ?? fallbackPersona.knowledge,
  };
}

// ============================================================================
// DATE/TIME CONTEXT
// ============================================================================

/**
 * Builds date/time context for agent awareness.
 * Critical for grounding the agent in reality from the very first moment.
 */
export function buildDateTimeContext(sessionStartTime: Date = new Date()): string {
  const dateStr = sessionStartTime.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const timeStr = sessionStartTime.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return `
---

## Current Date & Time

Today is ${dateStr}.
The current time is ${timeStr}.

Use this awareness naturally - don't announce it unless asked, just BE present in the moment.
If someone asks what day it is, what time it is, or what the date is, you know the answer.
`;
}

// ============================================================================
// PRE-SESSION BRIEFING
// ============================================================================

/**
 * Builds a minimal fallback briefing with date/time awareness.
 * Full briefing is generated asynchronously and upgrades this.
 */
export function buildFallbackBriefing(): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return `[YOUR AWARENESS - ${dateStr}]\nIt's ${timeStr}.\nUse this awareness naturally - don't announce it, just BE present in the moment.`;
}

// ============================================================================
// METADATA PARSING
// ============================================================================

export interface ParsedMetadata {
  metadata: Record<string, unknown>;
  personaId: string;
  publisherId?: string;
}

/**
 * Parses job and room metadata to extract persona and publisher info.
 */
export function parseMetadata(
  jobMetadata: string | undefined,
  roomMetadata: string | undefined
): ParsedMetadata {
  let metadata: Record<string, unknown> = {};

  // DEBUG: Log raw metadata
  process.stderr.write(`[agent-config] 🔍 DEBUG: Raw job.metadata = ${jobMetadata || '(empty)'}\n`);
  process.stderr.write(
    `[agent-config] 🔍 DEBUG: Raw room.metadata = ${roomMetadata || '(empty)'}\n`
  );

  if (jobMetadata) {
    try {
      metadata = JSON.parse(jobMetadata);
      process.stderr.write(
        `[agent-config] 🔍 DEBUG: Parsed job metadata keys: ${Object.keys(metadata).join(', ')}\n`
      );
    } catch (e) {
      process.stderr.write(`[agent-config] Failed to parse job.metadata: ${e}\n`);
    }
  }

  if (!metadata.persona_id && roomMetadata) {
    try {
      const roomMeta = JSON.parse(roomMetadata);
      if (roomMeta.persona_id) {
        metadata = { ...metadata, ...roomMeta };
      }
    } catch (e) {
      process.stderr.write(`[agent-config] Failed to parse room.metadata: ${e}\n`);
    }
  }

  const personaId = (metadata.persona_id as string) || process.env.PERSONA_ID || 'ferni';
  const publisherId = (metadata.publisher_id as string) || undefined;

  process.stderr.write(`[agent-config] Resolved personaId: ${personaId}\n`);
  if (publisherId) {
    process.stderr.write(`[agent-config] 🔗 Publisher ID: ${publisherId}\n`);
  }

  return { metadata, personaId, publisherId };
}

// ============================================================================
// USER LOCATION EXTRACTION
// ============================================================================

export interface UserLocation {
  city?: string;
  regionCode?: string;
  countryCode?: string;
}

/**
 * Extracts IP-detected location from metadata (TikTok-style personalization).
 */
export function extractUserLocation(metadata: Record<string, unknown>): UserLocation | undefined {
  if (!metadata.city && !metadata.regionCode && !metadata.countryCode) {
    process.stderr.write(`[agent-config] 📍 No city in metadata (location unavailable)\n`);
    return undefined;
  }

  const location: UserLocation = {
    city: metadata.city as string | undefined,
    regionCode: metadata.regionCode as string | undefined,
    countryCode: metadata.countryCode as string | undefined,
  };

  process.stderr.write(
    `[agent-config] 📍 Geo metadata received: city=${metadata.city || 'none'}, region=${metadata.regionCode || 'none'}, country=${metadata.countryCode || 'none'}\n`
  );

  if (location.city) {
    process.stderr.write(
      `[agent-config] 📍 User location: ${location.city}, ${location.regionCode || location.countryCode}\n`
    );
  }

  return location;
}

/**
 * Formats location for display/logging.
 */
export function formatLocation(location?: UserLocation): string | undefined {
  if (!location?.city) return undefined;
  return location.regionCode ? `${location.city}, ${location.regionCode}` : location.city;
}
