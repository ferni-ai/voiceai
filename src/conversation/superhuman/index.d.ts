/**
 * Superhuman Conversational Features
 *
 * Everything that makes Ferni feel like a real friend, not just an AI.
 *
 * @module conversation/superhuman
 */
export { captureQuote, extractQuote, findRelevantQuote, formatQuoteForPrompt, markQuoteSurfaced, saveQuote, type QuoteSuggestion, type QuoteSurfaceContext, type UserQuote, } from './quote-memory.js';
export { acknowledgeMilestone, checkMilestones, formatMilestoneForPrompt, getStats, recordBreakthrough, recordConversation, recordGoalAchieved, recordLaugh, type RelationshipMilestone, type UserRelationshipStats, } from './relationship-milestones.js';
export { detectMicroWin, formatMicroWinForPrompt, type MicroWin } from './micro-celebrations.js';
export { addNaturalSpeech, formatNaturalSpeechGuidance, generateSelfCorrection, generateThinkingMoment, getSpeechModification, type NaturalSpeechConfig, type SpeechModification, } from './natural-speech.js';
export { captureJoke, findRelevantJoke, formatJokeForPrompt, markJokeReferenced, type InsideJoke, type JokeReference, } from './inside-jokes.js';
export { addNickname, extractNameFromMessage, formatNamingGuidance, getUserNaming, recordNameUsage, setUserName, shouldUseName, updateEndearmentLevel, type UserNaming, } from './nicknames.js';
export { addPersonDetail, extractPerson, findPeopleToAskAbout, formatFollowUpForPrompt, getOrCreatePerson, updateStoryline, type PersonFollowUp, type PersonInLife, type Storyline, } from './story-continuity.js';
export { BetterThanHumanOrchestrator, clearBetterThanHuman, getBetterThanHuman, } from './orchestrator.js';
export { clearAnticipatoryPresence, getAnticipatoryPresence } from './anticipatory-presence.js';
export { clearEmotionalMemory, getEmotionalMemory } from './emotional-memory.js';
export { clearEvolvingJokes, getEvolvingJokes } from './evolving-jokes.js';
export { clearLinguisticMirroring, getLinguisticMirroring } from './linguistic-mirroring.js';
export { clearMetaRelationship, clearSomaticPresence, getMetaRelationship, getSomaticPresence, } from './meta-relationship.js';
export { clearDelightEngines, getProtectiveInstincts, getSpontaneousDelight, getVisibleVulnerability, } from './spontaneous-delight.js';
export { clearSuperhumanObservations, getSuperhumanObservations, } from '../../services/superhuman/observations.js';
export { clearTeamCoherence, getTeamCoherence } from './team-coherence.js';
export { clearTemporalEmotional, getTemporalEmotional } from './temporal-emotional.js';
export type { BetterThanHumanContext, BetterThanHumanInsight } from './types.js';
export { analyzeVulnerabilityDepth, clearVulnerabilityStates, formatVulnerabilityGuidance, getVulnerabilityState, getVulnerabilityStates, recordShareAndMatch, resetSessionVulnerability, type VulnerabilityDepth, type VulnerabilityMatch, type VulnerabilityState, } from './vulnerability-matching.js';
export { clearReflectionStates, formatReflectionGuidance, generateReflection, generateReflectionAsync, type Reflection, type ReflectionContext, type ReflectionType, } from './empathetic-reflections.js';
export { analyzePresenceNeed, formatPresenceGuidance, getPresencePhrase, shouldAvoidAdvice, type PresenceDecision, type PresenceLevel, } from './presence-mode.js';
export { addSharedTerm, clearSharedLanguage, extractSharedLanguage, findRelevantTerm, formatSharedLanguageGuidance, getLanguageStates, getSharedTerms, type SharedLanguageState, type SharedTerm, type SharedTermType, type TermSuggestion, } from './shared-language.js';
export { clearRitualStates, createCustomRitual, formatRitualGuidance, getEstablishedRituals, recordRitualPerformed, suggestRitual, type Ritual, type RitualSuggestion, type RitualType, } from './conversational-rituals.js';
export { formatForecastGuidance, generateForecast, getForecastAcknowledgment, shouldMentionForecast, type EmotionalForecast, type ForecastContext, } from './emotional-forecasting.js';
export { detectChallengeOpportunity, formatChallengeGuidance, getSoftChallenge, isGoodTimeToChallenge, type Challenge, type ChallengeContext, type ChallengeType, } from './gentle-challenges.js';
export { clearMetaMomentStates, findMetaMoment, formatMetaMomentGuidance, getQuickObservation, type MetaMoment, type MetaMomentType, } from './meta-moments.js';
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
export declare function clearAllSuperhumanEngines(userId: string, sessionId?: string): void;
/**
 * Clear ALL superhuman session state (for shutdown only).
 * WARNING: This clears state for ALL users!
 */
export declare function clearAllSuperhumanSessionState(): void;
//# sourceMappingURL=index.d.ts.map