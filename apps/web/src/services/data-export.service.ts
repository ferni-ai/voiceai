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

import { t } from '../i18n/index.js';
import { createLogger } from '../utils/logger.js';
import { apiFetch } from '../utils/api-helpers.js';
import {
  AUTH_READY_TIMEOUT_MS,
  DATA_RIGHTS_AUTH_WAIT_MS,
  LONG_REQUEST_TIMEOUT_MS,
  valueWithin,
} from '../utils/request-deadline.js';
import { clearAllUserData, exportLocalStorage, sealUserData } from '../config/storage-keys.js';
import { getAuthToken, initAuth } from './firebase-auth.service.js';
import { signOutReleasingPush } from './push-preference.js';
import { ritualsService } from './rituals.service.js';
import { deletionFailureKey, deletionOutcome } from './deletion-outcome.js';

const log = createLogger('DataExport');

// ============================================================================
// TYPES
// ============================================================================

export interface ExportableCategory {
  category: string;
  /** Localized display name; `category` is the server id. */
  name?: string;
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
 * Category ids are what the server knows them by, so they are sent back unchanged;
 * only the description shown to the user is localized.
 */
const CATEGORY_DESCRIPTION_KEYS: Record<string, string> = {
  Conversations: 'dataExportService.categoryConversations',
  Insights: 'dataExportService.categoryInsights',
  Rituals: 'dataExportService.categoryRituals',
  Predictions: 'dataExportService.categoryPredictions',
  'Mood History': 'dataExportService.categoryMoodHistory',
  Profile: 'dataExportService.categoryProfile',
  Contacts: 'dataExportService.categoryContacts',
  'Trust Journey': 'dataExportService.categoryTrustJourney',
  Wellbeing: 'dataExportService.categoryWellbeing',
  Habits: 'dataExportService.categoryHabits',
  Productivity: 'dataExportService.categoryProductivity',
  Records: 'dataExportService.categoryRecords',
};

const CATEGORY_NAME_KEYS: Record<string, string> = {
  Conversations: 'dataExportService.categoryName.conversations',
  Insights: 'dataExportService.categoryName.insights',
  Rituals: 'dataExportService.categoryName.rituals',
  Predictions: 'dataExportService.categoryName.predictions',
  'Mood History': 'dataExportService.categoryName.moodHistory',
  Profile: 'dataExportService.categoryName.profile',
  Contacts: 'dataExportService.categoryName.contacts',
  'Trust Journey': 'dataExportService.categoryName.trustJourney',
  Wellbeing: 'dataExportService.categoryName.wellbeing',
  Habits: 'dataExportService.categoryName.habits',
  Productivity: 'dataExportService.categoryName.productivity',
  Records: 'dataExportService.categoryName.records',
};

/** What the person is told when an export stops at a limit (src/api/routes/data.ts) */
const EXPORT_FAILURE_KEYS: Record<number, string> = {
  413: 'dataExportService.exportTooLarge',
  429: 'dataExportService.exportTooOften',
  503: 'dataExportService.exportBusy',
};

function localizeCategories(categories: ExportableCategory[]): ExportableCategory[] {
  return categories.map((c) => {
    const key = CATEGORY_DESCRIPTION_KEYS[c.category];
    return key ? { ...c, name: t(CATEGORY_NAME_KEYS[c.category]!), description: t(key) } : c;
  });
}

/**
 * A data-rights request that wasn't confirmed. `message` is safe to show the user.
 * 'refused': the server (or the sign-in check) turned it away, nothing was removed.
 * 'unknown': no answer, or a 5xx, so a delete may have run anyway (deletion-outcome.ts).
 */
export class DataRightsError extends Error {
  constructor(
    readonly reason: 'not_signed_in' | 'server' | 'refused' | 'unknown',
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
 * id the client names, so there is nothing to do without one. Waits up to
 * DATA_RIGHTS_AUTH_WAIT_MS for it; the caller sends it itself, so apiFetch's
 * shorter wait can't drop it and turn the request into a 401.
 */
async function requireSignedIn(message: string): Promise<string> {
  const signedIn = initAuth()
    .catch(() => undefined)
    .then(() => getAuthToken());
  const token = await valueWithin<string | null | undefined>(
    signedIn,
    DATA_RIGHTS_AUTH_WAIT_MS,
    undefined
  );
  if (token === undefined) {
    throw new DataRightsError('refused', t('dataExportService.authSlow'));
  }
  if (!token) {
    throw new DataRightsError('not_signed_in', message);
  }
  return token;
}

/** A delete with the caller's token, waiting past the server's own limit. Null: no answer. */
function sendDeletion(url: string, token: string, body: object): Promise<Response | null> {
  return apiFetch(
    url,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    },
    LONG_REQUEST_TIMEOUT_MS
  ).catch((err: unknown) => {
    log.error('Deletion request got no answer', err);
    return null;
  });
}

function deletionError(response: Response | null, what: 'data' | 'account'): DataRightsError {
  const outcome = deletionOutcome(response);
  const failed = outcome === 'confirmed' ? 'unknown' : outcome; // 2xx without its confirmation
  log.error('Deletion not confirmed', { what, outcome: failed, status: response?.status });
  return new DataRightsError(failed, t(deletionFailureKey(failed, response?.status, what)));
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
    const token = await requireSignedIn(t('dataExportService.signInToDownload'));

    try {
      const response = await apiFetch(
        '/api/export',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ format, categories }),
        },
        LONG_REQUEST_TIMEOUT_MS
      );

