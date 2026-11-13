/**
 * The real reply-for-log functions, for a `vi.mock` factory of `utils/safe-logger.js`.
 *
 * A stub that hands the text back whole shows every test dev behaviour, the opposite of
 * the safe default: a test asserting "no words in the log" then proves nothing about prod.
 * The real functions read FIRESTORE_DATABASE when called, so a test that sets none sees
 * what a prod log holds (`[N chars]`), and a test that sets a dev database sees the words.
 *
 * Use inside the factory (it cannot see a top-level import, the factory is hoisted):
 *   const { realReplyForLog } = await import('<path>/tests/helpers/real-reply-for-log.js');
 *   return { getLogger: ..., ...(await realReplyForLog()) };
 */
import { vi } from 'vitest';

import type * as ReplyForLog from '../../utils/reply-for-log.js';

type ReplyForLogFunctions = Pick<
  typeof ReplyForLog,
  'isFullLoggingEnabled' | 'replyForLog' | 'repliesForLog'
>;

export async function realReplyForLog(): Promise<ReplyForLogFunctions> {
  const { isFullLoggingEnabled, replyForLog, repliesForLog } = await vi.importActual<
    typeof ReplyForLog
  >('../../utils/reply-for-log.js');
  return { isFullLoggingEnabled, replyForLog, repliesForLog };
}
