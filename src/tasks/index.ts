/**
 * Tasks Module
 *
 * Comprehensive task system for building intelligent, human voice AI interactions.
 *
 * Task Categories:
 * - Base Tasks: Core task infrastructure
 * - Intelligent Tasks: Emotion-aware, context-adaptive tasks
 * - Micro Tasks: Quick, natural conversational moments
 * - Life Event Tasks: Handling major life transitions
 * - Support Tasks: Emotional support, check-ins, crisis handling
 * - Relationship Tasks: Follow-ups, storytelling, deep dives, goodbyes
 * - Advice Tasks: Wisdom sharing, decisions, fear, goals
 * - Finance Tasks: Domain-specific financial coaching tasks
 * - Onboarding Tasks: Welcome, situation assessment, goal setting
 */

// ============================================================================
// BASE TASKS
// ============================================================================

export {
  AgentTask,
  // Prebuilt basic tasks
  CollectConsentTask,
  CollectEmailTask,
  CollectNameTask,
  TaskGroup,
  TaskRegressionError,
} from './agent-task.js';

export type { ConsentResult, EmailResult, NameResult, TaskGroupResult } from './agent-task.js';

// ============================================================================
// MICRO TASKS - Quick, natural moments
// ============================================================================

export {
  ActiveListeningTask,
  PauseTask,
  QuickAcknowledgeTask,
  QuickCelebrateTask,
  QuickCuriosityTask,
  QuickValidateTask,
} from './micro-tasks.js';

export type {
  AcknowledgeResult,
  CuriosityResult,
  ListeningResult,
  PauseResult,
  QuickCelebrateResult,
  ValidateResult,
} from './micro-tasks.js';

// ============================================================================
// LIFE EVENT TASKS - Major life transitions
// ============================================================================

export {
  GriefSupportTask,
  LifeChangeTask,
  MilestoneTask,
  PanicPreventionTask,
} from './life-events.js';

export type {
  GriefSupportResult,
  LifeChangeResult,
  LifeEventType,
  MilestoneResult,
  PanicPreventionResult,
} from './life-events.js';

// ============================================================================
// INTELLIGENT TASKS
// ============================================================================

export {
  createAdaptiveResponse,
  IntelligentTask,
  IntelligentTaskGroup,
} from './intelligent-task.js';

export type { AdaptiveInstructions, ExecutableTask, TaskContext } from './intelligent-task.js';

// ============================================================================
// SUPPORT TASKS
// ============================================================================

export {
  CheckInTask,
  ComfortTask,
  CrisisDetectionTask,
  EmotionalSupportTask,
} from './support-tasks.js';

export type { CheckInResult, ComfortResult, CrisisResult, SupportResult } from './support-tasks.js';

// ============================================================================
// RELATIONSHIP TASKS
// ============================================================================

export {
  CelebrationTask,
  DeepDiveTask,
  FollowUpTask,
  GoodbyeTask,
  StorytellingTask,
} from './relationship-tasks.js';

export type {
  CelebrationResult,
  DeepDiveResult,
  FollowUpResult,
  GoodbyeResult,
  StoryResult,
} from './relationship-tasks.js';

// ============================================================================
// ADVICE TASKS (General-purpose)
// ============================================================================

export {
  DecisionSupportTask,
  FearAddressingTask,
  GoalSettingTask,
  WisdomSharingTask,
} from './advice-tasks.js';

export type {
  DecisionResult,
  FearResult,
  GoalSettingResult,
  WisdomResult,
} from './advice-tasks.js';

// ============================================================================
// DOMAIN-SPECIFIC TASKS
// ============================================================================

// Finance Tasks (Nayan/Jack Bogle domain)
export {
  FinancialGoalTask,
  InvestmentWisdomTask,
  MarketFearTask,
  MarketPanicTask,
  // Legacy aliases
  RebalancingTask as RebalancingGuidanceTask,
  RebalancingTask,
} from './finance-tasks.js';

export type {
  FinancialGoalResult,
  InvestmentWisdomResult,
  MarketFearResult,
  MarketPanicResult,
  RebalancingResult,
} from './finance-tasks.js';

// Habits Tasks (Maya Santos domain)
export {
  HabitBuildingTask,
  HabitStruggleTask,
  HabitTrackingTask,
  RoutineDesignTask,
} from './habits-tasks.js';

export type {
  HabitBuildingResult,
  HabitStruggleResult,
  HabitTrackingResult,
  RoutineDesignResult,
} from './habits-tasks.js';

// Research Tasks (Peter John domain)
export {
  CuriosityExplorationTask,
  DeepResearchTask,
  ExpertiseDevelopmentTask,
  LearningProjectTask,
} from './research-tasks.js';

