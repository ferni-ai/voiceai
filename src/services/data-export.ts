/**
 * Data Export Service
 *
 * GDPR-compliant data export functionality.
 * Allows users to download all their data in JSON or CSV format.
 */

import { getEngagementStore } from './engagement-store.js';
import { getConversationHistoryService } from './conversation-history.js';
import { getCognitiveMemoryService } from './cognitive-memory.js';
import { getLogger } from '../utils/logger.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ExportCategory {
  category: string;
  description: string;
  itemCount: number;
  exportable: boolean;
}

export interface ExportData {
  exportedAt: string;
  userId: string;
  categories: Record<string, unknown>;
}

export type ExportFormat = 'json' | 'csv';

// ============================================================================
// DATA EXPORT SERVICE
// ============================================================================

class DataExportService {
  /**
   * Get summary of exportable data categories.
   */
  async getExportableCategories(userId: string): Promise<ExportCategory[]> {
    const categories: ExportCategory[] = [];

    try {
      // Conversations
      const historyService = getConversationHistoryService();
      const history = await historyService.getHistory(userId, 1000);
      categories.push({
        category: 'Conversations',
        description: 'All conversation transcripts and metadata',
        itemCount: history.totalSessions,
        exportable: true,
      });

      // Cognitive memories
      const memoryService = getCognitiveMemoryService();
      const memories = await memoryService.getMemories(userId);
      categories.push({
        category: 'Insights',
        description: 'AI-learned memories and patterns',
        itemCount: memories.length,
        exportable: true,
      });

      // Engagement data
      const store = await getEngagementStore();
      const profile = await store.getProfile(userId);

      categories.push({
        category: 'Rituals',
        description: 'Daily practice history and streaks',
        itemCount: profile.activeRituals?.length || 0,
        exportable: true,
      });

      // Predictions
      const predictions = await store.getPredictions(userId, 1000);
      categories.push({
        category: 'Predictions',
        description: 'Your predictions and outcomes',
        itemCount: predictions.length,
        exportable: true,
      });

      // Weather history
      const weatherHistory = await store.getWeatherHistory(userId, 1000);
      categories.push({
        category: 'Mood History',
        description: 'Emotional weather records',
        itemCount: weatherHistory.length,
        exportable: true,
      });
    } catch (error) {
      getLogger().error({ error, userId }, 'Failed to get exportable categories');
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
      categories: {},
    };

    try {
      // Export conversations
      if (selectedCategories.includes('Conversations')) {
        const historyService = getConversationHistoryService();
        const history = await historyService.getHistory(userId, 10000);
        exportData.categories['conversations'] = history;
      }

      // Export cognitive memories
      if (selectedCategories.includes('Insights')) {
        const memoryService = getCognitiveMemoryService();
        const profile = await memoryService.getProfile(userId);
        exportData.categories['insights'] = profile;
      }

      // Export engagement data
      const store = await getEngagementStore();

      if (selectedCategories.includes('Rituals')) {
        const profile = await store.getProfile(userId);
        const streaks = await store.getRitualStreaks(userId);
        exportData.categories['rituals'] = {
          activeRituals: profile.activeRituals,
          streaks,
        };
      }

      if (selectedCategories.includes('Predictions')) {
        const predictions = await store.getPredictions(userId, 10000);
        exportData.categories['predictions'] = predictions;
      }

      if (selectedCategories.includes('Mood History')) {
        const weatherHistory = await store.getWeatherHistory(userId, 10000);
        exportData.categories['moodHistory'] = weatherHistory;
      }

      getLogger().info({ userId, categories: selectedCategories, format }, '📦 Data exported');
    } catch (error) {
      getLogger().error({ error, userId }, 'Failed to export data');
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
   * Delete all user data.
   */
  async deleteAllData(userId: string): Promise<void> {
    try {
      const store = await getEngagementStore();
      await store.deleteUserData(userId);
      getLogger().info({ userId }, '🗑️ All user data deleted');
    } catch (error) {
      getLogger().error({ error, userId }, 'Failed to delete user data');
      throw error;
    }
  }

  /**
   * Convert export data to CSV format.
   */
  private convertToCSV(data: ExportData): string {
    const lines: string[] = [];
    lines.push('# Ferni Data Export');
    lines.push(`# Exported: ${data.exportedAt}`);
    lines.push(`# User: ${data.userId}`);
    lines.push('');

    for (const [category, content] of Object.entries(data.categories)) {
      lines.push(`## ${category.toUpperCase()}`);

      if (Array.isArray(content)) {
        if (content.length > 0) {
          const headers = Object.keys(content[0] as Record<string, unknown>);
          lines.push(headers.join(','));
          for (const item of content) {
            const row = headers.map((h) => {
              const val = (item as Record<string, unknown>)[h];
              if (typeof val === 'string') {
                return `"${val.replace(/"/g, '""')}"`;
              }
              return String(val ?? '');
            });
            lines.push(row.join(','));
          }
        }
      } else if (typeof content === 'object' && content !== null) {
        for (const [key, value] of Object.entries(content)) {
          if (Array.isArray(value)) {
            lines.push(`${key},${value.length} items`);
          } else {
            lines.push(`${key},"${String(value).replace(/"/g, '""')}"`);
          }
        }
      }
      lines.push('');
    }

    return lines.join('\n');
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
