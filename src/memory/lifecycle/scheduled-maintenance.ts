/**
 * Scheduled Maintenance
 *
 * Manages scheduled maintenance jobs for memory lifecycle operations.
 * Integrates with Cloud Scheduler for automatic decay, consolidation, and cleanup.
 *
 * @module memory/lifecycle/scheduled-maintenance
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { StoredMemory } from '../unified-store/types.js';
import type { MaintenanceJobConfig, MaintenanceJobResult, MemoryHealthStats } from './types.js';
import { DecayManager, getDecayManager } from './decay-manager.js';
import { ConsolidationManager, getConsolidationManager } from './consolidation-manager.js';
import { PreferencePredictor, getPreferencePredictor } from './preference-predictor.js';

const log = createLogger({ module: 'ScheduledMaintenance' });

// ============================================================================
// DEFAULT JOBS
// ============================================================================

/**
 * Default maintenance jobs
 */
export const DEFAULT_MAINTENANCE_JOBS: MaintenanceJobConfig[] = [
  {
    name: 'daily-decay',
    type: 'decay',
    schedule: '0 4 * * *', // 4 AM daily
    enabled: true,
    batchSize: 1000,
    timeoutMs: 300000, // 5 minutes
  },
  {
    name: 'weekly-consolidation',
    type: 'consolidation',
    schedule: '0 3 * * 0', // 3 AM Sunday
    enabled: true,
    batchSize: 500,
    timeoutMs: 600000, // 10 minutes
  },
  {
    name: 'daily-cleanup',
    type: 'cleanup',
    schedule: '0 5 * * *', // 5 AM daily
    enabled: true,
    batchSize: 500,
    timeoutMs: 300000, // 5 minutes
  },
  {
    name: 'hourly-preference-update',
    type: 'preference_update',
    schedule: '0 * * * *', // Every hour
    enabled: true,
    batchSize: 100,
    timeoutMs: 60000, // 1 minute
  },
];

// ============================================================================
// SCHEDULED MAINTENANCE
// ============================================================================

/**
 * Scheduled Maintenance Manager
 *
 * Coordinates lifecycle maintenance jobs.
 */
export class ScheduledMaintenance {
  private jobs: MaintenanceJobConfig[];
  private decayManager: DecayManager;
  private consolidationManager: ConsolidationManager;
  private preferencePredictor: PreferencePredictor;
  private lastResults: Map<string, MaintenanceJobResult> = new Map();
  private running: Set<string> = new Set();

  constructor(jobs: MaintenanceJobConfig[] = DEFAULT_MAINTENANCE_JOBS) {
    this.jobs = jobs;
    this.decayManager = getDecayManager();
    this.consolidationManager = getConsolidationManager();
    this.preferencePredictor = getPreferencePredictor();
  }

  /**
   * Run a specific job
   */
  async runJob(
    jobName: string,
    userId: string,
    getMemories: () => Promise<StoredMemory[]>,
    saveMemory?: (memory: StoredMemory) => Promise<void>,
    deleteMemory?: (memoryId: string) => Promise<void>
  ): Promise<MaintenanceJobResult> {
    const job = this.jobs.find((j) => j.name === jobName);
    if (!job) {
      throw new Error(`Job not found: ${jobName}`);
    }

    if (!job.enabled) {
      return {
        jobName,
        startedAt: new Date(),
        completedAt: new Date(),
        durationMs: 0,
        success: false,
        error: 'Job is disabled',
        itemsProcessed: 0,
        itemsModified: 0,
      };
    }

    if (this.running.has(jobName)) {
      return {
        jobName,
        startedAt: new Date(),
        completedAt: new Date(),
        durationMs: 0,
        success: false,
        error: 'Job already running',
        itemsProcessed: 0,
        itemsModified: 0,
      };
    }

    this.running.add(jobName);
    const startedAt = new Date();

    try {
      // Get memories
      const memories = await getMemories();
      const toProcess = memories.slice(0, job.batchSize);

      let result: MaintenanceJobResult;

      switch (job.type) {
        case 'decay':
          result = await this.runDecayJob(job, toProcess, saveMemory);
          break;
        case 'consolidation':
          result = await this.runConsolidationJob(job, toProcess, saveMemory);
          break;
        case 'cleanup':
          result = await this.runCleanupJob(job, toProcess, deleteMemory);
          break;
        case 'preference_update':
          result = await this.runPreferenceUpdateJob(job, userId);
          break;
        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }

      result.startedAt = startedAt;
      this.lastResults.set(jobName, result);
      return result;
    } catch (error) {
      const errorResult: MaintenanceJobResult = {
        jobName,
        startedAt,
        completedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
        success: false,
        error: String(error),
        itemsProcessed: 0,
        itemsModified: 0,
      };
      this.lastResults.set(jobName, errorResult);
      return errorResult;
    } finally {
      this.running.delete(jobName);
    }
  }

