/**
 * GTM (Go-To-Market) Content Automation Types
 *
 * Defines the content strategy, pillars, and scheduling types
 * for Ferni's autonomous brand publishing system.
 *
 * @module services/gtm/types
 */

// ============================================================================
// CONTENT PILLARS
// ============================================================================

export type ContentPillar =
  | 'thought-leadership' // Industry vision, future of AI
  | 'tutorials' // How-to guides for developers
  | 'product-updates' // Features, changelog, roadmap
  | 'community' // User stories, spotlights
  | 'behind-the-scenes'; // Team, culture, process

export type ContentCategory =
  | 'tutorial'
  | 'deep-dive'
  | 'changelog'
  | 'case-study'
  | 'community-spotlight'
  | 'quick-tip'
  | 'industry-insight'
  | 'week-preview'
  | 'milestone'
  | 'announcement';

export type ContentTone =
  | 'warm' // Celebration, support moments
  | 'confident' // Product announcements
  | 'present' // Check-ins, community
  | 'direct' // Technical tutorials
  | 'inspiring'; // Vision, thought leadership

// ============================================================================
// BRAND VOICE ELEMENTS
// ============================================================================

export interface BrandVoice {
  /** Core brand phrases to use */
  phrases: {
    embrace: string[];
    avoid: string[];
  };
  /** Tone adjustments by context */
  toneByContext: Record<string, ContentTone>;
  /** Platform-specific voice adjustments */
  platformVoice: {
    twitter: VoiceAdjustment;
    linkedin: VoiceAdjustment;
    discord: VoiceAdjustment;
    blog: VoiceAdjustment;
  };
}

export interface VoiceAdjustment {
  maxLength: number;
  formality: 'casual' | 'balanced' | 'professional';
  emojiUsage: 'none' | 'minimal' | 'moderate';
  hashtagStrategy: 'none' | 'minimal' | 'standard';
}

// ============================================================================
// CONTENT GENERATION
// ============================================================================

export interface ContentBrief {
  pillar: ContentPillar;
  category: ContentCategory;
  topic: string;
  targetAudience: 'developers' | 'executives' | 'general' | 'community';
  tone: ContentTone;
  keywords?: string[];
  relatedContent?: string[];
  callToAction?: string;
}

/** Content status in the publishing pipeline */
export type ContentStatus = 'draft' | 'review' | 'approved' | 'scheduled' | 'published';

export interface GeneratedContent {
  id: string;
  brief: ContentBrief;
  title: string;
  body: string;
  excerpt: string;
  hashtags: string[];
  platforms: PlatformContent[];
  images?: ContentImage[];
  scheduledFor?: Date;
  status: ContentStatus;
  createdAt: Date;
  publishedAt?: Date;
}

export interface PlatformContent {
  platform: 'twitter' | 'linkedin' | 'discord' | 'blog';
  content: string;
  hashtags?: string[];
  images?: string[];
  link?: string;
}

export interface ContentImage {
  type: 'og-image' | 'thumbnail' | 'inline';
  url: string;
  alt: string;
  width: number;
  height: number;
}

// ============================================================================
// CONTENT CALENDAR
// ============================================================================

/** Calendar entry status */
export type CalendarEntryStatus = 'planned' | 'in-progress' | 'ready' | 'published' | 'skipped';

export interface ContentCalendarEntry {
  id: string;
  date: Date;
  dayOfWeek: number; // 0 = Sunday
  timeSlot: 'morning' | 'afternoon' | 'evening';
  pillar: ContentPillar;
  category: ContentCategory;
  topic?: string;
  contentId?: string;
  status: CalendarEntryStatus;
}

export interface WeeklySchedule {
  monday: { category: ContentCategory; pillar: ContentPillar };
  tuesday: { category: ContentCategory; pillar: ContentPillar };
  wednesday: { category: ContentCategory; pillar: ContentPillar };
  thursday: { category: ContentCategory; pillar: ContentPillar };
  friday: { category: ContentCategory; pillar: ContentPillar };
  saturday: { category: ContentCategory; pillar: ContentPillar };
  sunday: { category: ContentCategory; pillar: ContentPillar };
}

// ============================================================================
// THEME CALENDAR
// ============================================================================

export interface MonthlyTheme {
  month: number; // 1-12
  name: string;
  description: string;
  colorAccent: string;
  focusTopics: string[];
  specialDates?: SpecialDate[];
}

export interface SpecialDate {
  date: Date;
  name: string;
  contentType: ContentCategory;
  priority: 'high' | 'medium' | 'low';
}

// ============================================================================
// METRICS & ANALYTICS
// ============================================================================

export interface ContentMetrics {
  contentId: string;
  platform: string;
  impressions: number;
  engagement: number;
  clicks: number;
  shares: number;
  comments: number;
  conversionRate?: number;
  sentiment?: 'positive' | 'neutral' | 'negative';
  recordedAt: Date;
}

export interface GTMDashboard {
  totalPosts: number;
  postsThisWeek: number;
  scheduledPosts: number;
  topPerformingContent: ContentMetrics[];
  platformBreakdown: Record<string, number>;
  pillarBreakdown: Record<ContentPillar, number>;
  engagementTrend: { date: Date; engagement: number }[];
}

// ============================================================================
// CONTENT TEMPLATES
// ============================================================================

export interface ContentTemplate {
  id: string;
  name: string;
  category: ContentCategory;
  structure: string;
  variables: string[];
  exampleOutput: string;
  brandVoiceNotes: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface GTMConfig {
  enabled: boolean;
  autoPublish: boolean;
  reviewRequired: boolean;
  defaultTimezone: string;
  publishTimes: {
    morning: string; // e.g., "09:00"
    afternoon: string; // e.g., "14:00"
    evening: string; // e.g., "18:00"
  };
  platforms: {
    twitter: boolean;
    linkedin: boolean;
    discord: boolean;
    blog: boolean;
  };
  contentRatio: Record<ContentCategory, number>; // Target percentages
}
