/**
 * Truthful account-deletion responses, shared by DELETE /api/gdpr/account
 * and DELETE /api/account. "Everything was deleted" is only said when the
 * recursive deletion verified nothing is left.
 *
 * @module api/account-deletion-response
 */

import type { ServerResponse } from 'http';
import type { AccountDeletionReport } from '../services/memory-control/index.js';
import { sendJSON } from './helpers.js';

export interface AccountDeletionExtras {
  firebaseDeleted: boolean;
  wellbeingDeleted?: boolean;
}

/** Which parts of the deletion did not finish (no internal error text leaves the server). */
export function incompleteParts(report: AccountDeletionReport): string[] {
  const parts = Object.entries(report.firestore)
    .filter(([, state]) => state === 'failed')
    .map(([root]) => `firestore:${root}`);
  for (const [target, count] of Object.entries(report.storage)) {
    if (count === 'failed') parts.push(`storage:${target}`);
  }
  for (const error of report.errors) {
    if (error.startsWith('vectors:')) parts.push('vectors');
    if (error.startsWith('graph:')) parts.push('graph');
    if (error === 'Firestore unavailable') parts.push('firestore');
  }
  return [...new Set(parts)];
}

export function sendAccountDeletionResult(
  res: ServerResponse,
  report: AccountDeletionReport,
  extras: AccountDeletionExtras
): void {
  const details = {
    firestore: report.firestore,
    embeddingsDeleted: report.embeddings,
    graphRecordsDeleted: report.graphRecords,
    storage: report.storage,
    firebaseDeleted: extras.firebaseDeleted,
    ...(extras.wellbeingDeleted !== undefined && { wellbeingDeleted: extras.wellbeingDeleted }),
  };

  if (!report.complete) {
    sendJSON(
      res,
      {
        success: false,
        message: "We couldn't delete everything. Please try again or contact support.",
        incomplete: incompleteParts(report),
        details,
      },
      500
    );
    return;
  }

  if (!report.existed && !extras.firebaseDeleted && !extras.wellbeingDeleted) {
    sendJSON(res, { success: false, message: 'No account data found to delete.', details });
    return;
  }

  sendJSON(res, {
    success: true,
    message: 'Your account and all associated data have been deleted.',
    deletedAt: new Date().toISOString(),
    note: 'This action is irreversible. Thank you for using Ferni.',
    details,
  });
}
