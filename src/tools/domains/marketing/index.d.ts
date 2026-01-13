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
import type { ToolDefinition } from '../../registry/types.js';
export declare const getToolDefinitions: () => Promise<ToolDefinition[]>, domain: import("../../registry/types.js").ToolDomain, definitions: ToolDefinition[];
export default getToolDefinitions;
//# sourceMappingURL=index.d.ts.map