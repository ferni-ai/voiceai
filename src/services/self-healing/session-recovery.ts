/**
 * Session Recovery Handler
 *
 * Provides proactive user communication when self-healing recovers from errors.
 * This is the "human touch" that makes Ferni feel genuinely present.
 *
 * Philosophy: When something goes wrong, Ferni acknowledges it warmly
 * and redirects focus back to the user - because their experience matters most.
 */

import { humanizeError, getRecoveryMessage } from './error-humanizer.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'session-recovery' });

export interface RecoveryContext {
  wasInConversation: boolean;
  lastUserMessage?: string;
  errorType: string;
  phase: string;
  autoRecovered: boolean;
}

interface SessionLike {
  say: (text: string, options?: { allowInterruptions?: boolean }) => Promise<void> | void;
}

/**
 * Communicate recovery to user in a warm, human way
 */
export async function communicateRecovery(
  session: SessionLike,
  error: Error,
  context: RecoveryContext
): Promise<boolean> {
  try {
    const humanized = humanizeError(error);

    // Only notify user for significant issues
    if (!humanized.shouldNotifyUser) {
      log.debug({ errorType: context.errorType }, 'Skipping user notification (minor issue)');
      return false;
    }

    // Build the recovery message
    let message: string;

    if (context.autoRecovered) {
      // We fixed it - acknowledge briefly and move on
      message = humanized.userMessage;
    } else {
      // Still having issues - be more apologetic
      message = getRecoveryMessage({
        wasInConversation: context.wasInConversation,
        lastUserMessage: context.lastUserMessage,
        errorType: context.errorType,
      });
    }

    // Say the message warmly
    await session.say(message, { allowInterruptions: true });

    log.info(
      { phase: context.phase, errorType: context.errorType, autoRecovered: context.autoRecovered },
      'Communicated recovery to user'
    );

    return true;
  } catch (sayError) {
    log.warn({ sayError, originalError: error.message }, 'Failed to communicate recovery to user');
    return false;
  }
}

/**
 * Register recovery handlers for a session
 *
 * This wraps common session events to automatically communicate
 * recovery when the self-healing system fixes issues.
 */
export function createRecoveryAwareSession(
  session: SessionLike,
  options: {
    onRecoverySpoken?: (message: string) => void;
  } = {}
): SessionLike & {
  notifyRecovery: (error: Error, context: Partial<RecoveryContext>) => Promise<boolean>;
} {
  return {
    ...session,
    say: session.say.bind(session),

    /**
     * Call this when self-healing recovers from an error
     */
    async notifyRecovery(error: Error, context: Partial<RecoveryContext> = {}): Promise<boolean> {
      const fullContext: RecoveryContext = {
        wasInConversation: context.wasInConversation ?? true,
        lastUserMessage: context.lastUserMessage,
        errorType: context.errorType ?? error.name,
        phase: context.phase ?? 'unknown',
        autoRecovered: context.autoRecovered ?? true,
      };

      const humanized = humanizeError(error);

      if (humanized.shouldNotifyUser) {
        try {
          await session.say(humanized.userMessage, { allowInterruptions: true });
          options.onRecoverySpoken?.(humanized.userMessage);
          return true;
        } catch {
          return false;
        }
      }

      return false;
    },
  };
}

/**
 * Pre-defined recovery phrases for common scenarios
 *
 * These are warmer, more conversational versions that feel genuinely Ferni.
 */
export const RECOVERY_PHRASES = {
  // Quick recovery (< 1 second)
  quickBlip: [
    "Little hiccup there - I'm back!",
    "Oops, lost you for a sec. I'm here now!",
    "That was weird - anyway, I'm back!",
  ],

  // Longer recovery (1-5 seconds)
  noticeableDelay: [
    "Sorry about that pause - had a small technical moment. What were you saying?",
    "Okay, I'm back! Had a little brain freeze there. Where were we?",
    "That took a second - my brain needed a quick reset. I'm all ears now!",
  ],

  // Reconnection after disconnect
  reconnected: [
    "Hey, I'm back! We got disconnected for a moment there.",
    "Okay we're reconnected! Sorry about that little interruption.",
    "I'm back online! These things happen sometimes with voice calls.",
  ],

  // After graceful degradation
  reducedMode: [
    "I'm running a bit light right now, but I'm still here for you.",
    "Things are a bit simplified on my end, but let's keep going.",
    "I'm in a simpler mode right now - but still fully present!",
  ],
} as const;

/**
 * Get a random phrase from a category
 */
export function getRecoveryPhrase(
  category: keyof typeof RECOVERY_PHRASES
): string {
  const phrases = RECOVERY_PHRASES[category];
  return phrases[Math.floor(Math.random() * phrases.length)];
}

