/**
 * Conversation Planner
 *
 * Part of the "Better Than Human" architecture - gives the AI a sense of purpose
 * for each session rather than being purely reactive.
 *
 * Tracks goals, topics, follow-ups, and session intent to build coherent,
 * goal-directed conversations.
 *
 * @module intelligence/conversation-planner
 */

import { randomUUID } from 'crypto';

import { createLogger } from '../utils/safe-logger.js';
import { getFirestoreDb, recordDegradation, cleanForFirestore } from '../utils/firestore-utils.js';

const log = createLogger({ module: 'ConversationPlanner' });

// ============================================================================
// TYPES
// ============================================================================

export interface ConversationGoal {
  id: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  status: 'active' | 'achieved' | 'abandoned' | 'deferred';
  createdAt: Date;
  achievedAt?: Date;
  /** Progress 0-1 */
  progress: number;
  /** Source: detected from user, set by persona, inferred from context */
  source: 'user_explicit' | 'user_implicit' | 'persona_suggested' | 'system_inferred';
}

export interface FollowUpItem {
  id: string;
  description: string;
  fromSessionId: string;
  createdAt: Date;
  addressed: boolean;
}

export interface ConversationPlan {
  sessionId: string;
  userId: string;
  goals: ConversationGoal[];
  /** High-level session intent (e.g., "emotional support", "planning", "learning") */
  sessionIntent?: string;
  /** Topics to explore */
  topicsToExplore: string[];
  /** Topics already covered */
  topicsCovered: string[];
  /** Follow-up items from previous sessions */
  followUps: FollowUpItem[];
  updatedAt: Date;
}

export type GoalSource = ConversationGoal['source'];
export type GoalPriority = ConversationGoal['priority'];
export type GoalStatus = ConversationGoal['status'];

/** Result type for operations that can fail (e.g., persistence) */
export type PlanResult<T> = { ok: true; value: T } | { ok: false; error: string };

// ============================================================================
// IMPLICIT GOAL DETECTION PATTERNS (keyword/pattern matching, no LLM)
// ============================================================================

const GOAL_PATTERNS: Array<{
  regex: RegExp;
  extractDescription: (match: RegExpMatchArray, text: string) => string;
  source: GoalSource;
}> = [
  {
    regex:
      /\b(?:i want to|i'd like to|i need to|i'm trying to|i hope to)\s+(?:get better at|improve|learn|master|start|stop|build|achieve)\s+([^.?!]+)/i,
    extractDescription: (m) => m[1].trim(),
    source: 'user_implicit',
  },
  {
    regex: /\b(?:my goal is|my aim is|i'm aiming to|i'm working on)\s+([^.?!]+)/i,
    extractDescription: (m) => m[1].trim(),
    source: 'user_implicit',
  },
  {
    regex: /\b(?:help me|can you help me)\s+(?:to\s+)?([^.?!]+)/i,
    extractDescription: (m) => m[1].trim(),
    source: 'user_implicit',
  },
  {
    regex: /\b(?:figure out|work through|deal with|handle)\s+([^.?!]+)/i,
    extractDescription: (m) => `Work through: ${m[1].trim()}`,
    source: 'user_implicit',
  },
  {
    regex: /\b(?:decide|deciding)\s+(?:on\s+)?([^.?!]+)/i,
    extractDescription: (m) => `Decide: ${m[1].trim()}`,
    source: 'user_implicit',
  },
];

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Initialize a plan for a new session.
 */
export function createPlan(sessionId: string, userId: string): ConversationPlan {
  return {
    sessionId,
    userId,
    goals: [],
    topicsToExplore: [],
    topicsCovered: [],
    followUps: [],
    updatedAt: new Date(),
  };
}

/**
 * Add a goal to the plan.
 */
export function addGoal(
  plan: ConversationPlan,
  description: string,
  options?: { priority?: GoalPriority; source?: GoalSource }
): ConversationGoal {
  const goal: ConversationGoal = {
    id: randomUUID(),
    description: description.trim(),
    priority: options?.priority ?? 'medium',
    status: 'active',
    createdAt: new Date(),
    progress: 0,
    source: options?.source ?? 'persona_suggested',
  };
  plan.goals.push(goal);
  plan.updatedAt = new Date();
  return goal;
}

/**
 * Update progress on a goal (0-1).
 */
export function updateGoalProgress(plan: ConversationPlan, goalId: string, progress: number): void {
  const goal = plan.goals.find((g) => g.id === goalId);
  if (!goal || goal.status !== 'active') return;
  goal.progress = Math.max(0, Math.min(1, progress));
  plan.updatedAt = new Date();
}

/**
 * Mark a goal as complete.
 */
export function markGoalAchieved(plan: ConversationPlan, goalId: string): void {
  const goal = plan.goals.find((g) => g.id === goalId);
  if (!goal) return;
  goal.status = 'achieved';
  goal.progress = 1;
  goal.achievedAt = new Date();
  plan.updatedAt = new Date();
}

/**
 * Record that a topic was discussed.
 */
export function recordTopicCovered(plan: ConversationPlan, topic: string): void {
  const normalized = topic.trim().toLowerCase();
  if (!normalized) return;
  if (!plan.topicsCovered.includes(normalized)) {
    plan.topicsCovered.push(normalized);
    plan.updatedAt = new Date();
  }
}

/**
 * Detect implicit goals from transcript using keyword/pattern matching.
 */
