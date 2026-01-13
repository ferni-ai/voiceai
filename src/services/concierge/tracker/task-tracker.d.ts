/**
 * Task Tracker
 *
 * Manages the lifecycle of concierge requests from creation to completion.
 * Tracks status, results, and handles state transitions.
 */
import type { ConciergeRequest, ConciergeTarget, ConciergeResult, ConciergeRecommendation, ConciergeDomain, ConciergeRequestType, ConciergeRequirements, ConciergeEvent, RequestStatus, TargetStatus, OutreachChannel, DiscoveredBusiness } from '../types.js';
type EventListener = (event: ConciergeEvent) => void;
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
export declare class TaskTracker {
    /**
     * Generate a unique request ID
     */
    private generateId;
    /**
     * Emit an event to all listeners
     */
    private emitEvent;
    /**
     * Create a new concierge request
     */
    createRequest(options: CreateRequestOptions): Promise<ConciergeRequest>;
    /**
     * Get a request by ID
     */
    getRequest(requestId: string): Promise<ConciergeRequest | null>;
    /**
     * Get all active requests for a user
     */
    getUserRequests(userId: string): Promise<ConciergeRequest[]>;
    /**
     * Update request status
     */
    updateStatus(requestId: string, status: RequestStatus, statusMessage?: string): Promise<void>;
    /**
     * Update a target's status
     */
    updateTargetStatus(requestId: string, targetId: string, status: TargetStatus): Promise<void>;
    /**
     * Add a result from an outreach attempt
     */
    addResult(requestId: string, result: Omit<ConciergeResult, 'id'>): Promise<void>;
    /**
     * Set the recommendation for a request
     */
    setRecommendation(requestId: string, recommendation: ConciergeRecommendation): Promise<void>;
    /**
     * Get the next target to contact
     */
    getNextTarget(request: ConciergeRequest): ConciergeTarget | null;
    /**
     * Check if request is complete (all targets contacted or enough results)
     */
    isRequestComplete(request: ConciergeRequest): boolean;
    /**
     * Persist request to Firestore
     */
    private persistRequest;
    /**
     * Subscribe to concierge events
     */
    onEvent(listener: EventListener): () => void;
    /**
     * Find a request by target phone number (for incoming call/SMS matching)
     */
    findRequestByTargetPhone(phone: string): Promise<{
        request: ConciergeRequest;
        target: ConciergeTarget;
    } | null>;
    /**
     * Find a request by target email address (for incoming email matching)
     */
    findRequestByTargetEmail(email: string): Promise<{
        request: ConciergeRequest;
        target: ConciergeTarget;
    } | null>;
    /**
     * Clean up completed requests from memory
     */
    cleanup(): void;
}
export declare function getTaskTracker(): TaskTracker;
export declare function resetTaskTracker(): void;
export {};
//# sourceMappingURL=task-tracker.d.ts.map