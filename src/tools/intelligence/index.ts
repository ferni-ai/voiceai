/**
 * Unified Intelligence Layer (Simplified)
 *
 * This module now provides a stub implementation after the FTIS simplification.
 * Full intelligence features have been removed in favor of LLM native function calling.
 *
 * @module tools/intelligence
 */

// Re-export from stub (provides backward compatibility)
export {
  UnifiedIntelligenceLayer,
  getUnifiedIntelligence,
  initializeUnifiedIntelligence,
  resetUnifiedIntelligence,
  // Core types
  type UserIntelligenceProfile,
  type IntelligenceEnhancement,
  type LearningEvent,
  // Better Than Human types
  type VoiceEmotionState,
  type CrossPersonaContext,
  type PersonaHandoffEvent,
} from '../unified-intelligence-stub.js';

// Cognitive tool interpretation (still useful, not FTIS-specific)
export {
  interpretToolResult,
  type ToolResultContext,
  type CognitiveInterpretation,
} from './cognitive-tool-interpretation.js';