export function detectImplicitGoals(
  transcript: string,
  currentPlan: ConversationPlan
): ConversationGoal[] {
  if (!transcript?.trim()) return [];
  const detected: ConversationGoal[] = [];
  const existingDescriptions = new Set(currentPlan.goals.map((g) => g.description.toLowerCase()));

  for (const { regex, extractDescription, source } of GOAL_PATTERNS) {
    const match = transcript.match(regex);
    if (!match) continue;
    const description = extractDescription(match, transcript);
    if (!description || description.length < 5) continue;
    const key = description.toLowerCase();
    if (existingDescriptions.has(key)) continue;
    existingDescriptions.add(key);
    const goal = addGoal(currentPlan, description, {
      priority: 'medium',
      source,
    });
    detected.push(goal);
  }
  return detected;
}

/**
 * Format the plan as a context injection string for the LLM.
 */
export function buildPlanContext(plan: ConversationPlan): string {
  const parts: string[] = [];

  if (plan.sessionIntent) {
    parts.push(`Session intent: ${plan.sessionIntent}`);
  }

  const activeGoals = plan.goals.filter((g) => g.status === 'active');
  if (activeGoals.length > 0) {
    parts.push(
      `Goals (${activeGoals.length}): ${activeGoals.map((g) => `${g.description} (${Math.round(g.progress * 100)}%)`).join('; ')}`
    );
  }

  const achieved = plan.goals.filter((g) => g.status === 'achieved');
  if (achieved.length > 0) {
    parts.push(`Achieved: ${achieved.map((g) => g.description).join('; ')}`);
  }

  if (plan.topicsCovered.length > 0) {
    parts.push(`Covered: ${plan.topicsCovered.slice(-5).join(', ')}`);
  }

  const pendingFollowUps = plan.followUps.filter((f) => !f.addressed);
  if (pendingFollowUps.length > 0) {
    parts.push(`Follow-ups: ${pendingFollowUps.map((f) => f.description).join('; ')}`);
  }

  if (plan.topicsToExplore.length > 0) {
    parts.push(`Explore: ${plan.topicsToExplore.slice(0, 3).join(', ')}`);
  }

  if (parts.length === 0) return '';
  return `[Conversation plan: ${parts.join('. ')}]`;
}

/**
 * Generate a session summary.
 */
export function getSessionSummary(plan: ConversationPlan): {
  goalsSet: number;
  goalsAchieved: number;
  topicsCovered: string[];
  followUps: string[];
} {
  const goalsAchieved = plan.goals.filter((g) => g.status === 'achieved').length;
  const pendingFollowUps = plan.followUps.filter((f) => !f.addressed);
  return {
    goalsSet: plan.goals.length,
    goalsAchieved,
    topicsCovered: [...plan.topicsCovered],
    followUps: pendingFollowUps.map((f) => f.description),
  };
}

// ============================================================================
// PERSISTENCE
// ============================================================================

const PLANS_COLLECTION = 'conversation_plans';
const FOLLOW_UPS_COLLECTION = 'follow_ups';

function toSerializable<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Save plan to Firestore at session end.
 */
export async function persistPlan(plan: ConversationPlan): Promise<PlanResult<void>> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ConversationPlanner', 'db_unavailable');
    return { ok: false, error: 'Firestore not available' };
  }

  try {
    const userRef = db.collection('bogle_users').doc(plan.userId);
    const planDoc = cleanForFirestore({
      ...toSerializable(plan),
      goals: plan.goals.map((g) => ({
        ...g,
        createdAt: g.createdAt.toISOString(),
        achievedAt: g.achievedAt?.toISOString(),
      })),
      followUps: plan.followUps.map((f) => ({
        ...f,
        createdAt: f.createdAt.toISOString(),
      })),
      updatedAt: plan.updatedAt.toISOString(),
    });

    await userRef.collection(PLANS_COLLECTION).doc(plan.sessionId).set(planDoc, {
      merge: true,
    });

    // Sync follow-ups for querying
    const batch = db.batch();
    for (const fu of plan.followUps) {
      const fuRef = userRef.collection(FOLLOW_UPS_COLLECTION).doc(fu.id);
      batch.set(
        fuRef,
        cleanForFirestore({
          id: fu.id,
          description: fu.description,
          fromSessionId: fu.fromSessionId,
          createdAt: fu.createdAt.toISOString(),
          addressed: fu.addressed,
        }),
        { merge: true }
      );
    }
    await batch.commit();

    log.debug({ sessionId: plan.sessionId, userId: plan.userId }, 'Plan persisted');
    return { ok: true, value: undefined };
  } catch (error) {
    log.warn({ error: String(error), sessionId: plan.sessionId }, 'Failed to persist plan');
    return { ok: false, error: String(error) };
  }
}

/**
 * Load unaddressed follow-ups from past sessions.
 */
export async function loadPreviousFollowUps(userId: string): Promise<PlanResult<FollowUpItem[]>> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ConversationPlanner', 'db_unavailable');
    return { ok: false, error: 'Firestore not available' };
  }

  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection(FOLLOW_UPS_COLLECTION)
      .where('addressed', '==', false)
      .limit(20)
      .get();

    const followUps: FollowUpItem[] = snapshot.docs
      .map((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
        const d = doc.data();
        return {
          id: (d.id as string) ?? doc.id,
          description: (d.description as string) ?? '',
          fromSessionId: (d.fromSessionId as string) ?? '',
          createdAt: d.createdAt ? new Date(d.createdAt as string) : new Date(),
          addressed: (d.addressed as boolean) ?? false,
        };
      })
      .sort((a: FollowUpItem, b: FollowUpItem) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 10);

    return { ok: true, value: followUps };
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load follow-ups');
    return { ok: false, error: String(error) };
  }
}
