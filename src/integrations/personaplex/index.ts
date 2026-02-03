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
  CONVERSATION_STYLE_SUFFIX,
  MAX_PROMPT_LENGTH,
  TOOL_TRIGGER_PATTERNS,
  VOICE_EMBEDDING_CONFIGS,
  getFallbackVoice,
  getPersonaPlexConfig,
  getVoiceEmbeddingConfig,
  getVoicePromptForPersona,
  isPersonaPlexEnabled,
  logPersonaPlexConfig,
} from './config.js';

// =============================================================================
// TYPES
// =============================================================================

export type {
  BuiltPrompt,
  PersonaPlexClientEvents,
  PersonaPlexConfig,
  PersonaPlexConnectionOptions,
  PersonaPlexConnectionState,
  PersonaPlexMessage,
  PersonaPlexSession,
  PersonaPlexVoice,
  PromptContext,
  ToolDescription,
  ToolExecutionArgs,
  ToolExecutionRecord,
  ToolResult,
  ToolTrigger,
  TranscriptEntry,
  VoiceEmbeddingConfig,
  VoiceEmbeddingResult,
} from './types.js';

// =============================================================================
// CLIENT (Self-hosted server)
// =============================================================================

export { PersonaPlexClient, createPersonaPlexClient } from './client.js';

// =============================================================================
// API CLIENT (PersonaPlex.io hosted API - easier!)
// =============================================================================

export {
  PersonaPlexAPIClient,
  createPersonaPlexAPIClient,
  getPersonaPlexAPIKey,
  isPersonaPlexAPIConfigured,
} from './api-client.js';

// =============================================================================
// PROMPT BUILDING
// =============================================================================

export {
  buildMemoryContext,
  buildPersonaPlexPrompt,
  buildSessionContext,
  buildTimeContext,
  getDefaultToolDescriptions,
} from './prompt-builder.js';

// Enhanced prompt builder (leverages full persona bundles, superhuman capabilities)
export { buildEnhancedPersonaPlexPrompt, loadPersonaBundle } from './enhanced-prompt-builder.js';

export type { EnhancedPromptContext, LoadedPersona } from './enhanced-prompt-builder.js';

// =============================================================================
// VOICE EMBEDDINGS
// =============================================================================

export {
  generateAllVoiceSamples,
  generateVoiceSample,
  getAllEmbeddingGenerationCommands,
  getEmbeddingGenerationCommand,
  getVoiceEmbeddingPath,
  validateVoiceEmbeddings,
  voiceEmbeddingExists,
} from './voice-embeddings/generator.js';

// =============================================================================
// SESSION MANAGEMENT (Full Integration)
// =============================================================================

export {
  PersonaPlexSessionManager,
  createPersonaPlexSession,
  type PersonaPlexSessionConfig,
  type PersonaPlexSessionState,
  type PersonaPlexTurnContext,
} from './session/index.js';

// =============================================================================
// HUMANIZATION (SSML Translation)
// =============================================================================

export {
  translateSSMLToText,
  getTimeBasedVoiceGuidance,
  type SSMLTranslationInput,
  type SSMLTranslationOutput,
} from './humanization/index.js';

// =============================================================================
// TOOL EXECUTION
// =============================================================================

export {
  PersonaPlexToolExecutor,
  createToolExecutor,
  mapIntentToTool,
  type ToolTrigger as PersonaPlexToolTrigger,
  type ToolTriggerContext,
  type ToolExecutionResult,
  type PendingToolExecution,
} from './tools/index.js';
