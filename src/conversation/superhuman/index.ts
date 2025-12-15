/**
 * Superhuman Conversational Features
 *
 * Everything that makes Ferni feel like a real friend, not just an AI.
 *
 * @module conversation/superhuman
 */

// Quote Memory - "Last time you said..."
export {
  captureQuote,
  extractQuote,
  findRelevantQuote,
  formatQuoteForPrompt,
  markQuoteSurfaced,
  saveQuote,
  type QuoteSuggestion,
  type QuoteSurfaceContext,
  type UserQuote,
} from './quote-memory.js';

// Relationship Milestones - Anniversary tracking
export {
  acknowledgeMilestone,
  checkMilestones,
  formatMilestoneForPrompt,
  getStats,
  recordBreakthrough,
  recordConversation,
  recordGoalAchieved,
  recordLaugh,
  type RelationshipMilestone,
  type UserRelationshipStats,
} from './relationship-milestones.js';

// Micro-celebrations - Real-time wins
export { detectMicroWin, formatMicroWinForPrompt, type MicroWin } from './micro-celebrations.js';

// Natural Speech - Fillers, self-corrections
export {
  addNaturalSpeech,
  formatNaturalSpeechGuidance,
  generateSelfCorrection,
  generateThinkingMoment,
  getSpeechModification,
  type NaturalSpeechConfig,
  type SpeechModification,
} from './natural-speech.js';

// Inside Jokes - Shared humor
export {
  captureJoke,
  findRelevantJoke,
  formatJokeForPrompt,
  markJokeReferenced,
  type InsideJoke,
  type JokeReference,
} from './inside-jokes.js';

// Nicknames - Personal touch
export {
  addNickname,
  extractNameFromMessage,
  formatNamingGuidance,
  getUserNaming,
  recordNameUsage,
  setUserName,
  shouldUseName,
  updateEndearmentLevel,
  type UserNaming,
} from './nicknames.js';

// Story Continuity - People in their life
export {
  addPersonDetail,
  extractPerson,
  findPeopleToAskAbout,
  formatFollowUpForPrompt,
  getOrCreatePerson,
  updateStoryline,
  type PersonFollowUp,
  type PersonInLife,
  type Storyline,
} from './story-continuity.js';

// Better Than Human Orchestrator - Superhuman insights
export {
  BetterThanHumanOrchestrator,
  clearBetterThanHuman,
  getBetterThanHuman,
} from './orchestrator.js';

// Engine getters and clearers for testing
export { clearAnticipatoryPresence, getAnticipatoryPresence } from './anticipatory-presence.js';
export { clearEmotionalMemory, getEmotionalMemory } from './emotional-memory.js';
export { clearEvolvingJokes, getEvolvingJokes } from './evolving-jokes.js';
export { clearLinguisticMirroring, getLinguisticMirroring } from './linguistic-mirroring.js';
export {
  clearMetaRelationship,
  clearSomaticPresence,
  getMetaRelationship,
  getSomaticPresence,
} from './meta-relationship.js';
export {
  clearDelightEngines,
  getProtectiveInstincts,
  getSpontaneousDelight,
  getVisibleVulnerability,
} from './spontaneous-delight.js';
export {
  clearSuperhumanObservations,
  getSuperhumanObservations,
} from './superhuman-observations.js';
export { clearTeamCoherence, getTeamCoherence } from './team-coherence.js';
export { clearTemporalEmotional, getTemporalEmotional } from './temporal-emotional.js';

// Better Than Human Types
export type { BetterThanHumanContext, BetterThanHumanInsight } from './types.js';

// ===========================================================================
// NEW SUPERHUMAN FEATURES (Phase 2)
// ===========================================================================

// Vulnerability Matching - Reciprocal depth
export {
  analyzeVulnerabilityDepth,
  clearVulnerabilityStates,
  formatVulnerabilityGuidance,
  getVulnerabilityState,
  getVulnerabilityStates,
  recordShareAndMatch,
  resetSessionVulnerability,
  type VulnerabilityDepth,
  type VulnerabilityMatch,
  type VulnerabilityState,
} from './vulnerability-matching.js';

// Empathetic Reflections - Structured empathy
export {
  clearReflectionStates,
  formatReflectionGuidance,
  generateReflection,
  type Reflection,
  type ReflectionContext,
  type ReflectionType,
} from './empathetic-reflections.js';

