/**
 * Goals Service for CEO CLI
 *
 * Manages user goals with Firestore persistence.
 * Part of the Personal Productivity commands (ferni goals).
 *
 * Storage: users/{userId}/goals collection in Firestore
 *
 * @module services/ceo/goals
 */

import {
  getFirestoreDb,
  cleanForFirestore,
  recordDegradation,
} from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'goals-service' });

// ============================================================================
// TYPES
// ============================================================================

export interface Milestone {
  id: string;
  title: string;
  completed: boolean;
  completedAt?: Date;
}

export interface Goal {
  id: string;
  userId: string;
  title: string;
  description?: string;
  targetDate?: Date;
  progress: number; // 0-100
  status: GoalStatus;
  category: GoalCategory;
  milestones: Milestone[];
  createdAt: Date;
  updatedAt: Date;
}

export type GoalStatus = 'active' | 'completed' | 'paused';
export type GoalCategory = 'career' | 'health' | 'relationship' | 'financial' | 'personal';

export interface CreateGoalInput {
  title: string;
  description?: string;
  targetDate?: Date;
  category?: GoalCategory;
  milestones?: Array<{ title: string }>;
}

export interface UpdateGoalInput {
  title?: string;
  description?: string;
  targetDate?: Date;
  progress?: number;
  status?: GoalStatus;
  category?: GoalCategory;
}

// ============================================================================
// VALIDATION
// ============================================================================

const VALID_STATUSES: GoalStatus[] = ['active', 'completed', 'paused'];
const VALID_CATEGORIES: GoalCategory[] = [
  'career',
  'health',
  'relationship',
  'financial',
  'personal',
];

function validateProgress(progress: number): void {
  if (progress < 0 || progress > 100) {
    throw new Error('Progress must be between 0 and 100');
  }
}

function validateStatus(status: string): asserts status is GoalStatus {
  if (!VALID_STATUSES.includes(status as GoalStatus)) {
    throw new Error(`Invalid status: ${status}. Must be one of: ${VALID_STATUSES.join(', ')}`);
  }
}

function validateCategory(category: string): asserts category is GoalCategory {
  if (!VALID_CATEGORIES.includes(category as GoalCategory)) {
    throw new Error(
      `Invalid category: ${category}. Must be one of: ${VALID_CATEGORIES.join(', ')}`
    );
  }
}

function validateRequiredFields(input: CreateGoalInput): void {
  if (!input.title || input.title.trim().length === 0) {
    throw new Error('Goal title is required');
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function generateId(): string {
  return `goal_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function generateMilestoneId(): string {
  return `ms_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Calculate progress from milestones if milestones exist.
 * Returns the percentage of completed milestones.
 */
function calculateProgressFromMilestones(milestones: Milestone[]): number {
  if (milestones.length === 0) {
    return 0;
  }
  const completed = milestones.filter((m) => m.completed).length;
  return Math.round((completed / milestones.length) * 100);
}

/**
 * Convert Firestore data to Goal object.
 * Handles date conversion from Firestore Timestamps or ISO strings.
 */
function hydrateGoal(data: Record<string, unknown>, docId: string): Goal {
  return {
    id: docId,
    userId: data.userId as string,
    title: data.title as string,
    description: data.description as string | undefined,
    targetDate: data.targetDate ? toDate(data.targetDate) : undefined,
    progress: (data.progress as number) ?? 0,
    status: (data.status as GoalStatus) ?? 'active',
    category: (data.category as GoalCategory) ?? 'personal',
    milestones: hydrateMilestones(data.milestones),
    createdAt: toDate(data.createdAt) ?? new Date(),
    updatedAt: toDate(data.updatedAt) ?? new Date(),
  };
}

function hydrateMilestones(milestones: unknown): Milestone[] {
  if (!Array.isArray(milestones)) {
    return [];
  }
  return milestones.map((m: Record<string, unknown>) => ({
    id: (m.id as string) ?? generateMilestoneId(),
    title: (m.title as string) ?? '',
    completed: (m.completed as boolean) ?? false,
    completedAt: m.completedAt ? toDate(m.completedAt) : undefined,
  }));
}

/**
 * Convert various date formats to Date object.
 */
function toDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;

  // Firestore Timestamp
  if (
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate: unknown }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate();
  }

  // Serialized Firestore Timestamp
  if (typeof value === 'object' && 'seconds' in value) {
    const { seconds } = value as { seconds: number };
    return new Date(seconds * 1000);
  }

  // ISO string
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  return undefined;
}

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

/**
 * Create a new goal for a user.
 */
export async function createGoal(userId: string, input: CreateGoalInput): Promise<Goal> {
  validateRequiredFields(input);
  if (input.category) {
    validateCategory(input.category);
  }

  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('goals-service', 'db_unavailable');
    throw new Error('Database not available');
  }

  const now = new Date();
  const goalId = generateId();

  // Create milestones from input
  const milestones: Milestone[] = (input.milestones ?? []).map((m) => ({
    id: generateMilestoneId(),
    title: m.title,
    completed: false,
  }));

  const goal: Goal = {
    id: goalId,
    userId,
    title: input.title.trim(),
    description: input.description?.trim(),
    targetDate: input.targetDate,
    progress: 0,
    status: 'active',
    category: input.category ?? 'personal',
    milestones,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const docRef = db.collection('users').doc(userId).collection('goals').doc(goalId);
    await docRef.set(cleanForFirestore(goal));

    log.info({ userId, goalId, title: goal.title }, 'Goal created');
    return goal;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to create goal');
    throw new Error('Failed to create goal');
  }
}

