/**
 * Marketing Domain Tools
 *
 * Social media management tools that Alex (Communications Specialist) can use
 * to help manage Ferni's marketing - true dogfooding of our platform.
 *
 * DOMAIN: marketing
 * TOOLS:
 *   - generateSocialContent: AI-generate social posts from blog content
 *   - postToTwitter: Post directly to Twitter/X
 *   - postToLinkedIn: Post directly to LinkedIn
 *   - listScheduledPosts: View scheduled content
 *   - getMarketingAnalytics: View post performance
 *
 * Usage:
 *   "Alex, write a Twitter thread about our latest blog"
 *   "Alex, post that LinkedIn draft we wrote yesterday"
 *   "Alex, how did our posts perform last week?"
 */
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { createDomainExport } from '../../registry/loader.js';
// Import the actual API clients
import { TwitterClient } from './twitter-client.js';
import { LinkedInClient } from './linkedin-client.js';
import { MarketingStorage } from './storage.js';
import { generateSocialContentFromBlog } from './content-generator.js';
const log = getLogger();
// ============================================================================
// GENERATE SOCIAL CONTENT TOOL
// ============================================================================
const generateSocialContentDef = {
    id: 'generateSocialContent',
    name: 'Generate Social Content',
    description: 'Generate platform-specific social media content from a blog post, topic, or announcement. Creates ready-to-post content for Twitter threads, LinkedIn posts, and Instagram carousels.',
    domain: 'marketing',
    tags: ['marketing', 'social', 'content', 'generation', 'ai'],
    create: (ctx) => llm.tool({
        description: `Generate social media content from source material. Use this when asked to create Twitter threads, LinkedIn posts, or Instagram content. Always confirm the generated content with the user before posting.`,
        parameters: z.object({
            source: z.enum(['blog', 'topic', 'announcement']).describe('What to generate content from'),
            blogUrl: z
                .string()
                .optional()
                .describe('URL or path to blog post (required if source is blog)'),
            topic: z.string().optional().describe('Topic to write about (required if source is topic)'),
            announcement: z
                .string()
                .optional()
                .describe('Announcement text (required if source is announcement)'),
            platforms: z
                .array(z.enum(['twitter', 'linkedin', 'instagram']))
                .default(['twitter', 'linkedin'])
                .describe('Which platforms to generate content for'),
            tone: z
                .enum(['professional', 'casual', 'thought-leadership'])
                .default('thought-leadership')
                .describe('Tone of the content'),
        }),
        execute: async (params) => {
            log.info({ source: params.source, platforms: params.platforms }, '📝 Generating social content');
            try {
                const content = await generateSocialContentFromBlog({
                    source: params.source,
                    blogUrl: params.blogUrl,
                    topic: params.topic,
                    announcement: params.announcement,
                    platforms: params.platforms,
                    tone: params.tone,
                });
                // Format response for voice
                let response = "Here's what I've drafted:\n\n";
                if (content.twitter && params.platforms.includes('twitter')) {
                    response += `**Twitter Thread** (${content.twitter.thread.length} tweets):\n`;
                    content.twitter.thread.forEach((tweet, i) => {
                        response += `${i + 1}. ${tweet.substring(0, 100)}${tweet.length > 100 ? '...' : ''}\n`;
                    });
                    response += '\n';
                }
                if (content.linkedin && params.platforms.includes('linkedin')) {
                    response += `**LinkedIn Post** (${content.linkedin.post.length} characters):\n`;
                    response += `${content.linkedin.post.substring(0, 200)}...\n\n`;
                }
                if (content.instagram && params.platforms.includes('instagram')) {
                    response += `**Instagram Carousel** (${content.instagram.slides.length} slides):\n`;
                    response += `Slide 1: ${content.instagram.slides[0]}\n`;
                    response += `Caption: ${content.instagram.caption.substring(0, 100)}...\n\n`;
                }
                response +=
                    'Would you like me to post any of these now, schedule them for later, or would you like to make changes?';
                // Store draft in memory for later posting
                const storage = new MarketingStorage(ctx.userId);
                const draftId = await storage.saveDraft({
                    source: params.source,
                    content,
                    createdAt: new Date(),
                });
                log.info({ draftId }, '📝 Draft saved');
                return response;
            }
            catch (error) {
                log.error({ error: String(error) }, '📝 Content generation failed');
                return `I had trouble generating that content. ${String(error)}`;
            }
        },
    }),
};
// ============================================================================
// POST TO TWITTER TOOL
// ============================================================================
const postToTwitterDef = {
    id: 'postToTwitter',
    name: 'Post to Twitter',
    description: 'Post content directly to Twitter/X. Can post single tweets or full threads. Always confirm with user before posting.',
    domain: 'marketing',
    tags: ['marketing', 'social', 'twitter', 'publish'],
    create: (ctx) => llm.tool({
        description: `Post to Twitter/X. Use 'draft' to save without posting, 'post' to publish immediately, 'schedule' to post later. ALWAYS confirm with the user before using action='post'.`,
        parameters: z.object({
            action: z
                .enum(['post', 'schedule', 'draft'])
                .describe("Action to take - use 'draft' to save, 'post' to publish now, 'schedule' to post later"),
            content: z
                .union([z.string(), z.array(z.string())])
                .describe('Tweet content (string for single tweet, array for thread)'),
            scheduledAt: z
                .string()
                .optional()
                .describe('When to post (ISO timestamp, required for schedule action)'),
            useDraft: z.string().optional().describe('Use a previously generated draft by ID'),
        }),
        execute: async (params) => {
            log.info({ action: params.action }, '🐦 Twitter tool called');
            try {
                const storage = new MarketingStorage(ctx.userId);
                // Get content from draft if specified
                let content = params.content;
                if (params.useDraft) {
                    const draft = await storage.getDraft(params.useDraft);
                    if (draft?.content?.twitter) {
                        content = draft.content.twitter.thread;
                    }
                }
                if (params.action === 'draft') {
                    const draftId = await storage.saveDraft({
                        platform: 'twitter',
                        content: { twitter: { thread: Array.isArray(content) ? content : [content] } },
                        createdAt: new Date(),
                    });
                    return `Saved as draft! I'll remember this for when you're ready to post. Draft ID: ${draftId}`;
                }
                if (params.action === 'schedule') {
                    if (!params.scheduledAt) {
                        return 'When would you like me to schedule this? Give me a date and time.';
                    }
                    const scheduledId = await storage.schedulePost({
                        platform: 'twitter',
                        content: Array.isArray(content) ? content : [content],
                        scheduledAt: new Date(params.scheduledAt),
                        status: 'scheduled',
                    });
                    const scheduledTime = new Date(params.scheduledAt).toLocaleString();
                    return `Scheduled! This will post to Twitter on ${scheduledTime}. Schedule ID: ${scheduledId}`;
                }
                // action === 'post'
                const client = new TwitterClient();
                if (!client.isConfigured()) {
                    return "Twitter isn't connected yet. Would you like me to help you connect your Twitter account?";
                }
                const thread = Array.isArray(content) ? content : [content];
                const result = await client.postThread(thread);
                if (result.success) {
                    // Save to history
                    await storage.savePostedContent({
                        platform: 'twitter',
                        content: thread,
                        postedAt: new Date(),
                        postIds: result.tweetIds,
                        url: result.url,
                    });
                    return `Posted! Here's your tweet: ${result.url}\n\nI'll track how it performs.`;
                }
                else {
                    return `I couldn't post that. Twitter said: ${result.error}`;
                }
            }
            catch (error) {
                log.error({ error: String(error) }, '🐦 Twitter post failed');
                return `Something went wrong posting to Twitter: ${String(error)}`;
            }
        },
    }),
};
// ============================================================================
// POST TO LINKEDIN TOOL
// ============================================================================
const postToLinkedInDef = {
    id: 'postToLinkedIn',
    name: 'Post to LinkedIn',
    description: 'Post content directly to LinkedIn. Always confirm with user before posting.',
    domain: 'marketing',
    tags: ['marketing', 'social', 'linkedin', 'publish'],
    create: (ctx) => llm.tool({
        description: `Post to LinkedIn. Use 'draft' to save without posting, 'post' to publish immediately, 'schedule' to post later. ALWAYS confirm with the user before using action='post'.`,
        parameters: z.object({
            action: z
                .enum(['post', 'schedule', 'draft'])
                .describe("Action to take - use 'draft' to save, 'post' to publish now, 'schedule' to post later"),
            content: z.string().describe('Post content'),
            visibility: z
                .enum(['public', 'connections'])
                .default('public')
                .describe('Who can see the post'),
            scheduledAt: z
                .string()
                .optional()
                .describe('When to post (ISO timestamp, required for schedule action)'),
            useDraft: z.string().optional().describe('Use a previously generated draft by ID'),
        }),
        execute: async (params) => {
            log.info({ action: params.action }, '💼 LinkedIn tool called');
            try {
                const storage = new MarketingStorage(ctx.userId);
                // Get content from draft if specified
                let content = params.content;
                if (params.useDraft) {
                    const draft = await storage.getDraft(params.useDraft);
                    if (draft?.content?.linkedin) {
                        content = draft.content.linkedin.post;
                    }
                }
                if (params.action === 'draft') {
                    const draftId = await storage.saveDraft({
                        platform: 'linkedin',
                        content: { linkedin: { post: content } },
                        createdAt: new Date(),
                    });
                    return `Saved as draft! I'll remember this for when you're ready to post. Draft ID: ${draftId}`;
                }
                if (params.action === 'schedule') {
                    if (!params.scheduledAt) {
                        return 'When would you like me to schedule this? Give me a date and time.';
                    }
                    const scheduledId = await storage.schedulePost({
                        platform: 'linkedin',
                        content,
                        scheduledAt: new Date(params.scheduledAt),
                        status: 'scheduled',
                    });
                    const scheduledTime = new Date(params.scheduledAt).toLocaleString();
                    return `Scheduled! This will post to LinkedIn on ${scheduledTime}. Schedule ID: ${scheduledId}`;
                }
                // action === 'post'
                const client = new LinkedInClient();
                if (!client.isConfigured()) {
                    return "LinkedIn isn't connected yet. Would you like me to help you connect your LinkedIn account?";
                }
                const result = await client.post({
                    content,
                    visibility: params.visibility,
                });
                if (result.success) {
                    await storage.savePostedContent({
                        platform: 'linkedin',
                        content,
                        postedAt: new Date(),
                        postId: result.postId,
                        url: result.url,
                    });
                    return `Posted to LinkedIn! Here's your post: ${result.url}\n\nI'll track how it performs.`;
                }
                else {
                    return `I couldn't post that. LinkedIn said: ${result.error}`;
                }
            }
            catch (error) {
                log.error({ error: String(error) }, '💼 LinkedIn post failed');
                return `Something went wrong posting to LinkedIn: ${String(error)}`;
            }
        },
    }),
};
// ============================================================================
// LIST SCHEDULED POSTS TOOL
// ============================================================================
const listScheduledPostsDef = {
    id: 'listScheduledPosts',
    name: 'List Scheduled Posts',
    description: 'View all scheduled social media posts and their status.',
    domain: 'marketing',
    tags: ['marketing', 'social', 'schedule', 'list'],
    create: (ctx) => llm.tool({
        description: `List scheduled social media posts. Use to check what's coming up or manage the queue.`,
        parameters: z.object({
            platform: z
                .enum(['twitter', 'linkedin', 'all'])
                .default('all')
                .describe('Filter by platform'),
            status: z
                .enum(['scheduled', 'posted', 'failed', 'all'])
                .default('scheduled')
                .describe('Filter by status'),
            limit: z.number().default(10).describe('Maximum posts to return'),
        }),
        execute: async (params) => {
            log.info({ platform: params.platform, status: params.status }, '📅 Listing scheduled posts');
            try {
                const storage = new MarketingStorage(ctx.userId);
                const posts = await storage.getScheduledPosts({
                    platform: params.platform === 'all' ? undefined : params.platform,
                    status: params.status === 'all' ? undefined : params.status,
                    limit: params.limit,
                });
                if (posts.length === 0) {
                    return 'No scheduled posts found. Would you like to create some content?';
                }
                let response = `Here's what's scheduled:\n\n`;
                for (const post of posts) {
                    const time = post.scheduledAt.toLocaleString();
                    const platform = post.platform.charAt(0).toUpperCase() + post.platform.slice(1);
                    const preview = typeof post.content === 'string'
                        ? post.content.substring(0, 50)
                        : post.content[0].substring(0, 50);
                    response += `• **${platform}** (${time}): "${preview}..." [${post.status}]\n`;
                }
                response += `\nWould you like to reschedule any of these or create new content?`;
                return response;
            }
            catch (error) {
                log.error({ error: String(error) }, '📅 Failed to list posts');
                return `I had trouble getting the schedule. ${String(error)}`;
            }
        },
    }),
};
// ============================================================================
// GET MARKETING ANALYTICS TOOL
// ============================================================================
const getMarketingAnalyticsDef = {
    id: 'getMarketingAnalytics',
    name: 'Get Marketing Analytics',
    description: 'View performance metrics for social media posts.',
    domain: 'marketing',
    tags: ['marketing', 'social', 'analytics', 'metrics'],
    create: (ctx) => llm.tool({
        description: `Get social media analytics. Shows impressions, engagement, clicks for posts.`,
        parameters: z.object({
            platform: z
                .enum(['twitter', 'linkedin', 'all'])
                .default('all')
                .describe('Which platform to get analytics for'),
            period: z
                .enum(['today', 'week', 'month', 'quarter'])
                .default('week')
                .describe('Time period for analytics'),
        }),
        execute: async (params) => {
            log.info({ platform: params.platform, period: params.period }, '📊 Getting analytics');
            try {
                const storage = new MarketingStorage(ctx.userId);
                const analytics = await storage.getAnalytics({
                    platform: params.platform === 'all' ? undefined : params.platform,
                    period: params.period,
                });
                if (!analytics || analytics.totalPosts === 0) {
                    return "No analytics data yet. Once you start posting, I'll track how your content performs!";
                }
                let response = `Here's your ${params.period}ly social media summary:\n\n`;
                if (analytics.twitter && (params.platform === 'all' || params.platform === 'twitter')) {
                    response += `**Twitter**\n`;
                    response += `• ${analytics.twitter.posts} posts\n`;
                    response += `• ${analytics.twitter.impressions.toLocaleString()} impressions\n`;
                    response += `• ${analytics.twitter.engagements} engagements (${analytics.twitter.engagementRate}% rate)\n`;
                    if (analytics.twitter.bestPost) {
                        response += `• Best performer: "${analytics.twitter.bestPost.substring(0, 40)}..."\n`;
                    }
                    response += '\n';
                }
                if (analytics.linkedin && (params.platform === 'all' || params.platform === 'linkedin')) {
                    response += `**LinkedIn**\n`;
                    response += `• ${analytics.linkedin.posts} posts\n`;
                    response += `• ${analytics.linkedin.impressions.toLocaleString()} impressions\n`;
                    response += `• ${analytics.linkedin.reactions} reactions, ${analytics.linkedin.comments} comments\n`;
                    if (analytics.linkedin.bestPost) {
                        response += `• Best performer: "${analytics.linkedin.bestPost.substring(0, 40)}..."\n`;
                    }
                    response += '\n';
                }
                // Add insights
                if (analytics.insights && analytics.insights.length > 0) {
                    response += `**Insights**\n`;
                    for (const insight of analytics.insights) {
                        response += `• ${insight}\n`;
                    }
                }
                return response;
            }
            catch (error) {
                log.error({ error: String(error) }, '📊 Failed to get analytics');
                return `I had trouble getting analytics. ${String(error)}`;
            }
        },
    }),
};
// ============================================================================
// DOMAIN EXPORT
// ============================================================================
const marketingTools = [
    generateSocialContentDef,
    postToTwitterDef,
    postToLinkedInDef,
    listScheduledPostsDef,
    getMarketingAnalyticsDef,
];
export const { getToolDefinitions, domain, definitions } = createDomainExport('marketing', marketingTools);
export default getToolDefinitions;
//# sourceMappingURL=index.js.map