// Presence Mode - "Just be here"
export {
  analyzePresenceNeed,
  formatPresenceGuidance,
  getPresencePhrase,
  shouldAvoidAdvice,
  type PresenceDecision,
  type PresenceLevel,
} from './presence-mode.js';

// Shared Language - "Our words"
export {
  addSharedTerm,
  clearSharedLanguage,
  extractSharedLanguage,
  findRelevantTerm,
  formatSharedLanguageGuidance,
  getLanguageStates,
  getSharedTerms,
  type SharedLanguageState,
  type SharedTerm,
  type SharedTermType,
  type TermSuggestion,
} from './shared-language.js';

// Conversational Rituals - "Our thing"
export {
  clearRitualStates,
  createCustomRitual,
  formatRitualGuidance,
  getEstablishedRituals,
  recordRitualPerformed,
  suggestRitual,
  type Ritual,
  type RitualSuggestion,
  type RitualType,
} from './conversational-rituals.js';

// Emotional Forecasting - "Tomorrow might be tough"
export {
  formatForecastGuidance,
  generateForecast,
  getForecastAcknowledgment,
  shouldMentionForecast,
  type EmotionalForecast,
  type ForecastContext,
} from './emotional-forecasting.js';

// Gentle Challenges - "I love you, and..."
export {
  detectChallengeOpportunity,
  formatChallengeGuidance,
  getSoftChallenge,
  isGoodTimeToChallenge,
  type Challenge,
  type ChallengeContext,
  type ChallengeType,
} from './gentle-challenges.js';

// Meta-Moments - "This is nice"
export {
  clearMetaMomentStates,
  findMetaMoment,
  formatMetaMomentGuidance,
  getQuickObservation,
  type MetaMoment,
  type MetaMomentType,
} from './meta-moments.js';

// ===========================================================================
// CONSOLIDATED SESSION CLEANUP (Memory Leak Prevention)
// ===========================================================================

import { clearBetterThanHuman } from './orchestrator.js';
import { clearAnticipatoryPresence } from './anticipatory-presence.js';
import { clearEmotionalMemory } from './emotional-memory.js';
import { clearEvolvingJokes } from './evolving-jokes.js';
import { clearLinguisticMirroring } from './linguistic-mirroring.js';
import { clearMetaRelationship, clearSomaticPresence } from './meta-relationship.js';
import { clearDelightEngines } from './spontaneous-delight.js';
import { clearSuperhumanObservations } from './superhuman-observations.js';
import { clearTeamCoherence } from './team-coherence.js';
import { clearTemporalEmotional } from './temporal-emotional.js';
import { clearVulnerabilityStates, resetSessionVulnerability } from './vulnerability-matching.js';
import { clearReflectionStates } from './empathetic-reflections.js';
import { clearSharedLanguage } from './shared-language.js';
import { clearRitualStates } from './conversational-rituals.js';
import { clearMetaMomentStates } from './meta-moments.js';

/**
 * Clear all superhuman engine state for a specific user session.
 * Call this when a session ends to prevent memory leaks.
 *
 * Note: Some engines (vulnerability, reflection, shared language, rituals,
 * meta-moments) use userId-keyed Maps internally but expose global clear
 * functions. Those are handled separately in clearAllSuperhumanSessionState().
 *
 * @param userId - The user's ID
 * @param sessionId - The session ID (some engines key by userId:sessionId)
 */
export function clearAllSuperhumanEngines(userId: string, sessionId?: string): void {
  // User+session scoped engines (keyed by userId:sessionId)
  if (sessionId) {
    clearBetterThanHuman(userId, sessionId);
  }

  // User-scoped engines (keyed by userId only)
  clearAnticipatoryPresence(userId);
  clearEmotionalMemory(userId);
  clearEvolvingJokes(userId);
  clearLinguisticMirroring(userId);
  clearMetaRelationship(userId);
  clearSomaticPresence(userId);
  clearDelightEngines(userId);
  clearSuperhumanObservations(userId);
  clearTeamCoherence(userId);
  clearTemporalEmotional(userId);
  resetSessionVulnerability(userId);
}

/**
 * Clear ALL superhuman session state (for shutdown only).
 * WARNING: This clears state for ALL users!
 */
export function clearAllSuperhumanSessionState(): void {
  // Clear all global session states
  clearVulnerabilityStates();
  clearReflectionStates();
  clearSharedLanguage();
  clearRitualStates();
  clearMetaMomentStates();
}
