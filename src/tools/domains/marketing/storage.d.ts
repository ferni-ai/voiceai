/**
 * Marketing Content Storage
 *
 * Stores drafts, scheduled posts, analytics, and OAuth tokens in Firestore.
 * Tokens are encrypted using AES-256-GCM before storage.
 */
interface Draft {
    id?: string;
    source?: string;
    platform?: string;
    content: {
        twitter?: {
            thread: string[];
        };
        linkedin?: {
            post: string;
            hashtags?: string[];
        };
        instagram?: {
            slides: string[];
            caption: string;
            hashtags?: string[];
        };
    };
    createdAt: Date;
}
interface ScheduledPost {
    id?: string;
    platform: 'twitter' | 'linkedin' | 'instagram';
    content: string | string[];
    scheduledAt: Date;
    status: 'draft' | 'scheduled' | 'posted' | 'failed';
    error?: string;
    postId?: string;
    postUrl?: string;
}
interface PostedContent {
    id?: string;
    platform: string;
    content: string | string[];
    postedAt: Date;
    postId?: string;
    postIds?: string[];
    url?: string;
    analytics?: {
        impressions: number;
        engagements: number;
        clicks: number;
        likes?: number;
        retweets?: number;
        comments?: number;
        shares?: number;
    };
}
interface AnalyticsQuery {
    platform?: 'twitter' | 'linkedin';
    period: 'today' | 'week' | 'month' | 'quarter';
}
interface AnalyticsResult {
    totalPosts: number;
    twitter?: {
        posts: number;
        impressions: number;
        engagements: number;
        engagementRate: string;
        bestPost?: string;
    };
    linkedin?: {
        posts: number;
        impressions: number;
        reactions: number;
        comments: number;
        bestPost?: string;
    };
    insights: string[];
}
/**
 * Social platform OAuth tokens
 * Stored encrypted in Firestore
 */
export interface SocialTokens {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
    tokenType?: string;
    scope?: string;
    userId?: string;
    username?: string;
    updatedAt: number;
}
export declare class MarketingStorage {
    private userId;
    constructor(userId: string);
    saveDraft(draft: Draft): Promise<string>;
    getDraft(draftId: string): Promise<Draft | null>;
    listDrafts(): Promise<Draft[]>;
    deleteDraft(draftId: string): Promise<void>;
    schedulePost(post: Omit<ScheduledPost, 'id'>): Promise<string>;
    getScheduledPosts(filters?: {
        platform?: string;
        status?: string;
        limit?: number;
    }): Promise<ScheduledPost[]>;
    updateScheduledPost(id: string, update: Partial<ScheduledPost>): Promise<void>;
    deleteScheduledPost(id: string): Promise<void>;
    savePostedContent(content: Omit<PostedContent, 'id'>): Promise<string>;
    getPostedContent(filters?: {
        platform?: string;
        limit?: number;
        startDate?: Date;
        endDate?: Date;
    }): Promise<PostedContent[]>;
    getAnalytics(query: AnalyticsQuery): Promise<AnalyticsResult>;
    /**
     * Store social platform tokens securely
     * Tokens are encrypted with AES-256-GCM before storage
     */
    saveTokens(platform: 'twitter' | 'linkedin', tokens: SocialTokens): Promise<void>;
    /**
     * Retrieve and decrypt social platform tokens
     */
    getTokens(platform: 'twitter' | 'linkedin'): Promise<SocialTokens | null>;
    /**
     * Check if platform is connected (has valid tokens)
     */
    hasTokens(platform: 'twitter' | 'linkedin'): Promise<boolean>;
    /**
     * Delete stored tokens (disconnect platform)
     */
    deleteTokens(platform: 'twitter' | 'linkedin'): Promise<void>;
}
export default MarketingStorage;
//# sourceMappingURL=storage.d.ts.map