export type {
  CuriosityExplorationResult,
  DeepResearchResult,
  ExpertiseDevelopmentResult,
  LearningProjectResult,
} from './research-tasks.js';

// Communications Tasks (Alex Chen domain)
export {
  BoundarySettingTask,
  DifficultConversationTask,
  MessageCraftingTask,
  SchedulingTask,
} from './communications-tasks.js';

export type {
  BoundarySettingResult,
  DifficultConversationResult,
  MessageCraftingResult,
  SchedulingResult,
} from './communications-tasks.js';

// Events Tasks (Jordan Taylor domain)
export {
  EventPlanningTask,
  LifeMilestoneTask,
  SpecialDateTask,
  TravelPlanningTask,
} from './events-tasks.js';

export type {
  EventPlanningResult,
  LifeMilestoneResult,
  SpecialDateResult,
  TravelPlanningResult,
} from './events-tasks.js';

// ============================================================================
// ONBOARDING TASKS
// ============================================================================

export {
  createOnboardingFlow,
  FinancialSituationTask, // Legacy alias
  GoalsTask,
  runOnboarding,
  SituationAssessmentTask,
  WelcomeTask,
} from './onboarding.js';

export type {
  FinancialSituationResult, // Legacy alias
  GoalsResult as OnboardingGoalsResult,
  OnboardingResult,
  SituationResult,
  WelcomeResult,
} from './onboarding.js';

// ============================================================================
// TASK FLOW BUILDERS
// ============================================================================

import { FearAddressingTask, GoalSettingTask, WisdomSharingTask } from './advice-tasks.js';
import { IntelligentTaskGroup, type TaskContext } from './intelligent-task.js';
import { GoalsTask, SituationAssessmentTask, WelcomeTask } from './onboarding.js';
import { DeepDiveTask, FollowUpTask, GoodbyeTask } from './relationship-tasks.js';
import { CheckInTask, EmotionalSupportTask } from './support-tasks.js';
import { cleanForFirestore } from '../utils/firestore-utils.js';

/**
 * Create an intelligent onboarding flow that adapts to user emotions
 */
export function createIntelligentOnboardingFlow(context?: TaskContext): IntelligentTaskGroup {
  const group = new IntelligentTaskGroup();

  if (context) {
    group.setContext(context);
  }

  // Set up support task for distress interruption
  group.setSupportTask(() => new EmotionalSupportTask());

  // Add tasks with intelligent options
  // All task types implement ExecutableTask interface
  group.add(() => new WelcomeTask(), {
    id: 'welcome',
    description: 'Warm greeting and getting to know the user',
    priority: 1,
  });

  group.add(() => new CheckInTask({ reason: 'after greeting' }), {
    id: 'first_checkin',
    description: 'Check how they are doing',
    priority: 2,
    skipIfDistressed: false, // Always do this
  });

  group.add(() => new SituationAssessmentTask(), {
    id: 'situation',
    description: 'Understanding what brought them here',
    priority: 3,
    skipIfDistressed: true, // Skip if they need support
  });

  group.add(() => new GoalsTask(), {
    id: 'goals',
    description: 'Exploring their goals',
    priority: 4,
    skipIfDistressed: true,
  });

  return group;
}

/**
 * Create a returning user flow with follow-up
 */
export function createReturningUserFlow(
  context: TaskContext,
  previousSummary?: string,
  pendingFollowUps?: string[]
): IntelligentTaskGroup {
  const group = new IntelligentTaskGroup();
  group.setContext(context);
  group.setSupportTask(() => new EmotionalSupportTask());

  // Start with follow-up from last conversation
  group.add(
    () =>
      new FollowUpTask({
        lastSummary: previousSummary,
        pendingFollowUps,
      }),
    {
      id: 'follow_up',
      description: 'Follow up on previous conversation',
      priority: 1,
    }
  );

  group.add(() => new CheckInTask({ reason: 'regular' }), {
    id: 'checkin',
    description: 'Check how they are doing',
    priority: 2,
  });

  return group;
}

/**
 * Create a wisdom sharing session
 */
export function createWisdomSession(topic: string): IntelligentTaskGroup {
  const group = new IntelligentTaskGroup();
  group.setSupportTask(() => new EmotionalSupportTask());

  group.add(() => new WisdomSharingTask(topic), {
    id: 'wisdom',
    description: `Share wisdom about ${topic}`,
    priority: 1,
  });

  group.add(() => new CheckInTask({ reason: 'after teaching' }), {
    id: 'understanding_check',
    description: 'Check understanding and receptiveness',
    priority: 2,
  });

  return group;
}

