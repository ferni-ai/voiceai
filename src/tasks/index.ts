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
 * - Advice Tasks: Wisdom sharing, decisions, fear, goals, rebalancing
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
// ADVICE TASKS
// ============================================================================

export {
  WisdomSharingTask,
  DecisionSupportTask,
  FearAddressingTask,
  GoalSettingTask,
  RebalancingGuidanceTask,
} from './advice-tasks.js';

export type {
  WisdomResult,
  DecisionResult,
  FearResult,
  GoalSettingResult,
  RebalancingResult,
} from './advice-tasks.js';

// ============================================================================
// ONBOARDING TASKS
// ============================================================================

export {
  WelcomeTask,
  FinancialSituationTask,
  GoalsTask,
  createOnboardingFlow,
  runOnboarding,
} from './bogle-onboarding.js';

export type {
  WelcomeResult,
  FinancialSituationResult,
  GoalsResult as OnboardingGoalsResult,
  OnboardingResult,
} from './bogle-onboarding.js';

// ============================================================================
// TASK FLOW BUILDERS
// ============================================================================

import { IntelligentTaskGroup, type TaskContext } from './intelligent-task.js';
import { EmotionalSupportTask, CheckInTask } from './support-tasks.js';
import { FollowUpTask, GoodbyeTask, DeepDiveTask } from './relationship-tasks.js';
import { WisdomSharingTask, GoalSettingTask, FearAddressingTask } from './advice-tasks.js';
import { WelcomeTask, FinancialSituationTask, GoalsTask } from './bogle-onboarding.js';

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
  group.add(() => new WelcomeTask() as any, {
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

  group.add(() => new FinancialSituationTask() as any, {
    id: 'situation',
    description: 'Understanding their current financial situation',
    priority: 3,
    skipIfDistressed: true, // Skip if they need support
  });

  group.add(() => new GoalsTask() as any, {
    id: 'goals',
    description: 'Exploring their financial goals',
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
export function createWisdomSession(
  principle: 'goals' | 'balance' | 'cost' | 'discipline' | 'general'
): IntelligentTaskGroup {
  const group = new IntelligentTaskGroup();
  group.setSupportTask(() => new EmotionalSupportTask());

  group.add(() => new WisdomSharingTask(principle), {
    id: 'wisdom',
    description: `Share wisdom about ${principle}`,
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
    description: 'Help set financial goals',
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
# John Bogle Voice AI - Task Reference

## Base Tasks (3)
- CollectConsentTask: Get recording consent
- CollectNameTask: Get user's name
- CollectEmailTask: Get email address

## Micro Tasks (6) - NEW!
- QuickAcknowledgeTask: Just "I hear you"
- QuickCelebrateTask: Brief joy moments
- QuickValidateTask: "That makes sense"
- QuickCuriosityTask: ONE follow-up question
- ActiveListeningTask: Reflect back what you heard
- PauseTask: Meaningful silence

## Life Event Tasks (4) - NEW!
- LifeChangeTask: Major transitions (job, baby, divorce, etc.)
- PanicPreventionTask: Stop panic selling
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
- StorytellingTask: Share relevant Jack stories
- DeepDiveTask: Explore topics in depth
- GoodbyeTask: Warm conversation endings
- CelebrationTask: Celebrate wins and milestones

## Advice Tasks (5)
- WisdomSharingTask: Share investing principles
- DecisionSupportTask: Help with decisions
- FearAddressingTask: Address market fears
- GoalSettingTask: Set financial goals
- RebalancingGuidanceTask: Portfolio balance help

## Onboarding Tasks (3)
- WelcomeTask: Warm greeting
- FinancialSituationTask: Understand their situation
- GoalsTask: Explore their goals

## Natural Transitions - NEW!
- getTransition(): Get random phrase from category
- getContextualTransition(): Smart transition picker
- wrapWithTransitions(): Add entry/exit to any message

## Pre-built Flows (7)
- createIntelligentOnboardingFlow: Full new user onboarding
- createReturningUserFlow: Welcome back returning users
- createWisdomSession: Teach investing principles
- createFearAddressingFlow: Address financial fears
- createGoalSettingSession: Set goals together
- createDeepDiveSession: Deep topic exploration
- createWrapUpFlow: Graceful conversation ending

Total: 32 tasks + 7 flows + transitions system
`;
}
