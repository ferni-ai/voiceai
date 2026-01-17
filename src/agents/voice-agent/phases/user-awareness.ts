/**
 * User Awareness Phase
 *
 * Builds "Better Than Human" context about the user for model instructions.
 * This enables Ferni to remember and understand the user like a superhuman friend.
 *
 * BETTER THAN HUMAN Capabilities:
 * 1. Last Conversation Context - Ferni remembers exactly what you talked about
 * 2. Emotional Memory - Ferni remembers how you were feeling last time
 * 3. Life Events Awareness - Ferni remembers milestones, challenges, celebrations
 * 4. Goals & Concerns - Ferni knows what matters to you right now
 *
 * @module voice-agent/phases/user-awareness
 */

import type { UserProfile } from '../../../types/user-profile.js';

// ============================================================================
// TYPES
// ============================================================================

export interface UserAwarenessConfig {
  /** User profile from session services */
  userProfile: UserProfile | null;
  /** Whether this is a returning user */
  isReturningUser: boolean;
  /** User name from identification */
  userName?: string;
  /** Session start time for time calculations */
  sessionStartTime: Date;
}

export interface UserAwarenessResult {
  /** Array of awareness facts about the user */
  facts: string[];
  /** Formatted instructions block to add to model */
  instructionsBlock: string;
}

// ============================================================================
// MOOD CONTEXT MAPPINGS
// ============================================================================

const MOOD_CONTEXT: Record<string, string> = {
  tired_but_present: 'Last time they seemed a bit tired - be gentle.',
  reflective: 'Last time they were in a reflective mood.',
  philosophical: 'Last time they were in a thoughtful, philosophical space.',
  energized: 'Last time they were full of energy!',
  grounded: 'Last time they seemed calm and grounded.',
  playful: 'Last time they were in a playful mood.',
  nostalgic: 'Last time they were feeling nostalgic.',
};

const RELATIONSHIP_STAGE_DESCRIPTIONS: Record<string, string> = {
  getting_to_know: "You're still getting to know each other.",
  trusted_advisor: 'They trust you and share openly.',
  old_friend: "You're old friends - deep relationship.",
};

const LIFE_EVENT_TYPES: Record<string, string> = {
  wedding: 'preparing for a wedding',
  baby: 'expecting or has a new baby',
  graduation: 'graduation coming up',
  career_change: 'going through a career change',
  relocation: 'moving/relocating',
  loss: 'dealing with a loss',
  celebration: 'has something to celebrate',
};

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Build user awareness context for model instructions.
 *
 * This creates "Better Than Human" context that helps the agent remember
 * and understand the user like a superhuman friend would.
 */
export function buildUserAwareness(config: UserAwarenessConfig): UserAwarenessResult {
  const { userProfile, isReturningUser, userName, sessionStartTime } = config;

  const facts: string[] = [];

  if (!userProfile) {
    return {
      facts,
      instructionsBlock: '',
    };
  }

  const profile = userProfile;

  // User's name
  if (profile.name || profile.preferredName || userName) {
    const name = profile.preferredName || profile.name || userName;
    facts.push(`You're talking to ${name}.`);
  }

  // Relationship context
  addRelationshipContext(facts, profile, isReturningUser, sessionStartTime);

  // Better Than Human #1: Last Conversation Context
  if (isReturningUser && profile.lastConversationSummary) {
    facts.push(`Last time you talked about: ${profile.lastConversationSummary}`);
  }

  // Better Than Human #2: Emotional Memory
  addEmotionalMemory(facts, profile);

  // Better Than Human #3: Life Events Awareness
  addLifeEventsAwareness(facts, profile);

  // Better Than Human #4: Goals & Concerns
  addGoalsAndConcerns(facts, profile);

  // Build instructions block
  const instructionsBlock =
    facts.length > 0
      ? `
---

## Who You're Talking To

${facts.join('\n')}

Use this awareness naturally. Don't announce what you know - just BE a friend who remembers.
Reference past context when relevant, but don't force it. Let the conversation flow.
`
      : '';

  return {
    facts,
    instructionsBlock,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function addRelationshipContext(
  facts: string[],
  profile: UserProfile,
  isReturningUser: boolean,
  sessionStartTime: Date
): void {
  if (isReturningUser && profile.totalConversations) {
    const convCount = profile.totalConversations;
    if (convCount === 1) {
      facts.push("You've talked once before.");
    } else if (convCount < 5) {
      facts.push(`You've talked ${convCount} times - still getting to know each other.`);
    } else if (convCount < 20) {
      facts.push(`You've had ${convCount} conversations - a growing friendship.`);
    } else {
      facts.push(`You've had ${convCount} conversations together - you know each other well.`);
    }

    // Last conversation time
    if (profile.lastContact) {
      addLastContactContext(facts, profile.lastContact, sessionStartTime);
    }
  } else if (!isReturningUser) {
    facts.push('This is your first conversation with them - be welcoming but not overwhelming.');
  }

  // Relationship stage
  const { relationshipStage } = profile;
  if (relationshipStage && relationshipStage !== 'new_acquaintance') {
    const description = RELATIONSHIP_STAGE_DESCRIPTIONS[relationshipStage];
    if (description) {
      facts.push(description);
    }
  }
}

function addLastContactContext(
  facts: string[],
  lastContact: string | Date,
  sessionStartTime: Date
): void {
  const lastContactDate = typeof lastContact === 'string' ? new Date(lastContact) : lastContact;
  const daysSince = Math.floor(
    (sessionStartTime.getTime() - lastContactDate.getTime()) / (24 * 60 * 60 * 1000)
  );

  if (daysSince === 0) {
    facts.push('You talked earlier today.');
  } else if (daysSince === 1) {
    facts.push('You talked yesterday.');
  } else if (daysSince < 7) {
    facts.push(`Last talked ${daysSince} days ago.`);
  } else if (daysSince < 30) {
    facts.push(`It's been about ${Math.round(daysSince / 7)} weeks since you last talked.`);
  } else {
    facts.push(
      `It's been a while - about ${Math.round(daysSince / 30)} month${daysSince > 45 ? 's' : ''} since you last talked.`
    );
  }
}

function addEmotionalMemory(facts: string[], profile: UserProfile): void {
  if (profile.humanizingState?.lastMood) {
    const { lastMood } = profile.humanizingState;
    const moodDescription = MOOD_CONTEXT[lastMood];
    if (moodDescription) {
      facts.push(moodDescription);
    }
  }
}

function addLifeEventsAwareness(facts: string[], profile: UserProfile): void {
  if (!profile.lifeEvents || profile.lifeEvents.length === 0) {
    return;
  }

  // Find recent events (active or upcoming)
  const relevantEvents = profile.lifeEvents
    .filter((event) => {
      return (
        event.status === 'in_progress' || event.status === 'upcoming' || event.status === 'planning'
      );
    })
    .slice(0, 2); // Max 2 events

  for (const event of relevantEvents) {
    const eventContext = LIFE_EVENT_TYPES[event.type];
    if (eventContext) {
      facts.push(`Life context: ${event.title || eventContext}`);
    }
  }
}

function addGoalsAndConcerns(facts: string[], profile: UserProfile): void {
  if (profile.goals && profile.goals.length > 0) {
    const topGoal = profile.goals[0];
    facts.push(`Current goal: ${topGoal}`);
  }

  if (profile.primaryConcerns && profile.primaryConcerns.length > 0) {
    const topConcern = profile.primaryConcerns[0];
    facts.push(`On their mind: ${topConcern}`);
  }
}
