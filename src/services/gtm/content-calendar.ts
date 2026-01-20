/**
 * Content Calendar Service
 *
 * Manages the automated content scheduling and publishing pipeline.
 * Tracks what content is planned, ready, and published.
 *
 * Uses in-memory cache for fast reads with Firestore persistence
 * for durability across restarts.
 *
 * @module services/gtm/content-calendar
 */

import { createLogger } from '../../utils/safe-logger.js';
import { DEFAULT_WEEKLY_SCHEDULE, getMonthlyTheme } from './brand-voice.js';
import type {
  ContentCalendarEntry,
  GeneratedContent,
  ContentCategory,
  ContentPillar,
  GTMConfig,
  ContentStatus,
  CalendarEntryStatus,
} from './types.js';
import { v4 as uuidv4 } from 'uuid';
import * as firestoreStorage from './gtm-storage.js';

const log = createLogger({ module: 'content-calendar' });

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const DEFAULT_GTM_CONFIG: GTMConfig = {
  enabled: true,
  autoPublish: false, // Require review by default
  reviewRequired: true,
  defaultTimezone: 'America/Los_Angeles',
  publishTimes: {
    morning: '09:00',
    afternoon: '14:00',
    evening: '18:00',
  },
  platforms: {
    twitter: true,
    linkedin: true,
    discord: true,
    blog: false, // Blog posts need more review
  },
  contentRatio: {
    tutorial: 20,
    'deep-dive': 10,
    changelog: 15,
    'case-study': 10,
    'community-spotlight': 10,
    'quick-tip': 15,
    'industry-insight': 10,
    'week-preview': 5,
    milestone: 3,
    announcement: 2,
  },
};

// ============================================================================
// IN-MEMORY CACHE (synced with Firestore for persistence)
// ============================================================================

const calendarStore: Map<string, ContentCalendarEntry> = new Map();
const contentStore: Map<string, GeneratedContent> = new Map();
let cacheHydrated = false;

/**
 * Hydrate in-memory cache from Firestore on first access.
 * This is called lazily to avoid blocking startup.
 */
async function hydrateCache(): Promise<void> {
  if (cacheHydrated) return;

  try {
    log.info('Hydrating GTM cache from Firestore...');

    // Load all content
    const allContent = await firestoreStorage.getAllContent();
    for (const content of allContent) {
      contentStore.set(content.id, content);
    }

    // Load all calendar entries
    const allEntries = await firestoreStorage.getAllCalendarEntries();
    for (const entry of allEntries) {
      calendarStore.set(entry.id, entry);
    }

    cacheHydrated = true;
    log.info('GTM cache hydrated', {
      contentCount: contentStore.size,
      calendarCount: calendarStore.size,
    });
  } catch (error) {
    log.warn('Failed to hydrate GTM cache from Firestore', { error: String(error) });
    // Continue with empty cache - will use in-memory only
    cacheHydrated = true;
  }
}

/**
 * Initialize the GTM cache from Firestore.
 * Call this at startup or before first access to ensure data is loaded.
 * Safe to call multiple times - will only hydrate once.
 */
export async function initializeGTMCache(): Promise<void> {
  await hydrateCache();
}

/**
 * Check if the cache has been hydrated from Firestore.
 */
export function isCacheHydrated(): boolean {
  return cacheHydrated;
}

// ============================================================================
// CALENDAR GENERATION
// ============================================================================

export function generateWeeklyCalendar(
  startDate: Date,
  config: GTMConfig = DEFAULT_GTM_CONFIG
): ContentCalendarEntry[] {
  const entries: ContentCalendarEntry[] = [];
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  for (let i = 0; i < 7; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const dayOfWeek = date.getDay();
    const dayName = days[dayOfWeek] as keyof typeof DEFAULT_WEEKLY_SCHEDULE;
    const schedule = DEFAULT_WEEKLY_SCHEDULE[dayName];

    if (!schedule) continue;

    const entry: ContentCalendarEntry = {
      id: uuidv4(),
      date,
      dayOfWeek,
      timeSlot: 'morning',
      pillar: schedule.pillar,
      category: schedule.category,
      status: 'planned',
    };

    entries.push(entry);
    calendarStore.set(entry.id, entry);

    // Persist to Firestore (fire and forget for speed)
    firestoreStorage.storeCalendarEntry(entry).catch((error) => {
      log.error('Failed to persist calendar entry to Firestore', { id: entry.id, error: String(error) });
    });
  }

  log.info('Generated weekly calendar', { startDate, entries: entries.length });
  return entries;
}

