/**
 * Account Linking Context Builder
 *
 * Injects context when a caller looks like they also have an app account.
 * Ferni never links accounts on a call (it can't verify who owns them); the
 * guidance tells it to point the caller to signing in on the app instead.
 *
 * Example scenarios:
 * - Caller mentions email: "my email is john@example.com"
 * - Caller mentions app: "I also use the Ferni app"
 * - Caller mentions web: "we talked on the website before"
 *
 * @module intelligence/context-builders/external/account-linking-context
 */

import {
  registerContextBuilder,
  createStandardInjection,
  type ContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';
import { BuilderCategory } from '../core/categories.js';
import { createLogger } from '../../../utils/safe-logger.js';
import type { PotentialLinkResult } from '../../../services/identity/user-identification.js';

const log = createLogger({ module: 'context:account-linking' });

// ============================================================================
// TYPES
// ============================================================================

export interface AccountLinkingContext {
  /** Session ID */
  sessionId: string;

  /** Detected linking signals from conversation */
  signals: Array<{
    type: 'email_mention' | 'app_mention' | 'web_mention' | 'account_mention';
    value: string | null;
    confidence: number;
  }>;

  /** Potential matches found */
  potentialMatches: PotentialLinkResult[];

  /** Whether linking has been offered this session */
  linkingOffered: boolean;

  /** Whether linking has been completed */
  linkingComplete: boolean;
}

// ============================================================================
// CONTEXT STORAGE
// ============================================================================

const accountLinkingContexts = new Map<string, AccountLinkingContext>();

/**
 * Store account linking context for a session.
 */
export function setAccountLinkingContext(sessionId: string, context: AccountLinkingContext): void {
  accountLinkingContexts.set(sessionId, context);
  log.info(
    {
      sessionId,
      signalCount: context.signals.length,
      matchCount: context.potentialMatches.length,
    },
    '🔗 Account linking context stored'
  );
}

/**
 * Get account linking context for a session.
 */
export function getAccountLinkingContext(sessionId: string): AccountLinkingContext | undefined {
  return accountLinkingContexts.get(sessionId);
}

/**
 * Add potential matches to existing context.
 */
export function addPotentialMatches(sessionId: string, matches: PotentialLinkResult[]): void {
  const context = accountLinkingContexts.get(sessionId);
  if (context) {
    // Deduplicate by identityId
    const existingIds = new Set(context.potentialMatches.map((m) => m.identityId));
    const newMatches = matches.filter((m) => !existingIds.has(m.identityId));
    context.potentialMatches.push(...newMatches);

    if (newMatches.length > 0) {
      log.info(
        { sessionId, newMatchCount: newMatches.length },
        '🔗 Added new potential matches for account linking'
      );
    }
  }
}

/**
 * Mark that linking has been offered.
 */
export function markLinkingOffered(sessionId: string): void {
  const context = accountLinkingContexts.get(sessionId);
  if (context) {
    context.linkingOffered = true;
  }
}

/**
 * Mark that linking has been completed.
 */
export function markLinkingComplete(sessionId: string): void {
  const context = accountLinkingContexts.get(sessionId);
  if (context) {
    context.linkingComplete = true;
    log.info({ sessionId }, '✅ Account linking complete');
  }
}

/**
 * Clear account linking context.
 */
export function clearAccountLinkingContext(sessionId: string): void {
  accountLinkingContexts.delete(sessionId);
  log.debug({ sessionId }, 'Cleared account linking context');
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

export const accountLinkingContextBuilder: ContextBuilder = {
  name: 'account-linking-context',
  description: 'Injects guidance when account linking opportunities are detected',
  priority: 4, // Moderate priority - after identity but before general context
  category: BuilderCategory.CONTEXT,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { services } = input;
    const sessionId = services?.sessionId;

    if (!sessionId) {
      return [];
    }

    // Check if there's account linking context for this session
    const linkingContext = getAccountLinkingContext(sessionId);
    if (!linkingContext) {
      return []; // No linking signals detected
    }

    // If already completed, don't inject anything
    if (linkingContext.linkingComplete) {
      return [];
    }

    // If already offered, don't offer again
    if (linkingContext.linkingOffered) {
      return [];
    }

    // If no potential matches, don't inject anything
    if (linkingContext.potentialMatches.length === 0) {
      return [];
    }

    const injections: ContextInjection[] = [];
    const bestMatch = linkingContext.potentialMatches[0];

    log.debug(
      {
        sessionId,
        matchType: bestMatch.matchType,
        confidence: bestMatch.confidence,
        matchedName: bestMatch.profile.name,
      },
      'Building account linking context'
    );

    // Build guidance based on match type and confidence
    if (bestMatch.confidence >= 0.9) {
      // High confidence - likely the same person
      injections.push(
        createStandardInjection(
          'account_linking_high_confidence',
          buildLinkingGuidance(linkingContext.signals),
          {
            category: 'account-linking',
            confidence: bestMatch.confidence,
          }
        )
      );
    } else if (bestMatch.confidence >= 0.5) {
      // Moderate confidence - ask to confirm
      injections.push(
        createStandardInjection(
          'account_linking_moderate_confidence',
          buildLinkingGuidance(linkingContext.signals),
          {
            category: 'account-linking',
            confidence: bestMatch.confidence,
          }
        )
      );
    }

    // Mark as offered so we don't repeat
    markLinkingOffered(sessionId);

    log.info(
      {
        sessionId,
        injectionCount: injections.length,
        matchType: bestMatch.matchType,
      },
      'Built account linking context injections'
    );

    return injections;
  },
};

// ============================================================================
// INJECTION BUILDERS
// ============================================================================

/**
 * Guidance for a caller who looks like they already have an app account.
 *
 * The match came from what the caller said (an email, a name), which anyone
 * can say. So the agent must not link anything on the call, and must not
 * confirm the account exists or repeat anything from it: that would tell a
 * stranger whose account an email belongs to. Connecting accounts needs the
 * person to sign in to the app, where they prove they own the account.
 */
function buildLinkingGuidance(signals: AccountLinkingContext['signals']): string {
  const mentionedApp = signals.some(
    (s) => s.type === 'app_mention' || s.type === 'web_mention' || s.type === 'account_mention'
  );

  return `
THIS CALLER MAY ALSO USE THE FERNI APP

${mentionedApp ? 'They mentioned using the app or website.' : 'Something they said may match an app account.'}

You cannot connect accounts on a call. If they ask to bring their app history into this call, tell them warmly that connecting accounts needs them to sign in to the app first.

DON'T:
- Say whether you found an account, or share a name, history or anything else from one
- Treat them as the account holder because they said a name or an email
- Bring it up more than once, or push it
`.trim();
}

// ============================================================================
// REGISTER
// ============================================================================

registerContextBuilder(accountLinkingContextBuilder);

// ============================================================================
// EXPORTS
// ============================================================================

export { accountLinkingContextBuilder as default };
