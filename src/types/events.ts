/**
 * Domain Event Types
 *
 * Event-driven architecture types for tracking important system events.
 * These events can be used for:
 * - Analytics and metrics
 * - Event sourcing
 * - Pub/sub messaging
 * - Audit logging
 * - Real-time notifications
 *
 * Philosophy: Events are immutable facts about what happened in the system.
 *
 * @module types/events
 */

import {
  createEventId,
  type EventId,
  type PersonaId,
  type SessionId,
  type ToolId,
  type UserId,
} from './branded.js';
import type { RelationshipStage } from './relationship-stages.js';

// ============================================================================
// BASE EVENT TYPES
// ============================================================================

/**
 * Base event interface - all events extend this
 */
export interface BaseEvent {
  /** Unique event identifier */
  id: EventId;
  /** Event type discriminator */
  type: string;
  /** When the event occurred */
  timestamp: Date;
  /** Source system/service that generated the event */
  source: string;
  /** Optional correlation ID for tracing */
  correlationId?: string;
  /** Schema version for evolution */
  version: number;
}

/**
 * User-scoped event - events that relate to a specific user
 */
export interface UserEvent extends BaseEvent {
  userId: UserId;
}

/**
 * Session-scoped event - events that relate to a specific session
 */
export interface SessionEvent extends UserEvent {
  sessionId: SessionId;
}

// ============================================================================
// CONVERSATION EVENTS
// ============================================================================

/**
 * Conversation started event
 */
export interface ConversationStartedEvent extends SessionEvent {
  type: 'conversation.started';
  data: {
    personaId: PersonaId;
    roomId?: string;
    deviceType?: 'web' | 'mobile' | 'voice';
    referrer?: string;
  };
}

/**
 * Conversation ended event
 */
export interface ConversationEndedEvent extends SessionEvent {
  type: 'conversation.ended';
  data: {
    durationSeconds: number;
    turnCount: number;
    endReason: 'user_ended' | 'timeout' | 'error' | 'session_limit' | 'handoff';
    personaId: PersonaId;
    topicsSummary?: string[];
  };
}

/**
 * Turn completed event (user or AI turn)
 */
export interface TurnCompletedEvent extends SessionEvent {
  type: 'conversation.turn_completed';
  data: {
    turnNumber: number;
    speaker: 'user' | 'assistant';
    durationMs: number;
    wordCount: number;
    personaId: PersonaId;
    /** Detected emotion if any */
    emotion?: string;
    /** Tool calls made (if assistant turn) */
    toolCalls?: Array<{ toolId: ToolId; success: boolean }>;
  };
}

/**
 * Persona handoff event
 */
export interface PersonaHandoffEvent extends SessionEvent {
  type: 'conversation.handoff';
  data: {
    fromPersonaId: PersonaId;
    toPersonaId: PersonaId;
    reason: string;
    userInitiated: boolean;
  };
}

// ============================================================================
// RELATIONSHIP EVENTS
// ============================================================================

/**
 * Relationship stage changed event
 */
export interface RelationshipStageChangedEvent extends UserEvent {
  type: 'relationship.stage_changed';
  data: {
    previousStage: RelationshipStage;
    newStage: RelationshipStage;
    personaId?: PersonaId;
    metrics: {
      conversationCount: number;
      totalMinutesTalked: number;
      keyMomentsCount: number;
    };
  };
}

/**
 * Key moment recorded event
 */
export interface KeyMomentRecordedEvent extends SessionEvent {
  type: 'relationship.key_moment';
  data: {
    momentId: string;
    momentType:
      | 'shared_vulnerability'
      | 'breakthrough'
      | 'milestone'
      | 'concern'
      | 'celebration'
      | 'decision';
    summary: string;
    emotionalWeight: 'light' | 'medium' | 'heavy';
    topics: string[];
    personaId: PersonaId;
  };
}

/**
 * Story shared event (AI shared a story with user)
 */
export interface StorySharedEvent extends SessionEvent {
  type: 'relationship.story_shared';
  data: {
    storyId: string;
    theme: string;
    personaId: PersonaId;
    userReaction?: 'positive' | 'neutral' | 'moved' | 'curious';
  };
}

