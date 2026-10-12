/**
 * The "Who You're Talking To" block voice-agent-entry appends to the model
 * instructions, built from the profile as it stands now.
 *
 * On the multi-agent fast path the profile loads after session init
 * (session-manager's deferred load), so the returning flag session init hands
 * back was decided against a null profile and is false for everyone. A user
 * with 654 conversations was told "This is your first conversation with them"
 * (prod call 2026-10-12). The flag is recomputed here, at the point the block
 * is built, and written back to userData for the context builders that read it.
 */

import type { UserProfile } from '../../types/user-profile.js';
import { buildUserAwareness } from '../voice-agent/phases/user-awareness.js';

export interface UserAwarenessInjection {
  instructionsBlock: string;
  facts: string[];
  /** Returning flag after looking at the loaded profile */
  isReturningUser: boolean;
}

export function injectUserAwareness(opts: {
  sessionId: string;
  userProfile: UserProfile | null | undefined;
  userData: Record<string, unknown> | null | undefined;
  /** What session init decided, possibly before the profile loaded */
  isReturningUser: boolean;
  userName?: string;
  sessionStartTime: Date;
}): UserAwarenessInjection {
  const { sessionId, userProfile, userData, userName, sessionStartTime } = opts;
  const isReturningUser = opts.isReturningUser || (userProfile?.totalConversations ?? 0) > 0;
  if (isReturningUser && userData && userData.isReturningUser !== true) {
    userData.isReturningUser = true;
  }

  const { facts, instructionsBlock } = buildUserAwareness({
    sessionId,
    userProfile: userProfile ?? null,
    isReturningUser,
    userName,
    sessionStartTime,
  });
  if (facts.length > 0) {
    process.stderr.write(
      `[voice-agent-entry] 👤 BETTER THAN HUMAN - User awareness injected (${facts.length} facts):\n`
    );
    facts.forEach((fact, i) => process.stderr.write(`[voice-agent-entry]   ${i + 1}. ${fact}\n`));
  } else {
    process.stderr.write(
      `[voice-agent-entry] 👤 No user awareness facts available (new user or empty profile)\n`
    );
  }
  return { instructionsBlock, facts, isReturningUser };
}
