/**
 * Data Export Service
 *
 * GDPR-compliant comprehensive data export functionality.
 * Single source of truth for ALL user data export.
 *
 * Exports:
 * - Profile data (identity, preferences, relationship stage)
 * - Conversations (transcripts, metadata)
 * - Insights (AI-learned memories, patterns)
 * - Rituals (daily practices, streaks)
 * - Predictions (forecasts, outcomes)
 * - Mood History (emotional weather)
 * - Contacts (your people)
 * - Trust Journey (boundaries, growth, shared moments)
 * - Wellbeing (snapshots, trends)
 * - Habits (Maya's enhanced habit coaching)
 * - Productivity (tasks, notes, journal entries)
 */

import { getEngagementStore } from '../engagement/engagement-store.js';
import { getConversationHistoryService } from '../stores/conversation-history.js';
import { getCognitiveMemoryService } from '../memory/cognitive-memory.js';
import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface ExportCategory {
  category: string;
  description: string;
  itemCount: number;
  exportable: boolean;
  icon?: string;
}

export interface ExportData {
  exportedAt: string;
  userId: string;
  version: string;
  categories: Record<string, unknown>;
}

export type ExportFormat = 'json' | 'csv';

// ============================================================================
// CATEGORY DEFINITIONS
// ============================================================================

/**
 * All exportable data categories with their descriptions.
 */
export const EXPORT_CATEGORIES = {
  Conversations: {
    description: 'All conversation transcripts and metadata',
    icon: 'message-circle',
  },
  Insights: {
    description: 'What Ferni has learned about you',
    icon: 'lightbulb',
  },
  Rituals: {
    description: 'Daily practice history and streaks',
    icon: 'sun',
  },
  Predictions: {
    description: 'Your predictions and outcomes',
    icon: 'target',
  },
  'Mood History': {
    description: 'Emotional weather records',
    icon: 'cloud-sun',
  },
  Profile: {
    description: 'Your profile and preferences',
    icon: 'user',
  },
  Contacts: {
    description: 'Your people and relationships',
    icon: 'users',
  },
  'Trust Journey': {
    description: 'Your growth, boundaries, and shared moments',
    icon: 'heart',
  },
  Wellbeing: {
    description: 'Wellness snapshots and trends',
    icon: 'activity',
  },
  Habits: {
    description: "Maya's habit coaching data",
    icon: 'repeat',
  },
  Productivity: {
    description: 'Tasks, notes, and journal entries',
    icon: 'check-square',
  },
} as const;

// ============================================================================
// DATA EXPORT SERVICE
// ============================================================================

