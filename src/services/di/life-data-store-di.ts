/**
 * Life Data Store - DI-Enabled Version
 *
 * Persistent storage for Jordan's domain:
 * - Life milestones
 * - Life goals
 * - Retirement plans
 * - Team coordination context
 *
 * Key differences from legacy:
 * 1. Dependencies injected via constructor
 * 2. Returns Result types
 * 3. Registered with DI container
 *
 * PERSISTENCE: Milestones, goals, and retirement plans are persisted to Firestore.
 */

import { getLogger } from '../../utils/safe-logger.js';

import { failure, NotFoundError, success, type AsyncResult } from '../../types/result.js';
import type { UserProfile } from '../../types/user-profile.js';
import { createPersistenceStore, type PersistenceStore } from '../persistence/index.js';
import { Tokens, type Container, type Factory } from './container.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';

// ============================================================================
// TYPES (subset - full types in original file)
// ============================================================================

export type MilestoneCategory =
  | 'wedding'
  | 'first-baby'
  | 'first-home'
  | 'graduation'
  | 'retirement'
  | 'first-solo-trip'
  | 'first-pet'
  | 'coming-of-age'
  | 'milestone-birthday'
  | 'first-job'
  | 'first-car'
  | 'anniversary'
  | 'college-sendoff'
  | 'other';