      if (!response.ok) {
        log.error('Export request failed', { status: response.status });
        throw new DataRightsError(
          'server',
          t(EXPORT_FAILURE_KEYS[response.status] ?? 'dataExportService.exportFailed')
        );
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
   * The server deletion must be confirmed before anything local is cleared. A
   * refusal says nothing was removed; no answer says it couldn't be confirmed.
   */
  async deleteAllData(): Promise<void> {
    log.warn('Starting data deletion');
    const token = await requireSignedIn(t('dataExportService.signInToDeleteData'));

    const response = await sendDeletion('/api/export/all', token, { confirmDelete: true });
    if (!response?.ok) throw deletionError(response, 'data');

    this.clearLocalData();
    log.info('All user data deleted');
  }

  /**
   * Close the account: the server erases every store and the Firebase user,
   * then this device forgets everything and signs out. Resolves with a notice
   * for the user when the account is gone but some records couldn't be
   * removed (the server lists them in details.failures), else null.
   */
  async deleteAccount(): Promise<string | null> {
    log.warn('Starting account deletion');
    const token = await requireSignedIn(t('dataExportService.signInToDeleteAccount'));

    const response = await sendDeletion('/api/account', token, {
      confirmation: 'DELETE_MY_ACCOUNT',
    });
    const result = response?.ok
      ? ((await response.json().catch(() => ({}))) as {
          success?: boolean;
          details?: { failures?: unknown };
        })
      : null;

    if (!result?.success) throw deletionError(response, 'account');

    await this.forgetAccountOnDevice();
    const failures = result.details?.failures;
    if (Array.isArray(failures) && failures.length > 0) {
      log.warn('Account deleted, but some records were left', { failures });
      return t('dataExportService.accountDeletedPartial');
    }
    log.info('Account deleted');
    return null;
  }

  /**
   * After an account delete whose answer never came: does the server still take this
   * sign-in? 'open': yes, so the account wasn't closed. 'refused': no. That happens
   * when an account is closing (the sign-in is switched off when erasure starts), but
   * also for an expired or revoked token, so it isn't proof of closure; this device
   * signs out and forgets the data, which signing in again undoes. 'unknown': no clear
   * answer yet. Never sends another delete.
   */
  async checkAccountSignIn(): Promise<'open' | 'refused' | 'unknown'> {
    const token = await valueWithin(getAuthToken(), DATA_RIGHTS_AUTH_WAIT_MS, null);
    if (!token) return 'unknown';
    const response = await apiFetch('/api/account', {
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null);
    if (response?.ok) return 'open';
    if (response?.status !== 401 && response?.status !== 403) return 'unknown';
    await this.forgetAccountOnDevice();
    return 'refused';
  }

  private async forgetAccountOnDevice(): Promise<void> {
    this.clearLocalData();
    // Also kills this browser's push endpoint, so nothing addressed to the deleted account lands here.
    await signOutReleasingPush().catch((err: unknown) =>
      log.warn('Sign-out after account deletion failed', err)
    );
  }

  private clearLocalData(): void {
    clearAllUserData(false); // false = don't preserve dev settings
    // Both callers leave for '/' 1.5 s later. Until then nothing still running on
    // this page (a module's start-up save, a pending write) may put the deleted
    // data back, as one did after sign-out's clear (menu-e2e run 40105651631).
    sealUserData(false);
    ritualsService.clearAll();
  }

  /**
   * Get exportable categories from the backend.
   * This shows what data exists and can be exported.
   * Null when the backend didn't answer or refused: the panel then says it
   * couldn't load, instead of showing every category with 0 items.
   */
  async getExportableCategories(): Promise<ExportableCategory[] | null> {
    // Signed out: the categories, empty. A token that never comes: couldn't load.
    const token = await this.authToken();
    if (token === undefined) return null;
    if (!token) return this.getDefaultCategories();
    return this.fetchCategories();
  }

  /**
   * Only what the server says is there: null when signed out or it didn't answer.
   * "Check again" after an unconfirmed delete reads this, because the signed-out
   * list (every category at 0) would read as "your data is gone" with nothing
   * confirmed by the server.
   */
  async getServerCategories(): Promise<ExportableCategory[] | null> {
    return (await this.authToken()) ? this.fetchCategories() : null;
  }

  private authToken(): Promise<string | null | undefined> {
    return valueWithin<string | null | undefined>(getAuthToken(), AUTH_READY_TIMEOUT_MS, undefined);
  }

  private async fetchCategories(): Promise<ExportableCategory[] | null> {
    try {
      const response = await apiFetch('/api/export/categories');

      if (!response.ok) {
        log.warn('Failed to get categories from API', { status: response.status });
        return null;
      }

      const data = await response.json();
      return data.categories ? localizeCategories(data.categories) : null;
    } catch (err) {
      log.warn('Error fetching categories', err);
      return null;
    }
  }

  /**
   * Default categories when API is unavailable.
   */
  private getDefaultCategories(): ExportableCategory[] {
    return localizeCategories(
      Object.keys(CATEGORY_DESCRIPTION_KEYS).map((category) => ({
        category,
        description: '',
        itemCount: 0,
        exportable: true,
      }))
    );
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
