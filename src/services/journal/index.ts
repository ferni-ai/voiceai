/**
 * Unified Journal Service
 *
 * Provides a single interface for all journal-related operations across the system.
 * This abstraction layer routes to the appropriate storage based on context:
 *
 * - Digital Twin entries → Custom Agent Memory API
 * - Productivity notes → ProductivityStore
 * - Trust analytics → Trust Systems Firestore
 *
 * Benefits:
 * - Single API for all journaling operations
 * - Cross-source querying (get all entries)
 * - Consistent mood format handling
 * - Unified entry schema
 *
 * @module journal-service
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  getProductivityStore,
  type JournalEntryData,
  type NoteData,
} from '../stores/productivity-store.js';
import {
  normalizeMood,
  getMoodLabel,
  getMoodIcon,
  calculateAverageMood,
  getMoodTrend,
  type MoodId,
} from './mood-conversion.js';
import { getFirestoreDb, cleanForFirestore } from '../superhuman/firestore-utils.js';

const log = createLogger({ module: 'JournalService' });

// ============================================================================
// UNIFIED ENTRY TYPES
// ============================================================================

/**
 * Source system for journal entries
 */
export type JournalSource =
  | 'digital_twin' // Custom Agent Memory API
  | 'productivity' // ProductivityStore
  | 'auto_capture' // Auto-captured moments
  | 'quick_note' // Quick voice notes
  | 'trust_analytics'; // Trust system recordings

/**
 * Unified journal entry that works across all storage systems
 */
export interface UnifiedJournalEntry {
  // Core identification
  id: string;
  userId: string;
  source: JournalSource;

  // Content
  content: string;
  title?: string;
  transcript?: string;
  audioUrl?: string;
  durationSeconds?: number;

  // Context
  promptId?: string;
  promptText?: string;
  agentId?: string; // Digital Twin agent ID
  personaId?: string; // Which Ferni persona
  conversationId?: string;

  // Mood (unified format)
  mood?: {
    id: MoodId;
    score: number;
    label: string;
  };

  // Metadata
  tags?: string[];
  themes?: string[];

  // Productivity-specific fields (from ProductivityStore)
  gratitudes?: string[];
  highlight?: string;
  challenge?: string;
  learnings?: string;
  tomorrowIntention?: string;

  // Auto-capture fields
  momentType?: string;
  intensity?: number;

  // Timestamps
  createdAt: Date;
  updatedAt?: Date;
}

/**
 * Query options for fetching journal entries
 */
export interface JournalQueryOptions {
  /** Limit number of results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Filter by source */
  source?: JournalSource | JournalSource[];
  /** Filter by date range */
  startDate?: Date;
  endDate?: Date;
  /** Filter by mood valence */
  moodValence?: 'positive' | 'negative' | 'neutral';
  /** Filter by agent ID (for Digital Twin) */
  agentId?: string;
  /** Include only entries with transcripts */
  hasTranscript?: boolean;
  /** Sort order */
  sortBy?: 'createdAt' | 'mood';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Journal statistics
 */
export interface JournalStats {
  totalEntries: number;
  entriesBySource: Record<JournalSource, number>;
  currentStreak: number;
  longestStreak: number;
  averageMood: {
    id: MoodId;
    score: number;
    label: string;
  };
  moodTrend: 'improving' | 'declining' | 'stable';
  topMoods: Array<{ id: MoodId; count: number; label: string }>;
  entriesThisWeek: number;
  entriesThisMonth: number;
}

// ============================================================================
// JOURNAL SERVICE CLASS
// ============================================================================

class JournalService {
  // Cache for cross-source queries
  private entryCache = new Map<string, UnifiedJournalEntry[]>();
  private cacheExpiry = new Map<string, number>();
  private readonly CACHE_TTL = 60000; // 1 minute

