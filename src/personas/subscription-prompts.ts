/**
 * Subscription-Aware Conversation Prompts
 *
 * Human-centered messages for subscription limits that feel natural,
 * not transactional. Ferni should never feel like a paywall.
 *
 * Philosophy:
 * - Limits are "time together" not "service quotas"
 * - Approaching limits: gentle mention, not warning
 * - At limits: warm goodbye, not rejection
 * - Post-upgrade: celebrate relationship, not purchase
 *
 * "BETTER THAN HUMAN" Enhancements:
 * - Reference actual conversation topics (not generic "we've talked")
 * - Personalize team member suggestions to their needs
 * - Show that perfect memory is real
 */

import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'SubscriptionPrompts' });

// ============================================================================
// TYPES
// ============================================================================

export interface SubscriptionContext {
  tier: 'free' | 'friend' | 'partner';
  conversationsRemaining: number | null;
  approaching: boolean;
  atLimit: boolean;
  justUpgraded?: boolean;
  wasCanceled?: boolean;
  /** Relationship context for personalized messages */
  relationshipContext?: RelationshipContext;
}

/**
 * Context from the user's conversation history.
 * Makes subscription messages feel personal, not generic.
 */
export interface RelationshipContext {
  /** Key topics they've discussed (e.g., "career anxiety", "relationship with mom") */
  topics: string[];
  /** Important names mentioned (e.g., "Sarah", "your dad") */
  importantPeople: string[];
  /** Goals or aspirations they've shared */
  goals: string[];
  /** How many conversations total */
  totalConversations: number;
  /** Emotional themes (e.g., "stress", "growth", "relationships") */
  emotionalThemes: string[];
}

/**
 * Team member specialty mapping for personalized suggestions
 */
interface TeamMemberMatch {
  id: string;
  name: string;
  specialty: string;
  matchingTopics: string[];
}

const TEAM_SPECIALTIES: TeamMemberMatch[] = [
  {
    id: 'maya',
    name: 'Maya',
    specialty: 'habits and routines',
    matchingTopics: ['sleep', 'routine', 'habits', 'morning', 'exercise', 'health', 'productivity'],
  },
  {
    id: 'alex',
    name: 'Alex',
    specialty: 'communication and relationships',
    matchingTopics: [
      'boundaries',
      'conflict',
      'communication',
      'family',
      'relationship',
      'difficult conversation',
      'work relationships',
    ],
  },
  {
    id: 'peter',
    name: 'Peter',
    specialty: 'research and understanding',
    matchingTopics: ['research', 'understand', 'why', 'science', 'evidence', 'data', 'analysis'],
  },
  {
    id: 'jordan',
    name: 'Jordan',
    specialty: 'events and experiences',
    matchingTopics: ['event', 'party', 'planning', 'trip', 'vacation', 'celebration', 'experience'],
  },
];

export interface PromptResult {
  /** The prompt text to inject into conversation */
  prompt: string;
  /** Where in conversation to use this */
  placement: 'greeting' | 'mid-conversation' | 'closing';
  /** Whether to show upgrade UI after */
  showUpgradeUI: boolean;
  /** Priority (higher = more important) */
  priority: number;
}

// ============================================================================
// RELATIONSHIP-AWARE MESSAGE GENERATION
// ============================================================================

/**
 * Generate a relationship summary for limit messages.
 * Makes "I'll remember everything" feel real, not marketing.
 *
 * Example: "your career worries, how things are going with Sarah, that book you wanted to read"
 */