/**
 * Create a fear/anxiety addressing flow
 */
export function createFearAddressingFlow(fear: string): IntelligentTaskGroup {
  const group = new IntelligentTaskGroup();
  group.setSupportTask(() => new EmotionalSupportTask());

  group.add(() => new FearAddressingTask(fear), {
    id: 'address_fear',
    description: `Address fear about ${fear}`,
    priority: 1,
    skipIfDistressed: false, // This IS for distressed users
  });

  group.add(() => new CheckInTask({ reason: 'after heavy topic' }), {
    id: 'post_fear_checkin',
    description: 'Check how they are after discussing fear',
    priority: 2,
  });

  return group;
}

/**
 * Create a goal setting session
 */
export function createGoalSettingSession(): IntelligentTaskGroup {
  const group = new IntelligentTaskGroup();
  group.setSupportTask(() => new EmotionalSupportTask());

  group.add(() => new GoalSettingTask(), {
    id: 'goal_setting',
    description: 'Help set goals',
    priority: 1,
  });

  group.add(() => new CheckInTask({ reason: 'after planning' }), {
    id: 'post_goals_checkin',
    description: 'Check how they feel about their goals',
    priority: 2,
  });

  return group;
}

/**
 * Create a deep dive exploration
 */
export function createDeepDiveSession(topic: string): IntelligentTaskGroup {
  const group = new IntelligentTaskGroup();
  group.setSupportTask(() => new EmotionalSupportTask());

  group.add(() => new DeepDiveTask(topic), {
    id: 'deep_dive',
    description: `Deep dive into ${topic}`,
    priority: 1,
  });

  group.add(() => new CheckInTask({ reason: 'after learning' }), {
    id: 'understanding_check',
    description: 'Check understanding',
    priority: 2,
  });

  return group;
}

/**
 * Create a conversation wrap-up flow
 */
export function createWrapUpFlow(): IntelligentTaskGroup {
  const group = new IntelligentTaskGroup();

  group.add(() => new CheckInTask({ reason: 'before goodbye' }), {
    id: 'final_checkin',
    description: 'Final check before ending',
    priority: 1,
  });

  group.add(() => new GoodbyeTask(), {
    id: 'goodbye',
    description: 'Warm goodbye',
    priority: 2,
  });

  return group;
}

// ============================================================================
// NATURAL TRANSITIONS
// ============================================================================

export {
  EMOTIONAL_TRANSITIONS,
  getContextualTransition,
  getTransition,
  TASK_TRANSITIONS,
  TOPIC_ENTRY_TRANSITIONS,
  TOPIC_EXIT_TRANSITIONS,
  wrapWithTransitions,
} from './transitions.js';

// ============================================================================
// TASK MANAGER - Non-blocking task orchestration
// ============================================================================

export {
  getTaskManager,
  resetTaskManager,
  TASK_WISDOM,
  TaskManager,
  type ActiveTask,
  type TaskWisdom,
} from './task-manager.js';

// ============================================================================
// TASK PERSISTENCE - Firestore-backed task history
// ============================================================================

export {
  createTaskRecordFromActiveTask,
  getRecentTasksByType,
  getTaskEffectivenessStats,
  getTaskHistory,
  getUnderperformingTasks,
  getUserTaskHistory,
  getUserTaskSummary,
  saveTaskRecord,
  taskPersistence,
  type TaskHistoryQuery,
  type TaskRecord,
  type UserTaskSummary,
} from './task-persistence.js';

// ============================================================================
// TASK METRICS - Analytics and monitoring
// ============================================================================

export {
  checkForAlerts,
  generateTaskReport,
  getActiveAlerts,
  getAllTaskTypeMetrics,
  getSystemHealthMetrics,
  getTaskTypeMetrics,
  taskMetricsService,
  type RealtimeMetrics,
  type SystemHealthMetrics,
  type TaskAlert,
  type TaskTypeMetrics,
} from './task-metrics.service.js';

// ============================================================================
// CONSTANTS - Shared configuration
// ============================================================================

export {
  assessDistress,
  CONVERSATION_PHASES,
  CRISIS_EMOTION_THRESHOLD,
  DEFAULT_EMOTION_THRESHOLD,
  DISTRESS_IMPROVEMENT_THRESHOLD,
  DISTRESS_THRESHOLDS,
  EMOTIONS,
  exceedsDistressThreshold,
  getEmotionThresholdForTask,
  hasDistressImproved,
  INTENTS,
  KEYWORD_PATTERNS,
  METRICS_THRESHOLDS,
  SENSITIVE_EMOTION_THRESHOLD,
  shouldSkipTaskDueToDistress,
  TASK_PRIORITIES,
  TASK_TURN_COUNTS,
  VALENCE,
  type DistressAssessment,
  type DistressLevel,
  type EmotionAnalysis,
  type EmotionType,
  type IntentType,
  type TaskPriority,
  type TaskTurnCount,
  type ValenceType,
} from './constants.js';