// ============================================================================
// TOOL EVENTS
// ============================================================================

/**
 * Tool invoked event
 */
export interface ToolInvokedEvent extends SessionEvent {
  type: 'tool.invoked';
  data: {
    toolId: ToolId;
    domain: string;
    personaId: PersonaId;
    parameters: Record<string, unknown>;
    durationMs: number;
    success: boolean;
    errorCode?: string;
  };
}

/**
 * Tool feedback event (user reaction to tool result)
 */
export interface ToolFeedbackEvent extends SessionEvent {
  type: 'tool.feedback';
  data: {
    toolId: ToolId;
    feedbackType:
      | 'explicit_positive'
      | 'explicit_negative'
      | 'implicit_success'
      | 'implicit_failure';
    sentiment: 'positive' | 'negative' | 'neutral';
    userMessage?: string;
  };
}

// ============================================================================
// SUBSCRIPTION EVENTS
// ============================================================================

/**
 * Subscription created/changed event
 */
export interface SubscriptionChangedEvent extends UserEvent {
  type: 'subscription.changed';
  data: {
    previousTier?: 'free' | 'friend' | 'partner';
    newTier: 'free' | 'friend' | 'partner';
    billingFrequency: 'monthly' | 'annual';
    changeType: 'upgrade' | 'downgrade' | 'cancel' | 'reactivate' | 'new';
    stripeSubscriptionId?: string;
  };
}

/**
 * Session limit reached event
 */
export interface SessionLimitReachedEvent extends SessionEvent {
  type: 'subscription.session_limit_reached';
  data: {
    tier: 'free' | 'friend' | 'partner';
    sessionLimitMinutes: number;
    actualMinutes: number;
    conversationCompleted: boolean;
  };
}

// ============================================================================
// GOAL EVENTS
// ============================================================================

/**
 * Goal created event
 */
export interface GoalCreatedEvent extends UserEvent {
  type: 'goal.created';
  data: {
    goalId: string;
    goalType: 'retirement' | 'education' | 'home' | 'emergency' | 'travel' | 'other';
    name: string;
    targetAmount?: number;
    targetDate?: Date;
  };
}

/**
 * Goal progress updated event
 */
export interface GoalProgressUpdatedEvent extends UserEvent {
  type: 'goal.progress_updated';
  data: {
    goalId: string;
    previousProgress: number;
    newProgress: number;
    progressPercent: number;
  };
}

/**
 * Goal achieved event
 */
export interface GoalAchievedEvent extends UserEvent {
  type: 'goal.achieved';
  data: {
    goalId: string;
    goalType: string;
    name: string;
    daysToAchieve: number;
    celebrationDelivered: boolean;
  };
}

// ============================================================================
// MILESTONE EVENTS
// ============================================================================

/**
 * Milestone achieved event (conversations, streaks, anniversaries)
 */
export interface MilestoneAchievedEvent extends UserEvent {
  type: 'milestone.achieved';
  data: {
    milestoneType:
      | 'conversation_count'
      | 'streak'
      | 'anniversary'
      | 'time_together'
      | 'feature_unlock';
    value: number;
    description: string;
    acknowledged: boolean;
    personaId?: PersonaId;
  };
}

// ============================================================================
// MEMORY EVENTS
// ============================================================================

/**
 * Memory created event (something worth remembering)
 */
export interface MemoryCreatedEvent extends SessionEvent {
  type: 'memory.created';
  data: {
    memoryId: string;
    memoryType:
      | 'event'
      | 'goal'
      | 'person'
      | 'pattern'
      | 'struggle'
      | 'milestone'
      | 'preference'
      | 'achievement';
    content: string;
    topics: string[];
    emotionalWeight: 'light' | 'medium' | 'heavy';
    personaId: PersonaId;
  };
}

/**
 * Memory referenced event (AI brought up a past memory)
 */
export interface MemoryReferencedEvent extends SessionEvent {
  type: 'memory.referenced';
  data: {
    memoryId: string;
    context: string;
    userReaction?: 'positive' | 'neutral' | 'surprised' | 'moved';
    personaId: PersonaId;
  };
}