  /**
   * Run decay job
   */
  private async runDecayJob(
    job: MaintenanceJobConfig,
    memories: StoredMemory[],
    saveMemory?: (memory: StoredMemory) => Promise<void>
  ): Promise<MaintenanceJobResult> {
    const result = await this.decayManager.applyDecay(memories);

    // Save updated memories
    let modified = 0;
    if (saveMemory) {
      for (const decayResult of result.results) {
        if (decayResult.decayAmount > 0.001) {
          const memory = memories.find((m) => m.id === decayResult.memoryId);
          if (memory) {
            memory.strength = decayResult.newStrength;
            await saveMemory(memory);
            modified++;
          }
        }
      }
    }

    return {
      jobName: job.name,
      startedAt: new Date(),
      completedAt: new Date(),
      durationMs: result.durationMs,
      success: true,
      itemsProcessed: result.processed,
      itemsModified: modified,
      details: {
        decayed: result.decayed,
        markedForCleanup: result.markedForCleanup,
      },
    };
  }

  /**
   * Run consolidation job
   */
  private async runConsolidationJob(
    job: MaintenanceJobConfig,
    memories: StoredMemory[],
    saveMemory?: (memory: StoredMemory) => Promise<void>
  ): Promise<MaintenanceJobResult> {
    const result = await this.consolidationManager.consolidateBatch(memories);

    // Save consolidated memories
    let saved = 0;
    if (saveMemory) {
      for (const consolidation of result.results) {
        if (consolidation.consolidated) {
          await saveMemory(consolidation.consolidated);
          saved++;
        }
      }
    }

    return {
      jobName: job.name,
      startedAt: new Date(),
      completedAt: new Date(),
      durationMs: result.durationMs,
      success: true,
      itemsProcessed: result.memoriesProcessed,
      itemsModified: saved,
      details: {
        groupsFound: result.groupsFound,
        groupsConsolidated: result.groupsConsolidated,
        memoriesConsolidated: result.memoriesConsolidated,
      },
    };
  }

  /**
   * Run cleanup job
   */
  private async runCleanupJob(
    job: MaintenanceJobConfig,
    memories: StoredMemory[],
    deleteMemory?: (memoryId: string) => Promise<void>
  ): Promise<MaintenanceJobResult> {
    const startTime = Date.now();
    const candidates = this.decayManager.getCleanupCandidates(memories);

    // Delete candidates
    let deleted = 0;
    if (deleteMemory) {
      for (const candidate of candidates) {
        await deleteMemory(candidate.memory.id);
        deleted++;
      }
    }

    return {
      jobName: job.name,
      startedAt: new Date(),
      completedAt: new Date(),
      durationMs: Date.now() - startTime,
      success: true,
      itemsProcessed: memories.length,
      itemsModified: deleted,
      details: {
        candidatesFound: candidates.length,
        deleted,
      },
    };
  }

  /**
   * Run preference update job
   */
  private async runPreferenceUpdateJob(
    job: MaintenanceJobConfig,
    userId: string
  ): Promise<MaintenanceJobResult> {
    const startTime = Date.now();

    // Prune old data
    const pruned = this.preferencePredictor.pruneOldData(userId);

    return {
      jobName: job.name,
      startedAt: new Date(),
      completedAt: new Date(),
      durationMs: Date.now() - startTime,
      success: true,
      itemsProcessed: 1,
      itemsModified: pruned,
      details: {
        dataPointsPruned: pruned,
      },
    };
  }

  /**
   * Get health statistics for a user
   */
  async getHealthStats(memories: StoredMemory[]): Promise<MemoryHealthStats> {
    const total = memories.length;
    let healthy = 0;
    let decaying = 0;
    let atRisk = 0;
    let protected_ = 0;
    let activeCommitments = 0;
    let totalStrength = 0;

    for (const memory of memories) {
      totalStrength += memory.strength;

      if (memory.strength > 0.5) {
        healthy++;
      } else if (memory.strength > 0.1) {
        decaying++;
      } else {
        atRisk++;
      }

      if (memory.isProtected) protected_++;
      if (memory.isActiveCommitment) activeCommitments++;
    }

    // Estimate consolidation candidates
    const reduction = this.consolidationManager.estimateReduction(memories);

    return {
      totalMemories: total,
      healthyMemories: healthy,
      decayingMemories: decaying,
      atRiskMemories: atRisk,
      protectedMemories: protected_,
      activeCommitments,
      averageStrength: total > 0 ? totalStrength / total : 0,
      consolidationCandidates: reduction.currentCount - reduction.estimatedCount,
      lastDecayRun: this.lastResults.get('daily-decay')?.completedAt,
      lastConsolidationRun: this.lastResults.get('weekly-consolidation')?.completedAt,
    };
  }

  /**
   * Get last result for a job
   */
  getLastResult(jobName: string): MaintenanceJobResult | undefined {
    return this.lastResults.get(jobName);
  }

  /**
   * Get all job configurations
   */
  getJobs(): MaintenanceJobConfig[] {
    return this.jobs;
  }

  /**
   * Enable or disable a job
   */
  setJobEnabled(jobName: string, enabled: boolean): void {
    const job = this.jobs.find((j) => j.name === jobName);
    if (job) {
      job.enabled = enabled;
      log.info({ jobName, enabled }, 'Job status updated');
    }
  }

  /**
   * Check if a job is running
   */
  isJobRunning(jobName: string): boolean {
    return this.running.has(jobName);
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let maintenanceInstance: ScheduledMaintenance | null = null;

export function getScheduledMaintenance(jobs?: MaintenanceJobConfig[]): ScheduledMaintenance {
  if (!maintenanceInstance) {
    maintenanceInstance = new ScheduledMaintenance(jobs);
  }
  return maintenanceInstance;
}

export function resetScheduledMaintenance(): void {
  maintenanceInstance = null;
}
