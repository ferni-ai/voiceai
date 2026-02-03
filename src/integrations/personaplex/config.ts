/**
 * PersonaPlex Configuration
 *
 * Environment-based configuration for PersonaPlex integration.
 */

import { createLogger } from '../../utils/safe-logger.js';
import { VOICE_IDS } from '../../config/voice-ids.js';
import type { PersonaPlexConfig, VoiceEmbeddingConfig, PersonaPlexVoice } from './types.js';

const log = createLogger({ module: 'PersonaPlexConfig' });

// =============================================================================
// ENVIRONMENT CONFIGURATION
// =============================================================================

/**
 * Check if PersonaPlex integration is enabled
 */
export function isPersonaPlexEnabled(): boolean {
  return process.env.USE_PERSONAPLEX === 'true';
}

/**
 * Get PersonaPlex server configuration from environment
 */
export function getPersonaPlexConfig(): PersonaPlexConfig {
  const host = process.env.PERSONAPLEX_HOST || 'localhost';
  const port = process.env.PERSONAPLEX_PORT || '8998';
  const protocol = process.env.PERSONAPLEX_SSL === 'true' ? 'wss' : 'ws';

  return {
    url: process.env.PERSONAPLEX_URL || `${protocol}://${host}:${port}/api/chat`,
    voicePromptDir: process.env.PERSONAPLEX_VOICE_DIR || './voice-embeddings',
    debug: process.env.PERSONAPLEX_DEBUG === 'true',
    connectionTimeoutMs: parseInt(process.env.PERSONAPLEX_TIMEOUT_MS || '30000', 10),
    sampleRate: parseInt(process.env.PERSONAPLEX_SAMPLE_RATE || '24000', 10),
  };
}

// =============================================================================
// VOICE EMBEDDING CONFIGURATION
// =============================================================================

/**
 * Sample text used to generate voice embeddings.
 * Should be ~30 seconds of natural speech covering the persona's voice characteristics.
 */
const VOICE_SAMPLE_TEXT = `
Hello, it's wonderful to connect with you today. I've been thinking about how meaningful our conversations are, 
and I want you to know that I'm here to support you in whatever way feels right. Life has its ups and downs, 
and sometimes we just need someone to listen, someone who understands. Whether you're feeling great and want to 
celebrate, or going through something challenging, I'm here. Let's take a breath together and explore what's 
on your mind. Remember, every step forward, no matter how small, is progress worth acknowledging.
`.trim();

/**
 * Voice embedding configuration for each persona.
 * Maps Ferni personas to PersonaPlex voice embeddings.
 */
export const VOICE_EMBEDDING_CONFIGS: VoiceEmbeddingConfig[] = [
  {
    personaId: 'ferni',
    cartesiaVoiceId: VOICE_IDS.FERNI,
    embeddingFilename: 'ferni.pt',
    fallbackVoice: 'NATM1',
    sampleText: VOICE_SAMPLE_TEXT,
  },
  {
    personaId: 'maya-santos',
    cartesiaVoiceId: VOICE_IDS.MAYA_SANTOS,
    embeddingFilename: 'maya.pt',
    fallbackVoice: 'NATF2',
    sampleText: VOICE_SAMPLE_TEXT,
  },
  {
    personaId: 'alex-chen',
    cartesiaVoiceId: VOICE_IDS.ALEX_CHEN,
    embeddingFilename: 'alex.pt',
    fallbackVoice: 'NATF1',
    sampleText: VOICE_SAMPLE_TEXT,
  },
  {
    personaId: 'peter-john',
    cartesiaVoiceId: VOICE_IDS.PETER_JOHN,
    embeddingFilename: 'peter.pt',
    fallbackVoice: 'NATM0',
    sampleText: VOICE_SAMPLE_TEXT,
  },
  {
    personaId: 'jordan-taylor',
    cartesiaVoiceId: VOICE_IDS.JORDAN_TAYLOR,
    embeddingFilename: 'jordan.pt',
    fallbackVoice: 'NATF0',
    sampleText: VOICE_SAMPLE_TEXT,
  },
  {
    personaId: 'nayan-patel',
    cartesiaVoiceId: VOICE_IDS.NAYAN_PATEL,
    embeddingFilename: 'nayan.pt',
    fallbackVoice: 'NATM2',
    sampleText: VOICE_SAMPLE_TEXT,
  },
];

