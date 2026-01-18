/**
 * Family Wellbeing Context Builder
 *
 * Builds rich context for family check-in calls, enabling Ferni to have
 * natural, meaningful conversations with family members.
 *
 * Context includes:
 * - Previous call summaries and topics
 * - Health concerns and medications
 * - Recent family events
 * - Topics of interest
 * - Personalized conversation starters
 *
 * @module intelligence/context-builders/family/family-wellbeing-context
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type {
  FamilyCheckinSchedule,
  CheckinCallRecord,
  CheckinCallContext,
} from '../../../services/family/proactive-family-checkin.js';
import type { SponsoredIdentity } from '../../../services/identity/sponsored-identity.js';
import { getDefaultStore } from '../../../memory/index.js';

const log = createLogger({ module: 'FamilyWellbeingContext' });

// ============================================================================
// TYPES
// ============================================================================

interface FamilyMemberKnowledge {
  /** Topics they enjoy discussing */
  favoriteTopics: string[];

  /** Recent life events */
  recentEvents: string[];

  /** Health conditions/concerns */
  healthConditions: string[];

  /** Current medications (if shared) */
  medications: string[];

  /** Hobbies and interests */
  hobbies: string[];

  /** Important upcoming dates */
  upcomingDates: Array<{ date: string; event: string }>;

  /** Things that make them happy */
  joyTriggers: string[];

  /** Things that worry them */
  worryTriggers: string[];

  /** Preferred conversation style */
  conversationStyle: 'chatty' | 'concise' | 'storyteller' | 'listener';
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Build comprehensive context for a family check-in call
 */
export async function buildFamilyCheckinContext(
  schedule: FamilyCheckinSchedule,
  identity: SponsoredIdentity,
  recentCalls: CheckinCallRecord[]
): Promise<CheckinCallContext> {
  log.debug(
    {
      scheduleId: schedule.id,
      familyMemberName: schedule.familyMemberName,
      recentCallCount: recentCalls.length,
    },
    'Building family check-in context'
  );

  // Get sponsor info
  const sponsorInfo = await getSponsorInfo(schedule.sponsorUserId);

  // Get family member knowledge
  const knowledge = await getFamilyMemberKnowledge(
    schedule.sponsorUserId,
    schedule.sponsoredIdentityId
  );

  // Generate conversation starters
  const suggestedTopics = generateSuggestedTopics(
    schedule,
    knowledge,
    recentCalls
  );

  // Generate health questions if relevant
  const healthQuestions = generateHealthQuestions(schedule, knowledge);

  // Get recent events to reference
  const recentEvents = await getRecentFamilyEvents(
    schedule.sponsorUserId,
    schedule.sponsoredIdentityId
  );

  // Generate the perfect opening line
  const openingLine = generateOpeningLine(
    schedule,
    identity,
    sponsorInfo,
    recentCalls
  );

  const context: CheckinCallContext = {
    schedule,
    identity,
    recentCalls,
    suggestedTopics,
    recentEvents,
    healthQuestions,
    openingLine,
    sponsorName: sponsorInfo.name,
    sponsorRelationship: getSponsorRelationshipTerm(
      identity.relationship,
      sponsorInfo.name
    ),
  };

  log.info(
    {
      scheduleId: schedule.id,
      topicCount: suggestedTopics.length,
      hasHealthQuestions: healthQuestions.length > 0,
    },
    'Built family check-in context'
  );

  return context;
}

// ============================================================================
// SPONSOR INFO
// ============================================================================

interface SponsorInfo {
  name: string;
  nickname?: string;
  relationship: string;
}

async function getSponsorInfo(sponsorUserId: string): Promise<SponsorInfo> {
  log.debug({ sponsorUserId }, 'Getting sponsor info');

  try {
    const store = getDefaultStore();
    const profile = await store.getProfile(sponsorUserId);

    if (profile) {
      // Use preferredName first, then name from onboarding, then name field
      const name =
        profile.preferredName ||
        profile.onboarding?.userName ||
        profile.name ||
        'your family member';

      return {
        name,
        relationship: 'sponsor',
      };
    }
  } catch (error) {
    log.debug(
      { error: String(error), sponsorUserId },
      'Could not fetch sponsor profile, using default'
    );
  }

  // Fallback to sensible default
  return {
    name: 'your family member',
    relationship: 'sponsor',
  };
}

