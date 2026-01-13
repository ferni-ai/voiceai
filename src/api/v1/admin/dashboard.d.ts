/**
 * Admin Dashboard API Routes (v1)
 *
 * Aggregated dashboard data from all systems for the admin portal.
 *
 * Routes:
 * - GET  /api/v1/admin/dashboard/stats    - Aggregated stats from all systems
 * - GET  /api/v1/admin/dashboard/activity - Recent activity across all systems
 * - GET  /api/v1/admin/dashboard/health   - Overall system health summary
 *
 * @module AdminDashboardAPI
 */
import type { IncomingMessage, ServerResponse } from 'http';
import type { URL } from 'url';
import { type ActivityEvent } from '../../../services/admin-activity.js';
export type { ActivityEvent };
/**
 * Record an activity event (async wrapper for Firestore persistence)
 */
export declare function recordActivity(event: Omit<ActivityEvent, 'id' | 'timestamp'>): void;
/**
 * Get recent activity events (async)
 */
export declare function getRecentActivity(limit?: number): Promise<ActivityEvent[]>;
/**
 * Handle all dashboard admin routes
 * @returns true if the request was handled
 */
export declare function handleAdminDashboardRoutes(req: IncomingMessage, res: ServerResponse, pathname: string, _parsedUrl: URL): Promise<boolean>;
declare const _default: {
    handleAdminDashboardRoutes: typeof handleAdminDashboardRoutes;
    recordActivity: typeof recordActivity;
    getRecentActivity: typeof getRecentActivity;
};
export default _default;
//# sourceMappingURL=dashboard.d.ts.map