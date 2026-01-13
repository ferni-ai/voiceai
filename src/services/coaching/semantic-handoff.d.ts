/**
 * Semantic Handoff Intelligence
 *
 * Enhanced handoff detection using semantic similarity, not just keyword matching.
 * Uses embeddings to understand intent even when users don't use exact keywords.
 *
 * Example improvements:
 * - "I've been thinking about what really matters in life" → Nayan (philosophy)
 * - "Need to have an uncomfortable chat with my sister" → Alex (difficult conversations)
 * - "Want to be more disciplined about my day" → Maya (habits)
 *
 * Features:
 * - Pattern-based detection (fast, no API calls)
 * - Embedding-based similarity (optional, higher accuracy)
 * - Confidence tracking for continuous improvement
 *
 * @module SemanticHandoff
 */
import type { PersonaId, HandoffDecision } from './handoff-intelligence.js';
import { TEAM_PROFILES, getOrCreateExperience } from './handoff-intelligence.js';
/**
 * Detect handoff opportunity using semantic matching
 *
 * Improvements over basic keyword matching:
 * - Catches conceptual intent ("disciplined about my day" → Maya)
 * - Uses weighted patterns (strong vs weak signals)
 * - Better confidence scoring
 */
export declare function detectHandoffSemanticly(userId: string, userMessage: string, currentPersona?: PersonaId): HandoffDecision;
/**
 * Combined detection: semantic + keyword (fallback)
 */
export declare function detectHandoffEnhanced(userId: string, userMessage: string, currentPersona?: PersonaId): HandoffDecision;
export { TEAM_PROFILES, getOrCreateExperience };
//# sourceMappingURL=semantic-handoff.d.ts.map