class DataExportService {
  /**
   * Get summary of exportable data categories.
   * Shows item counts for each category.
   */
  async getExportableCategories(userId: string): Promise<ExportCategory[]> {
    const categories: ExportCategory[] = [];

    try {
      // 1. Conversations
      const historyService = getConversationHistoryService();
      const history = await historyService.getHistory(userId, 1000);
      categories.push({
        category: 'Conversations',
        description: EXPORT_CATEGORIES.Conversations.description,
        itemCount: history.totalSessions,
        exportable: true,
      });

      // 2. Cognitive memories/insights
      const memoryService = getCognitiveMemoryService();
      const memories = await memoryService.getMemories(userId);
      categories.push({
        category: 'Insights',
        description: EXPORT_CATEGORIES.Insights.description,
        itemCount: memories.length,
        exportable: true,
      });

      // 3. Engagement data (rituals, predictions, mood)
      const store = await getEngagementStore();
      const engagementProfile = await store.getProfile(userId);

      categories.push({
        category: 'Rituals',
        description: EXPORT_CATEGORIES.Rituals.description,
        itemCount: engagementProfile.activeRituals?.length || 0,
        exportable: true,
      });

      const predictions = await store.getPredictions(userId, 1000);
      categories.push({
        category: 'Predictions',
        description: EXPORT_CATEGORIES.Predictions.description,
        itemCount: predictions.length,
        exportable: true,
      });

      const weatherHistory = await store.getWeatherHistory(userId, 1000);
      categories.push({
        category: 'Mood History',
        description: EXPORT_CATEGORIES['Mood History'].description,
        itemCount: weatherHistory.length,
        exportable: true,
      });

      // 4. Profile
      const profileCount = await this.getProfileItemCount(userId);
      categories.push({
        category: 'Profile',
        description: EXPORT_CATEGORIES.Profile.description,
        itemCount: profileCount,
        exportable: true,
      });

      // 5. Contacts
      const contactsCount = await this.getContactsCount(userId);
      categories.push({
        category: 'Contacts',
        description: EXPORT_CATEGORIES.Contacts.description,
        itemCount: contactsCount,
        exportable: true,
      });

      // 6. Trust Journey
      const trustCount = await this.getTrustDataCount(userId);
      categories.push({
        category: 'Trust Journey',
        description: EXPORT_CATEGORIES['Trust Journey'].description,
        itemCount: trustCount,
        exportable: true,
      });

      // 7. Wellbeing
      const wellbeingCount = await this.getWellbeingCount(userId);
      categories.push({
        category: 'Wellbeing',
        description: EXPORT_CATEGORIES.Wellbeing.description,
        itemCount: wellbeingCount,
        exportable: true,
      });

      // 8. Habits
      const habitsCount = await this.getHabitsCount(userId);
      categories.push({
        category: 'Habits',
        description: EXPORT_CATEGORIES.Habits.description,
        itemCount: habitsCount,
        exportable: true,
      });

      // 9. Productivity
      const productivityCount = await this.getProductivityCount(userId);
      categories.push({
        category: 'Productivity',
        description: EXPORT_CATEGORIES.Productivity.description,
        itemCount: productivityCount,
        exportable: true,
      });
    } catch (error) {
      log.error({ error, userId }, 'Failed to get exportable categories');
    }

    return categories;
  }

  /**
   * Export user data in specified format.
   */
  async exportData(
    userId: string,
    format: ExportFormat,
    selectedCategories: string[]
  ): Promise<string> {
    const exportData: ExportData = {
      exportedAt: new Date().toISOString(),
      userId,
      version: '2.0', // Bumped version for new comprehensive export
      categories: {},
    };

    try {
      // Export each selected category
      for (const category of selectedCategories) {
        try {
          const data = await this.exportCategory(userId, category);
          if (data !== null) {
            exportData.categories[this.categoryToKey(category)] = data;
          }
        } catch (categoryError) {
          log.warn({ error: String(categoryError), userId, category }, 'Failed to export category');
          // Continue with other categories
        }
      }

      log.info({ userId, categories: selectedCategories, format }, '📦 Data exported');
    } catch (error) {
      log.error({ error, userId }, 'Failed to export data');
      throw error;
    }

    // Format output
    if (format === 'json') {
      return JSON.stringify(exportData, null, 2);
    } else {
      return this.convertToCSV(exportData);
    }
  }

  /**
   * Export a single category's data.
   */
  private async exportCategory(userId: string, category: string): Promise<unknown> {
    switch (category) {
      case 'Conversations':
        return this.exportConversations(userId);
      case 'Insights':
        return this.exportInsights(userId);
      case 'Rituals':
        return this.exportRituals(userId);
      case 'Predictions':
        return this.exportPredictions(userId);
      case 'Mood History':
        return this.exportMoodHistory(userId);
      case 'Profile':
        return this.exportProfile(userId);
      case 'Contacts':
        return this.exportContacts(userId);
      case 'Trust Journey':
        return this.exportTrustJourney(userId);
      case 'Wellbeing':
        return this.exportWellbeing(userId);
      case 'Habits':
        return this.exportHabits(userId);
      case 'Productivity':
        return this.exportProductivity(userId);
      default:
        log.warn({ category }, 'Unknown export category');
        return null;
    }
  }

