/**
 * Shared Persona Utilities
 *
 * Cross-persona behaviors, team dynamics, relationship building,
 * and utilities that make the personas work together as a cohesive
 * team and build deeper connections with users.
 */

// Content injector - unified access to all shared content
export {
  acknowledgeUser,
  createHandoffContext,
  formatForPrompt,
  getPersonalizedNameUsage,
  getTeammateOpinion,
  getTimeGreeting,
  injectSharedContent,
  shouldTellStory,
  suggestTeammate,
  type InjectedContent,
  type SharedContentContext,
} from './content-injector.js';

// Team dynamics - how personas reference and interact with each other
export {
  HANDOFF_WARMTH,
  TEAM_MENTIONS,
  TEAM_OPINIONS,
  generateHandoffSummary,
  getCasualMention,
  getHandoffWarmth,
  getOpinionAbout,
  getTeamSuggestion,
  type HandoffContext,
} from './team-dynamics.js';

// Relationship building - deepening connections with users
export {
  ACKNOWLEDGMENTS,
  CALLBACK_TEMPLATES,
  DEEPENING_QUESTIONS,
  STAGE_BEHAVIORS,
  generateCallback,
  getAcknowledgment,
  getDeepeningQuestion,
  getNameUsage,
  getStageClosing,
  getStageGreeting,
  getStagePersonalQuestion,
  shouldSharePersonalStory,
} from './relationship-building.js';

// Welcome back - time-based greetings for returning users
export {
  RETURNING_USER_RECOGNITION,
  WELCOME_BACK_BY_TIME,
  WELCOME_BACK_WITH_CONTEXT,
  generateWelcomeBack,
  getMilestoneMessage,
  getTimeBasedGreeting,
  isMilestoneConversation,
} from './welcome-back.js';

// Life events - tracking birthdays, anniversaries, milestones
export {
  EVENT_ACKNOWLEDGMENTS,
  UPCOMING_EVENT_MENTIONS,
  createLifeEvent,
  findEventsToAcknowledge,
  generateEventAcknowledgment,
  getDaysUntilEvent,
  getEventTimeBucket,
  getUpcomingEventMention,
  isEventSoon,
  isEventToday,
  type LifeEvent,
  type LifeEventType,
} from './life-events.js';

// Team chemistry - deep team dynamics, inside jokes, handoff context
export {
  buildHandoffContext as buildTeamHandoffContext,
  checkTeamInsideJoke,
  generateHandoffNote,
  getAllTeamReferences,
  getTeamChemistryConfig,
  getTeamCompliment,
  getTeamDynamics,
  getTeamReference,
  shouldIncludeTeamReference,
  type TeamChemistryConfig,
  type HandoffContext as TeamHandoffContext,
  type TeamInsideJoke,
  type TeamPairDynamic,
  type TeamReference,
  type TeamStory,
} from './team-chemistry.js';

// Persona LLM Expressions - dynamic expression generation for all personas
export {
  generatePersonaExpressions,
  getPersonaExpression,
  prewarmPersonaExpressions,
  clearPersonaCache,
  hasPersonaExpressionSupport,
  PERSONA_CONFIGS,
  MAYA_CONFIG,
  JORDAN_CONFIG,
  PETER_CONFIG,
  ALEX_CONFIG,
  NAYAN_CONFIG,
  type PersonaExpressionConfig,
  type PersonaTheme,
  type ExpressionContext as PersonaExpressionContext,
  type GeneratedExpression as PersonaGeneratedExpression,
} from './persona-llm-expressions.js';

// Persona Turn Personality - turn-level personality injection for all personas
export {
  sharedPersonality,
  processPersonaTurn,
  applyPersonaPersonalityToResponse,
  hasPersonaTurnSupport,
  type PersonaTurnInput,
  type PersonaTurnResult,
} from './persona-turn-personality.js';

// LLM Advanced Humanization - dynamic subtext, aftercare, energy, affirmations
export {
  llmHumanization,
  generateHumanizationLLM,
  clearHumanizationCache,
  type HumanizationType,
  type HumanizationContext,
  type GeneratedHumanization,
} from './llm-advanced-humanization.js';

// Cross-Persona Learning - share successful expressions across the team
export {
  crossPersonaLearning,
  extractPattern,
  adaptPatternToPersona,
  learnFromExpression,
  recordPatternEngagement,
  getBestPatternsForPersona,
  getPatternsFromPersona,
  getPatternStats,
  prunePatterns,
  type LearnedPattern,
  type PersonaVoice,
} from './cross-persona-learning.js';
