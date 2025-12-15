/**
 * Emotional Threading
 *
 * Tracks emotional continuity across sessions.
 * Ensures that emotional topics are followed up appropriately.
 *
 * Philosophy: When you reconnect with a friend after they shared something heavy,
 * you don't just start chatting about the weather. You acknowledge what they
 * were going through. This module tracks emotional threads so Ferni can do the same.
 *
 * @module memory/emotional-threading
 */

import { createLogger } from '../utils/safe-logger.js';
import type {
  IEmotionalThreading,
  EmotionalThread,
  SessionEmotionalContext,
} from './interfaces/index.js';

const log = createLogger({ module: 'EmotionalThreading' });

// ============================================================================
// CONFIGURATION
// ============================================================================

interface ThreadingConfig {
  /** Days before an unresolved thread becomes stale (default: 30) */
  staleThreadDays: number;
  /** Maximum threads to track per user (default: 10) */
  maxThreadsPerUser: number;
  /** Minimum intensity to create a thread (default: 0.4) */
  minIntensityForThread: number;
  /** Sessions to consider for trajectory (default: 5) */
  trajectorySessionCount: number;
}

const DEFAULT_CONFIG: ThreadingConfig = {
  staleThreadDays: 30,
  maxThreadsPerUser: 10,
  minIntensityForThread: 0.4,
  trajectorySessionCount: 5,
};

// ============================================================================
// EMOTIONAL THREADING IMPLEMENTATION
// ============================================================================

interface UserEmotionalData {
  threads: EmotionalThread[];
  sessionHistory: Array<{
    sessionId: string;
    timestamp: Date;
    dominantEmotion: string;
    endState: SessionEmotionalContext['lastSessionEndState'];
    intensity: number;
  }>;
  lastSessionEndState: SessionEmotionalContext['lastSessionEndState'];
  lastSessionTimestamp: Date;
}

export class EmotionalThreading implements IEmotionalThreading {
  private config: ThreadingConfig;
  private userData = new Map<string, UserEmotionalData>();

