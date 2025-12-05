/**
 * Cross-Session Threader
 *
 * Tracks conversation threads that span multiple sessions.
 * Jack remembers unfinished discussions and can naturally continue them.
 *
 * Example: "Last time you were telling me about your mother's health
 * situation - we got cut off. Want to continue that conversation?"
 *
 * Features:
 * - Open thread detection (unfinished topics)
 * - Interrupted conversation tracking
 * - Topic continuity suggestions
 * - Follow-up question tracking
 * - Story/advice that was promised but not delivered
 */

import { log } from '@livekit/agents';
import { getLogger } from '../utils/safe-logger.js';
import type { ConversationSummary, KeyMoment } from '../types/user-profile.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Why a thread is still open
 */
export type ThreadOpenReason =
  | 'interrupted' // Call dropped or user had to go
  | 'time_constraint' // User ran out of time
  | 'topic_shifted' // Discussion moved to something else
  | 'promised_followup' // Jack promised to continue this
  | 'user_requested' // User asked to discuss later
  | 'incomplete_advice' // Advice was started but not finished
  | 'emotional_pause' // Heavy topic that needed a break
  | 'unanswered_question'; // User asked but didn't get full answer

/**
 * Priority for resuming a thread
 */
export type ThreadPriority = 'high' | 'medium' | 'low';

/**
 * An open conversation thread
 */
export interface OpenThread {
  id: string;
  createdAt: Date;
  lastUpdatedAt: Date;

  // What it's about
  topic: string;
  subtopics: string[];
  summary: string;

  // Why it's open
  reason: ThreadOpenReason;
  reasonDetail?: string;

  // Context
  lastUserMessage?: string;
  lastJackMessage?: string;
  emotionalWeight: 'light' | 'medium' | 'heavy';

  // Priority
  priority: ThreadPriority;

  // Follow-up details
  suggestedResumption: string; // What Jack should say to resume
  questionsToAnswer: string[]; // Unanswered user questions
  promisedContent: string[]; // Things Jack said he'd cover

  // State
  status: 'open' | 'resumed' | 'closed' | 'abandoned';
  sessionIdCreated: string;
  sessionIdResumed?: string;

  // Metadata
  conversationTurnCount: number; // How many turns on this topic
  relatedGoalIds: string[];
  relatedKeyMomentIds: string[];
}

/**
 * A promised follow-up
 */
export interface PromisedFollowUp {
  id: string;
  createdAt: Date;

  // What was promised
  type: 'story' | 'advice' | 'calculation' | 'research' | 'check_in' | 'other';
  description: string;
  context: string;

  // When
  targetTimeframe?: string; // "next time", "tomorrow", "next week"

  // State
  delivered: boolean;
  deliveredAt?: Date;
}

/**
 * Session ending context for thread detection
 */
export interface SessionEndContext {
  endedNaturally: boolean;
  lastTopic: string;
  topicsDiscussed: string[];
  openQuestions: string[];
  emotionalState: string;
  userRequestedFollowUp: boolean;
  jackPromisedFollowUp: boolean;
  durationMinutes: number;
}

// ============================================================================
// CROSS-SESSION THREADER
// ============================================================================

export class CrossSessionThreader {
  private userId: string;
  private openThreads: OpenThread[] = [];
  private promisedFollowUps: PromisedFollowUp[] = [];
  private currentSessionId: string | null = null;

  constructor(
    userId: string,
    existingThreads?: OpenThread[],
    existingFollowUps?: PromisedFollowUp[]
  ) {
    this.userId = userId;
    if (existingThreads) {
      this.openThreads = existingThreads;
    }
    if (existingFollowUps) {
      this.promisedFollowUps = existingFollowUps;
    }
  }

  /**
   * Set the current session ID
   */
  setCurrentSession(sessionId: string): void {
    this.currentSessionId = sessionId;
  }

  // ============================================================================
  // THREAD DETECTION
  // ============================================================================

