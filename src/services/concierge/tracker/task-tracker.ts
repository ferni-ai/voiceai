/**
 * Task Tracker
 *
 * Manages the lifecycle of concierge requests from creation to completion.
 * Tracks status, results, and handles state transitions.
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore } from '../../superhuman/firestore-utils.js';
import type {
  ConciergeRequest,
  ConciergeTarget,
  ConciergeResult,
  ConciergeRecommendation,
  ConciergeDomain,
  ConciergeRequestType,
  ConciergeRequirements,
  ConciergeEvent,
  ConciergeEventType,
  RequestStatus,
  TargetStatus,
  OutreachChannel,
  DiscoveredBusiness,
} from '../types.js';

const log = createLogger({ module: 'concierge-tracker' });

// In-memory store for active requests (Firestore for persistence)
const activeRequests = new Map<string, ConciergeRequest>();

// Event listeners
type EventListener = (event: ConciergeEvent) => void;
const eventListeners: EventListener[] = [];

export interface CreateRequestOptions {
  userId: string;
  sessionId?: string;
  domain: ConciergeDomain;
  type: ConciergeRequestType;
  description: string;
  requirements: ConciergeRequirements;
  preferredChannel: OutreachChannel;
  maxTargets: number;
  businesses: DiscoveredBusiness[];
}

export class TaskTracker {
  /**
   * Generate a unique request ID
   */
  private generateId(): string {
    return `conc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Emit an event to all listeners
   */
  private emitEvent(event: ConciergeEvent): void {
    log.debug({ type: event.type, requestId: event.requestId }, 'Emitting concierge event');
    for (const listener of eventListeners) {
      try {
        listener(event);
      } catch (error) {
        log.error({ error: String(error) }, 'Event listener error');
      }
    }
  }

  /**
   * Create a new concierge request
   */
  async createRequest(options: CreateRequestOptions): Promise<ConciergeRequest> {
    const requestId = this.generateId();

    // Convert discovered businesses to targets
    const targets: ConciergeTarget[] = options.businesses.map((biz, index) => ({
      id: `${requestId}_target_${index}`,
      requestId,
      name: biz.name,
      phone: biz.phone,
      email: undefined, // Would need separate lookup
      address: biz.address,
      website: biz.website,
      source: 'google_places' as const,
      sourceId: biz.placeId,
      rating: biz.rating,
      priceLevel: biz.priceLevel,
      status: 'pending' as TargetStatus,
      attempts: 0,
      priority: index, // Lower index = higher priority
    }));

    const request: ConciergeRequest = {
      id: requestId,
      userId: options.userId,
      sessionId: options.sessionId,
      domain: options.domain,
      type: options.type,
      description: options.description,
      requirements: options.requirements,
      targets,
      status: 'pending',
      results: [],
      preferredChannel: options.preferredChannel,
      maxTargets: options.maxTargets,
      maxAttempts: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Store in memory
    activeRequests.set(requestId, request);

    // Persist to Firestore
    await this.persistRequest(request);

    // Emit event
    this.emitEvent({
      type: 'request_created',
      requestId,
      data: { domain: options.domain, type: options.type, targetCount: targets.length },
      timestamp: new Date(),
    });

    return request;
  }

  /**
   * Get a request by ID
   */
  async getRequest(requestId: string): Promise<ConciergeRequest | null> {
    // Check memory first
    if (activeRequests.has(requestId)) {
      return activeRequests.get(requestId)!;
    }

    // Try Firestore
    const db = getFirestoreDb();
    if (!db) return null;

    try {
      const doc = await db.collection('concierge_requests').doc(requestId).get();
      if (!doc.exists) return null;

      const data = doc.data() as ConciergeRequest;
      activeRequests.set(requestId, data);
      return data;
    } catch (error) {
      log.error({ error: String(error), requestId }, 'Failed to get request from Firestore');
      return null;
    }
  }

  /**
   * Get all active requests for a user
   */
  async getUserRequests(userId: string): Promise<ConciergeRequest[]> {
    const requests: ConciergeRequest[] = [];

    // Check memory
    for (const request of activeRequests.values()) {
      if (request.userId === userId) {
        requests.push(request);
      }
    }

    // Also check Firestore for non-cached requests
    const db = getFirestoreDb();
    if (db) {
      try {
        const snapshot = await db
          .collection('concierge_requests')
          .where('userId', '==', userId)
          .where('status', 'in', ['pending', 'discovering', 'in_progress', 'awaiting_user'])
          .orderBy('createdAt', 'desc')
          .limit(20)
          .get();

        for (const doc of snapshot.docs) {
          const data = doc.data() as ConciergeRequest;
          if (!activeRequests.has(data.id)) {
            activeRequests.set(data.id, data);
            requests.push(data);
          }
        }
      } catch (error) {
        log.error({ error: String(error), userId }, 'Failed to get user requests from Firestore');
      }
    }

    return requests;
  }

  /**
   * Update request status
   */
  async updateStatus(
    requestId: string,
    status: RequestStatus,
    statusMessage?: string
  ): Promise<void> {
    const request = await this.getRequest(requestId);
    if (!request) {
      log.warn({ requestId }, 'Request not found for status update');
      return;
    }

    request.status = status;
    request.statusMessage = statusMessage;
    request.updatedAt = new Date();

    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      request.completedAt = new Date();
    }

    activeRequests.set(requestId, request);
    await this.persistRequest(request);

    // Emit appropriate event
    const eventType: ConciergeEventType =
      status === 'completed'
        ? 'request_completed'
        : status === 'failed'
          ? 'request_failed'
          : status === 'awaiting_user'
            ? 'awaiting_user'
            : 'outreach_started';

    this.emitEvent({
      type: eventType,
      requestId,
      data: { status, statusMessage },
      timestamp: new Date(),
    });
  }

  /**
   * Update a target's status
   */
  async updateTargetStatus(
    requestId: string,
    targetId: string,
    status: TargetStatus
  ): Promise<void> {
    const request = await this.getRequest(requestId);
    if (!request) return;

    const target = request.targets.find((t) => t.id === targetId);
    if (!target) return;

    target.status = status;
    target.lastAttemptAt = new Date();
    if (status === 'queued' || status === 'no_answer') {
      target.attempts += 1;
    }

    request.updatedAt = new Date();
    activeRequests.set(requestId, request);
    await this.persistRequest(request);

    // Emit event for call status changes
    if (status === 'calling') {
      this.emitEvent({
        type: 'call_started',
        requestId,
        targetId,
        timestamp: new Date(),
      });
    } else if (status === 'completed') {
      this.emitEvent({
        type: 'call_completed',
        requestId,
        targetId,
        timestamp: new Date(),
      });
    }
  }

  /**
   * Add a result from an outreach attempt
   */
  async addResult(requestId: string, result: Omit<ConciergeResult, 'id'>): Promise<void> {
    const request = await this.getRequest(requestId);
    if (!request) return;

    const fullResult: ConciergeResult = {
      ...result,
      id: `${requestId}_result_${request.results.length}`,
    };

    request.results.push(fullResult);
    request.updatedAt = new Date();

    // Update target status
    const target = request.targets.find((t) => t.id === result.targetId);
    if (target) {
      target.status = result.success ? 'completed' : 'failed';
    }

    activeRequests.set(requestId, request);
    await this.persistRequest(request);

    this.emitEvent({
      type: 'result_received',
      requestId,
      targetId: result.targetId,
      data: { success: result.success, summary: result.summary },
      timestamp: new Date(),
    });
  }

  /**
   * Set the recommendation for a request
   */
  async setRecommendation(
    requestId: string,
    recommendation: ConciergeRecommendation
  ): Promise<void> {
    const request = await this.getRequest(requestId);
    if (!request) return;

    request.recommendation = recommendation;
    request.status = 'awaiting_user';
    request.updatedAt = new Date();

    activeRequests.set(requestId, request);
    await this.persistRequest(request);

    this.emitEvent({
      type: 'awaiting_user',
      requestId,
      data: { recommendation },
      timestamp: new Date(),
    });
  }

  /**
   * Get the next target to contact
   */
  getNextTarget(request: ConciergeRequest): ConciergeTarget | null {
    // Find pending targets, sorted by priority
    const pendingTargets = request.targets
      .filter(
        (t) =>
          t.status === 'pending' || (t.status === 'no_answer' && t.attempts < request.maxAttempts)
      )
      .sort((a, b) => a.priority - b.priority);

    return pendingTargets[0] || null;
  }

  /**
   * Check if request is complete (all targets contacted or enough results)
   */
  isRequestComplete(request: ConciergeRequest): boolean {
    const completedTargets = request.targets.filter(
      (t) => t.status === 'completed' || t.status === 'failed'
    ).length;

    const successfulResults = request.results.filter((r) => r.success).length;

    // Complete if we have enough successful results or all targets are done
    return successfulResults >= 3 || completedTargets >= request.targets.length;
  }

  /**
   * Persist request to Firestore
   */
  private async persistRequest(request: ConciergeRequest): Promise<void> {
    const db = getFirestoreDb();
    if (!db) return;

    try {
      // Store in user's subcollection
      await db
        .collection('bogle_users')
        .doc(request.userId)
        .collection('concierge_requests')
        .doc(request.id)
        .set(cleanForFirestore({
          ...request,
          createdAt: request.createdAt.toISOString(),
          updatedAt: request.updatedAt.toISOString(),
          completedAt: request.completedAt?.toISOString(),
        }));

      // Also store in global collection for admin queries
      await db
        .collection('concierge_requests')
        .doc(request.id)
        .set(cleanForFirestore({
          ...request,
          createdAt: request.createdAt.toISOString(),
          updatedAt: request.updatedAt.toISOString(),
          completedAt: request.completedAt?.toISOString(),
        }));
    } catch (error) {
      log.error({ error: String(error), requestId: request.id }, 'Failed to persist request');
    }
  }

  /**
   * Subscribe to concierge events
   */
  onEvent(listener: EventListener): () => void {
    eventListeners.push(listener);
    return () => {
      const index = eventListeners.indexOf(listener);
      if (index >= 0) {
        eventListeners.splice(index, 1);
      }
    };
  }

  /**
   * Clean up completed requests from memory
   */
  cleanup(): void {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000; // 30 minutes

    for (const [id, request] of activeRequests.entries()) {
      if (request.completedAt && now - request.completedAt.getTime() > maxAge) {
        activeRequests.delete(id);
      }
    }
  }
}

// Singleton instance
let trackerInstance: TaskTracker | null = null;

export function getTaskTracker(): TaskTracker {
  if (!trackerInstance) {
    trackerInstance = new TaskTracker();
  }
  return trackerInstance;
}

export function resetTaskTracker(): void {
  trackerInstance = null;
  activeRequests.clear();
}
