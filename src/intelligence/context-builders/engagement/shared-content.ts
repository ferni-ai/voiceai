/**
 * Shared Content Context Builder
 *
 * Provides unified access to all shared persona content through the content-injector.
 * This wires the personas/shared content into the LLM context system.
 *
 * WIRED (Jan 2026): Connects personas/shared/content-injector.ts to LLM context.
 *
 * Content includes:
 * - Team dynamics (how personas reference each other)
 * - Relationship building (stage-appropriate behaviors)
 * - Life events (birthdays, anniversaries, milestones)
 * - Welcome back (time-based returning user greetings)
 * - Callbacks (follow-ups from previous conversations)
 */

import { createLogger } from '../../../utils/safe-logger.js';
import {
  createHintInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';
import { createBuilderRng } from '../core/rng-utils.js';

// WIRED: Import content injector from personas/shared
import {
  injectSharedContent,
  formatForPrompt,
  type SharedContentContext,
  type InjectedContent,
} from '../../../personas/shared/content-injector.js';

const log = createLogger({ module: 'SharedContent' });

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert life events from user profile format to content-injector format
 */
function convertLifeEvents(
  userProfile: ContextBuilderInput['userProfile']
): SharedContentContext['activeLifeEvents'] {
  if (!userProfile?.lifeEvents) return undefined;

  return userProfile.lifeEvents.map((event) => ({
    type: event.type,
    title: event.title || event.type,
    status: event.status || 'active',
    date: event.date ? new Date(event.date) : undefined,
    emotionalSignificance: event.emotionalSignificance || 'medium',
  }));
}

/**
 * Calculate days since last contact
 */
function getDaysSinceLastContact(lastContactDate?: Date | string): number {
  if (!lastContactDate) return 0;

  const lastContact =
    typeof lastContactDate === 'string' ? new Date(lastContactDate) : lastContactDate;
  const now = new Date();
  const diffMs = now.getTime() - lastContact.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

async function buildSharedContentContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { persona, userData, userProfile, analysis } = input;
  const injections: ContextInjection[] = [];
  const turnCount = userData.turnCount || 0;

  // Create deterministic RNG for this builder
  const rng = createBuilderRng(input, 'shared-content');

  // Only inject on early turns (greeting context) or occasionally later
  const isEarlyTurn = turnCount <= 2;
  const shouldInjectLater = turnCount > 2 && rng.chance(0.15);

  if (!isEarlyTurn && !shouldInjectLater) {
    return injections;
  }

  // Detect if this is a closing phase (from conversation analysis)
  const isClosing =
    analysis.state?.phase === 'closing' ||
    analysis.intent?.primary === 'farewell' ||
    turnCount > 15;

  // Build shared content context
  const sharedContext: SharedContentContext = {
    currentPersona: persona.id,
    userName: userData.userName,
    relationshipStage: userProfile?.relationshipStage,
    conversationCount: userProfile?.totalConversations,
    daysSinceLastContact: getDaysSinceLastContact(userProfile?.lastContact),
    lastConversationSummary: userProfile?.lastConversationSummary,
    activeLifeEvents: convertLifeEvents(userProfile),
    recentLifeMilestones:
      userProfile?.lifeEvents
        ?.filter((e) => e.status === 'completed')
        .slice(0, 3)
        .map((e) => e.title || e.type) || [],
  };

  // Determine what to include
  const injectionOptions = {
    includeTeamContext: rng.chance(0.3) && turnCount > 3, // Occasional team references
    includeRelationshipContext: isEarlyTurn, // Relationship on early turns
    includeLifeEvents: isEarlyTurn && rng.chance(0.5), // Life events sometimes
    includeCallbacks: isEarlyTurn && rng.chance(0.4), // Callbacks sometimes
    isClosing,
  };

  // Get injected content
  const content: InjectedContent = injectSharedContent(sharedContext, injectionOptions);

  // Convert to context injection if we got any content
  const formatted = formatForPrompt(content);

  if (formatted.trim()) {
    injections.push(
      createHintInjection(
        'shared_content',
        `[SHARED PERSONA CONTENT]\n${formatted}`
      )
    );

    log.debug(
      {
        personaId: persona.id,
        turnCount,
        hasGreeting: !!content.greeting,
        hasTeam: !!content.teamContext,
        hasRelationship: !!content.relationshipContext,
        hasLifeEvent: !!content.lifeEventAcknowledgment,
        hasCallback: !!content.callbackContent,
        hasClosing: !!content.closingContent,
      },
      'Injected shared content'
    );
  }

  return injections;
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder({
  name: 'shared_content',
  description: 'Injects unified shared persona content (team, relationship, life events)',
  priority: 50, // Medium priority - after core emotional but before engagement
  build: buildSharedContentContext,
});

export { buildSharedContentContext };
