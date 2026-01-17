/**
 * Proactive Surfacing Engine
 *
 * Determines WHEN and WHAT to surface to users based on:
 * - Timing Intelligence (right moment for right content)
 * - Context Awareness (what's happening in user's life)
 * - Relationship Dynamics (trust level, engagement patterns)
 *
 * Architecture:
 * ```
 * ┌────────────────────────────────────────────────────────────────┐
 * │                 Proactive Surfacing Engine                     │
 * │                                                                │
 * │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐ │
 * │  │     Timing       │  │    Content       │  │   Delivery   │ │
 * │  │   Intelligence   │  │   Selector       │  │   Strategy   │ │
 * │  │                  │  │                  │  │              │ │
 * │  │  - Optimal time  │  │  - Relevance     │  │  - Channel   │ │
 * │  │  - User state    │  │  - Priority      │  │  - Format    │ │
 * │  │  - Context cues  │  │  - Freshness     │  │  - Tone      │ │
 * │  └──────────────────┘  └──────────────────┘  └──────────────┘ │
 * │                                                                │
 * │  ┌──────────────────────────────────────────────────────────┐ │
 * │  │                  Surfacing Queue                          │ │
 * │  │                                                           │ │
 * │  │   [Memory] → [Insight] → [Reminder] → [Celebration]      │ │
 * │  └──────────────────────────────────────────────────────────┘ │
 * └────────────────────────────────────────────────────────────────┘
 * ```
 *
 * @module intelligence/surfacing/proactive-surfacing-engine
 */

import { createLogger } from '../../utils/safe-logger.js';
import { Firestore, FieldValue, Timestamp } from '@google-cloud/firestore';