/**
 * Get voice embedding config for a persona
 */
export function getVoiceEmbeddingConfig(personaId: string): VoiceEmbeddingConfig | undefined {
  const normalized = personaId.toLowerCase();
  return VOICE_EMBEDDING_CONFIGS.find(
    (config) => config.personaId === normalized || config.personaId.startsWith(normalized)
  );
}

/**
 * Get the voice prompt filename for a persona.
 * Returns custom embedding if available, otherwise fallback to stock PersonaPlex voice.
 */
export function getVoicePromptForPersona(personaId: string): string {
  const config = getVoiceEmbeddingConfig(personaId);
  if (!config) {
    log.warn({ personaId }, 'No voice embedding config found, using default');
    return 'NATM1.pt'; // Default to natural male voice
  }

  // Check if custom embedding exists (this would be done at runtime)
  // For now, return the embedding filename - the client will check if it exists
  return config.embeddingFilename;
}

/**
 * Get fallback PersonaPlex voice for a persona
 */
export function getFallbackVoice(personaId: string): PersonaPlexVoice {
  const config = getVoiceEmbeddingConfig(personaId);
  return config?.fallbackVoice || 'NATM1';
}

// =============================================================================
// PROMPT CONFIGURATION
// =============================================================================

/**
 * Maximum text prompt length for PersonaPlex (approximate token limit)
 */
export const MAX_PROMPT_LENGTH = 2000;

/**
 * Default conversation style prompt suffix
 */
export const CONVERSATION_STYLE_SUFFIX = `
You enjoy having a good conversation. Be present, warm, and supportive. 
Listen actively and respond thoughtfully to what the user shares.
`.trim();

// =============================================================================
// TOOL TRIGGER CONFIGURATION
// =============================================================================

/**
 * Phrases that trigger tool execution when detected in PersonaPlex speech output.
 * These are natural language patterns the model might say when it wants to perform an action.
 */
export const TOOL_TRIGGER_PATTERNS = {
  calendar: {
    patterns: [
      /let me check (your |the )?calendar/i,
      /i('ll| will) look at (your |the )?schedule/i,
      /checking (your |the )?calendar/i,
    ],
    description: 'Check calendar events',
  },
  music: {
    patterns: [
      /i('ll| will) play (some )?music/i,
      /let me put on (some )?music/i,
      /how about (some )?music/i,
    ],
    description: 'Play music',
  },
  weather: {
    patterns: [
      /let me (check|look up) the weather/i,
      /i('ll| will) check the weather/i,
      /checking the weather/i,
    ],
    description: 'Get weather information',
  },
  reminder: {
    patterns: [
      /i('ll| will) (set|create) a reminder/i,
      /let me remind you/i,
      /setting a reminder/i,
    ],
    description: 'Set a reminder',
  },
  timer: {
    patterns: [
      /i('ll| will) (set|start) a timer/i,
      /starting (a |the )?timer/i,
    ],
    description: 'Set a timer',
  },
};

/**
 * Log configuration summary
 */
export function logPersonaPlexConfig(): void {
  const config = getPersonaPlexConfig();
  log.info(
    {
      enabled: isPersonaPlexEnabled(),
      url: config.url,
      voicePromptDir: config.voicePromptDir,
      debug: config.debug,
      personas: VOICE_EMBEDDING_CONFIGS.map((c) => c.personaId),
    },
    '🎙️ PersonaPlex Configuration'
  );
}
