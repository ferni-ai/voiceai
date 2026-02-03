/**
 * PersonaPlex Integration
 *
 * Full-duplex speech-to-speech model integration for Ferni.
 *
 * @module @ferni/integrations/personaplex
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

export {
  isPersonaPlexEnabled,
  getPersonaPlexConfig,
  getVoiceEmbeddingConfig,
  getVoicePromptForPersona,
  getFallbackVoice,
  logPersonaPlexConfig,
  VOICE_EMBEDDING_CONFIGS,
  MAX_PROMPT_LENGTH,
  CONVERSATION_STYLE_SUFFIX,
  TOOL_TRIGGER_PATTERNS,
} from './config.js';

// =============================================================================
// TYPES
// =============================================================================

export type {
  PersonaPlexConfig,
  PersonaPlexConnectionOptions,
  PersonaPlexConnectionState,
  PersonaPlexClientEvents,
  PersonaPlexMessage,
  VoiceEmbeddingConfig,
  VoiceEmbeddingResult,
  PersonaPlexVoice,
  PromptContext,
  ToolDescription,
  BuiltPrompt,
  ToolTrigger,
  ToolExecutionArgs,
  ToolResult,
  PersonaPlexSession,
  TranscriptEntry,
  ToolExecutionRecord,
} from './types.js';

// =============================================================================
// CLIENT
// =============================================================================

export { PersonaPlexClient, createPersonaPlexClient } from './client.js';

// =============================================================================
// PROMPT BUILDING
// =============================================================================

export {
  buildPersonaPlexPrompt,
  buildMemoryContext,
  buildSessionContext,
  buildTimeContext,
  getDefaultToolDescriptions,
} from './prompt-builder.js';

// =============================================================================
// VOICE EMBEDDINGS
// =============================================================================

export {
  generateVoiceSample,
  generateAllVoiceSamples,
  getEmbeddingGenerationCommand,
  getAllEmbeddingGenerationCommands,
  voiceEmbeddingExists,
  getVoiceEmbeddingPath,
  validateVoiceEmbeddings,
} from './voice-embeddings/generator.js';