const log = createLogger({ module: 'ProactiveSurfacing' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Content types that can be surfaced
 */
export type SurfaceContentType =
  | 'memory'
  | 'insight'
  | 'reminder'
  | 'celebration'
  | 'check_in'
  | 'recommendation'
  | 'pattern_observation'
  | 'growth_update'
  | 'relationship_touchpoint';

/**
 * Delivery channels
 */
export type DeliveryChannel = 'voice' | 'notification' | 'in_conversation' | 'daily_summary';

/**
 * Surfacing priority levels
 */
export type SurfacingPriority = 'critical' | 'high' | 'medium' | 'low' | 'background';

/**
 * Content to be surfaced
 */
export interface SurfaceContent {
  id: string;
  userId: string;
  type: SurfaceContentType;
  /** Main content to surface */
  content: string;
  /** Why this is being surfaced */
  reason: string;
  /** Related entity IDs */
  relatedEntities?: string[];
  /** Source of this content */
  source: {
    type: 'memory' | 'prediction' | 'pattern' | 'schedule' | 'milestone';
    id: string;
  };
  /** Delivery preferences */
  delivery: {
    channels: DeliveryChannel[];
    preferredChannel: DeliveryChannel;
    tone: 'warm' | 'celebratory' | 'gentle' | 'direct' | 'curious';
  };
  /** Priority */
  priority: SurfacingPriority;
  /** Timing constraints */
  timing: {
    /** Earliest time to surface */
    notBefore?: Date;
    /** Latest time to surface (expires after) */
    notAfter?: Date;
    /** Optimal time windows */
    optimalWindows?: Array<{
      startHour: number;
      endHour: number;
      days?: number[]; // 0=Sunday, 6=Saturday
    }>;
  };
  /** Created timestamp */
  createdAt: Date;
  /** Status */
  status: 'pending' | 'scheduled' | 'delivered' | 'skipped' | 'expired';
  /** When this was delivered */
  deliveredAt?: Date;
  /** User response/engagement */
  engagement?: {
    responded: boolean;
    responseType?: 'positive' | 'neutral' | 'dismissive';
    responseAt?: Date;
  };
}

/**
 * Timing intelligence result
 */
export interface TimingDecision {
  shouldSurfaceNow: boolean;
  optimalTime?: Date;
  reason: string;
  confidence: number;
  factors: {
    userAvailability: number; // 0-1
    contextRelevance: number; // 0-1
    urgency: number; // 0-1
    recentSurfacing: number; // 0-1 (lower = more recent surfacing)
  };
}

/**
 * User surfacing preferences
 */
export interface SurfacingPreferences {
  userId: string;
  /** Enable proactive surfacing */
  enabled: boolean;
  /** Quiet hours (no surfacing) */
  quietHours: {
    start: number; // Hour (0-23)
    end: number;
  };
  /** Preferred channels by content type */
  channelPreferences: Partial<Record<SurfaceContentType, DeliveryChannel>>;
  /** Maximum surfacings per day */
  maxPerDay: number;
  /** Types to exclude */
  excludeTypes: SurfaceContentType[];
  /** Updated at */
  updatedAt: Date;
}

// ============================================================================
// TIMING INTELLIGENCE
// ============================================================================

/**
 * Timing Intelligence Engine
 * Determines the optimal moment to surface content
 */
export class TimingIntelligence {
  private firestore: Firestore;

  constructor(firestore: Firestore) {
    this.firestore = firestore;
  }

  /**
   * Evaluate if now is a good time to surface content
   */
  async evaluateTiming(
    userId: string,
    content: SurfaceContent,
    preferences: SurfacingPreferences
  ): Promise<TimingDecision> {
    const now = new Date();
    const currentHour = now.getHours();

    // Check quiet hours
    if (this.isQuietHour(currentHour, preferences.quietHours)) {
      return {
        shouldSurfaceNow: false,
        optimalTime: this.getNextAvailableTime(now, preferences),
        reason: 'Currently in quiet hours',
        confidence: 1.0,
        factors: {
          userAvailability: 0,
          contextRelevance: 0.5,
          urgency: this.calculateUrgency(content),
          recentSurfacing: 0.5,
        },
      };
    }

    // Check optimal windows
    const inOptimalWindow = this.isInOptimalWindow(now, content.timing.optimalWindows);

    // Check recent surfacing
    const recentSurfacings = await this.getRecentSurfacings(userId);
    const recentSurfacingFactor = this.calculateRecentSurfacingFactor(recentSurfacings, preferences);

    // Check user engagement patterns
    const userAvailability = await this.estimateUserAvailability(userId, currentHour);

    // Calculate urgency
    const urgency = this.calculateUrgency(content);

    // Calculate context relevance
    const contextRelevance = await this.calculateContextRelevance(userId, content);

    // Make decision
    const factors = {
      userAvailability,
      contextRelevance,
      urgency,
      recentSurfacing: recentSurfacingFactor,
    };

    const overallScore =
      factors.userAvailability * 0.3 +
      factors.contextRelevance * 0.25 +
      factors.urgency * 0.25 +
      factors.recentSurfacing * 0.2;

    // Threshold decision
    const threshold = content.priority === 'critical' ? 0.3 : content.priority === 'high' ? 0.4 : 0.5;
    const shouldSurfaceNow = overallScore >= threshold && (inOptimalWindow || urgency > 0.7);

    return {
      shouldSurfaceNow,
      optimalTime: shouldSurfaceNow ? undefined : this.findOptimalTime(now, content, factors),
      reason: this.generateReason(factors, shouldSurfaceNow, inOptimalWindow),
      confidence: Math.min(overallScore + 0.2, 1),
      factors,
    };
  }

  /**
   * Check if current hour is in quiet hours
   */
  private isQuietHour(hour: number, quietHours: { start: number; end: number }): boolean {
    const { start, end } = quietHours;
    if (start <= end) {
      return hour >= start && hour < end;
    }
    // Handles overnight quiet hours (e.g., 22:00 - 07:00)
    return hour >= start || hour < end;
  }

  /**
   * Check if current time is in an optimal window
   */
  private isInOptimalWindow(
    now: Date,
    windows?: Array<{ startHour: number; endHour: number; days?: number[] }>
  ): boolean {
    if (!windows || windows.length === 0) return true;

    const currentHour = now.getHours();
    const currentDay = now.getDay();

    for (const window of windows) {
      const hourMatch = currentHour >= window.startHour && currentHour < window.endHour;
      const dayMatch = !window.days || window.days.includes(currentDay);
      if (hourMatch && dayMatch) return true;
    }

    return false;
  }

  /**
   * Get next available time after quiet hours
   */
  private getNextAvailableTime(now: Date, preferences: SurfacingPreferences): Date {
    const next = new Date(now);
    next.setHours(preferences.quietHours.end, 0, 0, 0);
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }
    return next;
  }

  /**
   * Get recent surfacings for a user
   */
  private async getRecentSurfacings(userId: string): Promise<SurfaceContent[]> {
    const snapshot = await this.firestore
      .collection('users')
      .doc(userId)
      .collection('surfaced_content')
      .where('status', '==', 'delivered')
      .where('deliveredAt', '>', Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000)))
      .orderBy('deliveredAt', 'desc')
      .limit(10)
      .get();

    return snapshot.docs.map((doc) => doc.data() as SurfaceContent);
  }

  /**
   * Calculate factor based on recent surfacings
   */
  private calculateRecentSurfacingFactor(
    recentSurfacings: SurfaceContent[],
    preferences: SurfacingPreferences
  ): number {
    const count = recentSurfacings.length;
    const maxAllowed = preferences.maxPerDay;

    if (count >= maxAllowed) return 0;
    if (count === 0) return 1;

    // Check time since last surfacing
    const lastSurfacing = recentSurfacings[0];
    if (lastSurfacing.deliveredAt) {
      const hoursSinceLastSurfacing = 
        (Date.now() - new Date(lastSurfacing.deliveredAt).getTime()) / (60 * 60 * 1000);
      
      // Want at least 2 hours between surfacings
      if (hoursSinceLastSurfacing < 2) return 0.2;
    }

    return 1 - count / maxAllowed;
  }

  /**
   * Estimate user availability at current hour
   */
  private async estimateUserAvailability(userId: string, hour: number): Promise<number> {
    // Get historical engagement at this hour
    const snapshot = await this.firestore
      .collection('users')
      .doc(userId)
      .collection('conversations')
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    if (snapshot.empty) return 0.5;

    // Count conversations at similar hours
    let matchingHours = 0;
    for (const doc of snapshot.docs) {
      const createdAt = doc.data().createdAt?.toDate?.();
      if (createdAt) {
        const convHour = createdAt.getHours();
        if (Math.abs(convHour - hour) <= 1) matchingHours++;
      }
    }

    return Math.min(matchingHours / 20, 1);
  }

  /**
   * Calculate urgency based on content
   */
  private calculateUrgency(content: SurfaceContent): number {
    // Priority-based base urgency
    const priorityUrgency: Record<SurfacingPriority, number> = {
      critical: 1.0,
      high: 0.8,
      medium: 0.5,
      low: 0.3,
      background: 0.1,
    };

    let urgency = priorityUrgency[content.priority];

    // Check timing constraints
    if (content.timing.notAfter) {
      const hoursUntilExpiry =
        (new Date(content.timing.notAfter).getTime() - Date.now()) / (60 * 60 * 1000);
      if (hoursUntilExpiry < 2) urgency = Math.min(urgency + 0.3, 1);
      else if (hoursUntilExpiry < 6) urgency = Math.min(urgency + 0.15, 1);
    }

    return urgency;
  }

  /**
   * Calculate context relevance
   */
  private async calculateContextRelevance(userId: string, content: SurfaceContent): Promise<number> {
    let relevance = 0.5;

    // Check if related entities were recently mentioned
    if (content.relatedEntities && content.relatedEntities.length > 0) {
      const recentConversation = await this.firestore
        .collection('users')
        .doc(userId)
        .collection('conversations')
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();

      if (!recentConversation.empty) {
        const conv = recentConversation.docs[0].data();
        const mentionedEntities = conv.mentionedEntities || [];
        
        const overlap = content.relatedEntities.filter((e) =>
          mentionedEntities.includes(e)
        ).length;
        
        if (overlap > 0) relevance += 0.3;
      }
    }

    // Type-based relevance adjustments
    if (content.type === 'celebration' || content.type === 'growth_update') {
      relevance += 0.1; // Always somewhat relevant
    }

    return Math.min(relevance, 1);
  }

  /**
   * Find optimal time to surface content
   */
  private findOptimalTime(
    now: Date,
    content: SurfaceContent,
    factors: TimingDecision['factors']
  ): Date {
    // Start with next hour
    const optimal = new Date(now);
    optimal.setMinutes(0, 0, 0);
    optimal.setHours(optimal.getHours() + 1);

    // If we have optimal windows, find next one
    if (content.timing.optimalWindows && content.timing.optimalWindows.length > 0) {
      for (const window of content.timing.optimalWindows) {
        const windowTime = new Date(now);
        windowTime.setHours(window.startHour, 0, 0, 0);
        
        if (windowTime > now) {
          return windowTime;
        }
        
        // Try tomorrow
        windowTime.setDate(windowTime.getDate() + 1);
        if (!content.timing.notAfter || windowTime < new Date(content.timing.notAfter)) {
          return windowTime;
        }
      }
    }

    return optimal;
  }

  /**
   * Generate human-readable reason for timing decision
   */
  private generateReason(
    factors: TimingDecision['factors'],
    shouldSurface: boolean,
    inOptimalWindow: boolean
  ): string {
    if (shouldSurface) {
      if (factors.urgency > 0.7) return 'High urgency content';
      if (inOptimalWindow && factors.userAvailability > 0.6) return 'Optimal time and user available';
      return 'Good overall conditions for surfacing';
    }

    if (factors.userAvailability < 0.3) return 'User typically less available at this time';
    if (factors.recentSurfacing < 0.3) return 'Too many recent surfacings';
    if (!inOptimalWindow) return 'Outside optimal time window';
    return 'Conditions not ideal for surfacing';
  }
}