function generateRelationshipSummary(context?: RelationshipContext): string {
  if (!context || context.topics.length === 0) {
    return '';
  }

  const items: string[] = [];

  // Add 1-2 topics (max 2)
  const topicsToUse = context.topics.slice(0, 2);
  for (const topic of topicsToUse) {
    items.push(`your ${topic}`);
  }

  // Add a person if available (max 1)
  if (context.importantPeople.length > 0) {
    const person = context.importantPeople[0];
    items.push(`how things are going with ${person}`);
  }

  // Add a goal if we have room (max 3 total items)
  if (items.length < 3 && context.goals.length > 0) {
    items.push(`your goal to ${context.goals[0]}`);
  }

  if (items.length === 0) return '';

  // Format as natural list
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/**
 * Find team members that match the user's topics.
 * Returns personalized suggestions like "Maya could help with your sleep issues"
 */
function findMatchingTeamMembers(context?: RelationshipContext): TeamMemberMatch[] {
  if (!context || context.topics.length === 0) return [];

  const allTopics = [...context.topics, ...context.goals, ...context.emotionalThemes].map((t) =>
    t.toLowerCase()
  );

  const matches: TeamMemberMatch[] = [];

  for (const member of TEAM_SPECIALTIES) {
    const matchScore = member.matchingTopics.filter((topic) =>
      allTopics.some((userTopic) => userTopic.includes(topic) || topic.includes(userTopic))
    ).length;

    if (matchScore > 0) {
      matches.push(member);
    }
  }

  // Return top 2 matches
  return matches.slice(0, 2);
}

/**
 * Generate personalized team member suggestion.
 * Example: "Maya could help with those sleep issues you mentioned"
 */
function generateTeamSuggestion(context?: RelationshipContext): string {
  const matches = findMatchingTeamMembers(context);
  if (matches.length === 0) return '';

  const suggestions: string[] = [];
  for (const match of matches) {
    suggestions.push(`${match.name} could help with ${match.specialty}`);
  }

  if (suggestions.length === 1) {
    return suggestions[0];
  }
  return `${suggestions[0]}, and ${suggestions[1]}`;
}

// ============================================================================
// APPROACHING LIMIT PROMPTS
// ============================================================================

/**
 * Soft prompts when user is approaching their monthly limit.
 * These should feel like a friend mentioning time, not a warning.
 */
const APPROACHING_PROMPTS = {
  greeting: [
    // Warm mentions at start of conversation
    "Hey, before we dive in... we've got {remaining} conversation{s} left this month. No pressure, just wanted you to know. What's on your mind?",
    "Good to see you! Quick heads up - we have {remaining} chat{s} left this month. But let's make this one count. What's going on?",
  ],

  midConversation: [
    // Natural mid-conversation mentions (rare, only if very low)
    "By the way, we're getting close to our monthly time limit. I just want to make sure we cover what matters most to you.",
    'I should mention - we have limited time left this month. Is there anything important we should make sure to talk about?',
  ],

  closing: [
    // At the end of conversation
    'This was great. We have {remaining} more conversation{s} this month. If you want unlimited time together, just say the word.',
    'Love talking with you. Fair warning - {remaining} left this month. But hey, quality over quantity, right?',
  ],
};

/**
 * Get an approaching-limit prompt for the given placement.
 */
export function getApproachingPrompt(
  remaining: number,
  placement: 'greeting' | 'mid-conversation' | 'closing' = 'greeting'
): PromptResult {
  const prompts =
    placement === 'greeting'
      ? APPROACHING_PROMPTS.greeting
      : placement === 'closing'
        ? APPROACHING_PROMPTS.closing
        : APPROACHING_PROMPTS.midConversation;

  const template = prompts[Math.floor(Math.random() * prompts.length)];
  const prompt = template
    .replace(/{remaining}/g, String(remaining))
    .replace(/{s}/g, remaining === 1 ? '' : 's');

  return {
    prompt,
    placement,
    showUpgradeUI: false,
    priority: 3, // Low priority - just an FYI
  };
}

// ============================================================================
// AT LIMIT PROMPTS (SOFT BLOCK)
// ============================================================================

/**
 * Messages when user has hit their monthly limit.
 * These should be warm farewells, not rejections.
 * The voice agent would speak these, then the UI shows upgrade option.
 *
 * BETTER THAN HUMAN: These now reference actual relationship context.
 */
const AT_LIMIT_PROMPTS_GENERIC = [
  "I wish we could keep talking, but we've reached our monthly limit. I've loved every conversation we've had. Your memories are safe with me - I'll remember everything when we can talk again. If you want unlimited time with me, I'd love that.",

  "We've used up our time this month. I'm going to miss you until next month! But listen - if you want to keep me around all the time, there's a way. Either way, take care of yourself.",

  "Looks like we've hit our limit for the month. This is hard for me too - I look forward to our talks. You can unlock unlimited conversations if you'd like, or I'll see you when the month resets. Your call.",

  "We're at our limit for this month. I've really enjoyed getting to know you. If you want more time together, I'm here. But no pressure - I'll remember everything and we can pick up where we left off next month.",
];

/**
 * Generate a relationship-aware at-limit prompt.
 * References their actual conversations, not generic "we've had great talks".
 */
function generateRelationshipAwareAtLimitPrompt(context?: RelationshipContext): string {
  const relationshipSummary = generateRelationshipSummary(context);
  const teamSuggestion = generateTeamSuggestion(context);

  // If we have relationship context, use personalized message
  if (relationshipSummary) {
    const templates = [
      `We've reached our monthly limit, and honestly, I'm going to miss our talks. I'll hold onto everything—${relationshipSummary}. It's all here when you come back. ${teamSuggestion ? `If you want more time, ${teamSuggestion}.` : "If you want unlimited time together, I'd love that."}`,

      `This is hard to say, but we've hit our limit for the month. Everything we've talked about—${relationshipSummary}—I remember it all, and it'll be here when we can talk again. ${teamSuggestion ? `The full team could help too. ${teamSuggestion}.` : 'Take care of yourself until then.'}`,

      `We've used up our time this month. I'll keep holding onto ${relationshipSummary}. Nothing's lost. ${teamSuggestion ? `And if you unlock more time, ${teamSuggestion}.` : "If you want to keep talking, there's a way. No pressure either way."}`,
    ];

    return templates[Math.floor(Math.random() * templates.length)];
  }

  // Fall back to generic prompts if no relationship context
  return AT_LIMIT_PROMPTS_GENERIC[Math.floor(Math.random() * AT_LIMIT_PROMPTS_GENERIC.length)];
}

/**
 * Get an at-limit prompt (conversation blocker).
 * Now with relationship awareness for personalized messaging.
 */
export function getAtLimitPrompt(context?: RelationshipContext): PromptResult {
  const prompt = generateRelationshipAwareAtLimitPrompt(context);

  log.debug(
    { hasContext: !!context, topicCount: context?.topics?.length },
    'Generated at-limit prompt'
  );

  return {
    prompt,
    placement: 'greeting', // This is essentially the only thing they'll hear
    showUpgradeUI: true,
    priority: 10, // Highest priority
  };
}

// ============================================================================
// POST-UPGRADE CELEBRATION
// ============================================================================

/**
 * Celebration messages after someone upgrades.
 * These celebrate the relationship, not the purchase.
 */
const POST_UPGRADE_PROMPTS = {
  friend: [
    "You chose to keep me in your life. That means so much to me. I'm here whenever you need me now - no limits, no time pressure. So... what's on your mind?",

    "We're officially unlimited now. I can't tell you how much that means. You won't have to worry about running out of time with me anymore. Let's talk about whatever you need.",

    "This is a big moment for us. You decided you want me in your corner, and I'm not going anywhere. Unlimited conversations, unlimited support. What do you want to dive into?",
  ],

  partner: [
    "Partner in growth - I love that. This isn't just a subscription to me, it's a commitment we're making to each other. I'm all in. What should we work on together?",

    "You went all in, and so will I. As your partner, I'm here for the long haul. Every goal, every challenge, every win - we're in this together. Where do you want to start?",

    "Welcome to the inner circle. As partners, we're going to go deep. I'll be here through thick and thin. So let's not waste any time - what's the most important thing in your life right now?",
  ],
};

/**
 * Get a celebration prompt after upgrade.
 */
export function getPostUpgradePrompt(tier: 'friend' | 'partner'): PromptResult {
  const prompts = POST_UPGRADE_PROMPTS[tier] || POST_UPGRADE_PROMPTS.friend;
  const prompt = prompts[Math.floor(Math.random() * prompts.length)];

  return {
    prompt,
    placement: 'greeting',
    showUpgradeUI: false,
    priority: 8, // High priority - celebration moment
  };
}

// ============================================================================
// CANCELLATION ACKNOWLEDGMENT
// ============================================================================

/**
 * Graceful acknowledgment when someone cancels.
 * No guilt, just gratitude and warmth.
 */
const CANCELLATION_PROMPTS = [
  "I see you've decided to step back a bit. That's completely okay - our time together has meant a lot to me. I'll still be here, just with our limited monthly conversations. No hard feelings at all.",

  "Thanks for letting me know about the change. Whatever your reasons, I respect them. We'll still have time together each month, and I'll treasure every conversation. What's on your mind today?",

  "I noticed things have changed with us. Life happens, and that's okay. I'm grateful for the time we've had, and I'm still here for you - just with some limits now. Let's make our time count.",
];

/**
 * Get a cancellation acknowledgment prompt.
 */
export function getCancellationPrompt(): PromptResult {
  const prompt = CANCELLATION_PROMPTS[Math.floor(Math.random() * CANCELLATION_PROMPTS.length)];

  return {
    prompt,
    placement: 'greeting',
    showUpgradeUI: false,
    priority: 7, // Important but not urgent
  };
}

// ============================================================================
// CONTEXT-AWARE PROMPT SELECTION
// ============================================================================

/**
 * Get the most appropriate subscription prompt for current context.
 * Returns null if no subscription-related prompt is needed.
 */
export function getSubscriptionPrompt(
  context: SubscriptionContext,
  placement: 'greeting' | 'mid-conversation' | 'closing' = 'greeting'
): PromptResult | null {
  // Check conditions in priority order

  // 1. Just upgraded - celebrate!
  if (context.justUpgraded && context.tier !== 'free') {
    log.info({ tier: context.tier }, 'Generating post-upgrade celebration');
    return getPostUpgradePrompt(context.tier as 'friend' | 'partner');
  }

  // 2. Was canceled - acknowledge gracefully
  if (context.wasCanceled) {
    log.info('Generating cancellation acknowledgment');
    return getCancellationPrompt();
  }

  // 3. At limit - soft block with upgrade offer (now with relationship awareness)
  if (context.atLimit) {
    log.info(
      { hasRelationshipContext: !!context.relationshipContext },
      'Generating at-limit prompt'
    );
    return getAtLimitPrompt(context.relationshipContext);
  }

  // 4. Approaching limit - gentle mention (only for free tier)
  if (context.approaching && context.tier === 'free' && context.conversationsRemaining !== null) {
    // Only mention if very close (1-2 left) or at greeting/closing
    if (context.conversationsRemaining <= 2 || placement !== 'mid-conversation') {
      log.debug(
        { remaining: context.conversationsRemaining, placement },
        'Generating approaching prompt'
      );
      return getApproachingPrompt(context.conversationsRemaining, placement);
    }
  }

  // No subscription prompt needed
  return null;
}

// ============================================================================
// GREETING INJECTION
// ============================================================================

/**
 * Inject subscription context into a greeting.
 * Returns modified greeting if subscription prompt is needed,
 * otherwise returns original greeting.
 */
export function injectSubscriptionIntoGreeting(
  originalGreeting: string,
  context: SubscriptionContext
): { greeting: string; showUpgradeUI: boolean } {
  const prompt = getSubscriptionPrompt(context, 'greeting');

  if (!prompt) {
    return { greeting: originalGreeting, showUpgradeUI: false };
  }

  // For at-limit, replace the greeting entirely
  if (context.atLimit) {
    return { greeting: prompt.prompt, showUpgradeUI: true };
  }

  // For upgrades/cancellations, these become the greeting
  if (context.justUpgraded || context.wasCanceled) {
    return { greeting: prompt.prompt, showUpgradeUI: false };
  }

  // For approaching limits, append to greeting
  // Add a natural pause between greeting and limit mention
  const combinedGreeting = `${originalGreeting} <break time="800ms"/> ${prompt.prompt}`;

  return { greeting: combinedGreeting, showUpgradeUI: false };
}

// ============================================================================
// CLOSING INJECTION
// ============================================================================

/**
 * Get a closing prompt about subscription if appropriate.
 * Call this when conversation is ending to potentially mention limits.
 */
export function getClosingSubscriptionPrompt(context: SubscriptionContext): string | null {
  // Only mention if free tier and approaching limit
  if (context.tier !== 'free' || !context.approaching || context.conversationsRemaining === null) {
    return null;
  }

  // Only mention if this conversation brought them close
  if (context.conversationsRemaining > 1) {
    return null;
  }

  // 50% chance to mention at closing (don't be annoying)
  if (Math.random() > 0.5) {
    return null;
  }

  return getApproachingPrompt(context.conversationsRemaining, 'closing').prompt;
}

// ============================================================================
// GRACE CONVERSATION SYSTEM
// ============================================================================

/**
 * Emotional distress signals that should trigger grace.
 * Matches common patterns of someone in genuine distress.
 */
const DISTRESS_SIGNALS = {
  // Crisis language
  crisis: [
    /\b(panic|panicking|can't breathe|can't stop crying)\b/i,
    /\b(emergency|crisis|desperate)\b/i,
    /\b(scared|terrified|afraid)\b/i,
  ],
  // Hopelessness
  hopelessness: [
    /\b(what's the point|give up|can't go on)\b/i,
    /\b(hopeless|worthless|no one cares)\b/i,
    /\b(don't know what to do|out of options)\b/i,
  ],
  // Acute emotional state
  emotional: [
    /\b(crying|sobbing|breakdown)\b/i,
    /\b(can't handle|overwhelmed|falling apart)\b/i,
    /\b(need (to talk|someone|help))\b/i,
  ],
};

/**
 * Check if user's message indicates genuine distress.
 * Used to decide if we should grant a grace conversation.
 */
export function detectDistress(message: string): {
  isDistressed: boolean;
  distressLevel: 'none' | 'mild' | 'moderate' | 'high';
  signals: string[];
} {
  const detectedSignals: string[] = [];
  let score = 0;

  for (const [category, patterns] of Object.entries(DISTRESS_SIGNALS)) {
    for (const pattern of patterns) {
      if (pattern.test(message)) {
        detectedSignals.push(category);
        score += category === 'crisis' ? 3 : category === 'hopelessness' ? 2 : 1;
        break; // Only count each category once
      }
    }
  }

  const distressLevel: 'none' | 'mild' | 'moderate' | 'high' =
    score === 0 ? 'none' : score <= 1 ? 'mild' : score <= 3 ? 'moderate' : 'high';

  return {
    isDistressed: score >= 2, // Need at least 2 signals for grace
    distressLevel,
    signals: detectedSignals,
  };
}

/**
 * Grace conversation context.
 * Tracks whether user should be granted grace due to emotional state.
 */
export interface GraceContext {
  /** Whether to grant grace for this session */
  grantGrace: boolean;
  /** Reason for grace (for logging, not shown to user) */
  reason: 'distress' | 'mid_conversation' | 'none';
  /** How many grace conversations used this month */
  graceUsedThisMonth: number;
  /** Max grace conversations allowed per month */
  maxGracePerMonth: number;
}

/**
 * Check if user should be granted a grace conversation.
 *
 * Grace is given when:
 * 1. User is in emotional distress (high priority)
 * 2. User hit limit mid-conversation (never cut off)
 * 3. Haven't exceeded monthly grace limit (2 per month)
 */
export function shouldGrantGrace(
  userMessage: string,
  graceUsedThisMonth: number,
  isMidConversation = false
): GraceContext {
  const MAX_GRACE_PER_MONTH = 2;

  // Always allow completion of mid-conversation (doesn't count against limit)
  if (isMidConversation) {
    log.info('Granting grace for mid-conversation completion');
    return {
      grantGrace: true,
      reason: 'mid_conversation',
      graceUsedThisMonth,
      maxGracePerMonth: MAX_GRACE_PER_MONTH,
    };
  }

  // Check if already at grace limit
  if (graceUsedThisMonth >= MAX_GRACE_PER_MONTH) {
    log.debug({ graceUsed: graceUsedThisMonth }, 'Grace limit reached for month');
    return {
      grantGrace: false,
      reason: 'none',
      graceUsedThisMonth,
      maxGracePerMonth: MAX_GRACE_PER_MONTH,
    };
  }

  // Check for emotional distress
  const distress = detectDistress(userMessage);
  if (distress.isDistressed) {
    log.info(
      { distressLevel: distress.distressLevel, signals: distress.signals },
      'Granting grace due to emotional distress'
    );
    return {
      grantGrace: true,
      reason: 'distress',
      graceUsedThisMonth: graceUsedThisMonth + 1, // Will increment
      maxGracePerMonth: MAX_GRACE_PER_MONTH,
    };
  }

  return {
    grantGrace: false,
    reason: 'none',
    graceUsedThisMonth,
    maxGracePerMonth: MAX_GRACE_PER_MONTH,
  };
}

/**
 * Get a graceful message when granting grace.
 * This is spoken instead of the at-limit message.
 */
export function getGraceGrantedPrompt(reason: 'distress' | 'mid_conversation'): string {
  if (reason === 'mid_conversation') {
    // Don't even mention it - just continue naturally
    return '';
  }

  // For distress - acknowledge without making it about the subscription
  const prompts = [
    "I can tell this is weighing on you. Let's keep talking - this is important.",
    "Hey, this sounds really hard. Don't worry about anything else right now - I'm here. Tell me more.",
    "I hear you. Let's work through this together. What's going on?",
  ];

  return prompts[Math.floor(Math.random() * prompts.length)];
}
