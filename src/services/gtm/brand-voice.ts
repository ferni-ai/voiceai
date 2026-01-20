/**
 * Ferni Brand Voice Configuration
 *
 * Encodes the brand voice guidelines from BRAND-VOICE-GUIDE.md
 * as structured data for content generation and validation.
 *
 * @module services/gtm/brand-voice
 */

import type { BrandVoice, ContentTone, WeeklySchedule, MonthlyTheme } from './types.js';

// ============================================================================
// CORE BRAND VOICE
// ============================================================================

export const FERNI_BRAND_VOICE: BrandVoice = {
  phrases: {
    embrace: [
      'present',
      'notice',
      'remember',
      'celebrate',
      'show up',
      'hold space',
      'in your corner',
      'pays attention',
      'genuine connection',
      'we actually remember',
      'we notice things',
      "I'm here",
      'take your time',
      "what's on your mind",
      'that matters',
      'this is huge',
    ],
    avoid: [
      'AI',
      'artificial',
      'bot',
      'chatbot',
      'natural language',
      'machine learning',
      'algorithm',
      'user',
      'human-like',
      'feels human',
      'simulate',
      'advice',
      'advisor',
      'recommend',
      'should',
      'As an AI',
      "I'm designed to",
      'My programming',
      '24/7 availability',
      'unlimited conversations',
      'virtual assistant',
      'digital companion',
      'revolutionary',
      'game-changing',
      'disruptive',
    ],
  },
  toneByContext: {
    celebration: 'warm',
    support: 'present',
    coaching: 'direct',
    'check-in': 'warm',
    announcement: 'confident',
    tutorial: 'direct',
    'thought-leadership': 'inspiring',
    community: 'warm',
    changelog: 'confident',
  },
  platformVoice: {
    twitter: {
      maxLength: 280,
      formality: 'casual',
      emojiUsage: 'minimal',
      hashtagStrategy: 'minimal',
    },
    linkedin: {
      maxLength: 3000,
      formality: 'professional',
      emojiUsage: 'minimal',
      hashtagStrategy: 'standard',
    },
    discord: {
      maxLength: 2000,
      formality: 'casual',
      emojiUsage: 'moderate',
      hashtagStrategy: 'none',
    },
    blog: {
      maxLength: 50000,
      formality: 'balanced',
      emojiUsage: 'none',
      hashtagStrategy: 'none',
    },
  },
};

// ============================================================================
// BRAND COLORS (from FERNI-BRAND-GUIDELINES.md)
// ============================================================================

export const BRAND_COLORS = {
  // Primary
  ferni: '#4a6741', // Deep Sage - Grounding leader
  accent: '#3D5A45', // Forest Green - Primary CTA

  // Backgrounds
  paperCream: '#F5F1E8',
  sand: '#E8E0D5',
  elevated: '#FFFDFB',

  // Text
  naturalInk: '#2C2520',
  secondary: '#5C544A',
  muted: '#756A5E',
  dimmed: '#A89D90',

  // Personas
  personas: {
    ferni: '#4a6741',
    maya: '#a67a6a',
    peter: '#3a6b73',
    jordan: '#c4856a',
    alex: '#5a6b8a',
    nayan: '#b8956a',
  },

  // Content category accents
  categories: {
    tutorial: '#10b981', // Emerald
    deepDive: '#8b5cf6', // Violet
    changelog: '#f59e0b', // Amber
    caseStudy: '#06b6d4', // Cyan
    community: '#ec4899', // Pink
    quickTip: '#38bdf8', // Sky
    industryInsight: '#a855f7', // Purple
  },
} as const;

// ============================================================================
// TYPOGRAPHY (from FERNI-BRAND-GUIDELINES.md)
// ============================================================================

export const TYPOGRAPHY = {
  display: 'Plus Jakarta Sans',
  body: 'Inter',
  accent: 'Sora',
  mono: 'JetBrains Mono',
} as const;

// ============================================================================
// WEEKLY CONTENT SCHEDULE
// ============================================================================

export const DEFAULT_WEEKLY_SCHEDULE: WeeklySchedule = {
  monday: { category: 'tutorial', pillar: 'tutorials' },
  tuesday: { category: 'deep-dive', pillar: 'thought-leadership' },
  wednesday: { category: 'changelog', pillar: 'product-updates' },
  thursday: { category: 'case-study', pillar: 'community' },
  friday: { category: 'quick-tip', pillar: 'tutorials' },
  saturday: { category: 'industry-insight', pillar: 'thought-leadership' },
  sunday: { category: 'week-preview', pillar: 'product-updates' },
};

// ============================================================================
// MONTHLY THEMES
// ============================================================================

