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
import { type UserOutreachPreferences } from './outreach-intelligence.js';
import { getGlobalAnalytics } from './analytics/outreach-analytics.js';
export interface ScheduledOutreach {
    id: string;
    userId: string;
    type: 'reminder' | 'commitment' | 'goal' | 'calendar' | 'reengagement';
    message: string;
    scheduledFor: Date;
    method: 'sms' | 'email' | 'call';
    status: 'pending' | 'sent' | 'failed' | 'cancelled';
    createdAt: Date;
    createdBy: string;
}
export interface UserOutreachSummary {
    userId: string;
    contactInfo: {
        hasPhone: boolean;
        hasEmail: boolean;
        preferredMethod: string;
        timezone?: string;
    };
    preferences: UserOutreachPreferences;
    stats: {
        totalSent: number;
        totalResponded: number;
        responseRate: number;
        pendingOutreach: number;
    };
    recommendations: string[];
}
export interface DashboardData {
    overview: {
        totalUsers: number;
        usersWithContact: number;
        totalScheduled: number;
        totalSentToday: number;
        overallResponseRate: number;
    };
    recentActivity: Array<{
        timestamp: Date;
        userId: string;
        action: string;
        details: string;
    }>;
    upcomingOutreach: ScheduledOutreach[];
    analytics: ReturnType<typeof getGlobalAnalytics>;
}
/**
 * Get summary for a specific user
 */
export declare function getUserSummary(userId: string): Promise<UserOutreachSummary>;
/**
 * Update user preferences
 */
export declare function updateUserPreferences(userId: string, prefs: Partial<UserOutreachPreferences>): UserOutreachPreferences;
/**
 * Disable all outreach for a user
 */
export declare function disableUserOutreach(userId: string): void;
/**
 * Enable outreach for a user
 */
export declare function enableUserOutreach(userId: string): void;
/**
 * Get all scheduled outreach for a user
 */
export declare function getScheduledOutreach(userId: string): ScheduledOutreach[];
/**
 * Cancel a scheduled outreach
 */
export declare function cancelScheduledOutreach(reminderId: string): Promise<boolean>;
/**
 * Get all upcoming outreach across all users
 */
export declare function getAllUpcomingOutreach(limit?: number): ScheduledOutreach[];
/**
 * Get dashboard overview data
 */
export declare function getDashboardData(): DashboardData;
/**
 * Get analytics report as string
 */
export declare function getAnalyticsReport(): string;
/**
 * Send a broadcast message to multiple users
 */
export declare function sendBroadcast(userIds: string[], message: string, method?: 'sms' | 'email', scheduledFor?: Date): Promise<{
    sent: number;
    failed: number;
    skipped: number;
}>;
/**
 * Express-compatible route handlers for admin API
 */
export declare const apiHandlers: {
    getDashboard: (_req: unknown, res: {
        json: (data: unknown) => void;
    }) => void;
    getUser: (req: {
        params: {
            userId: string;
        };
    }, res: {
        json: (data: unknown) => void;
    }) => void;
    updatePreferences: (req: {
        params: {
            userId: string;
        };
        body: Partial<UserOutreachPreferences>;
    }, res: {
        json: (data: unknown) => void;
    }) => void;
    getUserOutreach: (req: {
        params: {
            userId: string;
        };
    }, res: {
        json: (data: unknown) => void;
    }) => void;
    cancelOutreach: (req: {
        params: {
            reminderId: string;
        };
    }, res: {
        json: (data: unknown) => void;
    }) => void;
    getAnalytics: (_req: unknown, res: {
        json: (data: unknown) => void;
    }) => void;
    getReport: (_req: unknown, res: {
        send: (data: string) => void;
    }) => void;
};
declare const _default: {
    getUserSummary: typeof getUserSummary;
    updateUserPreferences: typeof updateUserPreferences;
    disableUserOutreach: typeof disableUserOutreach;
    enableUserOutreach: typeof enableUserOutreach;
    getScheduledOutreach: typeof getScheduledOutreach;
    cancelScheduledOutreach: typeof cancelScheduledOutreach;
    getAllUpcomingOutreach: typeof getAllUpcomingOutreach;
    getDashboardData: typeof getDashboardData;
    getAnalyticsReport: typeof getAnalyticsReport;
    sendBroadcast: typeof sendBroadcast;
    apiHandlers: {
        getDashboard: (_req: unknown, res: {
            json: (data: unknown) => void;
        }) => void;
        getUser: (req: {
            params: {
                userId: string;
            };
        }, res: {
            json: (data: unknown) => void;
        }) => void;
        updatePreferences: (req: {
            params: {
                userId: string;
            };
            body: Partial<UserOutreachPreferences>;
        }, res: {
            json: (data: unknown) => void;
        }) => void;
        getUserOutreach: (req: {
            params: {
                userId: string;
            };
        }, res: {
            json: (data: unknown) => void;
        }) => void;
        cancelOutreach: (req: {
            params: {
                reminderId: string;
            };
        }, res: {
            json: (data: unknown) => void;
        }) => void;
        getAnalytics: (_req: unknown, res: {
            json: (data: unknown) => void;
        }) => void;
        getReport: (_req: unknown, res: {
            send: (data: string) => void;
        }) => void;
    };
};
export default _default;
//# sourceMappingURL=outreach-admin.d.ts.map