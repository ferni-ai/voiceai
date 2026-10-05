/**
 * Commitment Prefetch
 *
 * Every turn, the live-superhuman step checks for progress on the user's
 * commitments (checkProgressE2E -> loadUserCommitments), and the turn
 * processor cuts that step off after 50ms. The first check for a user runs a
 * Firestore query (130-375ms locally on 2026-10-02), so a session's first turn
 * timed out and dropped its superhuman injections. Starting the read as soon
 * as the user is identified lets that turn hit loadUserCommitments' cache.
 */

import { createLogger } from '../../utils/safe-logger.js';
import { loadUserCommitments } from './commitment-keeper.js';

const log = createLogger({ module: 'CommitmentPrefetch' });

/**
 * Load a user's commitments into the commitment-keeper cache. Never rejects;
 * if it fails, the first turn loads them itself as before.
 */
export async function prefetchUserCommitments(userId: string | undefined): Promise<void> {
  if (!userId) return;
  const start = Date.now();
  try {
    const commitments = await loadUserCommitments(userId);
    log.debug(
      { userId, count: commitments.length, durationMs: Date.now() - start },
      'Commitments prefetched'
    );
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Commitment prefetch failed');
  }
}