export const MONTHLY_THEMES: MonthlyTheme[] = [
  {
    month: 1,
    name: 'New Beginnings',
    description: 'Getting started guides, fresh perspectives',
    colorAccent: '#06b6d4', // Cyan
    focusTopics: ['getting-started', 'onboarding', 'resolutions', 'goals'],
  },
  {
    month: 2,
    name: 'Connection',
    description: 'Voice + Relationships, emotional intelligence',
    colorAccent: '#ec4899', // Pink
    focusTopics: ['emotional-ai', 'relationships', 'empathy', 'listening'],
  },
  {
    month: 3,
    name: 'Spring Cleaning',
    description: 'Code quality, best practices, refactoring',
    colorAccent: '#10b981', // Green
    focusTopics: ['code-quality', 'testing', 'refactoring', 'optimization'],
  },
  {
    month: 4,
    name: 'Testing & Reliability',
    description: 'Testing strategies, reliability patterns',
    colorAccent: '#3b82f6', // Blue
    focusTopics: ['testing', 'reliability', 'monitoring', 'debugging'],
  },
  {
    month: 5,
    name: 'Performance Week',
    description: 'Speed, latency, optimization',
    colorAccent: '#eab308', // Yellow
    focusTopics: ['performance', 'latency', 'caching', 'scaling'],
  },
  {
    month: 6,
    name: 'Mid-Year Review',
    description: 'Progress, learnings, roadmap',
    colorAccent: '#8b5cf6', // Purple
    focusTopics: ['retrospective', 'roadmap', 'milestones', 'community'],
  },
  {
    month: 7,
    name: 'Hackathon Season',
    description: 'Building, experimenting, community projects',
    colorAccent: '#f97316', // Orange
    focusTopics: ['hackathon', 'projects', 'experiments', 'community'],
  },
  {
    month: 8,
    name: 'Back to Basics',
    description: 'Fundamentals, core concepts revisited',
    colorAccent: '#14b8a6', // Teal
    focusTopics: ['fundamentals', 'best-practices', 'patterns', 'architecture'],
  },
  {
    month: 9,
    name: 'Enterprise Ready',
    description: 'Security, compliance, scale',
    colorAccent: '#1e3a5f', // Navy
    focusTopics: ['enterprise', 'security', 'compliance', 'scale'],
  },
  {
    month: 10,
    name: 'Debugging Horror Stories',
    description: 'Debugging tales, lessons learned',
    colorAccent: '#f97316', // Orange
    focusTopics: ['debugging', 'postmortems', 'lessons', 'war-stories'],
  },
  {
    month: 11,
    name: 'Gratitude',
    description: 'Community highlights, appreciation',
    colorAccent: '#d97706', // Amber
    focusTopics: ['community', 'contributors', 'gratitude', 'celebration'],
  },
  {
    month: 12,
    name: 'Year in Review',
    description: 'Retrospective, wins, looking ahead',
    colorAccent: '#ca8a04', // Gold
    focusTopics: ['retrospective', 'wins', 'roadmap', 'celebration'],
  },
];

// ============================================================================
// CONTENT TEMPLATES
// ============================================================================

export const HEADLINE_PATTERNS = {
  /** Statement of truth */
  statement: [
    'Finally, someone who {verb}.',
    'The {noun} who actually {verb}.',
    'Someone in your corner. {qualifier}.',
  ],
  /** Question that resonates */
  question: [
    'What if someone actually {verb}?',
    'Who {verb} your {noun}?',
    "When's the last time someone really {verb}?",
  ],
  /** Bold claim */
  boldClaim: [
    'Better than {comparison}.',
    'Every {noun}, {adjective}.',
    '{noun} that never {negative}.',
  ],
};

export const WRITING_TEMPLATES = {
  tweetThread: `🧵 {hook}

{point1}

{point2}

{point3}

{callToAction}`,

  linkedInPost: `{hook}

{body}

{insight}

{callToAction}

{hashtags}`,

  discordAnnouncement: `**{title}**

{body}

{callToAction}`,

  blogIntro: `{hook}

In this {category}, we'll {promise}.

You'll learn:
{bulletPoints}

Let's get started.`,
};

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

export function validateBrandVoice(content: string): {
  isValid: boolean;
  warnings: string[];
  suggestions: string[];
} {
  const warnings: string[] = [];
  const suggestions: string[] = [];

  // Check for avoided phrases
  for (const phrase of FERNI_BRAND_VOICE.phrases.avoid) {
    if (content.toLowerCase().includes(phrase.toLowerCase())) {
      warnings.push(`Contains avoided phrase: "${phrase}"`);
    }
  }

  // Check for overly formal language
  const formalPatterns = [
    /\bplease\b/gi,
    /\bkindly\b/gi,
    /\butilize\b/gi,
    /\bleverage\b/gi,
    /\bsynergies?\b/gi,
    /\bsolution\b/gi,
    /\bworld-class\b/gi,
    /\bcutting-edge\b/gi,
  ];
  for (const pattern of formalPatterns) {
    if (pattern.test(content)) {
      warnings.push(`Overly formal language detected: ${pattern.source}`);
    }
  }

  // Check for marketing speak
  const marketingPatterns = [
    /\brevolutionary\b/gi,
    /\bgame-chang/gi,
    /\bdisruptive\b/gi,
    /\bseamless\b/gi,
    /\brobust\b/gi,
    /\bscalable\b/gi,
    /\bholistic\b/gi,
  ];
  for (const pattern of marketingPatterns) {
    if (pattern.test(content)) {
      warnings.push(`Marketing speak detected: ${pattern.source}`);
    }
  }

  // Suggest brand phrases if content is missing warmth
  const hasWarmth = FERNI_BRAND_VOICE.phrases.embrace.some((phrase) =>
    content.toLowerCase().includes(phrase.toLowerCase())
  );
  if (!hasWarmth) {
    suggestions.push(
      'Consider adding brand phrases like: "pays attention", "we notice", "in your corner"'
    );
  }

  return {
    isValid: warnings.length === 0,
    warnings,
    suggestions,
  };
}

export function getToneForContext(context: string): ContentTone {
  return FERNI_BRAND_VOICE.toneByContext[context] || 'warm';
}

export function getMonthlyTheme(month: number): MonthlyTheme | undefined {
  return MONTHLY_THEMES.find((t) => t.month === month);
}

export function getCategoryColor(category: string): string {
  const key = category.replace(/-/g, '') as keyof typeof BRAND_COLORS.categories;
  return BRAND_COLORS.categories[key] || BRAND_COLORS.ferni;
}
