/**
 * Concierge Router
 *
 * Routes user requests to appropriate discovery and outreach channels.
 * Determines the domain, validates permissions, and orchestrates the workflow.
 */
import type { ConciergeDomain, ConciergeRequestType, ConciergeRequirements, ConciergeUserPreferences, OutreachChannel } from './types.js';
export interface RouteResult {
    success: boolean;
    requestId?: string;
    error?: string;
    estimatedTargets?: number;
}
export interface ConciergeRouterOptions {
    userId: string;
    sessionId?: string;
    userPreferences?: ConciergeUserPreferences;
}
export declare class ConciergeRouter {
    private userId;
    private sessionId?;
    private userPreferences?;
    constructor(options: ConciergeRouterOptions);
    /**
     * Classify a natural language request into domain and type
     */
    classifyRequest(description: string): {
        domain: ConciergeDomain;
        type: ConciergeRequestType;
    };
    /**
     * Check if user has permission to use concierge for a domain
     */
    checkPermissions(domain: ConciergeDomain, channel: OutreachChannel): boolean;
    /**
     * Get the best channel for a domain
     */
    getBestChannel(domain: ConciergeDomain): OutreachChannel;
    /**
     * Route a user request to create a concierge task
     */
    routeRequest(description: string, requirements: ConciergeRequirements, options?: {
        maxTargets?: number;
        preferredChannel?: OutreachChannel;
    }): Promise<RouteResult>;
}
export declare function createConciergeRouter(options: ConciergeRouterOptions): ConciergeRouter;
//# sourceMappingURL=router.d.ts.map