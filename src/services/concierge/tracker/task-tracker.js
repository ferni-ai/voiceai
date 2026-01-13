/**
 * Task Tracker
 *
 * Manages the lifecycle of concierge requests from creation to completion.
 * Tracks status, results, and handles state transitions.
 */
import { createLogger } from '../../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore } from '../../superhuman/firestore-utils.js';
const log = createLogger({ module: 'concierge-tracker' });
// In-memory store for active requests (Firestore for persistence)
const activeRequests = new Map();
const eventListeners = [];
export class TaskTracker {
    /**
     * Generate a unique request ID
     */
    generateId() {
        return `conc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
    /**
     * Emit an event to all listeners
     */
    emitEvent(event) {
        log.debug({ type: event.type, requestId: event.requestId }, 'Emitting concierge event');
        for (const listener of eventListeners) {
            try {
                listener(event);
            }
            catch (error) {
                log.error({ error: String(error) }, 'Event listener error');
            }
        }
    }
    /**
     * Create a new concierge request
     */
    async createRequest(options) {
        const requestId = this.generateId();
        // Convert discovered businesses to targets
        const targets = options.businesses.map((biz, index) => ({
            id: `${requestId}_target_${index}`,
            requestId,
            name: biz.name,
            phone: biz.phone,
            email: undefined, // Would need separate lookup
            address: biz.address,
            website: biz.website,
            source: 'google_places',
            sourceId: biz.placeId,
            rating: biz.rating,
            priceLevel: biz.priceLevel,
            status: 'pending',
            attempts: 0,
            priority: index, // Lower index = higher priority
        }));
        const request = {
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
    async getRequest(requestId) {
        // Check memory first
        if (activeRequests.has(requestId)) {
            return activeRequests.get(requestId);
        }
        // Try Firestore
        const db = getFirestoreDb();
        if (!db)
            return null;
        try {
            const doc = await db.collection('concierge_requests').doc(requestId).get();
            if (!doc.exists)
                return null;
            const data = doc.data();
            activeRequests.set(requestId, data);
            return data;
        }
        catch (error) {
            log.error({ error: String(error), requestId }, 'Failed to get request from Firestore');
            return null;
        }
    }
    /**
     * Get all active requests for a user
     */
    async getUserRequests(userId) {
        const requests = [];
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
                    const data = doc.data();
                    if (!activeRequests.has(data.id)) {
                        activeRequests.set(data.id, data);
                        requests.push(data);
                    }
                }
            }
            catch (error) {
                log.error({ error: String(error), userId }, 'Failed to get user requests from Firestore');
            }
        }
        return requests;
    }
    /**
     * Update request status
     */
    async updateStatus(requestId, status, statusMessage) {
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
        const eventType = status === 'completed'
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
    async updateTargetStatus(requestId, targetId, status) {
        const request = await this.getRequest(requestId);
        if (!request)
            return;
        const target = request.targets.find((t) => t.id === targetId);
        if (!target)
            return;
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
        }
        else if (status === 'completed') {
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
    async addResult(requestId, result) {
        const request = await this.getRequest(requestId);
        if (!request)
            return;
        const fullResult = {
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
    async setRecommendation(requestId, recommendation) {
        const request = await this.getRequest(requestId);
        if (!request)
            return;
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
    getNextTarget(request) {
        // Find pending targets, sorted by priority
        const pendingTargets = request.targets
            .filter((t) => t.status === 'pending' || (t.status === 'no_answer' && t.attempts < request.maxAttempts))
            .sort((a, b) => a.priority - b.priority);
        return pendingTargets[0] || null;
    }
    /**
     * Check if request is complete (all targets contacted or enough results)
     */
    isRequestComplete(request) {
        const completedTargets = request.targets.filter((t) => t.status === 'completed' || t.status === 'failed').length;
        const successfulResults = request.results.filter((r) => r.success).length;
        // Complete if we have enough successful results or all targets are done
        return successfulResults >= 3 || completedTargets >= request.targets.length;
    }
    /**
     * Persist request to Firestore
     */
    async persistRequest(request) {
        const db = getFirestoreDb();
        if (!db)
            return;
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
        }
        catch (error) {
            log.error({ error: String(error), requestId: request.id }, 'Failed to persist request');
        }
    }
    /**
     * Subscribe to concierge events
     */
    onEvent(listener) {
        eventListeners.push(listener);
        return () => {
            const index = eventListeners.indexOf(listener);
            if (index >= 0) {
                eventListeners.splice(index, 1);
            }
        };
    }
    /**
     * Find a request by target phone number (for incoming call/SMS matching)
     */
    async findRequestByTargetPhone(phone) {
        // Normalize phone number (remove non-digits for comparison)
        const normalizedPhone = phone.replace(/\D/g, '');
        // Search active requests in memory first
        for (const request of activeRequests.values()) {
            if (request.status !== 'pending' && request.status !== 'in_progress')
                continue;
            for (const target of request.targets) {
                if (target.phone) {
                    const targetPhone = target.phone.replace(/\D/g, '');
                    if (targetPhone === normalizedPhone || targetPhone.endsWith(normalizedPhone.slice(-10))) {
                        return { request, target };
                    }
                }
            }
        }
        // Search Firestore for active requests
        const db = getFirestoreDb();
        if (db) {
            try {
                const snapshot = await db
                    .collection('concierge_requests')
                    .where('status', 'in', ['pending', 'in_progress', 'awaiting_user'])
                    .orderBy('createdAt', 'desc')
                    .limit(50)
                    .get();
                for (const doc of snapshot.docs) {
                    const request = doc.data();
                    for (const target of request.targets) {
                        if (target.phone) {
                            const targetPhone = target.phone.replace(/\D/g, '');
                            if (targetPhone === normalizedPhone ||
                                targetPhone.endsWith(normalizedPhone.slice(-10))) {
                                // Cache in memory
                                activeRequests.set(request.id, request);
                                return { request, target };
                            }
                        }
                    }
                }
            }
            catch (error) {
                log.error({ error: String(error), phone }, 'Failed to search requests by phone');
            }
        }
        return null;
    }
    /**
     * Find a request by target email address (for incoming email matching)
     */
    async findRequestByTargetEmail(email) {
        // Normalize email (lowercase)
        const normalizedEmail = email.toLowerCase().trim();
        // Search active requests in memory first
        for (const request of activeRequests.values()) {
            if (request.status !== 'pending' && request.status !== 'in_progress')
                continue;
            for (const target of request.targets) {
                if (target.email && target.email.toLowerCase() === normalizedEmail) {
                    return { request, target };
                }
            }
        }
        // Search Firestore for active requests
        const db = getFirestoreDb();
        if (db) {
            try {
                const snapshot = await db
                    .collection('concierge_requests')
                    .where('status', 'in', ['pending', 'in_progress', 'awaiting_user'])
                    .orderBy('createdAt', 'desc')
                    .limit(50)
                    .get();
                for (const doc of snapshot.docs) {
                    const request = doc.data();
                    for (const target of request.targets) {
                        if (target.email && target.email.toLowerCase() === normalizedEmail) {
                            // Cache in memory
                            activeRequests.set(request.id, request);
                            return { request, target };
                        }
                    }
                }
            }
            catch (error) {
                log.error({ error: String(error), email }, 'Failed to search requests by email');
            }
        }
        return null;
    }
    /**
     * Clean up completed requests from memory
     */
    cleanup() {
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
let trackerInstance = null;
export function getTaskTracker() {
    if (!trackerInstance) {
        trackerInstance = new TaskTracker();
    }
    return trackerInstance;
}
export function resetTaskTracker() {
    trackerInstance = null;
    activeRequests.clear();
}
//# sourceMappingURL=task-tracker.js.map