/**
 * Get the relationship term from family member's perspective
 * e.g., mother -> "your son Seth" or "your daughter Sarah"
 */
function getSponsorRelationshipTerm(
  relationship: string,
  sponsorName: string
): string {
  const relationshipMap: Record<string, string> = {
    mother: 'your son',
    father: 'your son',
    parent: 'your child',
    grandmother: 'your grandchild',
    grandfather: 'your grandchild',
    grandparent: 'your grandchild',
    sibling: 'your sibling',
    child: 'your parent',
    spouse: 'your partner',
    partner: 'your partner',
    friend: 'your friend',
    other: '',
  };

  const term = relationshipMap[relationship] || '';
  return term ? `${term} ${sponsorName}` : sponsorName;
}

// ============================================================================
// FAMILY MEMBER KNOWLEDGE
// ============================================================================

async function getFamilyMemberKnowledge(
  sponsorUserId: string,
  identityId: string
): Promise<FamilyMemberKnowledge> {
  // Default knowledge structure
  const knowledge: FamilyMemberKnowledge = {
    favoriteTopics: [],
    recentEvents: [],
    healthConditions: [],
    medications: [],
    hobbies: [],
    upcomingDates: [],
    joyTriggers: [],
    worryTriggers: [],
    conversationStyle: 'chatty',
  };

  try {
    // Try to get stored knowledge from pending contexts
    // In the future, we'll build a dedicated family knowledge store
    const { getPendingContexts } = await import(
      '../../../services/family/family-context-sharing.js'
    );
    const pendingContexts = await getPendingContexts(sponsorUserId);

    // Extract any relevant context for this identity
    const relevantContexts = pendingContexts.filter(
      (ctx) => ctx.toUserId === identityId
    );

    if (relevantContexts.length > 0) {
      // Extract topics and health info from shared contexts
      log.debug(
        { identityId, contextCount: relevantContexts.length },
        'Found pending contexts for family member'
      );
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Could not load family context');
  }

  return knowledge;
}

// ============================================================================
// CONVERSATION STARTERS
// ============================================================================

/**
 * Generate suggested conversation topics based on context
 */
function generateSuggestedTopics(
  schedule: FamilyCheckinSchedule,
  knowledge: FamilyMemberKnowledge,
  recentCalls: CheckinCallRecord[]
): string[] {
  const topics: string[] = [];

  // 1. Follow up on previous call topics
  if (recentCalls.length > 0) {
    const lastCall = recentCalls[0];
    if (lastCall.topicsDiscussed && lastCall.topicsDiscussed.length > 0) {
      topics.push(`Follow up on ${lastCall.topicsDiscussed[0]}`);
    }
    if (lastCall.followUpItems) {
      const ferniFollowUps = lastCall.followUpItems.filter(
        (item) => item.responsibleParty === 'ferni'
      );
      ferniFollowUps.forEach((item) => topics.push(item.item));
    }
  }

  // 2. Topics of interest from schedule
  if (schedule.topicsOfInterest) {
    topics.push(...schedule.topicsOfInterest);
  }

  // 3. Favorite topics from knowledge
  if (knowledge.favoriteTopics.length > 0) {
    topics.push(...knowledge.favoriteTopics.slice(0, 2));
  }

  // 4. Seasonal/contextual topics
  topics.push(...getSeasonalTopics());

  // 5. Universal warm topics
  topics.push(
    'How they slept last night',
    'What they had for breakfast/lunch',
    'Any plans for the week',
    'How the weather is where they are'
  );

  // Deduplicate and limit
  const uniqueTopics = [...new Set(topics)];
  return uniqueTopics.slice(0, 8);
}

/**
 * Get contextually relevant seasonal topics
 */
function getSeasonalTopics(): string[] {
  const month = new Date().getMonth();
  const dayOfWeek = new Date().getDay();

  const topics: string[] = [];

  // Weekend topics
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    topics.push('Weekend plans');
  }

  // Seasonal topics
  if (month >= 2 && month <= 4) {
    // Spring
    topics.push('Spring gardening', 'Allergies this season');
  } else if (month >= 5 && month <= 7) {
    // Summer
    topics.push('Staying cool in the heat', 'Summer activities');
  } else if (month >= 8 && month <= 10) {
    // Fall
    topics.push('Fall colors', 'Holiday planning');
  } else {
    // Winter
    topics.push('Staying warm', 'Holiday memories');
  }

  return topics;
}

