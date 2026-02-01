/**
 * Marketing Semantic Routing
 *
 * Routes to: domains/marketing
 * Tools: generateSocialContent, postToTwitter, postToLinkedIn,
 *        listScheduledPosts, getMarketingAnalytics
 *
 * Social media management tools for content creation and publishing.
 * Requires Twitter/LinkedIn OAuth setup.
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// GENERATE SOCIAL CONTENT
// ============================================================================

export const generateSocialContentTool: SemanticToolDefinition = {
  id: 'marketing_generate_content',
  name: 'Generate Social Content',
  description: 'Generate social media content for Twitter/LinkedIn.',
  shortDescription: 'create social posts',
  category: 'productivity',
  priority: 2,

  triggers: {
    phrases: [
      'write a tweet',
      'create a linkedin post',
      'draft social media content',
      'write something for twitter',
      'create a thread',
      'write a post about',
      'help me with social media',
      'generate social content',
    ],
    patterns: [
      /\b(write|create|draft|generate)\s+(a\s+)?(tweet|thread|post|content)\b/i,
      /\b(write|create)\s+(something\s+)?for\s+(twitter|linkedin|social\s+media)\b/i,
      /\b(help|assist)\s+(me\s+)?with\s+social\s+media\b/i,
      /\bsocial\s+media\s+content\b/i,
    ],
    keywords: [
      { word: 'tweet', weight: 1.0 },
      { word: 'linkedin', weight: 1.0 },
      { word: 'post', weight: 0.85 },
      { word: 'thread', weight: 0.9 },
      { word: 'social media', weight: 0.95 },
      { word: 'content', weight: 0.8 },
    ],
    antiKeywords: ['read tweet', 'check twitter'],
  },

  examples: [
    'Write a tweet about AI life coaching',
    'Create a LinkedIn post for my business',
    'Draft a Twitter thread about productivity',
  ],

  counterExamples: ['Read my twitter feed', 'Check what is trending on twitter'],

  arguments: [
    { name: 'topic', type: 'string', required: true, description: 'Topic to write about' },
    { name: 'platform', type: 'string', required: false, description: 'twitter or linkedin' },
    { name: 'tone', type: 'string', required: false, description: 'Tone of content' },
  ],

  confidence: {
    baseScore: 0.85,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.1,
    negativeKeywordPenalty: 0.4,
  },

  delegateTo: 'domains/marketing',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'generateSocialContent',
      args,
      delegateTo: 'domains/marketing',
    };
  },
};

// ============================================================================
// POST TO TWITTER
// ============================================================================

export const postToTwitterTool: SemanticToolDefinition = {
  id: 'marketing_post_twitter',
  name: 'Post to Twitter',
  description: 'Post content to Twitter/X.',
  shortDescription: 'post tweet',
  category: 'productivity',
  priority: 2,

  triggers: {
    phrases: [
      'post this to twitter',
      'tweet this',
      'publish to twitter',
      'send this tweet',
      'post my tweet',
      'share on twitter',
    ],
    patterns: [
      /\b(post|publish|send|share)\s+(this\s+)?(to\s+)?twitter\b/i,
      /\btweet\s+this\b/i,
      /\b(post|send)\s+(my\s+)?tweet\b/i,
    ],
    keywords: [
      { word: 'twitter', weight: 1.0 },
      { word: 'tweet', weight: 1.0 },
      { word: 'post', weight: 0.9 },
      { word: 'publish', weight: 0.85 },
    ],
    antiKeywords: ['write', 'draft', 'create'],
  },

  examples: ['Post this to Twitter', 'Tweet this out', 'Publish my tweet'],

  counterExamples: ['Write me a tweet'],

  arguments: [
    { name: 'content', type: 'string', required: true, description: 'Content to post' },
    { name: 'action', type: 'string', required: false, description: 'post, draft, or schedule' },
  ],

  confidence: {
    baseScore: 0.9,
    patternMatchBonus: 0.05,
    keywordDensityMultiplier: 1.05,
    negativeKeywordPenalty: 0.45,
  },

  delegateTo: 'domains/marketing',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'postToTwitter',
      args,
      delegateTo: 'domains/marketing',
    };
  },
};

// ============================================================================
// POST TO LINKEDIN
// ============================================================================

export const postToLinkedInTool: SemanticToolDefinition = {
  id: 'marketing_post_linkedin',
  name: 'Post to LinkedIn',
  description: 'Post content to LinkedIn.',
  shortDescription: 'post to linkedin',
  category: 'productivity',
  priority: 2,

  triggers: {
    phrases: [
      'post this to linkedin',
      'publish on linkedin',
      'share on linkedin',
      'send this to linkedin',
      'post my linkedin update',
    ],
    patterns: [
      /\b(post|publish|share|send)\s+(this\s+)?(to\s+|on\s+)?linkedin\b/i,
      /\blinkedin\s+(post|update)\b/i,
    ],
    keywords: [
      { word: 'linkedin', weight: 1.0 },
      { word: 'post', weight: 0.9 },
      { word: 'publish', weight: 0.85 },
      { word: 'professional', weight: 0.75 },
    ],
    antiKeywords: ['write', 'draft', 'create'],
  },

  examples: ['Post this to LinkedIn', 'Publish my LinkedIn update', 'Share this on LinkedIn'],

  counterExamples: ['Write me a LinkedIn post'],

  arguments: [
    { name: 'content', type: 'string', required: true, description: 'Content to post' },
    { name: 'visibility', type: 'string', required: false, description: 'public or connections' },
  ],

  confidence: {
    baseScore: 0.9,
    patternMatchBonus: 0.05,
    keywordDensityMultiplier: 1.05,
    negativeKeywordPenalty: 0.45,
  },

  delegateTo: 'domains/marketing',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'postToLinkedIn',
      args,
      delegateTo: 'domains/marketing',
    };
  },
};

// ============================================================================
// LIST SCHEDULED POSTS
// ============================================================================

export const listScheduledPostsTool: SemanticToolDefinition = {
  id: 'marketing_list_scheduled',
  name: 'List Scheduled Posts',
  description: 'View scheduled social media posts.',
  shortDescription: 'scheduled posts',
  category: 'productivity',
  priority: 3,

  triggers: {
    phrases: [
      'show scheduled posts',
      'what posts are scheduled',
      'list my scheduled content',
      'upcoming social media posts',
      'what is scheduled to post',
    ],
    patterns: [
      /\b(show|list|view)\s+(my\s+)?scheduled\s+(posts?|content)\b/i,
      /\bwhat\s+(posts?|content)\s+(are|is)\s+scheduled\b/i,
      /\bupcoming\s+(social\s+media\s+)?posts?\b/i,
    ],
    keywords: [
      { word: 'scheduled', weight: 1.0 },
      { word: 'posts', weight: 0.9 },
      { word: 'upcoming', weight: 0.85 },
      { word: 'queue', weight: 0.85 },
    ],
    antiKeywords: ['schedule a', 'create'],
  },

  examples: [
    'Show me my scheduled posts',
    'What is coming up in my social media queue',
    'List scheduled content',
  ],

  counterExamples: ['Schedule a new post'],

  arguments: [
    { name: 'platform', type: 'string', required: false, description: 'Filter by platform' },
  ],

  confidence: {
    baseScore: 0.82,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.35,
  },

  delegateTo: 'domains/marketing',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'listScheduledPosts',
      args,
      delegateTo: 'domains/marketing',
    };
  },
};

// ============================================================================
// GET MARKETING ANALYTICS
// ============================================================================

export const getMarketingAnalyticsTool: SemanticToolDefinition = {
  id: 'marketing_analytics',
  name: 'Get Marketing Analytics',
  description: 'View social media analytics and performance.',
  shortDescription: 'social analytics',
  category: 'productivity',
  priority: 3,

  triggers: {
    phrases: [
      'how are my posts doing',
      'social media analytics',
      'twitter analytics',
      'linkedin performance',
      'engagement stats',
      'how did my content perform',
    ],
    patterns: [
      /\b(how\s+are|what\s+are)\s+(my\s+)?posts?\s+doing\b/i,
      /\b(social\s+media|twitter|linkedin)\s+analytics\b/i,
      /\bengagement\s+(stats|metrics|data)\b/i,
      /\bcontent\s+performance\b/i,
    ],
    keywords: [
      { word: 'analytics', weight: 1.0 },
      { word: 'performance', weight: 0.95 },
      { word: 'engagement', weight: 0.9 },
      { word: 'stats', weight: 0.85 },
      { word: 'metrics', weight: 0.85 },
    ],
    antiKeywords: ['create', 'post'],
  },

  examples: [
    'How are my tweets doing',
    'Show me my social media analytics',
    'What are my engagement stats',
  ],

  counterExamples: ['Post something on Twitter'],

  arguments: [
    { name: 'platform', type: 'string', required: false, description: 'Filter by platform' },
    { name: 'period', type: 'string', required: false, description: 'Time period' },
  ],

  confidence: {
    baseScore: 0.8,
    patternMatchBonus: 0.12,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.35,
  },

  delegateTo: 'domains/marketing',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'getMarketingAnalytics',
      args,
      delegateTo: 'domains/marketing',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const marketingTools: SemanticToolDefinition[] = [
  generateSocialContentTool,
  postToTwitterTool,
  postToLinkedInTool,
  listScheduledPostsTool,
  getMarketingAnalyticsTool,
];
