/**
 * Outreach Admin Service
 *
 * Provides administrative functions for managing proactive outreach:
 * - View scheduled outreach
 * - Cancel/reschedule
 * - Manage user preferences
 * - View delivery status
 *
 * Can be exposed via API endpoints for a dashboard UI.
 */
import { getLogger } from '../utils/safe-logger.js';
import { getUserContactInfo } from './outreach/user-contact.js';
import { getPreferences, setPreferences, } from './outreach-intelligence.js';
import { getUserAnalytics, getGlobalAnalytics, generateSummaryReport, getOptimizationRecommendations, } from './analytics/outreach-analytics.js';
import { getPendingReminders, cancelReminder } from './scheduling/reminder-scheduler.js';
// ============================================================================
// USER MANAGEMENT
// ============================================================================
/**
 * Get summary for a specific user
 */
export async function getUserSummary(userId) {
    const contact = await getUserContactInfo(userId);
    const prefs = getPreferences(userId);
    const analytics = await getUserAnalytics(userId);
    const pending = getPendingReminders(userId);
    const recommendations = await getOptimizationRecommendations(userId);
    return {
        userId,
        contactInfo: {
            hasPhone: !!contact?.phone,
            hasEmail: !!contact?.email,
            preferredMethod: contact?.preferredMethod || prefs.preferredMethod,
            timezone: contact?.timezone || prefs.timezone,
        },
        preferences: prefs,
        stats: {
            totalSent: analytics.totalSent,
            totalResponded: analytics.totalResponded,
            responseRate: analytics.responseRate,
            pendingOutreach: pending.length,
        },
        recommendations,
    };
}
/**
 * Update user preferences
 */
export function updateUserPreferences(userId, prefs) {
    setPreferences(userId, prefs);
    return getPreferences(userId);
}
/**
 * Disable all outreach for a user
 */
export function disableUserOutreach(userId) {
    setPreferences(userId, { enabled: false });
    getLogger().info({ userId }, '🔇 Outreach disabled for user');
}
/**
 * Enable outreach for a user
 */
export function enableUserOutreach(userId) {
    setPreferences(userId, { enabled: true });
    getLogger().info({ userId }, '🔔 Outreach enabled for user');
}
// ============================================================================
// SCHEDULED OUTREACH MANAGEMENT
// ============================================================================
/**
 * Get all scheduled outreach for a user
 */
export function getScheduledOutreach(userId) {
    const reminders = getPendingReminders(userId);
    return reminders.map((r) => ({
        id: r.id,
        userId: r.userId,
        type: (r.context?.includes('commitment')
            ? 'commitment'
            : r.context?.includes('goal')
                ? 'goal'
                : r.context?.includes('calendar')
                    ? 'calendar'
                    : 'reminder'),
        message: r.message,
        scheduledFor: r.scheduledFor,
        method: r.deliveryMethod,
        status: r.status === 'pending' ? 'pending' : r.status === 'delivered' ? 'sent' : 'failed',
        createdAt: r.createdAt,
        createdBy: r.createdBy || 'system',
    }));
}
/**
 * Cancel a scheduled outreach
 */
export async function cancelScheduledOutreach(reminderId) {
    const success = await cancelReminder(reminderId);
    if (success) {
        getLogger().info({ reminderId }, '❌ Scheduled outreach cancelled');
    }
    return success;
}
/**
 * Get all upcoming outreach across all users
 */
export function getAllUpcomingOutreach(limit = 50) {
    // This would aggregate from all users
    // For now, returns empty as we'd need to iterate all users
    return [];
}
// ============================================================================
// DASHBOARD DATA
// ============================================================================
/**
 * Get dashboard overview data
 */
export function getDashboardData() {
    const analytics = getGlobalAnalytics();
    // These would be populated from actual stores
    const overview = {
        totalUsers: 0,
        usersWithContact: 0,
        totalScheduled: 0,
        totalSentToday: 0,
        overallResponseRate: analytics.overallResponseRate,
    };
    return {
        overview,
        recentActivity: [],
        upcomingOutreach: [],
        analytics,
    };
}
/**
 * Get analytics report as string
 */
export function getAnalyticsReport() {
    return generateSummaryReport();
}
// ============================================================================
// BULK OPERATIONS
// ============================================================================
/**
 * Send a broadcast message to multiple users
 */
export async function sendBroadcast(userIds, message, method = 'sms', scheduledFor) {
    const { scheduleText, scheduleEmail, canReachUser } = await import('../tools/domains/proactive/outreach/index.js');
    const { canSendOutreach } = await import('./outreach-intelligence.js');
    let sent = 0;
    let failed = 0;
    let skipped = 0;
    const sendTime = scheduledFor || new Date();
    for (const userId of userIds) {
        // Check if we can reach user
        if (!(await canReachUser(userId, method))) {
            skipped++;
            continue;
        }
        if (!canSendOutreach(userId)) {
            skipped++;
            continue;
        }
        let result;
        if (method === 'email') {
            result = await scheduleEmail(userId, '📢 Message from Ferni', message, sendTime, 'Ferni');
        }
        else {
            result = await scheduleText(userId, message, sendTime, 'Ferni');
        }
        if (result.success) {
            sent++;
        }
        else {
            failed++;
        }
    }
    getLogger().info({ sent, failed, skipped, total: userIds.length }, '📢 Broadcast complete');
    return { sent, failed, skipped };
}
// ============================================================================
// API ENDPOINTS (Express-compatible handlers)
// ============================================================================
/**
 * Express-compatible route handlers for admin API
 */
export const apiHandlers = {
    // GET /api/admin/dashboard
    getDashboard: (_req, res) => {
        const data = getDashboardData();
        res.json({ success: true, data });
    },
    // GET /api/admin/users/:userId
    getUser: (req, res) => {
        const summary = getUserSummary(req.params.userId);
        res.json({ success: true, data: summary });
    },
    // PUT /api/admin/users/:userId/preferences
    updatePreferences: (req, res) => {
        const prefs = updateUserPreferences(req.params.userId, req.body);
        res.json({ success: true, data: prefs });
    },
    // GET /api/admin/users/:userId/outreach
    getUserOutreach: (req, res) => {
        const outreach = getScheduledOutreach(req.params.userId);
        res.json({ success: true, data: outreach });
    },
    // DELETE /api/admin/outreach/:reminderId
    cancelOutreach: (req, res) => {
        const success = cancelScheduledOutreach(req.params.reminderId);
        res.json({ success });
    },
    // GET /api/admin/analytics
    getAnalytics: (_req, res) => {
        const analytics = getGlobalAnalytics();
        res.json({ success: true, data: analytics });
    },
    // GET /api/admin/report
    getReport: (_req, res) => {
        const report = getAnalyticsReport();
        res.send(report);
    },
};
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    // User management
    getUserSummary,
    updateUserPreferences,
    disableUserOutreach,
    enableUserOutreach,
    // Outreach management
    getScheduledOutreach,
    cancelScheduledOutreach,
    getAllUpcomingOutreach,
    // Dashboard
    getDashboardData,
    getAnalyticsReport,
    // Bulk operations
    sendBroadcast,
    // API handlers
    apiHandlers,
};
//# sourceMappingURL=outreach-admin.js.map