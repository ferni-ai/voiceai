/**
 * Marketing Content Storage
 *
 * Stores drafts, scheduled posts, and analytics in Firestore.
 */

import { getLogger } from '../../../utils/safe-logger.js';

const log = getLogger();

interface Draft {
  id?: string;
  source?: string;
  platform?: string;
  content: {
    twitter?: { thread: string[] };
    linkedin?: { post: string; hashtags?: string[] };
    instagram?: { slides: string[]; caption: string; hashtags?: string[] };
  };
  createdAt: Date;
}

interface ScheduledPost {
  id?: string;
  platform: 'twitter' | 'linkedin' | 'instagram';
  content: string | string[];
  scheduledAt: Date;
  status: 'scheduled' | 'posted' | 'failed';
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

// In-memory storage for development (replace with Firestore in production)
const draftsStore = new Map<string, Draft>();
const scheduledStore = new Map<string, ScheduledPost>();
const postedStore = new Map<string, PostedContent>();

export class MarketingStorage {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  // ============================================================================
  // DRAFTS
  // ============================================================================

  async saveDraft(draft: Draft): Promise<string> {
    const id = `draft_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const draftWithId = { ...draft, id };
    
    draftsStore.set(`${this.userId}:${id}`, draftWithId);
    
    log.debug({ userId: this.userId, draftId: id }, '📝 Draft saved');
    
    return id;
  }

  async getDraft(draftId: string): Promise<Draft | null> {
    return draftsStore.get(`${this.userId}:${draftId}`) || null;
  }

  async listDrafts(): Promise<Draft[]> {
    const drafts: Draft[] = [];
    for (const [key, value] of draftsStore.entries()) {
      if (key.startsWith(`${this.userId}:`)) {
        drafts.push(value);
      }
    }
    return drafts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async deleteDraft(draftId: string): Promise<void> {
    draftsStore.delete(`${this.userId}:${draftId}`);
  }

  // ============================================================================
  // SCHEDULED POSTS
  // ============================================================================

  async schedulePost(post: Omit<ScheduledPost, 'id'>): Promise<string> {
    const id = `sched_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const postWithId = { ...post, id };
    
    scheduledStore.set(`${this.userId}:${id}`, postWithId);
    
    log.debug({ userId: this.userId, scheduleId: id, scheduledAt: post.scheduledAt }, '📅 Post scheduled');
    
    return id;
  }

  async getScheduledPosts(filters?: {
    platform?: string;
    status?: string;
    limit?: number;
  }): Promise<ScheduledPost[]> {
    const posts: ScheduledPost[] = [];
    
    for (const [key, value] of scheduledStore.entries()) {
      if (key.startsWith(`${this.userId}:`)) {
        // Apply filters
        if (filters?.platform && value.platform !== filters.platform) continue;
        if (filters?.status && value.status !== filters.status) continue;
        
        posts.push(value);
      }
    }

    // Sort by scheduled time
    posts.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

    // Apply limit
    if (filters?.limit) {
      return posts.slice(0, filters.limit);
    }

    return posts;
  }

  async updateScheduledPost(id: string, update: Partial<ScheduledPost>): Promise<void> {
    const key = `${this.userId}:${id}`;
    const existing = scheduledStore.get(key);
    
    if (existing) {
      scheduledStore.set(key, { ...existing, ...update });
    }
  }

  async deleteScheduledPost(id: string): Promise<void> {
    scheduledStore.delete(`${this.userId}:${id}`);
  }

  // ============================================================================
  // POSTED CONTENT (History)
  // ============================================================================