// ============================================================================
// DOCUMENTATION
// ============================================================================

/**
 * Get documentation for all available tasks
 */
export function getTaskDocumentation(): string {
  return `
# Ferni Voice AI - Task Reference

## Base Tasks (3)
- CollectConsentTask: Get recording consent
- CollectNameTask: Get user's name
- CollectEmailTask: Get email address

## Micro Tasks (6)
- QuickAcknowledgeTask: Just "I hear you"
- QuickCelebrateTask: Brief joy moments
- QuickValidateTask: "That makes sense"
- QuickCuriosityTask: ONE follow-up question
- ActiveListeningTask: Reflect back what you heard
- PauseTask: Meaningful silence

## Life Event Tasks (4)
- LifeChangeTask: Major transitions (job, baby, divorce, etc.)
- PanicPreventionTask: Stop panic-driven decisions
- GriefSupportTask: Be present in loss
- MilestoneTask: Celebrate achievements

## Intelligent Tasks (2)
- IntelligentTask: Emotion-aware base class
- IntelligentTaskGroup: Smart task orchestration

## Support Tasks (4)
- EmotionalSupportTask: Crisis-level emotional support
- CheckInTask: Adaptive emotional check-ins
- ComfortTask: Address specific worries
- CrisisDetectionTask: Monitor for crisis signals

## Relationship Tasks (5)
- FollowUpTask: Reconnect with returning users
- StorytellingTask: Share relevant stories
- DeepDiveTask: Explore topics in depth
- GoodbyeTask: Warm conversation endings
- CelebrationTask: Celebrate wins and milestones

## Advice Tasks (4) - General Purpose
- WisdomSharingTask: Share wisdom on any topic
- DecisionSupportTask: Help with decisions
- FearAddressingTask: Address fears and anxiety
- GoalSettingTask: Help set clear goals

## Domain-Specific Tasks

### Finance Tasks (5) - Nayan/Jack Bogle
- InvestmentWisdomTask: Share investment principles
- MarketPanicTask: Address market panic
- RebalancingTask: Portfolio rebalancing guidance
- FinancialGoalTask: Set financial goals
- MarketFearTask: Address market fears

### Habits Tasks (4) - Maya Santos
- HabitTrackingTask: Check in on habit progress
- HabitBuildingTask: Design new habits (cue/routine/reward)
- HabitStruggleTask: Help when habits aren't sticking
- RoutineDesignTask: Design daily routines

### Research Tasks (4) - Peter John
- CuriosityExplorationTask: Fan the flames of curiosity
- LearningProjectTask: Plan a learning journey
- DeepResearchTask: Guide thorough research
- ExpertiseDevelopmentTask: Develop expertise in a domain

### Communications Tasks (4) - Alex Chen
- DifficultConversationTask: Prepare for tough conversations
- MessageCraftingTask: Help write important messages
- BoundarySettingTask: Set boundaries with clarity
- SchedulingTask: Coordinate schedules

### Events Tasks (4) - Jordan Taylor
- EventPlanningTask: Plan special events
- SpecialDateTask: Remember important dates
- TravelPlanningTask: Plan trips
- LifeMilestoneTask: Acknowledge life milestones

## Onboarding Tasks (3)
- WelcomeTask: Warm greeting and getting to know the user
- SituationAssessmentTask: Understand what brought them here
- GoalsTask: Explore their goals

## Natural Transitions
- getTransition(): Get random phrase from category
- getContextualTransition(): Smart transition picker
- wrapWithTransitions(): Add entry/exit to any message

## Pre-built Flows (7)
- createIntelligentOnboardingFlow: Full new user onboarding
- createReturningUserFlow: Welcome back returning users
- createWisdomSession: Share wisdom on a topic
- createFearAddressingFlow: Address fears
- createGoalSettingSession: Set goals together
- createDeepDiveSession: Deep topic exploration
- createWrapUpFlow: Graceful conversation ending

Total: 52 tasks + 7 flows + transitions system

Domain task breakdown:
- General: 28 tasks (work with any persona)
- Finance: 5 tasks (Nayan/Jack Bogle)
- Habits: 4 tasks (Maya Santos)
- Research: 4 tasks (Peter John)
- Communications: 4 tasks (Alex Chen)
- Events: 4 tasks (Jordan Taylor)
- Plus 3 onboarding tasks
`;
}
