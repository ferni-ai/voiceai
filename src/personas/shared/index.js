/**
 * Shared Persona Utilities
 *
 * Cross-persona behaviors, team dynamics, relationship building,
 * and utilities that make the personas work together as a cohesive
 * team and build deeper connections with users.
 */
// Content injector - unified access to all shared content
export { acknowledgeUser, createHandoffContext, formatForPrompt, getPersonalizedNameUsage, getTeammateOpinion, getTimeGreeting, injectSharedContent, shouldTellStory, suggestTeammate, } from './content-injector.js';
// Team dynamics - how personas reference and interact with each other
export { HANDOFF_WARMTH, TEAM_MENTIONS, TEAM_OPINIONS, generateHandoffSummary, getCasualMention, getHandoffWarmth, getOpinionAbout, getTeamSuggestion, } from './team-dynamics.js';
// Relationship building - deepening connections with users
export { ACKNOWLEDGMENTS, CALLBACK_TEMPLATES, DEEPENING_QUESTIONS, STAGE_BEHAVIORS, generateCallback, getAcknowledgment, getDeepeningQuestion, getNameUsage, getStageClosing, getStageGreeting, getStagePersonalQuestion, shouldSharePersonalStory, } from './relationship-building.js';
// Welcome back - time-based greetings for returning users
export { RETURNING_USER_RECOGNITION, WELCOME_BACK_BY_TIME, WELCOME_BACK_WITH_CONTEXT, generateWelcomeBack, getMilestoneMessage, getTimeBasedGreeting, isMilestoneConversation, } from './welcome-back.js';
// Life events - tracking birthdays, anniversaries, milestones
export { EVENT_ACKNOWLEDGMENTS, UPCOMING_EVENT_MENTIONS, createLifeEvent, findEventsToAcknowledge, generateEventAcknowledgment, getDaysUntilEvent, getEventTimeBucket, getUpcomingEventMention, isEventSoon, isEventToday, } from './life-events.js';
// Team chemistry - deep team dynamics, inside jokes, handoff context
export { buildHandoffContext as buildTeamHandoffContext, checkTeamInsideJoke, generateHandoffNote, getAllTeamReferences, getTeamChemistryConfig, getTeamCompliment, getTeamDynamics, getTeamReference, shouldIncludeTeamReference, } from './team-chemistry.js';
// Persona LLM Expressions - dynamic expression generation for all personas
export { generatePersonaExpressions, getPersonaExpression, prewarmPersonaExpressions, clearPersonaCache, hasPersonaExpressionSupport, PERSONA_CONFIGS, MAYA_CONFIG, JORDAN_CONFIG, PETER_CONFIG, ALEX_CONFIG, NAYAN_CONFIG, } from './persona-llm-expressions.js';
// Persona Turn Personality - turn-level personality injection for all personas
export { sharedPersonality, processPersonaTurn, applyPersonaPersonalityToResponse, hasPersonaTurnSupport, } from './persona-turn-personality.js';
// LLM Advanced Humanization - dynamic subtext, aftercare, energy, affirmations
export { llmHumanization, generateHumanizationLLM, clearHumanizationCache, } from './llm-advanced-humanization.js';
// Cross-Persona Learning - share successful expressions across the team
export { crossPersonaLearning, extractPattern, adaptPatternToPersona, learnFromExpression, recordPatternEngagement, getBestPatternsForPersona, getPatternsFromPersona, getPatternStats, prunePatterns, } from './cross-persona-learning.js';
//# sourceMappingURL=index.js.map