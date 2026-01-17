/**
 * Collective Learning Module
 *
 * Learn from all users to become a better coach for everyone.
 *
 * @module intelligence/collective
 */

// Community Insights
export {
  CommunityInsightsEngine,
  getCommunityInsights,
  resetCommunityInsights,
  loadCommunityInsightsFromFirestore,
  saveCommunityInsightsToFirestore,
  initializeCommunityInsights,
  type CommunityJourneyPattern,
  type CommunityResponsePattern,
  type EffectiveQuestion,
  type JourneyTransition,
  type PhraseEffectiveness,
  type ResponseStrategySignal,
  type StoryResonance,
} from './community-insights.js';

// Agent Evolution
export {
  AgentEvolutionEngine,
  getAgentEvolution,
  resetAgentEvolution,
  loadAgentEvolutionFromFirestore,
  saveAgentEvolutionToFirestore,
  initializeAgentEvolution,
  type EmergentPattern,
  type PersonaAdjustment,
  type PersonaEvolutionState,
  type PersonaExperiment,
  type StoryRanking,
} from './agent-evolution.js';

// Integration
export {
  initializeCollectiveLearning,
  shutdownCollectiveLearning,
  recordResponseForLearning,
  recordStoryForLearning,
  recordBreakthroughForLearning,
  flushLearningSignals,
  getCollectiveRecommendations,
  analyzeResponseLength,
  analyzeResponseType,
  analyzeUserEngagement,
  type BreakthroughSignal,
  type ConversationSignalContext,
  type ResponseSignalData,
  type StoryUsageSignal,
  type UserReactionSignal,
} from './integration.js';

// Scheduler
export {
  startCollectiveLearningScheduler,
  stopCollectiveLearningScheduler,
  forceRunAllJobs,
  getSchedulerStatus,
} from './scheduler.js';
