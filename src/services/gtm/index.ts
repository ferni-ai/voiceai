/**
 * GTM (Go-To-Market) Content Automation Module
 *
 * Autonomous content generation, scheduling, and publishing
 * for Ferni's brand presence across all platforms.
 *
 * @module services/gtm
 */

// Types
export * from './types.js';

// Brand Voice
export {
  FERNI_BRAND_VOICE,
  BRAND_COLORS,
  TYPOGRAPHY,
  DEFAULT_WEEKLY_SCHEDULE,
  MONTHLY_THEMES,
  HEADLINE_PATTERNS,
  WRITING_TEMPLATES,
  validateBrandVoice,
  getToneForContext,
  getMonthlyTheme,
  getCategoryColor,
} from './brand-voice.js';

// Content Generation
export {
  generateContent,
  generateDailyContent,
  generateMilestoneContent,
  generateAnnouncementContent,
  improveContent,
} from './content-generator.js';

// Content Calendar
export {
  generateWeeklyCalendar,
  generateMonthlyCalendar,
  getCalendarEntry,
  getEntriesForDate,
  getEntriesForWeek,
  getPendingEntries,
  getReadyToPublish,
  updateEntryStatus,
  linkContentToEntry,
  getContentForEntry,
  getPublishQueue,
  getCalendarStats,
  storeContent,
  getContent,
  getAllContent,
  updateContentStatus,
  suggestNextContent,
  DEFAULT_GTM_CONFIG,
  initializeGTMCache,
  isCacheHydrated,
} from './content-calendar.js';

// GTM Service
export {
  runDailyPublishing,
  generateWeeklyContent,
  createContent,
  celebrateMilestone,
  getGTMDashboard,
  getGTMStatus,
  approveContent,
  rejectContent,
  publishNow,
  verifyBrandAccountConfig,
} from './gtm-service.js';

// GTM Config
export {
  getGTMConfig,
  BLOG_BASE_URL,
  getBlogUrl,
  CATEGORY_TARGET_RATIOS,
  PILLAR_TARGET_RATIOS,
  OPTIMAL_PUBLISH_TIMES,
} from './gtm-config.js';

// Firestore Storage (for production use)
export {
  storeContent as persistContent,
  getContent as fetchContent,
  getAllContent as fetchAllContent,
  updateContentStatus as persistContentStatus,
  getContentByStatus as fetchContentByStatus,
  storeCalendarEntry as persistCalendarEntry,
  getCalendarEntry as fetchCalendarEntry,
  getCalendarEntriesForRange as fetchCalendarRange,
  updateCalendarEntryStatus as persistCalendarStatus,
  getAllCalendarEntries as fetchAllCalendarEntries,
  getContentStats,
  getCalendarStats as getCalendarStatsAsync,
} from './gtm-storage.js';
