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
import { clearAllUserData, exportLocalStorage } from '../config/storage-keys.js';
import { getAuthToken, initAuth } from './firebase-auth.service.js';
import { signOutReleasingPush } from './push-preference.js';
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

/**
 * A data-rights request that did not happen. `message` is safe to show the user.
 */
export class DataRightsError extends Error {
  constructor(
    readonly reason: 'not_signed_in' | 'server',
    message: string
  ) {
    super(message);
    this.name = 'DataRightsError';
  }
}

/** The user-facing text for a failed data-rights request. */
export function dataRightsErrorMessage(err: unknown, fallback: string): string {
  return err instanceof DataRightsError ? err.message : fallback;
}

/**
 * The server binds export and delete to the verified Firebase token, never to an
 * id the client names, so there is nothing to do without one.
 */
async function requireSignedIn(action: string): Promise<void> {
  await initAuth().catch(() => undefined);
  const token = await getAuthToken();
  if (!token) {
    throw new DataRightsError('not_signed_in', `Sign in to ${action}.`);
  }
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
    await requireSignedIn('download your data');

    try {
      const response = await apiFetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format, categories }),
      });

      if (!response.ok) {
        log.error('Export request failed', { status: response.status });
        throw new DataRightsError('server', "Couldn't export your data. Try again?");
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
   * The server deletion must succeed before anything local is cleared, so a
   * failure leaves the user exactly where they were and says so.
   */
  async deleteAllData(): Promise<void> {
    log.warn('Starting data deletion');
    await requireSignedIn('delete your data');

    const response = await apiFetch('/api/export/all', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmDelete: true }),
    }).catch((err: unknown) => {
      log.error('Data deletion request failed', err);
      return null;
    });

    if (!response?.ok) {
      log.error('Server refused data deletion', { status: response?.status });
      throw new DataRightsError('server', "Couldn't delete your data. Nothing was removed. Try again?");
    }

    this.clearLocalData();
    log.info('All user data deleted');
  }

  /**
   * Close the account: the server erases every store and the Firebase user,
   * then this device forgets everything and signs out.
   */
  async deleteAccount(): Promise<void> {
    log.warn('Starting account deletion');
    await requireSignedIn('delete your account');

    const response = await apiFetch('/api/account', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation: 'DELETE_MY_ACCOUNT' }),
    }).catch((err: unknown) => {
      log.error('Account deletion request failed', err);
      return null;
    });
    const result = response?.ok
      ? ((await response.json().catch(() => ({}))) as { success?: boolean })
      : null;

    if (!result?.success) {
      log.error('Server did not confirm account deletion', { status: response?.status });
      throw new DataRightsError('server', "Couldn't delete your account. Try again?");
    }

    this.clearLocalData();
    // Also kills this browser's push endpoint, so nothing addressed to the deleted account lands here.
    await signOutReleasingPush().catch((err: unknown) =>
      log.warn('Sign-out after account deletion failed', err)
    );
    log.info('Account deleted');
  }

  private clearLocalData(): void {
    clearAllUserData(false); // false = don't preserve dev settings
    ritualsService.clearAll();
  }

  /**
   * Get exportable categories from the backend.
   * This shows what data exists and can be exported.
   */
  async getExportableCategories(): Promise<ExportableCategory[]> {
    if (!(await getAuthToken())) {
      return this.getDefaultCategories();
    }

    try {
      const response = await apiFetch('/api/export/categories');

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
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const dataExportService = new DataExportService();

export default dataExportService;
