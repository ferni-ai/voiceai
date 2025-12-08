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
  TaskGroup,
  TaskRegressionError,
  // Prebuilt basic tasks
  CollectConsentTask,
  CollectNameTask,
  CollectEmailTask,
} from './agent-task.js';

export type { TaskGroupResult, ConsentResult, NameResult, EmailResult } from './agent-task.js';

// ============================================================================
// MICRO TASKS - Quick, natural moments
// ============================================================================

export {
  QuickAcknowledgeTask,
  QuickCelebrateTask,
  QuickValidateTask,
  QuickCuriosityTask,
  ActiveListeningTask,
  PauseTask,
} from './micro-tasks.js';

export type {
  AcknowledgeResult,
  QuickCelebrateResult,
  ValidateResult,
  CuriosityResult,
  ListeningResult,
  PauseResult,
} from './micro-tasks.js';

// ============================================================================
// LIFE EVENT TASKS - Major life transitions
// ============================================================================

export {
  LifeChangeTask,
  PanicPreventionTask,
  GriefSupportTask,
  MilestoneTask,
} from './life-events.js';

export type {
  LifeEventType,
  LifeChangeResult,
  PanicPreventionResult,
  GriefSupportResult,
  MilestoneResult,
} from './life-events.js';

// ============================================================================
// INTELLIGENT TASKS
// ============================================================================

export {
  IntelligentTask,
  IntelligentTaskGroup,
  createAdaptiveResponse,
} from './intelligent-task.js';

export type { TaskContext, AdaptiveInstructions } from './intelligent-task.js';

// ============================================================================
// SUPPORT TASKS
// ============================================================================

export {
  EmotionalSupportTask,
  CheckInTask,
  ComfortTask,
  CrisisDetectionTask,
} from './support-tasks.js';

export type { SupportResult, CheckInResult, ComfortResult, CrisisResult } from './support-tasks.js';

// ============================================================================
// RELATIONSHIP TASKS
// ============================================================================

export {
  FollowUpTask,
  StorytellingTask,
  DeepDiveTask,
  GoodbyeTask,
  CelebrationTask,
} from './relationship-tasks.js';

export type {
  FollowUpResult,
  StoryResult,
  DeepDiveResult,
  GoodbyeResult,
  CelebrationResult,
} from './relationship-tasks.js';

// ============================================================================
// ADVICE TASKS (General-purpose)
// ============================================================================

export {
  WisdomSharingTask,
  DecisionSupportTask,
  FearAddressingTask,
  GoalSettingTask,
} from './advice-tasks.js';

export type {
  WisdomResult,
  DecisionResult,
  FearResult,
  GoalSettingResult,
} from './advice-tasks.js';

// ============================================================================
// DOMAIN-SPECIFIC TASKS
// ============================================================================

// Finance Tasks (Nayan/Jack Bogle domain)
export {
  InvestmentWisdomTask,
  MarketPanicTask,
  RebalancingTask,
  FinancialGoalTask,
  MarketFearTask,
  // Legacy aliases
  RebalancingTask as RebalancingGuidanceTask,
} from './finance-tasks.js';

export type {
  InvestmentWisdomResult,
  MarketPanicResult,
  RebalancingResult,
  FinancialGoalResult,
  MarketFearResult,
} from './finance-tasks.js';

// Habits Tasks (Maya Santos domain)
export {
  HabitTrackingTask,
  HabitBuildingTask,
  HabitStruggleTask,
  RoutineDesignTask,
} from './habits-tasks.js';

export type {
  HabitTrackingResult,
  HabitBuildingResult,
  HabitStruggleResult,
  RoutineDesignResult,
} from './habits-tasks.js';

// Research Tasks (Peter John domain)
export {
  CuriosityExplorationTask,
  LearningProjectTask,
  DeepResearchTask,
  ExpertiseDevelopmentTask,
} from './research-tasks.js';

export type {
  CuriosityExplorationResult,
  LearningProjectResult,
  DeepResearchResult,
  ExpertiseDevelopmentResult,
} from './research-tasks.js';

// Communications Tasks (Alex Chen domain)
export {
  DifficultConversationTask,
  MessageCraftingTask,
  BoundarySettingTask,
  SchedulingTask,
} from './communications-tasks.js';

export type {
  DifficultConversationResult,
  MessageCraftingResult,
  BoundarySettingResult,
  SchedulingResult,
} from './communications-tasks.js';

// Events Tasks (Jordan Taylor domain)
export {
  EventPlanningTask,
  SpecialDateTask,
  TravelPlanningTask,
  LifeMilestoneTask,
} from './events-tasks.js';

export type {
  EventPlanningResult,
  SpecialDateResult,
  TravelPlanningResult,
  LifeMilestoneResult,
} from './events-tasks.js';

// ============================================================================
// ONBOARDING TASKS
// ============================================================================

export {
  WelcomeTask,
  SituationAssessmentTask,
  FinancialSituationTask, // Legacy alias
  GoalsTask,
  createOnboardingFlow,
  runOnboarding,
} from './onboarding.js';

export type {
  WelcomeResult,
  SituationResult,
  FinancialSituationResult, // Legacy alias
  GoalsResult as OnboardingGoalsResult,
  OnboardingResult,
} from './onboarding.js';

// ============================================================================
// TASK FLOW BUILDERS
// ============================================================================

import { IntelligentTaskGroup, type IntelligentTask, type TaskContext } from './intelligent-task.js';
import { EmotionalSupportTask, CheckInTask } from './support-tasks.js';
import { FollowUpTask, GoodbyeTask, DeepDiveTask } from './relationship-tasks.js';
import { WisdomSharingTask, GoalSettingTask, FearAddressingTask } from './advice-tasks.js';
import { WelcomeTask, SituationAssessmentTask, GoalsTask } from './onboarding.js';

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
  // Note: Type assertion needed because IntelligentTaskGroup expects a generic task interface
  // that these specific task types satisfy at runtime but TypeScript can't verify statically
  group.add(() => new WelcomeTask() as unknown as InstanceType<typeof IntelligentTask>, {
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

  group.add(
    () => new SituationAssessmentTask() as unknown as InstanceType<typeof IntelligentTask>,
    {
      id: 'situation',
      description: 'Understanding what brought them here',
      priority: 3,
      skipIfDistressed: true, // Skip if they need support
    }
  );

  group.add(() => new GoalsTask() as unknown as InstanceType<typeof IntelligentTask>, {
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
  TOPIC_ENTRY_TRANSITIONS,
  TOPIC_EXIT_TRANSITIONS,
  EMOTIONAL_TRANSITIONS,
  TASK_TRANSITIONS,
  getTransition,
  getContextualTransition,
  wrapWithTransitions,
} from './transitions.js';

// ============================================================================
// TASK MANAGER - Non-blocking task orchestration
// ============================================================================

export {
  TaskManager,
  getTaskManager,
  resetTaskManager,
  TASK_WISDOM,
  type TaskWisdom,
  type ActiveTask,
} from './task-manager.js';

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