  constructor(config?: Partial<ThreadingConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Record session end state and any unresolved emotions
   */
  async recordSessionEnd(context: {
    userId: string;
    sessionId: string;
    dominantEmotion: string;
    endState: SessionEmotionalContext['lastSessionEndState'];
    unresolvedTopics: string[];
    intensity?: number;
  }): Promise<void> {
    const {
      userId,
      sessionId,
      dominantEmotion,
      endState,
      unresolvedTopics,
      intensity = 0.5,
    } = context;

    const data = this.getOrCreateUserData(userId);
    const now = new Date();

    // Record session in history
    data.sessionHistory.push({
      sessionId,
      timestamp: now,
      dominantEmotion,
      endState,
      intensity,
    });

    // Trim history
    if (data.sessionHistory.length > this.config.trajectorySessionCount * 2) {
      data.sessionHistory = data.sessionHistory.slice(-this.config.trajectorySessionCount * 2);
    }

    // Update session end state
    data.lastSessionEndState = endState;
    data.lastSessionTimestamp = now;

    // Create or update threads for unresolved topics
    if (endState === 'unresolved' || endState === 'heavy') {
      for (const topic of unresolvedTopics) {
        await this.createOrUpdateThread(userId, {
          emotion: dominantEmotion,
          topic,
          intensity,
          status: 'unresolved',
        });
      }
    }

    // Mark existing threads as potentially resolved if session ended positively
    if (endState === 'positive' || endState === 'hopeful') {
      for (const thread of data.threads) {
        if (thread.status === 'processing') {
          // If they mentioned this topic and ended positively, maybe it's resolving
          if (unresolvedTopics.some((t) => t.includes(thread.topic) || thread.topic.includes(t))) {
            thread.progressNotes.push(`Session ended positively while discussing ${thread.topic}`);
          }
        }
      }
    }

    this.userData.set(userId, data);
    log.debug({ userId, endState, threads: data.threads.length }, 'Recorded session end');
  }

  /**
   * Get session emotional context for a user
   */
  async getSessionContext(userId: string): Promise<SessionEmotionalContext> {
    const data = this.userData.get(userId);

    if (!data) {
      return this.getDefaultContext();
    }

    // Calculate trajectory
    const trajectory = this.calculateTrajectory(data.sessionHistory);

    // Get active threads (not stale, not resolved)
    const activeThreads = this.getActiveThreads(data.threads);

    // Determine suggested approach
    const suggestedApproach = this.determineSuggestedApproach(
      data.lastSessionEndState,
      activeThreads,
      trajectory
    );

    return {
      lastSessionEndState: data.lastSessionEndState,
      activeThreads,
      recentTrajectory: trajectory,
      suggestedApproach,
    };
  }

  /**
   * Update a thread's status or add progress notes
   */
  async updateThread(
    userId: string,
    threadId: string,
    update: Partial<EmotionalThread>
  ): Promise<void> {
    const data = this.userData.get(userId);
    if (!data) return;

    const thread = data.threads.find((t) => t.id === threadId);
    if (!thread) return;

    Object.assign(thread, update);
    thread.lastMentioned = new Date();

    this.userData.set(userId, data);
    log.debug({ userId, threadId, status: thread.status }, 'Updated emotional thread');
  }

  /**
   * Mark a thread as resolved
   */
  async resolveThread(userId: string, threadId: string, resolution: string): Promise<void> {
    const data = this.userData.get(userId);
    if (!data) return;

    const thread = data.threads.find((t) => t.id === threadId);
    if (!thread) return;

    thread.status = 'resolved';
    thread.progressNotes.push(`Resolved: ${resolution}`);

    this.userData.set(userId, data);
    log.info({ userId, threadId, resolution }, 'Resolved emotional thread');
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Get or create user data
   */
  private getOrCreateUserData(userId: string): UserEmotionalData {
    if (!this.userData.has(userId)) {
      this.userData.set(userId, {
        threads: [],
        sessionHistory: [],
        lastSessionEndState: 'neutral',
        lastSessionTimestamp: new Date(),
      });
    }
    return this.userData.get(userId)!;
  }

  /**
   * Create or update an emotional thread
   */
  private async createOrUpdateThread(
    userId: string,
    context: {
      emotion: string;
      topic: string;
      intensity: number;
      status: EmotionalThread['status'];
    }
  ): Promise<void> {
    const data = this.getOrCreateUserData(userId);
    const now = new Date();

    // Check if thread exists for this topic
    const existingThread = data.threads.find(
      (t) => t.topic.toLowerCase() === context.topic.toLowerCase() && t.status !== 'resolved'
    );

    if (existingThread) {
      // Update existing thread
      existingThread.lastMentioned = now;
      existingThread.sessionCount++;
      existingThread.intensity = Math.max(existingThread.intensity, context.intensity);
      if (context.status === 'unresolved' && existingThread.status === 'processing') {
        // It was processing but came back unresolved
        existingThread.progressNotes.push('Topic resurfaced as unresolved');
      }
    } else if (context.intensity >= this.config.minIntensityForThread) {
      // Create new thread
      const newThread: EmotionalThread = {
        id: `thread_${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        emotion: context.emotion,
        topic: context.topic,
        intensity: context.intensity,
        status: context.status,
        firstMentioned: now,
        lastMentioned: now,
        sessionCount: 1,
        progressNotes: [],
      };
      data.threads.push(newThread);

      // Trim if too many threads
      if (data.threads.length > this.config.maxThreadsPerUser) {
        // Remove oldest resolved threads first
        const resolved = data.threads.filter((t) => t.status === 'resolved');
        if (resolved.length > 0) {
          resolved.sort((a, b) => a.lastMentioned.getTime() - b.lastMentioned.getTime());
          data.threads = data.threads.filter((t) => t.id !== resolved[0].id);
        }
      }
    }

    this.userData.set(userId, data);
  }

  /**
   * Get active (non-stale, non-resolved) threads
   */
  private getActiveThreads(threads: EmotionalThread[]): EmotionalThread[] {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.staleThreadDays);

    return threads.filter((t) => t.status !== 'resolved' && t.lastMentioned >= cutoffDate);
  }

  /**
   * Calculate emotional trajectory from session history
   */
  private calculateTrajectory(
    history: UserEmotionalData['sessionHistory']
  ): SessionEmotionalContext['recentTrajectory'] {
    if (history.length < 2) {
      return 'stable';
    }

    const recent = history.slice(-this.config.trajectorySessionCount);

    // Score each session (positive = 1, hopeful = 0.5, neutral = 0, heavy = -0.5, unresolved = -0.5)
    const scores: number[] = recent.map((s) => {
      switch (s.endState) {
        case 'positive':
          return 1;
        case 'hopeful':
          return 0.5;
        case 'neutral':
          return 0;
        case 'heavy':
          return -0.5;
        case 'unresolved':
          return -0.5;
        default:
          return 0;
      }
    });

    // Calculate trend
    let trend = 0;
    for (let i = 1; i < scores.length; i++) {
      trend += scores[i] - scores[i - 1];
    }
    trend /= scores.length - 1;

    // Check for volatility
    const variance = scores.reduce((sum, s) => sum + Math.pow(s - trend, 2), 0) / scores.length;
    if (variance > 0.5) {
      return 'volatile';
    }

    if (trend > 0.2) return 'improving';
    if (trend < -0.2) return 'declining';
    return 'stable';
  }

  /**
   * Determine suggested approach based on context
   */
  private determineSuggestedApproach(
    lastEndState: SessionEmotionalContext['lastSessionEndState'],
    activeThreads: EmotionalThread[],
    trajectory: SessionEmotionalContext['recentTrajectory']
  ): SessionEmotionalContext['suggestedApproach'] {
    // Determine opening tone
    let openingTone: SessionEmotionalContext['suggestedApproach']['openingTone'] = 'warm';
    if (lastEndState === 'heavy') {
      openingTone = 'gentle';
    } else if (lastEndState === 'positive') {
      openingTone = 'energetic';
    } else if (lastEndState === 'unresolved') {
      openingTone = 'calm';
    }

    // Determine check-in priority
    let checkInPriority: SessionEmotionalContext['suggestedApproach']['checkInPriority'] =
      'connection';
    if (activeThreads.length > 0) {
      const heavyThreads = activeThreads.filter((t) => t.intensity > 0.6);
      if (heavyThreads.length > 0) {
        checkInPriority = 'emotional';
      }
    }
    if (trajectory === 'declining') {
      checkInPriority = 'emotional';
    }

    // Things to avoid
    const thingsToAvoid: string[] = [];
    if (lastEndState === 'heavy') {
      thingsToAvoid.push("Don't start with anything too upbeat");
    }
    if (trajectory === 'volatile') {
      thingsToAvoid.push('Avoid assumptions about their current state');
    }

    // Find thread to address
    let threadToAddress: EmotionalThread | null = null;
    if (activeThreads.length > 0) {
      // Prioritize by intensity and recency
      const sortedThreads = [...activeThreads].sort((a, b) => {
        const aScore = a.intensity + (a.status === 'unresolved' ? 0.3 : 0);
        const bScore = b.intensity + (b.status === 'unresolved' ? 0.3 : 0);
        return bScore - aScore;
      });
      threadToAddress = sortedThreads[0];
    }

    return {
      openingTone,
      checkInPriority,
      thingsToAvoid,
      threadToAddress,
    };
  }

  /**
   * Get default context for new users
   */
  private getDefaultContext(): SessionEmotionalContext {
    return {
      lastSessionEndState: 'neutral',
      activeThreads: [],
      recentTrajectory: 'stable',
      suggestedApproach: {
        openingTone: 'warm',
        checkInPriority: 'connection',
        thingsToAvoid: [],
        threadToAddress: null,
      },
    };
  }

  // ============================================================================
  // IMPORT/EXPORT
  // ============================================================================

  export(): Array<[string, UserEmotionalData]> {
    return Array.from(this.userData.entries());
  }

  import(data: Array<[string, UserEmotionalData]>): void {
    this.userData = new Map(data);
  }

  /**
   * Get stats for a user
   */
  getStats(userId: string): {
    activeThreads: number;
    resolvedThreads: number;
    sessionCount: number;
    trajectory: SessionEmotionalContext['recentTrajectory'];
  } {
    const data = this.userData.get(userId);
    if (!data) {
      return {
        activeThreads: 0,
        resolvedThreads: 0,
        sessionCount: 0,
        trajectory: 'stable',
      };
    }

    return {
      activeThreads: data.threads.filter((t) => t.status !== 'resolved').length,
      resolvedThreads: data.threads.filter((t) => t.status === 'resolved').length,
      sessionCount: data.sessionHistory.length,
      trajectory: this.calculateTrajectory(data.sessionHistory),
    };
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let defaultThreading: EmotionalThreading | null = null;

export function getEmotionalThreading(): EmotionalThreading {
  if (!defaultThreading) {
    defaultThreading = new EmotionalThreading();
  }
  return defaultThreading;
}

export function resetEmotionalThreading(): void {
  defaultThreading = null;
}

export default {
  EmotionalThreading,
  getEmotionalThreading,
  resetEmotionalThreading,
};