export function generateMonthlyCalendar(
  year: number,
  month: number,
  config: GTMConfig = DEFAULT_GTM_CONFIG
): ContentCalendarEntry[] {
  const entries: ContentCalendarEntry[] = [];
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);
  const theme = getMonthlyTheme(month);

  let currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    const weekEntries = generateWeeklyCalendar(currentDate, config);
    entries.push(...weekEntries);
    currentDate.setDate(currentDate.getDate() + 7);
  }

  // Add monthly theme context to entries
  entries.forEach((entry) => {
    if (theme) {
      entry.topic = `${theme.name}: ${entry.category}`;
    }
  });

  log.info('Generated monthly calendar', { year, month, theme: theme?.name, entries: entries.length });
  return entries;
}

// ============================================================================
// CALENDAR MANAGEMENT
// ============================================================================

export function getCalendarEntry(id: string): ContentCalendarEntry | undefined {
  return calendarStore.get(id);
}

export function getEntriesForDate(date: Date): ContentCalendarEntry[] {
  const dateStr = date.toISOString().split('T')[0];
  return Array.from(calendarStore.values()).filter(
    (entry) => entry.date.toISOString().split('T')[0] === dateStr
  );
}

export function getEntriesForWeek(startDate: Date): ContentCalendarEntry[] {
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 7);

  return Array.from(calendarStore.values()).filter(
    (entry) => entry.date >= startDate && entry.date < endDate
  );
}

export function getPendingEntries(): ContentCalendarEntry[] {
  return Array.from(calendarStore.values())
    .filter((entry) => entry.status === 'planned' || entry.status === 'in-progress')
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function getReadyToPublish(): ContentCalendarEntry[] {
  const now = new Date();
  return Array.from(calendarStore.values())
    .filter((entry) => entry.status === 'ready' && entry.date <= now)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function updateEntryStatus(
  id: string,
  status: ContentCalendarEntry['status'],
  contentId?: string
): void {
  const entry = calendarStore.get(id);
  if (entry) {
    entry.status = status;
    if (contentId) entry.contentId = contentId;
    calendarStore.set(id, entry);
    log.info('Updated calendar entry', { id, status, contentId });

    // Persist to Firestore (fire and forget for speed)
    firestoreStorage.updateCalendarEntryStatus(id, status, contentId).catch((error) => {
      log.error('Failed to persist calendar entry status to Firestore', { id, error: String(error) });
    });
  }
}

// ============================================================================
// CONTENT LINKING
// ============================================================================

export function linkContentToEntry(
  entryId: string,
  content: GeneratedContent
): void {
  const entry = calendarStore.get(entryId);
  if (entry) {
    entry.contentId = content.id;
    entry.status = content.status === 'approved' ? 'ready' : 'in-progress';
    calendarStore.set(entryId, entry);
    contentStore.set(content.id, content);
    log.info('Linked content to calendar entry', { entryId, contentId: content.id });

    // Persist both to Firestore (fire and forget for speed)
    firestoreStorage.storeContent(content).catch((error) => {
      log.error('Failed to persist content to Firestore', { id: content.id, error: String(error) });
    });
    firestoreStorage.updateCalendarEntryStatus(entryId, entry.status, content.id).catch((error) => {
      log.error('Failed to persist calendar entry to Firestore', { entryId, error: String(error) });
    });
  }
}

export function getContentForEntry(entryId: string): GeneratedContent | undefined {
  const entry = calendarStore.get(entryId);
  if (entry?.contentId) {
    return contentStore.get(entry.contentId);
  }
  return undefined;
}

// ============================================================================
// PUBLISHING QUEUE
// ============================================================================

export interface PublishQueueItem {
  entryId: string;
  contentId: string;
  scheduledFor: Date;
  platforms: string[];
  priority: 'high' | 'normal' | 'low';
}

export function getPublishQueue(config: GTMConfig = DEFAULT_GTM_CONFIG): PublishQueueItem[] {
  const readyEntries = getReadyToPublish();
  const queue: PublishQueueItem[] = [];

  for (const entry of readyEntries) {
    if (!entry.contentId) continue;

    const content = contentStore.get(entry.contentId);
    if (!content) continue;

    // Determine which platforms to publish to
    const platforms: string[] = [];
    if (config.platforms.twitter) platforms.push('twitter');
    if (config.platforms.linkedin) platforms.push('linkedin');
    if (config.platforms.discord) platforms.push('discord');
    if (config.platforms.blog && content.body.length > 500) platforms.push('blog');

    queue.push({
      entryId: entry.id,
      contentId: entry.contentId,
      scheduledFor: entry.date,
      platforms,
      priority: entry.category === 'changelog' || entry.category === 'announcement' ? 'high' : 'normal',
    });
  }

  return queue.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority === 'high' ? -1 : 1;
    }
    return a.scheduledFor.getTime() - b.scheduledFor.getTime();
  });
}

