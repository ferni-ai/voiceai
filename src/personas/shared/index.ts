/**
 * Shared Persona Utilities
 *
 * Cross-persona behaviors, team dynamics, relationship building,
 * and utilities that make the personas work together as a cohesive
 * team and build deeper connections with users.
 */

// Content injector - unified access to all shared content
export {
  injectSharedContent,
  getTeammateOpinion,
  suggestTeammate,
  createHandoffContext,
  acknowledgeUser,
  getPersonalizedNameUsage,
  shouldTellStory,
  getTimeGreeting,
  formatForPrompt,
  type SharedContentContext,
  type InjectedContent,
} from './content-injector.js';

// Team dynamics - how personas reference and interact with each other
export {
  TEAM_OPINIONS,
  HANDOFF_WARMTH,
  TEAM_MENTIONS,
  type HandoffContext,
  generateHandoffSummary,
  getOpinionAbout,
  getHandoffWarmth,
  getTeamSuggestion,
  getCasualMention,
} from './team-dynamics.js';

// Relationship building - deepening connections with users
export {
  STAGE_BEHAVIORS,
  CALLBACK_TEMPLATES,
  DEEPENING_QUESTIONS,
  ACKNOWLEDGMENTS,
  generateCallback,
  getDeepeningQuestion,
  getAcknowledgment,
  getNameUsage,
  getStageGreeting,
  getStageClosing,
  getStagePersonalQuestion,
  shouldSharePersonalStory,
} from './relationship-building.js';

// Welcome back - time-based greetings for returning users
export {
  WELCOME_BACK_BY_TIME,
  WELCOME_BACK_WITH_CONTEXT,
  RETURNING_USER_RECOGNITION,
  generateWelcomeBack,
  getTimeBasedGreeting,
  isMilestoneConversation,
  getMilestoneMessage,
} from './welcome-back.js';

// Life events - tracking birthdays, anniversaries, milestones
export {
  type LifeEvent,
  type LifeEventType,
  EVENT_ACKNOWLEDGMENTS,
  UPCOMING_EVENT_MENTIONS,
  getDaysUntilEvent,
  isEventSoon,
  isEventToday,
  getEventTimeBucket,
  generateEventAcknowledgment,
  getUpcomingEventMention,
  findEventsToAcknowledge,
  createLifeEvent,
} from './life-events.js';