  /**
   * Detect open threads when a session ends
   */
  detectOpenThreads(endContext: SessionEndContext): OpenThread[] {
    const newThreads: OpenThread[] = [];

    // 1. Check for interrupted conversation
    if (!endContext.endedNaturally && endContext.lastTopic) {
      const thread = this.createThread({
        topic: endContext.lastTopic,
        reason: 'interrupted',
        reasonDetail: 'Conversation ended unexpectedly',
        emotionalWeight: this.inferEmotionalWeight(endContext.emotionalState),
        priority: 'high',
        summary: `Discussing ${endContext.lastTopic} when connection ended`,
      });
      newThreads.push(thread);
    }

    // 2. Check for time constraints
    if (endContext.durationMinutes < 5 && endContext.topicsDiscussed.length > 0) {
      const thread = this.createThread({
        topic: endContext.topicsDiscussed[0],
        reason: 'time_constraint',
        reasonDetail: 'Very short conversation',
        emotionalWeight: 'light',
        priority: 'medium',
        summary: `Brief discussion about ${endContext.topicsDiscussed[0]}`,
      });
      newThreads.push(thread);
    }

    // 3. Check for unanswered questions
    if (endContext.openQuestions.length > 0) {
      for (const question of endContext.openQuestions.slice(0, 3)) {
        const thread = this.createThread({
          topic: this.extractTopicFromQuestion(question),
          reason: 'unanswered_question',
          reasonDetail: question,
          emotionalWeight: 'light',
          priority: 'medium',
          summary: `Question about: ${question.slice(0, 50)}...`,
          questionsToAnswer: [question],
        });
        newThreads.push(thread);
      }
    }

    // 4. Check for emotional topics that need follow-up
    if (
      endContext.emotionalState === 'distressed' ||
      endContext.emotionalState === 'anxious' ||
      endContext.emotionalState === 'sad'
    ) {
      const thread = this.createThread({
        topic: endContext.lastTopic || 'emotional support',
        reason: 'emotional_pause',
        reasonDetail: `User was ${endContext.emotionalState}`,
        emotionalWeight: 'heavy',
        priority: 'high',
        summary: `Important emotional discussion about ${endContext.lastTopic || 'personal matters'}`,
      });
      newThreads.push(thread);
    }

    // 5. Check for promised follow-ups
    if (endContext.jackPromisedFollowUp || endContext.userRequestedFollowUp) {
      const thread = this.createThread({
        topic: endContext.lastTopic || 'follow-up',
        reason: endContext.jackPromisedFollowUp ? 'promised_followup' : 'user_requested',
        emotionalWeight: 'medium',
        priority: 'medium',
        summary: 'Follow-up was requested or promised',
      });
      newThreads.push(thread);
    }

    // Add new threads
    for (const thread of newThreads) {
      this.openThreads.push(thread);
    }

    // Keep only last 20 open threads
    this.openThreads = this.openThreads.filter((t) => t.status === 'open').slice(-20);

    getLogger().info(
      {
        newThreads: newThreads.length,
        totalOpen: this.openThreads.filter((t) => t.status === 'open').length,
      },
      'Open threads detected'
    );

    return newThreads;
  }