/**
 * Get all goals for a user, optionally filtered by status.
 */
export async function getGoals(userId: string, status?: GoalStatus): Promise<Goal[]> {
  if (status) {
    validateStatus(status);
  }

  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('goals-service', 'db_unavailable');
    return [];
  }

  try {
    const query = db.collection('users').doc(userId).collection('goals');

    // Apply status filter if provided
    const queryRef = status ? query.where('status', '==', status) : query;

    const snapshot = await queryRef.orderBy('createdAt', 'desc').get();

    if (snapshot.empty) {
      return [];
    }

    const goals: Goal[] = [];
    for (const doc of snapshot.docs) {
      const data = doc.data();
      if (data) {
        goals.push(hydrateGoal(data as Record<string, unknown>, doc.id));
      }
    }

    log.debug({ userId, count: goals.length, status }, 'Goals retrieved');
    return goals;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get goals');
    return [];
  }
}

/**
 * Get a single goal by ID.
 */
export async function getGoal(userId: string, goalId: string): Promise<Goal | null> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('goals-service', 'db_unavailable');
    return null;
  }

  try {
    const docRef = db.collection('users').doc(userId).collection('goals').doc(goalId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data();
    if (!data) {
      return null;
    }

    return hydrateGoal(data as Record<string, unknown>, doc.id);
  } catch (error) {
    log.error({ error: String(error), userId, goalId }, 'Failed to get goal');
    return null;
  }
}

/**
 * Update a goal.
 */
export async function updateGoal(
  userId: string,
  goalId: string,
  updates: UpdateGoalInput
): Promise<Goal> {
  // Validate inputs
  if (updates.progress !== undefined) {
    validateProgress(updates.progress);
  }
  if (updates.status) {
    validateStatus(updates.status);
  }
  if (updates.category) {
    validateCategory(updates.category);
  }

  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('goals-service', 'db_unavailable');
    throw new Error('Database not available');
  }

  try {
    const docRef = db.collection('users').doc(userId).collection('goals').doc(goalId);
    const doc = await docRef.get();

    if (!doc.exists) {
      throw new Error('Goal not found');
    }

    const existing = hydrateGoal(doc.data() as Record<string, unknown>, doc.id);

    const updated: Goal = {
      ...existing,
      title: updates.title?.trim() ?? existing.title,
      description:
        updates.description !== undefined ? updates.description?.trim() : existing.description,
      targetDate: updates.targetDate !== undefined ? updates.targetDate : existing.targetDate,
      progress: updates.progress ?? existing.progress,
      status: updates.status ?? existing.status,
      category: updates.category ?? existing.category,
      updatedAt: new Date(),
    };

    await docRef.set(cleanForFirestore(updated), { merge: true });

    log.info({ userId, goalId }, 'Goal updated');
    return updated;
  } catch (error) {
    const errorMsg = String(error);
    if (errorMsg.includes('Goal not found')) {
      throw error;
    }
    log.error({ error: errorMsg, userId, goalId }, 'Failed to update goal');
    throw new Error('Failed to update goal');
  }
}

/**
 * Delete a goal.
 */
export async function deleteGoal(userId: string, goalId: string): Promise<void> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('goals-service', 'db_unavailable');
    throw new Error('Database not available');
  }

  try {
    const docRef = db.collection('users').doc(userId).collection('goals').doc(goalId);
    const doc = await docRef.get();

    if (!doc.exists) {
      throw new Error('Goal not found');
    }

    await docRef.delete();
    log.info({ userId, goalId }, 'Goal deleted');
  } catch (error) {
    const errorMsg = String(error);
    if (errorMsg.includes('Goal not found')) {
      throw error;
    }
    log.error({ error: errorMsg, userId, goalId }, 'Failed to delete goal');
    throw new Error('Failed to delete goal');
  }
}

/**
 * Update goal progress directly.
 * If milestones exist, also updates milestone completion proportionally.
 */