  /**
   * Get all journal entries for a user across all sources
   */
  async getAllEntries(
    userId: string,
    options: JournalQueryOptions = {}
  ): Promise<UnifiedJournalEntry[]> {
    const cacheKey = `${userId}:${JSON.stringify(options)}`;

    // Check cache
    if (this.isCacheValid(cacheKey)) {
      return this.entryCache.get(cacheKey) || [];
    }

    const entries: UnifiedJournalEntry[] = [];

    // Load from ProductivityStore
    try {
      const productivityEntries = await this.getProductivityEntries(userId, options);
      entries.push(...productivityEntries);
    } catch (error) {
      log.warn({ error: String(error), userId }, 'Failed to load productivity entries');
    }

    // Load from Digital Twin (Custom Agents)
    if (
      !options.source ||
      options.source === 'digital_twin' ||
      (Array.isArray(options.source) && options.source.includes('digital_twin'))
    ) {
      try {
        const twinEntries = await this.getDigitalTwinEntries(userId, options);
        entries.push(...twinEntries);
      } catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to load Digital Twin entries');
      }
    }

    // Sort and limit
    const sorted = this.sortEntries(entries, options);
    const limited = options.limit
      ? sorted.slice(options.offset || 0, (options.offset || 0) + options.limit)
      : sorted;

    // Cache results
    this.entryCache.set(cacheKey, limited);
    this.cacheExpiry.set(cacheKey, Date.now() + this.CACHE_TTL);

    log.debug({ userId, count: limited.length }, 'Loaded journal entries');
    return limited;
  }