// ============================================================================
// CALENDAR ANALYTICS
// ============================================================================

export interface CalendarStats {
  totalEntries: number;
  byStatus: Record<ContentCalendarEntry['status'], number>;
  byCategory: Record<ContentCategory, number>;
  byPillar: Record<ContentPillar, number>;
  upcomingCount: number;
  overdueCount: number;
}

export function getCalendarStats(): CalendarStats {
  const entries = Array.from(calendarStore.values());
  const now = new Date();

  const stats: CalendarStats = {
    totalEntries: entries.length,
    byStatus: { planned: 0, 'in-progress': 0, ready: 0, published: 0, skipped: 0 },
    byCategory: {} as Record<ContentCategory, number>,
    byPillar: {} as Record<ContentPillar, number>,
    upcomingCount: 0,
    overdueCount: 0,
  };

  for (const entry of entries) {
    stats.byStatus[entry.status]++;
    stats.byCategory[entry.category] = (stats.byCategory[entry.category] || 0) + 1;
    stats.byPillar[entry.pillar] = (stats.byPillar[entry.pillar] || 0) + 1;

    if (entry.date > now && entry.status !== 'published') {
      stats.upcomingCount++;
    } else if (entry.date < now && entry.status !== 'published') {
      stats.overdueCount++;
    }
  }

  return stats;
}

// ============================================================================
// CONTENT STORAGE (synced with Firestore)
// ============================================================================

export function storeContent(content: GeneratedContent): void {
  // Update in-memory cache
  contentStore.set(content.id, content);
  log.info('Stored content', { id: content.id, title: content.title });

  // Persist to Firestore (fire and forget for speed)
  firestoreStorage.storeContent(content).catch((error) => {
    log.error('Failed to persist content to Firestore', { id: content.id, error: String(error) });
  });
}

export function getContent(id: string): GeneratedContent | undefined {
  return contentStore.get(id);
}

export function getAllContent(): GeneratedContent[] {
  return Array.from(contentStore.values());
}

export function updateContentStatus(
  id: string,
  status: ContentStatus,
  publishedAt?: Date
): void {
  const content = contentStore.get(id);
  if (content) {
    content.status = status;
    if (publishedAt) content.publishedAt = publishedAt;
    contentStore.set(id, content);
    log.info('Updated content status', { id, status });

    // Persist to Firestore (fire and forget for speed)
    firestoreStorage.updateContentStatus(id, status, publishedAt).catch((error) => {
      log.error('Failed to persist content status to Firestore', { id, error: String(error) });
    });
  }
}

// ============================================================================
// NEXT CONTENT SUGGESTIONS
// ============================================================================

export function suggestNextContent(): {
  category: ContentCategory;
  pillar: ContentPillar;
  reason: string;
} {
  const stats = getCalendarStats();
  const config = DEFAULT_GTM_CONFIG;

  // Find most underrepresented category
  let lowestCategory: ContentCategory = 'tutorial';
  let lowestRatio = Infinity;

  for (const [category, target] of Object.entries(config.contentRatio)) {
    const actual = stats.byCategory[category as ContentCategory] || 0;
    const ratio = actual / target;
    if (ratio < lowestRatio) {
      lowestRatio = ratio;
      lowestCategory = category as ContentCategory;
    }
  }

  // Map category to pillar
  const categoryToPillar: Record<ContentCategory, ContentPillar> = {
    tutorial: 'tutorials',
    'deep-dive': 'thought-leadership',
    changelog: 'product-updates',
    'case-study': 'community',
    'community-spotlight': 'community',
    'quick-tip': 'tutorials',
    'industry-insight': 'thought-leadership',
    'week-preview': 'product-updates',
    milestone: 'community',
    announcement: 'product-updates',
  };

  return {
    category: lowestCategory,
    pillar: categoryToPillar[lowestCategory],
    reason: `${lowestCategory} content is ${Math.round(lowestRatio * 100)}% of target ratio`,
  };
}
