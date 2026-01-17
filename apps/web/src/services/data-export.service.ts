/**
 * Data Export Service (Frontend)
 *
 * GDPR-compliant data export and deletion.
 * This service calls the backend API for comprehensive data export,
 * and also handles local storage cleanup.
 *
 * The backend is the single source of truth for what data exists.
 * This frontend service handles:
 * - Calling the backend export API
 * - Triggering file downloads
 * - Clearing localStorage (frontend-only data)
 */

import { createLogger } from '../utils/logger.js';
import { apiFetch } from '../utils/api-helpers.js';
import { clearAllUserData, exportLocalStorage, STORAGE_KEYS } from '../config/storage-keys.js';
import { ritualsService } from './rituals.service.js';

const log = createLogger('DataExport');

// ============================================================================
// TYPES
// ============================================================================

export interface ExportableCategory {
  category: string;
  description: string;
  itemCount: number;
  exportable: boolean;
}

export interface ExportData {
  exportedAt: string;
  version: string;
  categories: Record<string, unknown>;
  localStorageData?: Record<string, string | null>;
}

// ============================================================================
// DATA EXPORT SERVICE
// ============================================================================

class DataExportService {
  /**
   * Export user data in the specified format.
   * Calls the backend API and triggers a download.
   */
  async exportData(format: 'json' | 'csv', categories: string[]): Promise<void> {
    log.info('Starting data export', { format, categories });

    const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
    if (!userId) {
      log.warn('No user ID found, cannot export data');
      throw new Error('Not signed in');
    }

    try {
      // Call backend export API
      const response = await apiFetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          format,
          categories,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Export failed: ${error}`);
      }

      // Get the exported data as blob
      let blob: Blob;

      if (format === 'json') {
        // For JSON, we want to also include localStorage data
        const backendData = await response.json();
        const localData = exportLocalStorage();

        const enrichedData: ExportData = {
          ...backendData,
          localStorageData: localData,
        };

        blob = new Blob([JSON.stringify(enrichedData, null, 2)], {
          type: 'application/json',
        });
      } else {
        // For CSV, just use the backend response
        blob = await response.blob();
      }

      // Trigger download
      this.triggerDownload(blob, `ferni-data-${this.getDateString()}.${format}`);
      log.info('Data export completed successfully');
    } catch (err) {
      log.error('Data export failed', err);
      throw err;
    }
  }

  /**
   * Delete all user data (GDPR right to erasure).
   * Clears both backend data and localStorage.
   */
  async deleteAllData(): Promise<void> {
    log.warn('Starting data deletion');

    const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);

    try {
      // 1. Clear all localStorage data
      clearAllUserData(false); // false = don't preserve dev settings

      // 2. Clear rituals service state
      ritualsService.clearAll();

      // 3. Delete backend data (if we have a userId)
      if (userId) {
        try {
          const response = await apiFetch('/api/export/all', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, confirmDelete: true }),
          });

          if (response.ok) {
            log.info('Backend data deleted');
          } else {
            log.warn('Backend deletion returned non-OK status');
          }
        } catch (err) {
          log.warn('Backend deletion failed, local data still cleared', err);
        }
      }

      log.info('All user data deleted');
    } catch (err) {
      log.error('Data deletion failed', err);
      throw err;
    }
  }

  /**
   * Get exportable categories from the backend.
   * This shows what data exists and can be exported.
   */
  async getExportableCategories(): Promise<ExportableCategory[]> {
    const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
    if (!userId) {
      return this.getDefaultCategories();
    }

    try {
      const response = await apiFetch(`/api/export/categories?userId=${encodeURIComponent(userId)}`);

      if (!response.ok) {
        log.warn('Failed to get categories from API, using defaults');
        return this.getDefaultCategories();
      }

      const data = await response.json();
      return data.categories || this.getDefaultCategories();
    } catch (err) {
      log.warn('Error fetching categories', err);
      return this.getDefaultCategories();
    }
  }

  /**
   * Default categories when API is unavailable.
   */
  private getDefaultCategories(): ExportableCategory[] {
    return [
      {
        category: 'Conversations',
        description: 'All conversation transcripts and metadata',
        itemCount: 0,
        exportable: true,
      },
      {
        category: 'Insights',
        description: 'What Ferni has learned about you',
        itemCount: 0,
        exportable: true,
      },
      {
        category: 'Rituals',
        description: 'Daily practice history and streaks',
        itemCount: 0,
        exportable: true,
      },
      {
        category: 'Predictions',
        description: 'Your predictions and outcomes',
        itemCount: 0,
        exportable: true,
      },
      {
        category: 'Mood History',
        description: 'Emotional weather records',
        itemCount: 0,
        exportable: true,
      },
      {
        category: 'Profile',
        description: 'Your profile and preferences',
        itemCount: 0,
        exportable: true,
      },
      {
        category: 'Contacts',
        description: 'Your people and relationships',
        itemCount: 0,
        exportable: true,
      },
      {
        category: 'Trust Journey',
        description: 'Your growth, boundaries, and shared moments',
        itemCount: 0,
        exportable: true,
      },
      {
        category: 'Wellbeing',
        description: 'Wellness snapshots and trends',
        itemCount: 0,
        exportable: true,
      },
      {
        category: 'Habits',
        description: "Maya's habit coaching data",
        itemCount: 0,
        exportable: true,
      },
      {
        category: 'Productivity',
        description: 'Tasks, notes, and journal entries',
        itemCount: 0,
        exportable: true,
      },
    ];
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Trigger a file download in the browser.
   */
  private triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    log.info('Download triggered', { filename });
  }

  /**
   * Get date string for filename.
   */
  private getDateString(): string {
    return new Date().toISOString().split('T')[0] || 'export';
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const dataExportService = new DataExportService();

export default dataExportService;