  // ============================================================================
  // INDIVIDUAL CATEGORY EXPORTERS
  // ============================================================================

  private async exportConversations(userId: string) {
    const historyService = getConversationHistoryService();
    const history = await historyService.getHistory(userId, 10000);
    return history;
  }

  private async exportInsights(userId: string) {
    const memoryService = getCognitiveMemoryService();
    const profile = await memoryService.getProfile(userId);
    const memories = await memoryService.getMemories(userId);
    return {
      profile: profile
        ? {
            name: profile.name,
            preferredName: profile.preferredName,
            communicationStyle: profile.communicationStyle,
            speakingPace: profile.speakingPace,
            totalConversations: profile.totalConversations,
            totalMinutesTalked: profile.totalMinutesTalked,
          }
        : null,
      memories: memories.map((m) => ({
        id: m.id,
        type: m.type,
        content: m.content,
        confidence: m.confidence,
        source: m.source,
        timestamp: m.timestamp,
      })),
    };
  }

  private async exportRituals(userId: string) {
    const store = await getEngagementStore();
    const profile = await store.getProfile(userId);
    const streaks = await store.getRitualStreaks(userId);
    return {
      activeRituals: profile.activeRituals || [],
      streaks: streaks.map((s) => ({
        ritualId: s.ritualId,
        personaId: s.personaId,
        currentStreak: s.currentStreak,
        longestStreak: s.longestStreak,
        lastCompletedAt: s.lastCompletedAt,
        totalCompletions: s.totalCompletions,
        streakHistory: s.streakHistory,
      })),
    };
  }

  private async exportPredictions(userId: string) {
    const store = await getEngagementStore();
    const predictions = await store.getPredictions(userId, 10000);
    return predictions.map((p) => ({
      id: p.id,
      weekOf: p.weekOf,
      predictions: p.predictions,
      actuals: p.actuals,
      accuracy: p.accuracy,
      createdAt: p.createdAt,
      completedAt: p.completedAt,
    }));
  }

  private async exportMoodHistory(userId: string) {
    const store = await getEngagementStore();
    const weatherHistory = await store.getWeatherHistory(userId, 10000);
    return weatherHistory.map((w) => ({
      date: w.date,
      weather: w.weather,
      ritualId: w.ritualId,
      insights: w.insights,
    }));
  }

  private async exportProfile(userId: string) {
    try {
      const { getDefaultStore } = await import('../memory/index.js');
      const store = getDefaultStore();
      await store.initialize();
      const profile = await store.getProfile(userId);

      if (!profile) return null;

      // Sanitize profile for export (exclude internal fields)
      return {
        id: profile.id,
        name: profile.name,
        preferredName: profile.preferredName,
        firstContact: profile.firstContact,
        lastContact: profile.lastContact,
        totalConversations: profile.totalConversations,
        totalMinutesTalked: profile.totalMinutesTalked,
        communicationStyle: profile.communicationStyle,
        speakingPace: profile.speakingPace,
        relationshipStage: profile.relationshipStage,
        preferredTopics: profile.preferredTopics,
        avoidTopics: profile.avoidTopics,
        humorAppreciation: profile.humorAppreciation,
        preferences: profile.preferences,
        familyMembers: profile.familyMembers?.map((f) => ({
          relationship: f.relationship,
          name: f.name,
          mentionedTopics: f.mentionedTopics,
        })),
        lifeEvents: profile.lifeEvents?.map((e) => ({
          id: e.id,
          type: e.type,
          title: e.title,
          status: e.status,
          date: e.date,
        })),
        goals: profile.goals?.map((g) => ({
          id: g.id,
          name: g.name,
          type: g.type,
          status: g.status,
          priority: g.priority,
        })),
      };
    } catch (error) {
      log.warn({ error: String(error), userId }, 'Failed to export profile');
      return null;
    }
  }