  /**
   * Create a new journal entry
   */
  async createEntry(
    userId: string,
    entry: Omit<UnifiedJournalEntry, 'id' | 'createdAt' | 'userId'>
  ): Promise<UnifiedJournalEntry> {
    const id = `journal_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const now = new Date();

    const fullEntry: UnifiedJournalEntry = {
      ...entry,
      id,
      userId,
      createdAt: now,
      updatedAt: now,
    };

    // Route to appropriate storage based on source
    switch (entry.source) {
      case 'productivity':
      case 'quick_note':
        await this.saveToProductivityStore(userId, fullEntry);
        break;
      case 'digital_twin':
        await this.saveToDigitalTwin(userId, fullEntry);
        break;
      default:
        // Default to productivity store
        await this.saveToProductivityStore(userId, fullEntry);
    }

    // Invalidate cache
    this.invalidateCache(userId);

    log.info({ userId, entryId: id, source: entry.source }, 'Journal entry created');
    return fullEntry;
  }

  /**
   * Get journal statistics for a user
   */
  async getStats(userId: string): Promise<JournalStats> {
    const entries = await this.getAllEntries(userId);

    // Calculate streaks
    const { currentStreak, longestStreak } = this.calculateStreaks(entries);

    // Calculate mood stats
    const moods = entries.filter((e) => e.mood).map((e) => e.mood!.id);
    const moodStats = calculateAverageMood(moods);

    // Calculate recent vs older for trend
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const recentMoods = entries
      .filter((e) => e.createdAt >= oneWeekAgo && e.mood)
      .map((e) => e.mood!.id);
    const olderMoods = entries
      .filter((e) => e.createdAt >= twoWeeksAgo && e.createdAt < oneWeekAgo && e.mood)
      .map((e) => e.mood!.id);

    const moodTrend = getMoodTrend(recentMoods, olderMoods);

    // Count by source
    const entriesBySource: Record<JournalSource, number> = {
      digital_twin: 0,
      productivity: 0,
      auto_capture: 0,
      quick_note: 0,
      trust_analytics: 0,
    };
    entries.forEach((e) => {
      entriesBySource[e.source]++;
    });

    // Count this week/month
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const entriesThisWeek = entries.filter((e) => e.createdAt >= startOfWeek).length;
    const entriesThisMonth = entries.filter((e) => e.createdAt >= startOfMonth).length;

    // Top moods
    const topMoods = Object.entries(moodStats.distribution)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([id, count]) => ({
        id: id as MoodId,
        count,
        label: getMoodLabel(id),
      }));

    return {
      totalEntries: entries.length,
      entriesBySource,
      currentStreak,
      longestStreak,
      averageMood: {
        id: moodStats.averageId,
        score: moodStats.averageScore,
        label: getMoodLabel(moodStats.averageId),
      },
      moodTrend,
      topMoods,
      entriesThisWeek,
      entriesThisMonth,
    };
  }

  /**
   * Search entries by content
   */
  async searchEntries(
    userId: string,
    query: string,
    options: JournalQueryOptions = {}
  ): Promise<UnifiedJournalEntry[]> {
    const entries = await this.getAllEntries(userId, options);
    const lowerQuery = query.toLowerCase();

    return entries.filter((entry) => {
      const searchText = [
        entry.content,
        entry.title,
        entry.transcript,
        entry.promptText,
        ...(entry.tags || []),
        ...(entry.themes || []),
        ...(entry.gratitudes || []),
        entry.highlight,
        entry.challenge,
        entry.learnings,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchText.includes(lowerQuery);
    });
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async getProductivityEntries(
    userId: string,
    options: JournalQueryOptions
  ): Promise<UnifiedJournalEntry[]> {
    const store = getProductivityStore();
    await store.loadUserData(userId);

    const entries: UnifiedJournalEntry[] = [];

    // Get journal entries
    const journals = store.getUserJournalEntries(userId);
    for (const journal of journals) {
      entries.push(this.convertProductivityJournal(userId, journal));
    }

    // Get notes (type=journal or gratitude)
    const notes = store.getUserNotes(userId);
    for (const note of notes) {
      if (note.type === 'journal' || note.type === 'gratitude' || note.type === 'reflection') {
        entries.push(this.convertProductivityNote(userId, note));
      }
    }

    return this.filterEntries(entries, options);
  }

  private async getDigitalTwinEntries(
    userId: string,
    options: JournalQueryOptions
  ): Promise<UnifiedJournalEntry[]> {
    const entries: UnifiedJournalEntry[] = [];

    try {
      const db = getFirestoreDb();
      if (!db) return entries;

      // Query custom agents for this user
      const agentsRef = db.collection('bogle_users').doc(userId).collection('custom_agents');
      const agentsSnap = await agentsRef.where('type', '==', 'twin').get();

      for (const agentDoc of agentsSnap.docs) {
        // Skip if filtering by specific agent
        if (options.agentId && agentDoc.id !== options.agentId) continue;

        const memoriesRef = agentDoc.ref.collection('memories');
        const memoriesSnap = await memoriesRef.where('type', '==', 'journalEntry').get();

        for (const memDoc of memoriesSnap.docs) {
          const data = memDoc.data();
          entries.push(this.convertDigitalTwinEntry(userId, agentDoc.id, memDoc.id, data));
        }
      }
    } catch (error) {
      log.warn({ error: String(error) }, 'Failed to query Digital Twin entries');
    }

    return this.filterEntries(entries, options);
  }

  private async saveToProductivityStore(userId: string, entry: UnifiedJournalEntry): Promise<void> {
    const store = getProductivityStore();

    if (entry.gratitudes || entry.highlight || entry.challenge) {
      // Save as structured journal
      const journalData: JournalEntryData = {
        id: entry.id,
        date: entry.createdAt.toISOString(),
        gratitudes: entry.gratitudes || [],
        highlight: entry.highlight,
        challenge: entry.challenge,
        learnings: entry.learnings,
        tomorrowIntention: entry.tomorrowIntention,
        mood: entry.mood?.score || 5,
        notes: entry.content,
        createdAt: entry.createdAt.toISOString(),
      };
      store.setJournalEntry(userId, journalData);
    } else {
      // Save as note
      const noteData: NoteData = {
        id: entry.id,
        type: entry.source === 'quick_note' ? 'quick' : 'journal',
        content: entry.content,
        title: entry.title,
        tags: entry.tags || [],
        mood: entry.mood?.score,
        linkedDate: entry.createdAt.toISOString(),
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt?.toISOString() || entry.createdAt.toISOString(),
      };
      store.setNote(userId, noteData);
    }
  }

  private async saveToDigitalTwin(userId: string, entry: UnifiedJournalEntry): Promise<void> {
    if (!entry.agentId) {
      log.warn(
        { userId, entryId: entry.id },
        'No agentId for Digital Twin entry, falling back to productivity'
      );
      await this.saveToProductivityStore(userId, entry);
      return;
    }

    try {
      const db = getFirestoreDb();
      if (!db) {
        log.warn('Firestore unavailable, falling back to productivity store');
        await this.saveToProductivityStore(userId, entry);
        return;
      }

      const memoryRef = db
        .collection('bogle_users')
        .doc(userId)
        .collection('custom_agents')
        .doc(entry.agentId)
        .collection('memories')
        .doc(entry.id);

      await memoryRef.set(cleanForFirestore({
        type: 'journalEntry',
        content: entry.content,
        transcript: entry.transcript,
        audioUrl: entry.audioUrl,
        durationSeconds: entry.durationSeconds,
        mood: entry.mood?.id,
        themes: entry.themes,
        source: entry.source,
        momentType: entry.momentType,
        intensity: entry.intensity,
        conversationId: entry.conversationId,
        personaId: entry.personaId,
        promptId: entry.promptId,
        createdAt: entry.createdAt,
      }));
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to save to Digital Twin');
      throw error;
    }
  }

  private convertProductivityJournal(
    userId: string,
    journal: JournalEntryData
  ): UnifiedJournalEntry {
    const mood = normalizeMood(journal.mood);
    return {
      id: journal.id,
      userId,
      source: 'productivity',
      content: journal.notes || '',
      gratitudes: journal.gratitudes,
      highlight: journal.highlight,
      challenge: journal.challenge,
      learnings: journal.learnings,
      tomorrowIntention: journal.tomorrowIntention,
      mood: {
        id: mood.id,
        score: mood.score,
        label: getMoodLabel(mood.id),
      },
      createdAt: new Date(journal.createdAt),
    };
  }

  private convertProductivityNote(userId: string, note: NoteData): UnifiedJournalEntry {
    const mood = note.mood ? normalizeMood(note.mood) : undefined;
    return {
      id: note.id,
      userId,
      source: note.type === 'quick' ? 'quick_note' : 'productivity',
      content: note.content,
      title: note.title,
      tags: note.tags,
      mood: mood
        ? {
            id: mood.id,
            score: mood.score,
            label: getMoodLabel(mood.id),
          }
        : undefined,
      createdAt: new Date(note.createdAt),
      updatedAt: new Date(note.updatedAt),
    };
  }

  private convertDigitalTwinEntry(
    userId: string,
    agentId: string,
    memoryId: string,
    data: Record<string, unknown>
  ): UnifiedJournalEntry {
    const moodInput = data.mood as string | number | undefined;
    const mood = moodInput ? normalizeMood(moodInput) : undefined;

    return {
      id: memoryId,
      userId,
      source: (data.source as JournalSource) || 'digital_twin',
      agentId,
      content: (data.content as string) || '',
      transcript: data.transcript as string | undefined,
      audioUrl: data.audioUrl as string | undefined,
      durationSeconds: data.durationSeconds as number | undefined,
      mood: mood
        ? {
            id: mood.id,
            score: mood.score,
            label: getMoodLabel(mood.id),
          }
        : undefined,
      themes: data.themes as string[] | undefined,
      momentType: data.momentType as string | undefined,
      intensity: data.intensity as number | undefined,
      conversationId: data.conversationId as string | undefined,
      personaId: data.personaId as string | undefined,
      promptId: data.promptId as string | undefined,
      createdAt:
        data.createdAt instanceof Date ? data.createdAt : new Date(data.createdAt as string),
    };
  }

  private filterEntries(
    entries: UnifiedJournalEntry[],
    options: JournalQueryOptions
  ): UnifiedJournalEntry[] {
    return entries.filter((entry) => {
      // Filter by source
      if (options.source) {
        const sources = Array.isArray(options.source) ? options.source : [options.source];
        if (!sources.includes(entry.source)) return false;
      }

      // Filter by date range
      if (options.startDate && entry.createdAt < options.startDate) return false;
      if (options.endDate && entry.createdAt > options.endDate) return false;

      // Filter by transcript
      if (options.hasTranscript && !entry.transcript) return false;

      // Filter by mood valence
      if (options.moodValence && entry.mood) {
        const { score } = entry.mood;
        if (options.moodValence === 'positive' && score < 7) return false;
        if (options.moodValence === 'negative' && score > 3) return false;
        if (options.moodValence === 'neutral' && (score < 4 || score > 6)) return false;
      }

      return true;
    });
  }

  private sortEntries(
    entries: UnifiedJournalEntry[],
    options: JournalQueryOptions
  ): UnifiedJournalEntry[] {
    const sortBy = options.sortBy || 'createdAt';
    const sortOrder = options.sortOrder || 'desc';

    return [...entries].sort((a, b) => {
      let comparison = 0;

      if (sortBy === 'createdAt') {
        comparison = a.createdAt.getTime() - b.createdAt.getTime();
      } else if (sortBy === 'mood') {
        const moodA = a.mood?.score || 5;
        const moodB = b.mood?.score || 5;
        comparison = moodA - moodB;
      }

      return sortOrder === 'desc' ? -comparison : comparison;
    });
  }

  private calculateStreaks(entries: UnifiedJournalEntry[]): {
    currentStreak: number;
    longestStreak: number;
  } {
    if (entries.length === 0) {
      return { currentStreak: 0, longestStreak: 0 };
    }

    // Get unique dates (YYYY-MM-DD)
    const dates = new Set(entries.map((e) => e.createdAt.toISOString().split('T')[0]));
    const sortedDates = Array.from(dates).sort().reverse();

    // Check if today or yesterday has an entry (for current streak)
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const hasRecentEntry = sortedDates[0] === today || sortedDates[0] === yesterday;

    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    let lastDate: Date | null = null;

    for (const dateStr of sortedDates) {
      const date = new Date(dateStr);

      if (!lastDate) {
        tempStreak = 1;
        if (hasRecentEntry) currentStreak = 1;
      } else {
        const dayDiff = Math.round((lastDate.getTime() - date.getTime()) / 86400000);
        if (dayDiff === 1) {
          tempStreak++;
          if (hasRecentEntry && tempStreak > currentStreak) {
            currentStreak = tempStreak;
          }
        } else {
          tempStreak = 1;
        }
      }

      if (tempStreak > longestStreak) {
        longestStreak = tempStreak;
      }

      lastDate = date;
    }

    return { currentStreak, longestStreak };
  }

  private isCacheValid(key: string): boolean {
    const expiry = this.cacheExpiry.get(key);
    if (!expiry) return false;
    return Date.now() < expiry;
  }

  private invalidateCache(userId: string): void {
    // Remove all cache entries for this user
    for (const key of this.entryCache.keys()) {
      if (key.startsWith(userId)) {
        this.entryCache.delete(key);
        this.cacheExpiry.delete(key);
      }
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let instance: JournalService | null = null;

export function getJournalService(): JournalService {
  if (!instance) {
    instance = new JournalService();
  }
  return instance;
}

// ============================================================================
// RE-EXPORTS
// ============================================================================

export {
  normalizeMood,
  getMoodLabel,
  getMoodIcon,
  calculateAverageMood,
  getMoodTrend,
} from './mood-conversion.js';
export type { MoodId, UnifiedMood } from './mood-conversion.js';