export interface LifeMilestone {
  id: string;
  userId: string;
  name: string;
  category: MilestoneCategory;
  targetDate?: Date;
  status: 'dreaming' | 'planning' | 'in-progress' | 'completed' | 'postponed';
  budget?: number;
  checklist: Array<{ id: string; task: string; completed: boolean }>;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

export type LifeGoalCategory =
  | 'career'
  | 'financial'
  | 'health'
  | 'relationships'
  | 'personal-growth'
  | 'home'
  | 'travel'
  | 'giving'
  | 'fun';

export interface LifeGoal {
  id: string;
  userId: string;
  title: string;
  description?: string;
  category: LifeGoalCategory;
  status: 'not-started' | 'in-progress' | 'on-track' | 'at-risk' | 'completed' | 'abandoned';
  progressPercent: number;
  targetDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface RetirementPlan {
  id: string;
  userId: string;
  targetAge: number;
  currentAge: number;
  style: 'early-retirement' | 'traditional' | 'semi-retirement' | 'encore-career' | 'flexible';
  monthlyIncomeGoal: number;
  currentSavings: number;
  savingsProgress: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface LifePortfolio {
  userId: string;
  categories: Record<LifeGoalCategory, { satisfaction: number; focus: string }>;
  overallScore: number;
}

// ============================================================================
// STORE INTERFACE
// ============================================================================

interface MemoryStoreInterface {
  getProfile: (userId: string) => Promise<UserProfile | null>;
  saveProfile: (profile: UserProfile) => Promise<void>;
}

// ============================================================================
// DEPENDENCIES
// ============================================================================

export interface LifeDataStoreDeps {
  store: MemoryStoreInterface;
  logger?: ReturnType<typeof getLogger>;
}

// ============================================================================
// PERSISTENCE TYPES
// ============================================================================

interface PersistedMilestone extends Omit<LifeMilestone, 'targetDate' | 'createdAt' | 'updatedAt'> {
  targetDate?: string;
  createdAt: string;
  updatedAt: string;
}

interface PersistedGoal extends Omit<LifeGoal, 'targetDate' | 'createdAt' | 'updatedAt'> {
  targetDate?: string;
  createdAt: string;
  updatedAt: string;
}

interface PersistedRetirementPlan extends Omit<RetirementPlan, 'createdAt' | 'updatedAt'> {
  createdAt: string;
  updatedAt: string;
}

interface UserLifeData {
  milestones: PersistedMilestone[];
  goals: PersistedGoal[];
  retirementPlan?: PersistedRetirementPlan;
}

function serializeMilestone(m: LifeMilestone): PersistedMilestone {
  return {
    ...m,
    targetDate: m.targetDate?.toISOString(),
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

function deserializeMilestone(data: PersistedMilestone): LifeMilestone {
  return {
    ...data,
    targetDate: data.targetDate ? new Date(data.targetDate) : undefined,
    createdAt: new Date(data.createdAt),
    updatedAt: new Date(data.updatedAt),
  };
}

function serializeGoal(g: LifeGoal): PersistedGoal {
  return {
    ...g,
    targetDate: g.targetDate?.toISOString(),
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
  };
}

function deserializeGoal(data: PersistedGoal): LifeGoal {
  return {
    ...data,
    targetDate: data.targetDate ? new Date(data.targetDate) : undefined,
    createdAt: new Date(data.createdAt),
    updatedAt: new Date(data.updatedAt),
  };
}

function serializeRetirementPlan(p: RetirementPlan): PersistedRetirementPlan {
  return {
    ...p,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

function deserializeRetirementPlan(data: PersistedRetirementPlan): RetirementPlan {
  return {
    ...data,
    createdAt: new Date(data.createdAt),
    updatedAt: new Date(data.updatedAt),
  };
}

// ============================================================================
// SERVICE
// ============================================================================

export class LifeDataStoreService {
  private readonly store: MemoryStoreInterface;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly getLogger: () => any;

  // In-memory caches backed by Firestore persistence
  private milestones = new Map<string, LifeMilestone[]>();
  private goals = new Map<string, LifeGoal[]>();
  private retirementPlans = new Map<string, RetirementPlan>();
  private loadedUsers = new Set<string>();
  private persistence: PersistenceStore<UserLifeData> | null = null;

  constructor(deps: LifeDataStoreDeps) {
    this.store = deps.store;
    const loggerDep = deps.logger;
    this.getLogger = typeof loggerDep === 'function' ? loggerDep : () => loggerDep ?? getLogger();
    this.getLogger().info('📋 Life Data Store Service initialized (DI)');
  }

  private getPersistence(): PersistenceStore<UserLifeData> {
    if (!this.persistence) {
      this.persistence = createPersistenceStore<UserLifeData>({
        collection: 'life_data',
        documentId: 'data',
        syncIntervalMs: 3000,
      });
    }
    return this.persistence;
  }

  private async ensureUserLoaded(userId: string): Promise<void> {
    if (this.loadedUsers.has(userId)) return;

    try {
      const data = await this.getPersistence().load(userId);
      if (data) {
        if (data.milestones) {
          this.milestones.set(userId, data.milestones.map(deserializeMilestone));
        }
        if (data.goals) {
          this.goals.set(userId, data.goals.map(deserializeGoal));
        }
        if (data.retirementPlan) {
          this.retirementPlans.set(userId, deserializeRetirementPlan(data.retirementPlan));
        }
      }
      this.loadedUsers.add(userId);
      this.getLogger().debug({ userId }, 'Loaded life data from persistence');
    } catch (error) {
      this.getLogger().warn({ error, userId }, 'Failed to load life data');
      this.loadedUsers.add(userId);
    }
  }

  private persistUserData(userId: string): void {
    const userMilestones = this.milestones.get(userId) || [];
    const userGoals = this.goals.get(userId) || [];
    const retirementPlan = this.retirementPlans.get(userId);

    this.getPersistence().set(cleanForFirestore(userId), {
      milestones: userMilestones.map(serializeMilestone),
      goals: userGoals.map(serializeGoal),
      retirementPlan: retirementPlan ? serializeRetirementPlan(retirementPlan) : undefined,
    });
  }

  async flush(): Promise<void> {
    await this.getPersistence().flush();
    this.getLogger().info('Life data store persistence flushed');
  }

  /**
   * Shutdown and clear all state
   */
  async shutdown(): Promise<void> {
    await this.flush();
    // Clear state for clean restart
    this.loadedUsers.clear();
    this.milestones.clear();
    this.goals.clear();
    this.retirementPlans.clear();
    this.getLogger().info('Life data store service shutdown complete');
  }

  // ==========================================================================
  // MILESTONES
  // ==========================================================================

  async createMilestone(
    userId: string,
    data: Omit<LifeMilestone, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
  ): AsyncResult<LifeMilestone, Error> {
    try {
      await this.ensureUserLoaded(userId);

      const milestone: LifeMilestone = {
        ...data,
        id: `milestone_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const userMilestones = this.milestones.get(userId) || [];
      userMilestones.push(milestone);
      this.milestones.set(userId, userMilestones);
      this.persistUserData(userId);

      this.getLogger().info({ userId, milestoneId: milestone.id }, 'Milestone created');
      return success(milestone);
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async getMilestone(
    userId: string,
    milestoneId: string
  ): AsyncResult<LifeMilestone, NotFoundError | Error> {
    try {
      await this.ensureUserLoaded(userId);
      const userMilestones = this.milestones.get(userId) || [];
      const milestone = userMilestones.find((m) => m.id === milestoneId);

      if (!milestone) {
        return failure(new NotFoundError('LifeMilestone', milestoneId));
      }

      return success(milestone);
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async listMilestones(userId: string): AsyncResult<LifeMilestone[], Error> {
    try {
      await this.ensureUserLoaded(userId);
      const userMilestones = this.milestones.get(userId) || [];
      return success(userMilestones);
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async updateMilestone(
    userId: string,
    milestoneId: string,
    updates: Partial<LifeMilestone>
  ): AsyncResult<LifeMilestone, NotFoundError | Error> {
    try {
      await this.ensureUserLoaded(userId);
      const userMilestones = this.milestones.get(userId) || [];
      const index = userMilestones.findIndex((m) => m.id === milestoneId);

      if (index === -1) {
        return failure(new NotFoundError('LifeMilestone', milestoneId));
      }

      const updated: LifeMilestone = {
        ...userMilestones[index],
        ...updates,
        id: milestoneId,
        userId,
        updatedAt: new Date(),
      };

      userMilestones[index] = updated;
      this.milestones.set(userId, userMilestones);
      this.persistUserData(userId);

      this.getLogger().debug({ userId, milestoneId }, 'Milestone updated');
      return success(updated);
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async deleteMilestone(
    userId: string,
    milestoneId: string
  ): AsyncResult<void, NotFoundError | Error> {
    try {
      await this.ensureUserLoaded(userId);
      const userMilestones = this.milestones.get(userId) || [];
      const index = userMilestones.findIndex((m) => m.id === milestoneId);

      if (index === -1) {
        return failure(new NotFoundError('LifeMilestone', milestoneId));
      }

      userMilestones.splice(index, 1);
      this.milestones.set(userId, userMilestones);
      this.persistUserData(userId);

      this.getLogger().debug({ userId, milestoneId }, 'Milestone deleted');
      return success(undefined);
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ==========================================================================
  // GOALS
  // ==========================================================================

  async createGoal(
    userId: string,
    data: Omit<LifeGoal, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
  ): AsyncResult<LifeGoal, Error> {
    try {
      await this.ensureUserLoaded(userId);
      const goal: LifeGoal = {
        ...data,
        id: `goal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const userGoals = this.goals.get(userId) || [];
      userGoals.push(goal);
      this.goals.set(userId, userGoals);
      this.persistUserData(userId);

      this.getLogger().info({ userId, goalId: goal.id }, 'Goal created');
      return success(goal);
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async listGoals(userId: string, category?: LifeGoalCategory): AsyncResult<LifeGoal[], Error> {
    try {
      await this.ensureUserLoaded(userId);
      let userGoals = this.goals.get(userId) || [];

      if (category) {
        userGoals = userGoals.filter((g) => g.category === category);
      }

      return success(userGoals);
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async updateGoalProgress(
    userId: string,
    goalId: string,
    progressPercent: number
  ): AsyncResult<LifeGoal, NotFoundError | Error> {
    try {
      await this.ensureUserLoaded(userId);
      const userGoals = this.goals.get(userId) || [];
      const index = userGoals.findIndex((g) => g.id === goalId);

      if (index === -1) {
        return failure(new NotFoundError('LifeGoal', goalId));
      }

      const updated: LifeGoal = {
        ...userGoals[index],
        progressPercent: Math.min(100, Math.max(0, progressPercent)),
        status:
          progressPercent >= 100 ? 'completed' : progressPercent >= 50 ? 'on-track' : 'in-progress',
        updatedAt: new Date(),
      };

      userGoals[index] = updated;
      this.goals.set(userId, userGoals);
      this.persistUserData(userId);

      return success(updated);
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ==========================================================================
  // RETIREMENT
  // ==========================================================================

  async getRetirementPlan(userId: string): AsyncResult<RetirementPlan | null, Error> {
    try {
      await this.ensureUserLoaded(userId);
      const plan = this.retirementPlans.get(userId);
      return success(plan || null);
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async saveRetirementPlan(
    userId: string,
    data: Omit<RetirementPlan, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
  ): AsyncResult<RetirementPlan, Error> {
    try {
      await this.ensureUserLoaded(userId);
      const existing = this.retirementPlans.get(userId);

      const plan: RetirementPlan = {
        ...data,
        id: existing?.id || `retirement_${userId}`,
        userId,
        createdAt: existing?.createdAt || new Date(),
        updatedAt: new Date(),
      };

      this.retirementPlans.set(userId, plan);
      this.persistUserData(userId);
      this.getLogger().info({ userId }, 'Retirement plan saved');

      return success(plan);
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ==========================================================================
  // LIFE PORTFOLIO
  // ==========================================================================

  async getLifePortfolio(userId: string): AsyncResult<LifePortfolio, Error> {
    try {
      await this.ensureUserLoaded(userId);
      const goals = this.goals.get(userId) || [];

      // Calculate satisfaction per category
      const categories = {} as LifePortfolio['categories'];
      const allCategories: LifeGoalCategory[] = [
        'career',
        'financial',
        'health',
        'relationships',
        'personal-growth',
        'home',
        'travel',
        'giving',
        'fun',
      ];

      for (const cat of allCategories) {
        const catGoals = goals.filter((g) => g.category === cat);
        const avgProgress =
          catGoals.length > 0
            ? catGoals.reduce((sum, g) => sum + g.progressPercent, 0) / catGoals.length
            : 50; // Default satisfaction

        categories[cat] = {
          satisfaction: Math.round(avgProgress / 10),
          focus: avgProgress < 30 ? 'transform' : avgProgress < 70 ? 'improve' : 'maintain',
        };
      }

      const overallScore = Math.round(
        Object.values(categories).reduce((sum, c) => sum + c.satisfaction, 0) / allCategories.length
      );

      return success({
        userId,
        categories,
        overallScore,
      });
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ==========================================================================
  // STATS
  // ==========================================================================

  getStats(): {
    totalMilestones: number;
    totalGoals: number;
    totalRetirementPlans: number;
  } {
    return {
      totalMilestones: Array.from(this.milestones.values()).flat().length,
      totalGoals: Array.from(this.goals.values()).flat().length,
      totalRetirementPlans: this.retirementPlans.size,
    };
  }
}

// ============================================================================
// DI REGISTRATION
// ============================================================================

export const LifeDataStoreToken = Symbol('LifeDataStoreService');

export const createLifeDataStoreService: Factory<LifeDataStoreService> = (container) => {
  return new LifeDataStoreService({
    store: container.resolve(Tokens.MemoryStore),
  });
};

export function registerLifeDataStoreService(container: Container): void {
  container.registerSingleton(LifeDataStoreToken, createLifeDataStoreService);
}

export function getLifeDataStoreService(container: Container): LifeDataStoreService {
  if (!container.has(LifeDataStoreToken)) {
    registerLifeDataStoreService(container);
  }
  return container.resolve<LifeDataStoreService>(LifeDataStoreToken);
}
