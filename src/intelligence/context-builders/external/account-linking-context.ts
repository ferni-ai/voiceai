/**
 * Account Linking Context Builder
 *
 * Injects context when account linking opportunities are detected.
 * This enables Ferni to naturally offer merging phone and web accounts
 * when the user mentions their email or that they use the app.
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
          buildHighConfidenceLinkingGuidance(bestMatch, linkingContext.signals),
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
          buildModerateConfidenceLinkingGuidance(bestMatch, linkingContext.signals),
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

function buildHighConfidenceLinkingGuidance(
  match: PotentialLinkResult,
  signals: AccountLinkingContext['signals']
): string {
  const signalDescriptions = signals.map((s) => {
    switch (s.type) {
      case 'email_mention':
        return `email: ${s.value}`;
      case 'app_mention':
        return 'uses the app';
      case 'web_mention':
        return 'uses the website';
      case 'account_mention':
        return 'has an account';
      default:
        return s.type;
    }
  });

  return `
ACCOUNT LINKING OPPORTUNITY - HIGH CONFIDENCE

I found a match for this caller!
- Name in existing account: ${match.profile.name || '(not set)'}
- Match type: ${match.matchType}
- Confidence: ${Math.round(match.confidence * 100)}%
- What they mentioned: ${signalDescriptions.join(', ')}
- Previous conversations: ${match.profile.totalConversations || 0}

This caller likely already has a web/app account. Linking their phone will:
- Combine their conversation history
- Let them seamlessly switch between phone and app
- Keep all their memories and context in one place

SUGGEST NATURALLY:
${
  match.matchType === 'email'
    ? `- "I think I know you from the app! Is this ${match.profile.name || 'you'}?"`
    : `- "That name sounds familiar - do you also use the Ferni app?"`
}
- "Would you like me to link this phone to your account?"

If they confirm, use the link_phone_to_account tool with:
- web_account_id: "${match.identityId}"
- confirmed_by_user: true

DON'T:
- Be pushy about linking
- Assume they want to link without asking
- Share details from their other account until they confirm
`.trim();
}

function buildModerateConfidenceLinkingGuidance(
  match: PotentialLinkResult,
  signals: AccountLinkingContext['signals']
): string {
  const signalDescriptions = signals.map((s) => {
    switch (s.type) {
      case 'email_mention':
        return `email: ${s.value}`;
      case 'app_mention':
        return 'uses the app';
      case 'web_mention':
        return 'uses the website';
      case 'account_mention':
        return 'has an account';
      default:
        return s.type;
    }
  });

  return `
POSSIBLE ACCOUNT LINKING OPPORTUNITY

I found a potential match, but not 100% sure:
- Name in existing account: ${match.profile.name || '(not set)'}
- Match type: ${match.matchType}
- Confidence: ${Math.round(match.confidence * 100)}%
- What they mentioned: ${signalDescriptions.join(', ')}

VERIFY BEFORE OFFERING TO LINK:
${
  match.matchType === 'name'
    ? `- "Do you also use the Ferni app? I think we may have talked there before."`
    : `- "I think I recognize you - do you use Ferni on your phone or computer too?"`
}

If they confirm AND want to link:
- Use the link_phone_to_account tool
- Make sure confirmed_by_user is true

If they say no or seem confused:
- Don't push it
- Just continue the conversation normally
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