  /**
   * Create a thread record
   */
  private createThread(params: {
    topic: string;
    reason: ThreadOpenReason;
    reasonDetail?: string;
    emotionalWeight: OpenThread['emotionalWeight'];
    priority: ThreadPriority;
    summary: string;
    questionsToAnswer?: string[];
    promisedContent?: string[];
  }): OpenThread {
    const suggestedResumption = this.generateResumptionMessage(params.topic, params.reason);

    return {
      id: `thread_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date(),
      lastUpdatedAt: new Date(),

      topic: params.topic,
      subtopics: [],
      summary: params.summary,

      reason: params.reason,
      reasonDetail: params.reasonDetail,
      emotionalWeight: params.emotionalWeight,

      priority: params.priority,

      suggestedResumption,
      questionsToAnswer: params.questionsToAnswer || [],
      promisedContent: params.promisedContent || [],

      status: 'open',
      sessionIdCreated: this.currentSessionId || 'unknown',

      conversationTurnCount: 0,
      relatedGoalIds: [],
      relatedKeyMomentIds: [],
    };
  }

  /**
   * Generate a natural message to resume a thread
   */
  private generateResumptionMessage(topic: string, reason: ThreadOpenReason): string {
    switch (reason) {
      case 'interrupted':
        return `Last time, we were in the middle of talking about ${topic} when we got cut off. Want to pick up where we left off?`;

      case 'time_constraint':
        return `I know we were rushed last time. You mentioned ${topic} - did you want to dig into that more?`;

      case 'unanswered_question':
        return `You asked me something about ${topic} last time that I don't think I fully answered. Let me address that.`;

      case 'emotional_pause':
        return `I've been thinking about what you shared last time about ${topic}. How are you feeling about that now?`;

      case 'promised_followup':
        return `I mentioned I'd follow up on ${topic} - let me do that now.`;

      case 'user_requested':
        return `You wanted to continue our discussion about ${topic}. I'm all ears.`;

      case 'incomplete_advice':
        return `I started to give you some thoughts on ${topic} but didn't finish. Let me continue.`;

      case 'topic_shifted':
        return `Before we moved on last time, we were discussing ${topic}. Did you want to go back to that?`;

      default:
        return `I remember we were discussing ${topic}. Want to continue that conversation?`;
    }
  }

  /**
   * Infer emotional weight from state
   */
  private inferEmotionalWeight(emotionalState: string): OpenThread['emotionalWeight'] {
    const heavy = ['distressed', 'anxious', 'sad', 'grief', 'angry', 'scared'];
    const medium = ['concerned', 'worried', 'frustrated', 'uncertain', 'confused'];

    if (heavy.includes(emotionalState.toLowerCase())) return 'heavy';
    if (medium.includes(emotionalState.toLowerCase())) return 'medium';
    return 'light';
  }

  /**
   * Extract topic from a question
   */
  private extractTopicFromQuestion(question: string): string {
    // Simple extraction - take key nouns
    const cleaned = question
      .toLowerCase()
      .replace(/^(what|how|why|when|where|can|should|is|are|do|does)\s+/i, '')
      .replace(/\?$/, '')
      .trim();

    // Take first meaningful phrase
    const words = cleaned.split(' ').slice(0, 5);
    return words.join(' ');
  }

  // ============================================================================
  // THREAD MANAGEMENT
  // ============================================================================

  /**
   * Get open threads sorted by priority
   */
  getOpenThreads(): OpenThread[] {
    const priorityOrder = { high: 0, medium: 1, low: 2 };

    return this.openThreads
      .filter((t) => t.status === 'open')
      .sort((a, b) => {
        // First by priority
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;

        // Then by emotional weight
        const weightOrder = { heavy: 0, medium: 1, light: 2 };
        return weightOrder[a.emotionalWeight] - weightOrder[b.emotionalWeight];
      });
  }

  /**
   * Get the most important thread to resume
   */
  getTopThread(): OpenThread | null {
    const open = this.getOpenThreads();
    return open[0] || null;
  }

  /**
   * Mark a thread as resumed
   */
  resumeThread(threadId: string): void {
    const thread = this.openThreads.find((t) => t.id === threadId);
    if (thread) {
      thread.status = 'resumed';
      thread.sessionIdResumed = this.currentSessionId || undefined;
      thread.lastUpdatedAt = new Date();

      getLogger().info({ threadId, topic: thread.topic }, 'Thread resumed');
    }
  }

  /**
   * Mark a thread as closed
   */
  closeThread(threadId: string): void {
    const thread = this.openThreads.find((t) => t.id === threadId);
    if (thread) {
      thread.status = 'closed';
      thread.lastUpdatedAt = new Date();

      getLogger().info({ threadId, topic: thread.topic }, 'Thread closed');
    }
  }