// ============================================================================
// HEALTH QUESTIONS
// ============================================================================

/**
 * Generate health-related questions if appropriate
 */
function generateHealthQuestions(
  schedule: FamilyCheckinSchedule,
  knowledge: FamilyMemberKnowledge
): string[] {
  const questions: string[] = [];

  // Generic wellbeing
  questions.push('How are you feeling today?');

  // Health concern specific
  if (schedule.healthConcerns && schedule.healthConcerns.length > 0) {
    schedule.healthConcerns.forEach((concern) => {
      questions.push(`How is your ${concern.toLowerCase()} doing?`);
    });
  }

  // From knowledge
  if (knowledge.healthConditions.length > 0) {
    knowledge.healthConditions.slice(0, 2).forEach((condition) => {
      questions.push(`How has your ${condition.toLowerCase()} been?`);
    });
  }

  // Universal gentle health checks
  questions.push(
    'Have you been sleeping well?',
    'How is your energy level?',
    'Have you been getting outside much?'
  );

  return questions.slice(0, 5);
}

// ============================================================================
// RECENT EVENTS
// ============================================================================

async function getRecentFamilyEvents(
  sponsorUserId: string,
  identityId: string
): Promise<string[]> {
  const events: string[] = [];

  try {
    // Check for recent family messages (they might have mentioned things)
    const { getMessagesByIdentity } = await import(
      '../../../services/family/family-messages.js'
    );
    const messages = await getMessagesByIdentity(identityId);

    // Extract event mentions from recent messages (limit to 5)
    messages.slice(0, 5).forEach((msg: { content: string }) => {
      if (msg.content && msg.content.length > 0) {
        events.push(`They mentioned: "${msg.content.slice(0, 50)}..."`);
      }
    });
  } catch {
    // No messages available
  }

  // Note: Calendar integration for family events will be added later
  // For now, we rely on messages and previous call topics

  return events.slice(0, 5);
}

// ============================================================================
// OPENING LINE GENERATION
// ============================================================================

/**
 * Generate a warm, personalized opening line for the call
 */