// ============================================================================
// PROACTIVE SURFACING ENGINE
// ============================================================================

/**
 * Main engine for proactive content surfacing
 */
export class ProactiveSurfacingEngine {
  private firestore: Firestore;
  private timingIntelligence: TimingIntelligence;

  constructor(firestore?: Firestore) {
    this.firestore = firestore || new Firestore();
    this.timingIntelligence = new TimingIntelligence(this.firestore);
  }

  /**
   * Queue content for surfacing
   */
  async queueContent(content: Omit<SurfaceContent, 'id' | 'createdAt' | 'status'>): Promise<string> {
    const id = `surface_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fullContent: SurfaceContent = {
      ...content,
      id,
      createdAt: new Date(),
      status: 'pending',
    };

    await this.firestore
      .collection('users')
      .doc(content.userId)
      .collection('surfaced_content')
      .doc(id)
      .set({
        ...fullContent,
        createdAt: FieldValue.serverTimestamp(),
      });

    log.debug(
      { userId: content.userId, contentId: id, type: content.type },
      'Content queued for surfacing'
    );

    return id;
  }

  /**
   * Process the surfacing queue for a user
   */
  async processQueue(userId: string): Promise<SurfaceContent | null> {
    // Get user preferences
    const preferences = await this.getUserPreferences(userId);
    if (!preferences.enabled) return null;

    // Get pending content
    const pendingContent = await this.getPendingContent(userId);
    if (pendingContent.length === 0) return null;

    // Evaluate each content item
    for (const content of pendingContent) {
      // Skip excluded types
      if (preferences.excludeTypes.includes(content.type)) {
        continue;
      }

      // Check if expired
      if (content.timing.notAfter && new Date(content.timing.notAfter) < new Date()) {
        await this.updateContentStatus(userId, content.id, 'expired');
        continue;
      }

      // Check if not yet ready
      if (content.timing.notBefore && new Date(content.timing.notBefore) > new Date()) {
        continue;
      }

      // Evaluate timing
      const timingDecision = await this.timingIntelligence.evaluateTiming(
        userId,
        content,
        preferences
      );

      if (timingDecision.shouldSurfaceNow) {
        // Mark as delivered
        await this.markDelivered(userId, content.id);
        return content;
      }

      // Schedule for later if we have an optimal time
      if (timingDecision.optimalTime) {
        await this.scheduleContent(userId, content.id, timingDecision.optimalTime);
      }
    }

    return null;
  }

  /**
   * Get user surfacing preferences
   */
  async getUserPreferences(userId: string): Promise<SurfacingPreferences> {
    const doc = await this.firestore
      .collection('users')
      .doc(userId)
      .collection('settings')
      .doc('surfacing_preferences')
      .get();

    if (!doc.exists) {
      // Return defaults
      return {
        userId,
        enabled: true,
        quietHours: { start: 22, end: 7 },
        channelPreferences: {},
        maxPerDay: 5,
        excludeTypes: [],
        updatedAt: new Date(),
      };
    }

    return doc.data() as SurfacingPreferences;
  }

  /**
   * Get pending content for a user
   */
  private async getPendingContent(userId: string): Promise<SurfaceContent[]> {
    const snapshot = await this.firestore
      .collection('users')
      .doc(userId)
      .collection('surfaced_content')
      .where('status', 'in', ['pending', 'scheduled'])
      .orderBy('priority', 'desc')
      .limit(20)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        createdAt: data.createdAt?.toDate?.() || new Date(),
        timing: {
          ...data.timing,
          notBefore: data.timing?.notBefore?.toDate?.(),
          notAfter: data.timing?.notAfter?.toDate?.(),
        },
      } as SurfaceContent;
    });
  }

  /**
   * Update content status
   */
  private async updateContentStatus(
    userId: string,
    contentId: string,
    status: SurfaceContent['status']
  ): Promise<void> {
    await this.firestore
      .collection('users')
      .doc(userId)
      .collection('surfaced_content')
      .doc(contentId)
      .update({ status });
  }

  /**
   * Mark content as delivered
   */
  private async markDelivered(userId: string, contentId: string): Promise<void> {
    await this.firestore
      .collection('users')
      .doc(userId)
      .collection('surfaced_content')
      .doc(contentId)
      .update({
        status: 'delivered',
        deliveredAt: FieldValue.serverTimestamp(),
      });
  }

  /**
   * Schedule content for later
   */
  private async scheduleContent(userId: string, contentId: string, scheduledFor: Date): Promise<void> {
    await this.firestore
      .collection('users')
      .doc(userId)
      .collection('surfaced_content')
      .doc(contentId)
      .update({
        status: 'scheduled',
        'timing.notBefore': Timestamp.fromDate(scheduledFor),
      });
  }

  /**
   * Record user engagement with surfaced content
   */
  async recordEngagement(
    userId: string,
    contentId: string,
    responseType: 'positive' | 'neutral' | 'dismissive'
  ): Promise<void> {
    await this.firestore
      .collection('users')
      .doc(userId)
      .collection('surfaced_content')
      .doc(contentId)
      .update({
        engagement: {
          responded: true,
          responseType,
          responseAt: FieldValue.serverTimestamp(),
        },
      });
  }

  /**
   * Generate content suggestions from various sources
   */
  async generateSuggestions(userId: string): Promise<Array<Omit<SurfaceContent, 'id' | 'createdAt' | 'status'>>> {
    const suggestions: Array<Omit<SurfaceContent, 'id' | 'createdAt' | 'status'>> = [];

    try {
      // Get recent memories that could be surfaced
      const memoriesRef = this.firestore
        .collection('users')
        .doc(userId)
        .collection('memories')
        .where('significance', '>', 0.7)
        .orderBy('significance', 'desc')
        .limit(10);

      const memories = await memoriesRef.get();

      for (const memDoc of memories.docs) {
        const memory = memDoc.data();
        const daysSinceCreated =
          (Date.now() - (memory.createdAt?.toDate?.()?.getTime() || Date.now())) /
          (24 * 60 * 60 * 1000);

        // Surface anniversary memories
        if (daysSinceCreated >= 365 && daysSinceCreated <= 366) {
          suggestions.push({
            userId,
            type: 'memory',
            content: `One year ago: ${memory.summary || memory.content}`,
            reason: 'Anniversary of this memory',
            relatedEntities: memory.entities,
            source: { type: 'memory', id: memDoc.id },
            delivery: {
              channels: ['in_conversation', 'notification'],
              preferredChannel: 'in_conversation',
              tone: 'warm',
            },
            priority: 'medium',
            timing: {
              optimalWindows: [{ startHour: 9, endHour: 11 }, { startHour: 18, endHour: 20 }],
            },
          });
        }
      }

      // Check for upcoming relationship touchpoints
      const entitiesRef = this.firestore
        .collection('users')
        .doc(userId)
        .collection('unified_entities')
        .where('type', '==', 'person')
        .where('salience', '>', 0.5)
        .limit(20);

      const entities = await entitiesRef.get();

      for (const entityDoc of entities.docs) {
        const entity = entityDoc.data();
        const lastMentioned = entity.lastMentionedAt?.toDate?.();
        
        if (lastMentioned) {
          const daysSinceLastMention =
            (Date.now() - lastMentioned.getTime()) / (24 * 60 * 60 * 1000);

          // Suggest check-in for important people not mentioned recently
          if (daysSinceLastMention > 14 && entity.salience > 0.6) {
            suggestions.push({
              userId,
              type: 'relationship_touchpoint',
              content: `You haven't mentioned ${entity.canonicalName} in a while. How are things with them?`,
              reason: `${Math.floor(daysSinceLastMention)} days since last mention`,
              relatedEntities: [entityDoc.id],
              source: { type: 'pattern', id: entityDoc.id },
              delivery: {
                channels: ['in_conversation'],
                preferredChannel: 'in_conversation',
                tone: 'curious',
              },
              priority: 'low',
              timing: {
                optimalWindows: [{ startHour: 18, endHour: 21 }],
              },
            });
          }
        }
      }
    } catch (error) {
      log.warn({ userId, error: String(error) }, 'Error generating surfacing suggestions');
    }

    return suggestions;
  }
}

// ============================================================================
// SINGLETON & EXPORTS
// ============================================================================

let engineInstance: ProactiveSurfacingEngine | null = null;

/**
 * Get or create the surfacing engine singleton
 */
export function getSurfacingEngine(): ProactiveSurfacingEngine {
  if (!engineInstance) {
    engineInstance = new ProactiveSurfacingEngine();
  }
  return engineInstance;
}

/**
 * Queue content for surfacing
 */
export async function queueForSurfacing(
  content: Omit<SurfaceContent, 'id' | 'createdAt' | 'status'>
): Promise<string> {
  const engine = getSurfacingEngine();
  return engine.queueContent(content);
}

/**
 * Process surfacing queue and get next content to surface
 */
export async function getNextSurfacing(userId: string): Promise<SurfaceContent | null> {
  const engine = getSurfacingEngine();
  return engine.processQueue(userId);
}

/**
 * Generate and queue surfacing suggestions
 */
export async function generateAndQueueSuggestions(userId: string): Promise<number> {
  const engine = getSurfacingEngine();
  const suggestions = await engine.generateSuggestions(userId);
  
  let queued = 0;
  for (const suggestion of suggestions) {
    await engine.queueContent(suggestion);
    queued++;
  }
  
  return queued;
}