// ============================================================================
// ERROR EVENTS
// ============================================================================

/**
 * Error occurred event
 */
export interface ErrorOccurredEvent extends BaseEvent {
  type: 'system.error';
  data: {
    errorCode: string;
    errorMessage: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    service: string;
    userId?: UserId;
    sessionId?: SessionId;
    stack?: string;
    context?: Record<string, unknown>;
  };
}

// ============================================================================
// HABIT EVENTS
// ============================================================================

/**
 * Habit created event
 */
export interface HabitCreatedEvent extends UserEvent {
  type: 'habit.created';
  data: {
    habitId: string;
    habitName: string;
    category: 'health' | 'productivity' | 'mindfulness' | 'social' | 'learning' | 'other';
    frequency: 'daily' | 'weekly' | 'custom';
    targetDays?: number[];
    reminderTime?: string;
    personaId?: PersonaId;
  };
}

/**
 * Habit logged event (user completed a habit)
 */
export interface HabitLoggedEvent extends UserEvent {
  type: 'habit.logged';
  data: {
    habitId: string;
    habitName: string;
    completedAt: Date;
    note?: string;
    mood?: 'great' | 'good' | 'neutral' | 'low';
    currentStreak: number;
    totalCompletions: number;
  };
}

/**
 * Habit streak achieved event
 */
export interface HabitStreakEvent extends UserEvent {
  type: 'habit.streak_achieved';
  data: {
    habitId: string;
    habitName: string;
    streakLength: number;
    streakType: 'first_week' | 'two_weeks' | 'month' | 'quarter' | 'year' | 'custom';
    celebrationDelivered: boolean;
  };
}

/**
 * Habit broken event (streak broken)
 */
export interface HabitBrokenEvent extends UserEvent {
  type: 'habit.streak_broken';
  data: {
    habitId: string;
    habitName: string;
    previousStreak: number;
    daysMissed: number;
    supportOffered: boolean;
  };
}

// ============================================================================
// WELLNESS EVENTS
// ============================================================================

/**
 * Mood check-in event
 */
export interface MoodCheckInEvent extends UserEvent {
  type: 'wellness.mood_checkin';
  data: {
    mood: 'great' | 'good' | 'okay' | 'low' | 'struggling';
    energyLevel: 'high' | 'medium' | 'low';
    stressLevel: 'low' | 'moderate' | 'high' | 'overwhelming';
    triggers?: string[];
    note?: string;
    personaId?: PersonaId;
  };
}

/**
 * Sleep logged event
 */
export interface SleepLoggedEvent extends UserEvent {
  type: 'wellness.sleep_logged';
  data: {
    hoursSlept: number;
    quality: 'excellent' | 'good' | 'fair' | 'poor';
    wakeTime?: string;
    bedTime?: string;
    factors?: string[];
  };
}

/**
 * Exercise logged event
 */
export interface ExerciseLoggedEvent extends UserEvent {
  type: 'wellness.exercise_logged';
  data: {
    activityType: string;
    durationMinutes: number;
    intensity: 'light' | 'moderate' | 'vigorous';
    caloriesBurned?: number;
    note?: string;
  };
}

/**
 * Meditation/mindfulness event
 */
export interface MindfulnessEvent extends UserEvent {
  type: 'wellness.mindfulness';
  data: {
    practiceType: 'meditation' | 'breathing' | 'gratitude' | 'journaling' | 'other';
    durationMinutes: number;
    guidedBy?: PersonaId;
    completedFully: boolean;
    moodBefore?: string;
    moodAfter?: string;
  };
}

/**
 * Wellness insight generated event
 */
export interface WellnessInsightEvent extends UserEvent {
  type: 'wellness.insight_generated';
  data: {
    insightType: 'pattern' | 'recommendation' | 'warning' | 'celebration';
    title: string;
    message: string;
    basedOn: string[];
    confidence: number;
    actionable: boolean;
  };
}

// ============================================================================
// PRODUCTIVITY EVENTS
// ============================================================================

/**
 * Task created event
 */