  async savePostedContent(content: Omit<PostedContent, 'id'>): Promise<string> {
    const id = `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const postWithId = { ...content, id };
    
    postedStore.set(`${this.userId}:${id}`, postWithId);
    
    log.debug({ userId: this.userId, postId: id }, '✅ Posted content saved');
    
    return id;
  }

  async getPostedContent(filters?: {
    platform?: string;
    limit?: number;
    startDate?: Date;
    endDate?: Date;
  }): Promise<PostedContent[]> {
    const posts: PostedContent[] = [];
    
    for (const [key, value] of postedStore.entries()) {
      if (key.startsWith(`${this.userId}:`)) {
        if (filters?.platform && value.platform !== filters.platform) continue;
        if (filters?.startDate && value.postedAt < filters.startDate) continue;
        if (filters?.endDate && value.postedAt > filters.endDate) continue;
        
        posts.push(value);
      }
    }

    posts.sort((a, b) => b.postedAt.getTime() - a.postedAt.getTime());

    if (filters?.limit) {
      return posts.slice(0, filters.limit);
    }

    return posts;
  }

  // ============================================================================
  // ANALYTICS
  // ============================================================================

  async getAnalytics(query: AnalyticsQuery): Promise<AnalyticsResult> {
    // Calculate date range
    const now = new Date();
    let startDate: Date;
    
    switch (query.period) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'quarter':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
    }

    const posts = await this.getPostedContent({
      platform: query.platform,
      startDate,
      endDate: now,
    });

    if (posts.length === 0) {
      return {
        totalPosts: 0,
        insights: [],
      };
    }

    // Aggregate analytics
    const twitterPosts = posts.filter(p => p.platform === 'twitter');
    const linkedinPosts = posts.filter(p => p.platform === 'linkedin');

    const result: AnalyticsResult = {
      totalPosts: posts.length,
      insights: [],
    };

    if (twitterPosts.length > 0) {
      const totalImpressions = twitterPosts.reduce(
        (sum, p) => sum + (p.analytics?.impressions || 0),
        0
      );
      const totalEngagements = twitterPosts.reduce(
        (sum, p) => sum + (p.analytics?.engagements || 0),
        0
      );
      
      // Find best performer
      const bestTwitter = twitterPosts.reduce((best, p) => {
        const score = (p.analytics?.engagements || 0) / (p.analytics?.impressions || 1);
        const bestScore = (best.analytics?.engagements || 0) / (best.analytics?.impressions || 1);
        return score > bestScore ? p : best;
      });

      result.twitter = {
        posts: twitterPosts.length,
        impressions: totalImpressions,
        engagements: totalEngagements,
        engagementRate: totalImpressions > 0 
          ? ((totalEngagements / totalImpressions) * 100).toFixed(1) 
          : '0',
        bestPost: typeof bestTwitter.content === 'string' 
          ? bestTwitter.content 
          : bestTwitter.content[0],
      };
    }

    if (linkedinPosts.length > 0) {
      const totalImpressions = linkedinPosts.reduce(
        (sum, p) => sum + (p.analytics?.impressions || 0),
        0
      );
      const totalReactions = linkedinPosts.reduce(
        (sum, p) => sum + (p.analytics?.likes || 0),
        0
      );
      const totalComments = linkedinPosts.reduce(
        (sum, p) => sum + (p.analytics?.comments || 0),
        0
      );

      const bestLinkedIn = linkedinPosts.reduce((best, p) => {
        const score = (p.analytics?.likes || 0) + (p.analytics?.comments || 0) * 2;
        const bestScore = (best.analytics?.likes || 0) + (best.analytics?.comments || 0) * 2;
        return score > bestScore ? p : best;
      });

      result.linkedin = {
        posts: linkedinPosts.length,
        impressions: totalImpressions,
        reactions: totalReactions,
        comments: totalComments,
        bestPost: typeof bestLinkedIn.content === 'string'
          ? bestLinkedIn.content
          : bestLinkedIn.content[0],
      };
    }

    // Generate insights
    if (result.twitter && result.twitter.engagementRate) {
      const rate = parseFloat(result.twitter.engagementRate);
      if (rate > 3) {
        result.insights.push('Your Twitter engagement is above average! Keep up the good content.');
      } else if (rate < 1) {
        result.insights.push('Twitter engagement is low. Try posting at different times or with more engaging hooks.');
      }
    }

    if (result.linkedin && result.linkedin.comments > 5) {
      result.insights.push('LinkedIn comments are strong - your content is sparking conversations!');
    }

    return result;
  }
}

export default MarketingStorage;