  private async exportContacts(userId: string) {
    try {
      const { getUserContacts } = await import('../identity/contacts.js');
      const contacts = await getUserContacts(userId);

      return contacts.map((c) => ({
        id: c.id,
        displayName: c.displayName,
        firstName: c.firstName,
        lastName: c.lastName,
        nicknames: c.nicknames,
        relationship: c.relationship,
        phones: c.phones,
        emails: c.emails,
        birthday: c.birthday,
        notes: c.notes,
        groups: c.groups,
        lastContactedAt: c.lastContactedAt,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }));
    } catch (error) {
      log.warn({ error: String(error), userId }, 'Failed to export contacts');
      return [];
    }
  }

  private async exportTrustJourney(userId: string) {
    try {
      const {
        loadTrustProfiles,
        getActiveBoundaries,
        getGrowthPatterns,
        getSharedMoments,
        getUncelebratedWins,
        getPendingIntentions,
        getDueMoments,
      } = await import('../trust-systems/index.js');

      await loadTrustProfiles(userId);

      const boundaries = getActiveBoundaries(userId);
      const growth = getGrowthPatterns(userId);
      const sharedMoments = getSharedMoments(userId);
      const wins = getUncelebratedWins(userId);
      const intentions = getPendingIntentions(userId);
      const dueMoments = getDueMoments(userId);

      return {
        boundaries: {
          total: boundaries.length,
          types: boundaries.reduce(
            (acc, b) => {
              acc[b.type] = (acc[b.type] || 0) + 1;
              return acc;
            },
            {} as Record<string, number>
          ),
          note: 'Specific boundary content is private.',
        },
        growth: {
          patternsIdentified: growth.length,
          types: [...new Set(growth.map((g) => g.type))],
          examples: growth.slice(0, 10).map((g) => ({
            type: g.type,
            description: g.after?.pattern,
            firstSeen: g.after?.firstSeen,
          })),
        },
        sharedMoments: {
          total: sharedMoments.length,
          runningGags: sharedMoments.filter((m) => m.type === 'running_gag').length,
          phrases: sharedMoments.filter((m) => m.type === 'phrase').length,
          stories: sharedMoments.filter((m) => m.type === 'story').length,
        },
        celebrations: {
          winsRecognized: wins.length,
          winTypes: [...new Set(wins.map((w) => w.type))],
          intentionsTracked: intentions.length,
        },
        proactiveCare: {
          upcomingMoments: dueMoments.length,
        },
      };
    } catch (error) {
      log.warn({ error: String(error), userId }, 'Failed to export trust journey');
      return null;
    }
  }

  private async exportWellbeing(userId: string) {
    try {
      const { exportWellbeingData } = await import('../wellbeing-tracking/persistence.js');
      const data = await exportWellbeingData(userId);

      if (!data) return null;

      return {
        profile: data.profile
          ? {
              totalSnapshots: data.profile.totalSnapshots,
              firstSnapshot: data.profile.firstSnapshot,
              lastSnapshot: data.profile.lastSnapshot,
              weeklyTrends: data.profile.weeklyTrends,
            }
          : null,
        snapshots: data.snapshots.map((s) => ({
          id: s.id,
          timestamp: s.timestamp,
          source: s.source,
          dimensions: s.dimensions,
          topic: s.topic,
        })),
      };
    } catch (error) {
      log.warn({ error: String(error), userId }, 'Failed to export wellbeing data');
      return null;
    }
  }