export async function updateProgress(
  userId: string,
  goalId: string,
  progress: number
): Promise<Goal> {
  validateProgress(progress);

  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('goals-service', 'db_unavailable');
    throw new Error('Database not available');
  }

  try {
    const docRef = db.collection('users').doc(userId).collection('goals').doc(goalId);
    const doc = await docRef.get();

    if (!doc.exists) {
      throw new Error('Goal not found');
    }

    const existing = hydrateGoal(doc.data() as Record<string, unknown>, doc.id);

    // Auto-complete if progress reaches 100
    const status: GoalStatus = progress >= 100 ? 'completed' : existing.status;

    const updated: Goal = {
      ...existing,
      progress,
      status,
      updatedAt: new Date(),
    };

    await docRef.set(cleanForFirestore(updated), { merge: true });

    log.info({ userId, goalId, progress, status }, 'Goal progress updated');
    return updated;
  } catch (error) {
    const errorMsg = String(error);
    if (errorMsg.includes('Goal not found')) {
      throw error;
    }
    log.error({ error: errorMsg, userId, goalId }, 'Failed to update progress');
    throw new Error('Failed to update progress');
  }
}

/**
 * Add a milestone to a goal.
 */
export async function addMilestone(
  userId: string,
  goalId: string,
  milestone: { title: string }
): Promise<Goal> {
  if (!milestone.title || milestone.title.trim().length === 0) {
    throw new Error('Milestone title is required');
  }

  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('goals-service', 'db_unavailable');
    throw new Error('Database not available');
  }

  try {
    const docRef = db.collection('users').doc(userId).collection('goals').doc(goalId);
    const doc = await docRef.get();

    if (!doc.exists) {
      throw new Error('Goal not found');
    }

    const existing = hydrateGoal(doc.data() as Record<string, unknown>, doc.id);

    const newMilestone: Milestone = {
      id: generateMilestoneId(),
      title: milestone.title.trim(),
      completed: false,
    };

    const milestones = [...existing.milestones, newMilestone];

    // Recalculate progress based on milestones
    const progress = calculateProgressFromMilestones(milestones);

    const updated: Goal = {
      ...existing,
      milestones,
      progress,
      updatedAt: new Date(),
    };

    await docRef.set(cleanForFirestore(updated), { merge: true });

    log.info({ userId, goalId, milestoneId: newMilestone.id }, 'Milestone added');
    return updated;
  } catch (error) {
    const errorMsg = String(error);
    if (errorMsg.includes('Goal not found')) {
      throw error;
    }
    log.error({ error: errorMsg, userId, goalId }, 'Failed to add milestone');
    throw new Error('Failed to add milestone');
  }
}

/**
 * Mark a milestone as completed.
 */
export async function completeMilestone(
  userId: string,
  goalId: string,
  milestoneId: string
): Promise<Goal> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('goals-service', 'db_unavailable');
    throw new Error('Database not available');
  }

  try {
    const docRef = db.collection('users').doc(userId).collection('goals').doc(goalId);
    const doc = await docRef.get();

    if (!doc.exists) {
      throw new Error('Goal not found');
    }

    const existing = hydrateGoal(doc.data() as Record<string, unknown>, doc.id);

    const milestoneIndex = existing.milestones.findIndex((m) => m.id === milestoneId);
    if (milestoneIndex === -1) {
      throw new Error('Milestone not found');
    }

    // Update the milestone
    const milestones = [...existing.milestones];
    milestones[milestoneIndex] = {
      ...milestones[milestoneIndex],
      completed: true,
      completedAt: new Date(),
    };

    // Recalculate progress based on milestones
    const progress = calculateProgressFromMilestones(milestones);

    // Auto-complete goal if all milestones are done
    const allComplete = milestones.every((m) => m.completed);
    const status: GoalStatus = allComplete ? 'completed' : existing.status;

    const updated: Goal = {
      ...existing,
      milestones,
      progress,
      status,
      updatedAt: new Date(),
    };

    await docRef.set(cleanForFirestore(updated), { merge: true });

    log.info({ userId, goalId, milestoneId, progress, allComplete }, 'Milestone completed');
    return updated;
  } catch (error) {
    const errorMsg = String(error);
    if (errorMsg.includes('not found')) {
      throw error;
    }
    log.error({ error: errorMsg, userId, goalId, milestoneId }, 'Failed to complete milestone');
    throw new Error('Failed to complete milestone');
  }
}

// ============================================================================
// SERVICE INTERFACE (for typed access)
// ============================================================================

export interface GoalsService {
  createGoal: (userId: string, goal: CreateGoalInput) => Promise<Goal>;
  getGoals: (userId: string, status?: GoalStatus) => Promise<Goal[]>;
  getGoal: (userId: string, goalId: string) => Promise<Goal | null>;
  updateGoal: (userId: string, goalId: string, updates: UpdateGoalInput) => Promise<Goal>;
  deleteGoal: (userId: string, goalId: string) => Promise<void>;
  updateProgress: (userId: string, goalId: string, progress: number) => Promise<Goal>;
  addMilestone: (userId: string, goalId: string, milestone: { title: string }) => Promise<Goal>;
  completeMilestone: (userId: string, goalId: string, milestoneId: string) => Promise<Goal>;
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

/**
 * Singleton goals service instance.
 * Use this for typed access to all goals operations.
 */
export const goalsService: GoalsService = {
  createGoal,
  getGoals,
  getGoal,
  updateGoal,
  deleteGoal,
  updateProgress,
  addMilestone,
  completeMilestone,
};

export default goalsService;