  /**
   * Add a promised follow-up
   */
  addPromisedFollowUp(
    type: PromisedFollowUp['type'],
    description: string,
    context: string,
    targetTimeframe?: string
  ): PromisedFollowUp {
    const followUp: PromisedFollowUp = {
      id: `followup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date(),
      type,
      description,
      context,
      targetTimeframe,
      delivered: false,
    };

    this.promisedFollowUps.push(followUp);

    // Keep only last 20 follow-ups
    if (this.promisedFollowUps.length > 20) {
      this.promisedFollowUps = this.promisedFollowUps.slice(-20);
    }

    getLogger().info(
      { type, description: description.slice(0, 50) },
      'Promised follow-up recorded'
    );

    return followUp;
  }

  /**
   * Mark a follow-up as delivered
   */
  markFollowUpDelivered(followUpId: string): void {
    const followUp = this.promisedFollowUps.find((f) => f.id === followUpId);
    if (followUp) {
      followUp.delivered = true;
      followUp.deliveredAt = new Date();
    }
  }

  /**
   * Get undelivered follow-ups
   */
  getUndeliveredFollowUps(): PromisedFollowUp[] {
    return this.promisedFollowUps.filter((f) => !f.delivered);
  }

  // ============================================================================
  // CONTEXT GENERATION
  // ============================================================================

  /**
   * Get thread context for prompt injection
   */
  getThreadContext(): string {
    const openThreads = this.getOpenThreads();
    const pendingFollowUps = this.getUndeliveredFollowUps();

    if (openThreads.length === 0 && pendingFollowUps.length === 0) {
      return '';
    }

    const lines: string[] = [];

    // Open threads
    if (openThreads.length > 0) {
      const top = openThreads[0];
      lines.push(`📌 OPEN THREAD: ${top.topic}`);
      lines.push(`   Reason: ${top.reason.replace('_', ' ')}`);
      lines.push(`   Suggested: "${top.suggestedResumption}"`);

      if (openThreads.length > 1) {
        lines.push(`   (${openThreads.length - 1} more open threads)`);
      }
    }

    // Pending follow-ups
    if (pendingFollowUps.length > 0) {
      const top = pendingFollowUps[0];
      lines.push(`📝 PROMISED: ${top.type} - ${top.description.slice(0, 50)}...`);
    }

    return `[CONVERSATION THREADS]\n${lines.join('\n')}`;
  }

  /**
   * Get a natural conversation starter if there are open threads
   */
  getConversationStarter(): string | null {
    const topThread = this.getTopThread();
    if (topThread) {
      return topThread.suggestedResumption;
    }

    const pendingFollowUp = this.getUndeliveredFollowUps()[0];
    if (pendingFollowUp) {
      return `I wanted to follow up on something - ${pendingFollowUp.description}`;
    }

    return null;
  }

  // ============================================================================
  // DATA ACCESS
  // ============================================================================

  /**
   * Get all data for persistence
   */
  getAllData(): { threads: OpenThread[]; followUps: PromisedFollowUp[] } {
    return {
      threads: [...this.openThreads],
      followUps: [...this.promisedFollowUps],
    };
  }

  /**
   * Get stats
   */
  getStats(): {
    openThreads: number;
    resumedThreads: number;
    closedThreads: number;
    pendingFollowUps: number;
    deliveredFollowUps: number;
  } {
    return {
      openThreads: this.openThreads.filter((t) => t.status === 'open').length,
      resumedThreads: this.openThreads.filter((t) => t.status === 'resumed').length,
      closedThreads: this.openThreads.filter((t) => t.status === 'closed').length,
      pendingFollowUps: this.promisedFollowUps.filter((f) => !f.delivered).length,
      deliveredFollowUps: this.promisedFollowUps.filter((f) => f.delivered).length,
    };
  }
}

// ============================================================================
// SINGLETON MANAGEMENT
// ============================================================================

const threaders = new Map<string, CrossSessionThreader>();

export function getCrossSessionThreader(
  userId: string,
  existingThreads?: OpenThread[],
  existingFollowUps?: PromisedFollowUp[]
): CrossSessionThreader {
  let threader = threaders.get(userId);
  if (!threader) {
    threader = new CrossSessionThreader(userId, existingThreads, existingFollowUps);
    threaders.set(userId, threader);
  }
  return threader;
}

export function removeCrossSessionThreader(userId: string): void {
  threaders.delete(userId);
}

export default CrossSessionThreader;
