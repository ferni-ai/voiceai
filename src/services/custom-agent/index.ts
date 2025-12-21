/**
 * Custom Agent Services
 *
 * Central export for all custom agent creation services:
 * - Voice cloning (Cartesia integration)
 * - Memory capture and AI extraction
 * - System prompt generation
 *
 * @module services/custom-agent
 */

// Voice Cloning
export {
  processVoiceUpload,
  createVoiceClone,
  generateVoicePreview,
  getVoiceClone,
  deleteVoiceClone,
  analyzeAudio,
  getVoiceLibrary,
  VOICE_LIBRARY_CATEGORIES,
  QUALITY_THRESHOLDS,
  SUPPORTED_FORMATS,
  MAX_FILE_SIZE_BYTES,
} from './voice-clone.service.js';

export type { VoiceLibraryEntry } from './voice-clone.service.js';

// Memory Capture
export {
  processMemory,
  processMemories,
  transcribeAudio,
  transcribeAudioBuffer,
  extractMetadata,
  findRelevantMemories,
  createStory,
  createWisdom,
  createSharedMoment,
  createLifeEvent,
  createJournalEntry,
  createAddMemoryResponse,
} from './memory-capture.service.js';

export type {
  MemoryType,
  RawMemoryInput,
  ProcessedMemory,
  ExtractedMetadata,
} from './memory-capture.service.js';

// Prompt Generation
export { generateSystemPrompt, generateManifest } from './prompt-generator.service.js';

// Persistence
export {
  createCustomAgent,
  getCustomAgent,
  listCustomAgents,
  updateCustomAgent,
  deleteCustomAgent,
  addMemoryToAgent,
  removeMemoryFromAgent,
  updateAgentVoice,
  getActiveCustomAgents,
  userOwnsAgent,
} from './custom-agent-persistence.service.js';

// Runtime (Voice Agent Integration)
export {
  isCustomAgentId,
  extractUserIdFromMetadata,
  customAgentToPersonaConfig,
  loadCustomAgentAsPersona,
  loadAllCustomAgentsAsPersonas,
  createFallbackCustomAgentPersona,
  CUSTOM_AGENT_PREFIXES,
  DEFAULT_COMMUNICATION,
  DEFAULT_KNOWLEDGE,
} from './custom-agent-runtime.service.js';

// GCS Storage
export {
  uploadAudioToGcs,
  downloadAudioFromGcs,
  deleteAudioFromGcs,
  uploadVoicePreview,
  uploadVoiceJournalEntry,
  generateSignedUrl,
  deleteAgentAudioFiles,
  isGcsConfigured,
  getGcsBucketName,
} from './gcs-storage.service.js';

export type { UploadResult, SignedUrlResult } from './gcs-storage.service.js';
