/**
 * Admin Diagnostics API Routes (v1)
 *
 * System diagnostics, handoff monitoring, and health checks.
 *
 * Routes:
 * - GET    /api/v1/admin/diagnostics/health       - System health overview
 * - GET    /api/v1/admin/diagnostics/handoff/metrics - Handoff performance metrics
 * - GET    /api/v1/admin/diagnostics/handoff/recent  - Recent handoff events
 * - GET    /api/v1/admin/diagnostics/services     - Service status
 *
 * @module AdminDiagnosticsAPI
 */
import type { IncomingMessage, ServerResponse } from 'http';
import type { URL } from 'url';
interface HandoffEvent {
    id: string;
    from: string;
    to: string;
    trigger: string;
    duration: number;
    status: 'success' | 'failed';
    timestamp: Date;
    userId?: string;
    roomId?: string;
}
/**
 * Handle all diagnostics admin routes
 * @returns true if the request was handled
 */
export declare function handleAdminDiagnosticsRoutes(req: IncomingMessage, res: ServerResponse, pathname: string, _parsedUrl: URL): Promise<boolean>;
/**
 * Record a handoff event (called from handoff service)
 */
export declare function recordHandoffEvent(event: Omit<HandoffEvent, 'id' | 'timestamp'>): void;
declare const _default: {
    handleAdminDiagnosticsRoutes: typeof handleAdminDiagnosticsRoutes;
    recordHandoffEvent: typeof recordHandoffEvent;
};
export default _default;
//# sourceMappingURL=diagnostics.d.ts.map