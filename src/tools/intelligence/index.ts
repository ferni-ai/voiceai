/**
 * Unified Intelligence Layer
 *
 * Bridges SemanticRouter and UnifiedToolOrchestrator for "Better Than Human"
 * tool selection and anticipation.
 *
 * Features:
 * - Cross-session learning (Firestore persistence)
 * - Emotion-aware tool selection (voice prosody → tool boosts)
 * - Cross-persona intelligence (handoff context)
 * - Proactive outreach integration (time-based patterns)
 *
 * @module tools/intelligence
 */

export {
  UnifiedIntelligenceLayer,
  getUnifiedIntelligence,
  initializeUnifiedIntelligence,
  // Core types
  type UserIntelligenceProfile,
  type IntelligenceEnhancement,
  type LearningEvent,
  type AnticipationResult,
  type UnifiedIntelligenceConfig,
  // Better Than Human types
  type VoiceEmotionState,
  type CrossPersonaContext,
  type PersonaHandoffEvent,
} from './unified-intelligence-layer.js';