  private async exportHabits(userId: string) {
    try {
      const { getProductivityStore } = await import('../stores/productivity-store.js');
      const store = getProductivityStore();
      await store.loadUserData(userId);
      const data = store.getFullUserData(userId);

      if (!data) return null;

      return {
        habits: (data.habits || []).map((h) => ({
          id: h.id,
          name: h.name,
          description: h.description,
          category: h.category,
          frequency: h.frequency,
          targetPerDay: h.targetPerDay,
          reminderTime: h.reminderTime,
          isActive: h.isActive,
          createdAt: h.createdAt,
        })),
        habitLogs: (data.habitLogs || []).slice(-1000).map((l) => ({
          id: l.id,
          habitId: l.habitId,
          date: l.date,
          completed: l.completed,
          count: l.count,
          notes: l.notes,
        })),
        enhancedHabits: (data.enhancedHabits || []).map((h) => ({
          id: h.id,
          name: h.name,
          domain: h.domain,
          currentLevel: h.currentLevel,
          targetLevel: h.targetLevel,
          habitLoop: h.habitLoop,
          levelHistory: h.levelHistory,
        })),
        habitStacks: (data.habitStacks || []).map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          anchorHabit: s.anchorHabit,
          newHabits: s.newHabits,
          totalDuration: s.totalDuration,
          bestTimeOfDay: s.bestTimeOfDay,
        })),
        weeklyReflections: (data.weeklyReflections || []).slice(-52),
      };
    } catch (error) {
      log.warn({ error: String(error), userId }, 'Failed to export habits');
      return null;
    }
  }

  private async exportProductivity(userId: string) {
    try {
      const { getProductivityStore } = await import('../stores/productivity-store.js');
      const store = getProductivityStore();
      await store.loadUserData(userId);
      const data = store.getFullUserData(userId);

      if (!data) return null;

      return {
        tasks: (data.tasks || []).map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          category: t.category,
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate,
          tags: t.tags,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        })),
        notes: (data.notes || []).map((n) => ({
          id: n.id,
          title: n.title,
          type: n.type,
          content: n.content,
          tags: n.tags,
          mood: n.mood,
          linkedDate: n.linkedDate,
          createdAt: n.createdAt,
          updatedAt: n.updatedAt,
        })),
        journalEntries: (data.journalEntries || []).map((j) => ({
          id: j.id,
          date: j.date,
          gratitudes: j.gratitudes,
          highlight: j.highlight,
          challenge: j.challenge,
          learnings: j.learnings,
          tomorrowIntention: j.tomorrowIntention,
          mood: j.mood,
          notes: j.notes,
          createdAt: j.createdAt,
        })),
        bills: (data.bills || []).map((b) => ({
          id: b.id,
          name: b.name,
          payee: b.payee,
          amount: b.amount,
          frequency: b.frequency,
          dueDay: b.dueDay,
          category: b.category,
          isAutoPay: b.isAutoPay,
          isActive: b.isActive,
          createdAt: b.createdAt,
        })),
        routines: (data.routines || []).map((r) => ({
          id: r.id,
          name: r.name,
          type: r.type,
          steps: r.steps,
          totalDuration: r.totalDuration,
          targetTime: r.targetTime,
          isActive: r.isActive,
          createdAt: r.createdAt,
        })),
        shoppingLists: (data.shoppingLists || []).map((s) => ({
          id: s.id,
          name: s.name,
          items: s.items,
          createdAt: s.createdAt,
        })),
      };
    } catch (error) {
      log.warn({ error: String(error), userId }, 'Failed to export productivity data');
      return null;
    }
  }

  // ============================================================================
  // COUNT HELPERS
  // ============================================================================

  private async getProfileItemCount(userId: string): Promise<number> {
    try {
      const { getDefaultStore } = await import('../memory/index.js');
      const store = getDefaultStore();
      await store.initialize();
      const profile = await store.getProfile(userId);
      return profile ? 1 : 0;
    } catch {
      return 0;
    }
  }

  private async getContactsCount(userId: string): Promise<number> {
    try {
      const { getUserContacts } = await import('../identity/contacts.js');
      const contacts = await getUserContacts(userId);
      return contacts.length;
    } catch {
      return 0;
    }
  }

  private async getTrustDataCount(userId: string): Promise<number> {
    try {
      const { loadTrustProfiles, getActiveBoundaries, getGrowthPatterns, getSharedMoments } =
        await import('../trust-systems/index.js');
      await loadTrustProfiles(userId);
      return (
        getActiveBoundaries(userId).length +
        getGrowthPatterns(userId).length +
        getSharedMoments(userId).length
      );
    } catch {
      return 0;
    }
  }

  private async getWellbeingCount(userId: string): Promise<number> {
    try {
      const { exportWellbeingData } = await import('../wellbeing-tracking/persistence.js');
      const data = await exportWellbeingData(userId);
      return data?.snapshots?.length || 0;
    } catch {
      return 0;
    }
  }

  private async getHabitsCount(userId: string): Promise<number> {
    try {
      const { getProductivityStore } = await import('../stores/productivity-store.js');
      const store = getProductivityStore();
      await store.loadUserData(userId);
      const data = store.getFullUserData(userId);
      return (data?.habits?.length || 0) + (data?.enhancedHabits?.length || 0);
    } catch {
      return 0;
    }
  }

  private async getProductivityCount(userId: string): Promise<number> {
    try {
      const { getProductivityStore } = await import('../stores/productivity-store.js');
      const store = getProductivityStore();
      await store.loadUserData(userId);
      const data = store.getFullUserData(userId);
      return (
        (data?.tasks?.length || 0) +
        (data?.notes?.length || 0) +
        (data?.journalEntries?.length || 0)
      );
    } catch {
      return 0;
    }
  }

  // ============================================================================
  // DELETE ALL DATA
  // ============================================================================

  /**
   * Delete all user data (GDPR right to erasure).
   * Comprehensive deletion across all data stores.
   */
  async deleteAllData(userId: string): Promise<void> {
    const deletionResults: Record<string, boolean> = {};

    try {
      // 1. Delete engagement data
      try {
        const store = await getEngagementStore();
        await store.deleteUserData(userId);
        deletionResults['engagement'] = true;
      } catch (e) {
        log.warn({ error: String(e), userId }, 'Failed to delete engagement data');
        deletionResults['engagement'] = false;
      }

      // 2. Delete profile data
      try {
        const { getDefaultStore } = await import('../memory/index.js');
        const store = getDefaultStore();
        await store.initialize();
        await store.deleteProfile(userId);
        deletionResults['profile'] = true;
      } catch (e) {
        log.warn({ error: String(e), userId }, 'Failed to delete profile');
        deletionResults['profile'] = false;
      }

      // 3. Delete wellbeing data
      try {
        const { deleteWellbeingData } = await import('../wellbeing-tracking/persistence.js');
        await deleteWellbeingData(userId);
        deletionResults['wellbeing'] = true;
      } catch (e) {
        log.warn({ error: String(e), userId }, 'Failed to delete wellbeing data');
        deletionResults['wellbeing'] = false;
      }

      // 4. Delete trust data
      try {
        const { deleteTrustProfiles } = await import('../trust-systems/index.js');
        await deleteTrustProfiles(userId);
        deletionResults['trust'] = true;
      } catch (e) {
        log.warn({ error: String(e), userId }, 'Failed to delete trust data');
        deletionResults['trust'] = false;
      }

      // 5. Delete contacts
      try {
        const { deleteAllContacts } = await import('../identity/contacts.js');
        await deleteAllContacts(userId);
        deletionResults['contacts'] = true;
      } catch (e) {
        log.warn({ error: String(e), userId }, 'Failed to delete contacts');
        deletionResults['contacts'] = false;
      }

      // 6. Delete productivity data
      try {
        const { getProductivityStore } = await import('../stores/productivity-store.js');
        const store = getProductivityStore();
        await store.clearUserData(userId);
        deletionResults['productivity'] = true;
      } catch (e) {
        log.warn({ error: String(e), userId }, 'Failed to delete productivity data');
        deletionResults['productivity'] = false;
      }

      // 7. Delete conversation history (if method exists)
      try {
        const service = getConversationHistoryService();
        // Type narrowing for optional deleteHistory method
        interface WithDeleteHistory {
          deleteHistory?: (userId: string) => Promise<void>;
        }
        const serviceWithDelete = service as unknown as WithDeleteHistory;
        if (typeof serviceWithDelete.deleteHistory === 'function') {
          await serviceWithDelete.deleteHistory(userId);
          deletionResults['conversations'] = true;
        } else {
          log.debug({ userId }, 'Conversation history deleteHistory method not available');
          deletionResults['conversations'] = false;
        }
      } catch (e) {
        log.warn({ error: String(e), userId }, 'Failed to delete conversation history');
        deletionResults['conversations'] = false;
      }

      // 8. Delete cognitive memories (if method exists)
      try {
        const memoryService = getCognitiveMemoryService();
        // Type narrowing for optional deleteAllMemories method
        interface WithDeleteAllMemories {
          deleteAllMemories?: (userId: string) => Promise<void>;
        }
        const memoryWithDelete = memoryService as unknown as WithDeleteAllMemories;
        if (typeof memoryWithDelete.deleteAllMemories === 'function') {
          await memoryWithDelete.deleteAllMemories(userId);
          deletionResults['cognitive'] = true;
        } else {
          log.debug({ userId }, 'Cognitive memory deleteAllMemories method not available');
          deletionResults['cognitive'] = false;
        }
      } catch (e) {
        log.warn({ error: String(e), userId }, 'Failed to delete cognitive memories');
        deletionResults['cognitive'] = false;
      }

      log.info({ userId, deletionResults }, '🗑️ User data deletion completed');
    } catch (error) {
      log.error({ error, userId, deletionResults }, 'Failed to delete all user data');
      throw error;
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Convert category name to JSON key.
   */
  private categoryToKey(category: string): string {
    return category.toLowerCase().replace(/\s+/g, '_');
  }

  /**
   * Convert export data to CSV format.
   */
  private convertToCSV(data: ExportData): string {
    const lines: string[] = [];
    lines.push('# Ferni Data Export');
    lines.push(`# Exported: ${data.exportedAt}`);
    lines.push(`# User: ${data.userId}`);
    lines.push(`# Version: ${data.version}`);
    lines.push('');

    for (const [category, content] of Object.entries(data.categories)) {
      lines.push(`## ${category.toUpperCase()}`);
      lines.push('');

      if (Array.isArray(content)) {
        if (content.length > 0) {
          const first = content[0] as Record<string, unknown>;
          const headers = Object.keys(first).filter(
            (k) => typeof first[k] !== 'object' || first[k] === null
          );
          lines.push(headers.join(','));
          for (const item of content) {
            const row = headers.map((h) => {
              const val = (item as Record<string, unknown>)[h];
              if (val === null || val === undefined) return '';
              if (typeof val === 'string') {
                return `"${val.replace(/"/g, '""')}"`;
              }
              return String(val);
            });
            lines.push(row.join(','));
          }
        }
      } else if (typeof content === 'object' && content !== null) {
        this.flattenObjectToCSV(content as Record<string, unknown>, lines, '');
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Recursively flatten an object for CSV output.
   */
  private flattenObjectToCSV(obj: Record<string, unknown>, lines: string[], prefix: string): void {
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (Array.isArray(value)) {
        lines.push(`${fullKey},${value.length} items`);
      } else if (typeof value === 'object' && value !== null) {
        this.flattenObjectToCSV(value as Record<string, unknown>, lines, fullKey);
      } else if (value !== undefined) {
        const strValue =
          typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : String(value);
        lines.push(`${fullKey},${strValue}`);
      }
    }
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let instance: DataExportService | null = null;

export function getDataExportService(): DataExportService {
  if (!instance) {
    instance = new DataExportService();
  }
  return instance;
}

export default DataExportService;
