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
