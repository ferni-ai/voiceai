/**
 * What "Privacy & your data" does when the user exports, deletes their data or
 * deletes their account. Each one reports success only once the server confirms
 * it. A refusal says nothing was removed and why. A delete with no answer (a
 * timeout, a network error, a 5xx) says it couldn't be confirmed and offers a
 * check of what's there now, never a second delete: the server keeps erasing
 * after the browser stops waiting, so the first request may still be running.
 *
 * Loaded, with the data export service, when the panel opens (panel-methods.ts).
 */

import { t } from '../i18n/index.js';
import {
  DataRightsError,
  dataExportService,
  dataRightsErrorMessage,
} from '../services/data-export.service.js';
import type { DataExportUICallbacks } from '../ui/data-export.ui.js';
import { getDataExportUI } from '../ui/data-export.ui.js';
import {
  recheckAfterDelete,
  showDataRightsNotice,
  showDeletionUnconfirmed,
} from '../ui/data-export-status.js';
import { toast } from '../ui/whisper.ui.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('DataRights');

/** Both deletes leave for '/' once the server has confirmed them. */
function leaveSoon(): void {
  setTimeout(() => {
    window.location.href = '/';
  }, 1500);
}

/**
 * A delete that wasn't confirmed. Only a DataRightsError the server or sign-in
 * check refused may say nothing was removed; anything else couldn't be confirmed.
 */
function deleteNotConfirmed(err: unknown, unknownKey: string, check: () => void): void {
  if (err instanceof DataRightsError && err.reason !== 'unknown') {
    toast.error(err.message);
    return;
  }
  showDeletionUnconfirmed(getDataExportUI(), dataRightsErrorMessage(err, t(unknownKey)), check);
}

/** The panel's categories and counts; null when they couldn't be loaded. */
export const loadCategories = () => dataExportService.getExportableCategories();

/** Re-load the categories and their counts, so the user sees what's still there. */
function checkData(): void {
  void recheckAfterDelete(
    getDataExportUI(),
    loadCategories,
    t('dataExportService.deleteDataStillUnknown')
  );
}

async function checkAccount(): Promise<void> {
  const ui = getDataExportUI();
  showDataRightsNotice(ui, t('common.loading'));
  const state = await dataExportService.checkAccountSignIn();
  if (state === 'refused') {
    // Not proof the account is closed (a 401 also means expired or revoked): say only that
    ui.hide();
    toast.info(t('dataExportService.accountSignInRefused'));
    leaveSoon();
  } else if (state === 'open') {
    showDataRightsNotice(ui, t('dataExportService.accountStillOpen'));
  } else {
    showDeletionUnconfirmed(ui, t('dataExportService.deleteAccountUnknown'), () => {
      void checkAccount();
    });
  }
}

export function dataRightsCallbacks(): DataExportUICallbacks {
  return {
    onExport: async (format, categories) => {
      try {
        toast.info(t('app.preparingData'));
        await dataExportService.exportData(format, categories);
        toast.success(t('app.downloadStarted'));
      } catch (err) {
        log.error('Export failed:', err);
        toast.error(dataRightsErrorMessage(err, t('dataExportService.exportFailed')));
      }
    },
    onDeleteData: async () => {
      try {
        toast.info(t('app.deletingData'));
        await dataExportService.deleteAllData();
        toast.success(t('app.allDataDeleted'));
        leaveSoon();
      } catch (err) {
        log.error('Delete failed:', err);
        deleteNotConfirmed(err, 'dataExportService.deleteDataUnknown', checkData);
      }
    },
    onDeleteAccount: async () => {
      try {
        toast.info(t('app.deletingAccount'));
        const leftover = await dataExportService.deleteAccount();
        toast[leftover ? 'warning' : 'success'](leftover ?? t('app.accountDeleted'));
        leaveSoon();
      } catch (err) {
        log.error('Account deletion failed:', err);
        deleteNotConfirmed(err, 'dataExportService.deleteAccountUnknown', () => {
          void checkAccount();
        });
      }
    },
    onClose: () => {
      log.debug('Data export panel closed');
    },
  };
}
