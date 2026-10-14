/**
 * Auto-capture flag. Off by default.
 *
 * Auto-capture has no sender yet: saveMomentToJournal and saveAllPendingMoments
 * have no callers, so nothing captured ever reached a journal. Until 2026-10-13
 * every matched call sentence (and "i think" or "want to" matches nearly all of
 * them) piled up in plain text in localStorage, unbounded, and survived account
 * delete. While off, nothing is detected or kept, and the twin panel does not
 * offer the "remember what matters" toggle. Turn it on with
 * `VITE_JOURNAL_CAPTURE=true` once a real sender exists. Even when on, moments
 * stay in memory only and are never written to browser storage.
 */
export function isJournalCaptureOn(): boolean {
  return import.meta.env.VITE_JOURNAL_CAPTURE === 'true';
}