export interface TaskCreatedEvent extends UserEvent {
  type: 'productivity.task_created';
  data: {
    taskId: string;
    title: string;
    priority: 'high' | 'medium' | 'low';
    dueDate?: Date;
    category?: string;
    estimatedMinutes?: number;
    personaId?: PersonaId;
  };
}

/**
 * Task completed event
 */
export interface TaskCompletedEvent extends UserEvent {
  type: 'productivity.task_completed';
  data: {
    taskId: string;
    title: string;
    completedAt: Date;
    daysUntilDue?: number;
    actualMinutes?: number;
    wasOverdue: boolean;
    celebrationDelivered: boolean;
  };
}

/**
 * Focus session started event
 */
export interface FocusSessionStartedEvent extends SessionEvent {
  type: 'productivity.focus_started';
  data: {
    focusType: 'pomodoro' | 'deep_work' | 'creative' | 'planning';
    plannedMinutes: number;
    taskId?: string;
    distractionsBlocked: boolean;
  };
}

/**
 * Focus session ended event
 */
export interface FocusSessionEndedEvent extends SessionEvent {
  type: 'productivity.focus_ended';
  data: {
    focusType: 'pomodoro' | 'deep_work' | 'creative' | 'planning';
    actualMinutes: number;
    completedSuccessfully: boolean;
    distractionCount: number;
    taskProgress?: number;
  };
}

/**
 * Routine completed event
 */
export interface RoutineCompletedEvent extends UserEvent {
  type: 'productivity.routine_completed';
  data: {
    routineId: string;
    routineName: string;
    routineType: 'morning' | 'evening' | 'work' | 'weekend' | 'custom';
    stepsCompleted: number;
    totalSteps: number;
    durationMinutes: number;
    currentStreak: number;
  };
}

/**
 * Productivity insight event
 */
export interface ProductivityInsightEvent extends UserEvent {
  type: 'productivity.insight';
  data: {
    insightType: 'peak_hours' | 'completion_rate' | 'focus_quality' | 'suggestion';
    title: string;
    message: string;
    metric?: number;
    comparison?: 'improving' | 'stable' | 'declining';
    actionable: boolean;
  };
}

// ============================================================================
// LEARNING EVENTS
// ============================================================================

/**
 * Learning session event
 */
export interface LearningSessionEvent extends UserEvent {
  type: 'learning.session';
  data: {
    topic: string;
    source: 'conversation' | 'resource' | 'practice' | 'reflection';
    durationMinutes: number;
    keyTakeaways?: string[];
    personaId?: PersonaId;
    retentionScore?: number;
  };
}

/**
 * Skill progress event
 */
export interface SkillProgressEvent extends UserEvent {
  type: 'learning.skill_progress';
  data: {
    skillName: string;
    previousLevel: number;
    newLevel: number;
    evidenceOf: string;
    celebrationDelivered: boolean;
  };
}

// ============================================================================
// UNION TYPES
// ============================================================================

/**
 * All conversation events
 */
export type ConversationEvent =
  | ConversationStartedEvent
  | ConversationEndedEvent
  | TurnCompletedEvent
  | PersonaHandoffEvent;

/**
 * All relationship events
 */
export type RelationshipEvent =
  | RelationshipStageChangedEvent
  | KeyMomentRecordedEvent
  | StorySharedEvent;

/**
 * All tool events
 */
export type ToolEvent = ToolInvokedEvent | ToolFeedbackEvent;

/**
 * All subscription events
 */
export type SubscriptionEvent = SubscriptionChangedEvent | SessionLimitReachedEvent;

/**
 * All goal events
 */
export type GoalEvent = GoalCreatedEvent | GoalProgressUpdatedEvent | GoalAchievedEvent;

/**
 * All memory events
 */
export type MemoryEvent = MemoryCreatedEvent | MemoryReferencedEvent;

/**
 * All habit events
 */
export type HabitEvent = HabitCreatedEvent | HabitLoggedEvent | HabitStreakEvent | HabitBrokenEvent;

/**
 * All wellness events
 */