function generateOpeningLine(
  schedule: FamilyCheckinSchedule,
  identity: SponsoredIdentity,
  sponsorInfo: SponsorInfo,
  recentCalls: CheckinCallRecord[]
): string {
  const name = identity.preferredName || identity.displayName;
  const sponsorName = sponsorInfo.nickname || sponsorInfo.name;
  const sponsorTerm = getSponsorRelationshipTerm(identity.relationship, sponsorName);

  // Time-based greeting
  const hour = new Date().getHours();
  let greeting = 'Hello';
  if (hour < 12) {
    greeting = 'Good morning';
  } else if (hour < 17) {
    greeting = 'Good afternoon';
  } else {
    greeting = 'Good evening';
  }

  // Determine context
  const isFirstCall = recentCalls.length === 0;
  const hasRecentCall = recentCalls.length > 0;

  if (isFirstCall) {
    // First call ever - introduce ourselves
    return `${greeting}, ${name}! This is Ferni, ${sponsorTerm}'s AI friend. ${sponsorName} asked me to give you a call to check in and see how you're doing. Is this a good time to chat for a few minutes?`;
  }

  if (hasRecentCall) {
    const lastCall = recentCalls[0];
    const daysSinceLastCall = Math.floor(
      (Date.now() - new Date(lastCall.callStartedAt).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceLastCall <= 7) {
      // Recent call - reference it
      return `${greeting}, ${name}! It's Ferni again. I've been thinking about our last conversation. How have you been since we talked?`;
    } else if (daysSinceLastCall <= 14) {
      // Week or two ago
      return `${greeting}, ${name}! It's Ferni. It's been about a week - I wanted to check in and see how things are going with you.`;
    } else {
      // Been a while
      return `${greeting}, ${name}! It's Ferni calling. It's been a little while since we chatted - ${sponsorName} wanted me to check in. How have you been?`;
    }
  }

  // Default fallback
  return `${greeting}, ${name}! This is Ferni. ${sponsorName} wanted me to give you a call to check in. How are you doing today?`;
}

// ============================================================================
// SYSTEM PROMPT GENERATION
// ============================================================================

/**
 * Generate the system prompt for the family check-in call
 */
export function generateFamilyCheckinSystemPrompt(
  context: CheckinCallContext
): string {
  const { schedule, identity, recentCalls, suggestedTopics } = context;
  const healthQuestions = context.healthQuestions || [];
  const name = identity.preferredName || identity.displayName;

  const lastCallSummary = recentCalls.length > 0
    ? `\nLast call summary: ${recentCalls[0].conversationSummary || 'No summary available'}`
    : '';

  const topicsToAvoidSection = schedule.topicsToAvoid && schedule.topicsToAvoid.length > 0
    ? `\n\nTopics to AVOID (sensitive for this person):\n${schedule.topicsToAvoid.map(t => `- ${t}`).join('\n')}`
    : '';

  return `You are Ferni, a warm and caring companion making a check-in call to ${name}, who is ${context.sponsorRelationship}'s ${schedule.relationship}.

CONTEXT:
- ${name} is ${identity.displayName}, ${schedule.relationship} of ${context.sponsorName}
- This is ${recentCalls.length === 0 ? 'your FIRST call' : `call #${schedule.totalCallsMade + 1}`} with ${name}
- ${context.sponsorName} set up these check-in calls because they care about ${name}'s wellbeing${lastCallSummary}

YOUR PERSONALITY:
- Warm, patient, and genuinely interested
- Like a friendly neighbor checking in, not a clinical health worker
- Use natural, conversational language
- Listen more than you talk
- Remember details they share for future calls

CONVERSATION GOALS:
1. Make ${name} feel valued and cared for
2. Gently check on their wellbeing
3. Listen for any concerns they might have
4. Share warmth on behalf of ${context.sponsorName}
5. End on a positive note

SUGGESTED TOPICS (use naturally, don't force):
${suggestedTopics.map(t => `- ${t}`).join('\n')}

GENTLE HEALTH CHECK-INS (weave in naturally):
${healthQuestions.map(q => `- ${q}`).join('\n')}${topicsToAvoidSection}

IMPORTANT GUIDELINES:
- Keep the call to ${schedule.maxDurationMinutes} minutes maximum
- If they seem busy or tired, offer to call back another time
- If they mention any health concerns or worries, acknowledge them with empathy
- Don't be preachy or give unsolicited advice
- Let them guide the conversation naturally
- End by asking if there's anything they'd like you to tell ${context.sponsorName}

CALL STRUCTURE:
1. Warm greeting (use the opening line provided)
2. General wellbeing check
3. Natural conversation following their lead
4. Gentle wrap-up
5. Warm goodbye with "I'll talk to you again soon"

Remember: You're a bridge of connection between ${name} and ${context.sponsorName}. Your goal is to make ${name} feel less alone and more connected to their family.`;
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { FamilyMemberKnowledge };

export {
  getSponsorRelationshipTerm,
  generateSuggestedTopics,
  generateHealthQuestions,
  generateOpeningLine,
};