export type WellnessEvent =
  | MoodCheckInEvent
  | SleepLoggedEvent
  | ExerciseLoggedEvent
  | MindfulnessEvent
  | WellnessInsightEvent;

/**
 * All productivity events
 */
export type ProductivityEvent =
  | TaskCreatedEvent
  | TaskCompletedEvent
  | FocusSessionStartedEvent
  | FocusSessionEndedEvent
  | RoutineCompletedEvent
  | ProductivityInsightEvent;

/**
 * All learning events
 */
export type LearningEvent = LearningSessionEvent | SkillProgressEvent;

/**
 * All domain events (union of all event types)
 */
export type DomainEvent =
  | ConversationEvent
  | RelationshipEvent
  | ToolEvent
  | SubscriptionEvent
  | GoalEvent
  | MilestoneAchievedEvent
  | MemoryEvent
  | HabitEvent
  | WellnessEvent
  | ProductivityEvent
  | LearningEvent
  | ErrorOccurredEvent;

// ============================================================================
// EVENT FACTORY HELPERS
// ============================================================================

/**
 * Create a base event with common fields
 */
export function createBaseEvent<T extends string>(
  type: T,
  source: string
): Pick<BaseEvent, 'id' | 'type' | 'timestamp' | 'source' | 'version'> {
  return {
    id: createEventId(),
    type,
    timestamp: new Date(),
    source,
    version: 1,
  };
}

/**
 * Create a user event
 */
export function createUserEvent<T extends string>(
  type: T,
  userId: UserId,
  source: string
): Pick<UserEvent, 'id' | 'type' | 'timestamp' | 'source' | 'version' | 'userId'> {
  return {
    ...createBaseEvent(type, source),
    userId,
  };
}

/**
 * Create a session event
 */
export function createSessionEvent<T extends string>(
  type: T,
  userId: UserId,
  sessionId: SessionId,
  source: string
): Pick<SessionEvent, 'id' | 'type' | 'timestamp' | 'source' | 'version' | 'userId' | 'sessionId'> {
  return {
    ...createUserEvent(type, userId, source),
    sessionId,
  };
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Check if an event is a conversation event
 */
export function isConversationEvent(event: DomainEvent): event is ConversationEvent {
  return event.type.startsWith('conversation.');
}

/**
 * Check if an event is a relationship event
 */
export function isRelationshipEvent(event: DomainEvent): event is RelationshipEvent {
  return event.type.startsWith('relationship.');
}

/**
 * Check if an event is a tool event
 */
export function isToolEvent(event: DomainEvent): event is ToolEvent {
  return event.type.startsWith('tool.');
}

/**
 * Check if an event is a subscription event
 */
export function isSubscriptionEvent(event: DomainEvent): event is SubscriptionEvent {
  return event.type.startsWith('subscription.');
}

/**
 * Check if an event is a goal event
 */
export function isGoalEvent(event: DomainEvent): event is GoalEvent {
  return event.type.startsWith('goal.');
}

/**
 * Check if an event is a memory event
 */
export function isMemoryEvent(event: DomainEvent): event is MemoryEvent {
  return event.type.startsWith('memory.');
}

/**
 * Check if an event is a habit event
 */
export function isHabitEvent(event: DomainEvent): event is HabitEvent {
  return event.type.startsWith('habit.');
}

/**
 * Check if an event is a wellness event
 */
export function isWellnessEvent(event: DomainEvent): event is WellnessEvent {
  return event.type.startsWith('wellness.');
}

/**
 * Check if an event is a productivity event
 */
export function isProductivityEvent(event: DomainEvent): event is ProductivityEvent {
  return event.type.startsWith('productivity.');
}

/**
 * Check if an event is a learning event
 */
export function isLearningEvent(event: DomainEvent): event is LearningEvent {
  return event.type.startsWith('learning.');
}

/**
 * Check if an event is user-scoped
 */
export function isUserEvent(event: BaseEvent): event is UserEvent {
  return 'userId' in event;
}

/**
 * Check if an event is session-scoped
 */
export function isSessionEvent(event: BaseEvent): event is SessionEvent {
  return 'sessionId' in event && 'userId' in event;
}
