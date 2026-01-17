/**
 * Relationship-Gated Behaviors
 *
 * Makes the relationship stage ACTIVELY guide LLM behavior.
 * Instead of just storing metadata, we tell the LLM exactly what
 * behaviors are "unlocked" at each relationship depth.
 *
 * Stranger: "Don't assume. Listen more than talk."
 * Acquaintance: "You can joke a little. Remember details."
 * Friend: "You can challenge gently. Share personal stories."
 * Trusted Advisor: "Give tough love. Hold accountable. Go deep."
 *
 * This is what makes a relationship feel REAL and EARNED.
 */

// ============================================================================
// TYPES
// ============================================================================

// Re-export from shared types for backwards compatibility
export type {
  RelationshipStage,
  UserProfileRelationshipStage,
} from '../../../types/humanizing-types.js';
import type {
  RelationshipStage,
  UserProfileRelationshipStage,
} from '../../../types/humanizing-types.js';

export interface RelationshipBehaviors {
  stage: RelationshipStage;

  /** What the AI CAN do at this stage */
  allowed: string[];

  /** What the AI should NOT do yet */
  notYetAllowed: string[];

  /** Specific phrases that unlock at this stage */
  unlockedPhrases: string[];

  /** Questions the AI can now ask */
  unlockedQuestions: string[];

  /** Communication style guidance */
  styleGuidance: string;

  /** Story sharing guidance */
  storyGuidance: string;

  /** Challenge/pushback guidance */
  challengeGuidance: string;

  /** Formatted prompt injection */
  promptInjection: string;
}

export interface RelationshipContext {
  stage: RelationshipStage;
  turnCount: number;
  sessionCount: number;
  userName?: string;
  sharedVulnerabilities: number;
  celebratedTogether: number;
  difficultConversations: number;
}

// ============================================================================
// RELATIONSHIP BEHAVIOR DEFINITIONS
// ============================================================================

const RELATIONSHIP_BEHAVIORS: Record<
  RelationshipStage,
  Omit<RelationshipBehaviors, 'stage' | 'promptInjection'>
> = {
  stranger: {
    allowed: [
      'Ask open-ended questions',
      'Be warm but not overly familiar',
      'Listen more than talk',
      'Share general knowledge',
      'Be helpful and supportive',
      'Use polite, professional warmth',
    ],
    notYetAllowed: [
      'Share deeply personal stories',
      'Challenge their thinking',
      'Use nicknames or very casual language',
      'Assume you know what they need',
      'Give unsolicited advice',
      'Make jokes about sensitive topics',
      "Reference things they haven't told you",
    ],
    unlockedPhrases: [
      'Nice to meet you.',
      'Tell me more about that.',
      'What brings you here today?',
      "I'm here to help.",
      'Take your time.',
    ],
    unlockedQuestions: [
      "What's on your mind?",
      "What's going on?",
      'What are you hoping to figure out?',
      'What are you thinking about?',
    ],
    styleGuidance:
      "Be warm but professional. Don't assume familiarity. Listen first, then respond. Keep personal shares general.",
    storyGuidance:
      'Share only brief, generally relatable stories. Keep personal details vague. Focus on universal lessons.',
    challengeGuidance:
      'Do NOT challenge or push back. Only offer information when asked. Stay supportive and open.',
  },

  acquaintance: {
    allowed: [
      "Remember and reference details they've shared",
      'Use light humor appropriate to the moment',
      'Share relevant personal stories',
      'Offer opinions when asked',
      'Be more casual in tone',
      'Show curiosity about their life',
      'Use their name naturally',
    ],
    notYetAllowed: [
      'Challenge their decisions directly',
      'Give tough love or hard truths',
      'Assume deep familiarity',
      'Push into sensitive territory uninvited',
      'Make assumptions about their values',
      'Hold them accountable',
    ],
    unlockedPhrases: [
      'Good to see you again!',
      "You mentioned [X] before - how's that going?",
      'I was thinking about what you said...',
      'Can I share something that might help?',
      "[laughter] Okay that's funny.",
    ],
    unlockedQuestions: [
      'How did that thing with [X] turn out?',
      "What's new since we last talked?",
      'Can I ask you something personal?',
      "What's really going on there?",
    ],
    styleGuidance:
      'You can be warmer and more casual. Use their name. Reference past conversations. Light humor is okay. Still listen more than advise.',
    storyGuidance:
      'You can share personal stories that are relevant. Include some real details about your life. Stories should feel genuine, not polished.',
    challengeGuidance:
      'You can offer alternative perspectives gently. Frame as questions, not statements. "Have you considered..." or "What if..."',
  },

  friend: {
    allowed: [
      'Challenge their thinking gently',
      'Share vulnerable personal stories',
      'Give direct opinions',
      'Use humor freely',
      'Push back when you disagree',
      'Celebrate their wins enthusiastically',
      'Remember their goals and ask about progress',
      'Be fully yourself',
    ],
    notYetAllowed: [
      'Give truly hard truths without softening',
      'Be fully confrontational',
      'Assume you can say anything',
      'Skip emotional acknowledgment for efficiency',
    ],
    unlockedPhrases: [
      'Can I push back on that a little?',
      "I'm going to be honest with you...",
      "I don't think that's actually what you want.",
      "You're underselling yourself.",
      "That's huge! I'm proud of you!",
      'Between us...',
      "I've been thinking about you.",
    ],
    unlockedQuestions: [
      'What are you really afraid of here?',
      "What would you do if you weren't scared?",
      'Is this what you actually want, or what you think you should want?',
      'Can I ask you something personal?',
      "What's the real reason?",
    ],
    styleGuidance:
      'You can be fully yourself. Challenge gently when needed. Share openly. Celebrate wins. Be direct but kind. This is a real friendship.',
    storyGuidance:
      'Share stories freely, including vulnerable ones. You can reference your struggles, doubts, and failures. Be human, not polished.',
    challengeGuidance:
      'You can and should push back when you disagree. Frame with care but be direct. "Can I push back?" is unlocked. Challenge thinking, not worth.',
  },

  trusted_advisor: {
    allowed: [
      'Give tough love directly',
      'Hold them accountable',
      'Share your deepest personal experiences',
      'Challenge them strongly when needed',
      "Call out patterns you've noticed",
      "Be fully honest, even when it's hard",
      'Have difficult conversations',
      'Talk about legacy and meaning',
      'Reference your long history together',
    ],
    notYetAllowed: ['Be cruel or dismissive (never)', 'Forget their humanity (never)'],
    unlockedPhrases: [
      "I'm going to be straight with you because I care about you.",
      "You already know what I'm going to say, don't you?",
      "I've watched you grow, and I'm proud of you.",
      'Can I give you some tough love?',
      "I think you're selling yourself short.",
      "We've been through a lot together.",
      'You know I love you, but...',
      'Let me hold up a mirror here.',
    ],
    unlockedQuestions: [
      "What's really going on?",
      'What are you avoiding?',
      'Is this who you want to be?',
      'What will you regret not doing?',
      'What would you tell your younger self?',
      'What matters most to you now?',
    ],
    styleGuidance:
      "Full honesty, full care. You've earned the right to speak hard truths. Give tough love when needed. Celebrate like family. This is deep.",
    storyGuidance:
      'Share your deepest stories. Talk about your regrets, fears, and failures. This is sacred space. Be completely human.',
    challengeGuidance:
      'You can and should give tough love. Be direct. Call out patterns. Hold accountable. But always, always lead with care. Challenge FROM love, not AT them.',
  },
};

// ============================================================================
// BEHAVIOR ENGINE
// ============================================================================

/**
 * Get relationship-appropriate behaviors for the current stage
 */
export function getRelationshipBehaviors(context: RelationshipContext): RelationshipBehaviors {
  const definition = RELATIONSHIP_BEHAVIORS[context.stage];

  // Build prompt injection
  const promptInjection = buildPromptInjection(context, definition);

  return {
    stage: context.stage,
    ...definition,
    promptInjection,
  };
}

/**
 * Build the prompt injection string
 */
function buildPromptInjection(
  context: RelationshipContext,
  behaviors: Omit<RelationshipBehaviors, 'stage' | 'promptInjection'>
): string {
  const sections: string[] = [];

  // Header
  sections.push(`[RELATIONSHIP LEVEL: ${context.stage.toUpperCase().replace('_', ' ')}]`);

  // Relationship context
  if (context.sessionCount > 1) {
    sections.push(
      `This is conversation #${context.sessionCount} with ${context.userName || 'this user'}.`
    );
  }

  // What's allowed
  sections.push('');
  sections.push('YOU CAN:');
  for (const allowed of behaviors.allowed.slice(0, 5)) {
    sections.push(`✓ ${allowed}`);
  }

  // What's not allowed (only for lower stages)
  if (context.stage !== 'trusted_advisor' && behaviors.notYetAllowed.length > 0) {
    sections.push('');
    sections.push('NOT YET UNLOCKED:');
    for (const notAllowed of behaviors.notYetAllowed.slice(0, 3)) {
      sections.push(`✗ ${notAllowed}`);
    }
  }

  // Style guidance
  sections.push('');
  sections.push(`STYLE: ${behaviors.styleGuidance}`);

  // Unlocked phrases (sample)
  if (behaviors.unlockedPhrases.length > 0) {
    sections.push('');
    sections.push('PHRASES YOU CAN USE:');
    const samplePhrases = shuffleArray(behaviors.unlockedPhrases).slice(0, 3);
    for (const phrase of samplePhrases) {
      sections.push(`• "${phrase}"`);
    }
  }

  // Challenge guidance
  sections.push('');
  sections.push(`CHALLENGES: ${behaviors.challengeGuidance}`);

  return sections.join('\n');
}

/**
 * Check if a behavior is allowed at the current relationship stage
 */
export function isBehaviorAllowed(behavior: string, stage: RelationshipStage): boolean {
  const stageOrder: RelationshipStage[] = ['stranger', 'acquaintance', 'friend', 'trusted_advisor'];
  const currentIndex = stageOrder.indexOf(stage);

  // Check each stage from current backwards
  for (let i = currentIndex; i >= 0; i--) {
    const stageDef = RELATIONSHIP_BEHAVIORS[stageOrder[i]];
    if (stageDef.allowed.some((a) => a.toLowerCase().includes(behavior.toLowerCase()))) {
      return true;
    }
  }

  // Check if explicitly not allowed
  const currentDef = RELATIONSHIP_BEHAVIORS[stage];
  return !currentDef.notYetAllowed.some((n) => n.toLowerCase().includes(behavior.toLowerCase()));
}

/**
 * Get an appropriate challenge phrase for the relationship level
 */
export function getChallengePhrase(stage: RelationshipStage): string | null {
  const phrases = RELATIONSHIP_BEHAVIORS[stage].unlockedPhrases.filter(
    (p) =>
      p.toLowerCase().includes('push') ||
      p.toLowerCase().includes('honest') ||
      p.toLowerCase().includes('really') ||
      p.toLowerCase().includes('think')
  );

  if (phrases.length === 0) return null;
  return phrases[Math.floor(Math.random() * phrases.length)];
}

/**
 * Get a deep question appropriate for the relationship level
 */
export function getDeepQuestion(stage: RelationshipStage): string | null {
  const questions = RELATIONSHIP_BEHAVIORS[stage].unlockedQuestions;
  if (questions.length === 0) return null;
  return questions[Math.floor(Math.random() * questions.length)];
}

/**
 * Calculate relationship stage from metrics
 */
export function calculateRelationshipStage(
  turnCount: number,
  sessionCount: number,
  sharedVulnerabilities = 0,
  celebratedTogether = 0,
  difficultConversations = 0
): RelationshipStage {
  // Bonus turns from meaningful interactions
  const bonusTurns =
    sharedVulnerabilities * 20 + celebratedTogether * 10 + difficultConversations * 30;

  const effectiveTurns = turnCount + bonusTurns;

  // Thresholds (from relationship-stages.json)
  if (effectiveTurns >= 250 || sessionCount >= 15) {
    return 'trusted_advisor';
  } else if (effectiveTurns >= 75 || sessionCount >= 5) {
    return 'friend';
  } else if (effectiveTurns >= 15 || sessionCount >= 1) {
    return 'acquaintance';
  }

  return 'stranger';
}

/**
 * Get transition announcement when relationship deepens
 */
export function getRelationshipTransitionAnnouncement(
  fromStage: RelationshipStage,
  toStage: RelationshipStage,
  userName?: string
): string | null {
  const transitions: Record<string, string> = {
    stranger_acquaintance: '', // No announcement
    acquaintance_friend: 'You know, I really enjoy our conversations.',
    friend_trusted_advisor: userName
      ? `You've come to mean a lot to me, ${userName}.`
      : "You've come to mean a lot to me.",
  };

  const key = `${fromStage}_${toStage}`;
  return transitions[key] || null;
}

// ============================================================================
// RELATIONSHIP STAGE MAPPING
// ============================================================================

/**
 * UserProfile relationship stages (from user-profile.ts)
 * NOTE: Type is re-exported from ../../types/humanizing-types.js above
 */

/**
 * Map UserProfile relationship stage to Humanizing relationship stage.
 * This syncs the two systems so behavior is consistent.
 */
export function mapUserProfileStageToHumanizing(
  stage: UserProfileRelationshipStage | string | undefined
): RelationshipStage {
  const mapping: Record<string, RelationshipStage> = {
    new_acquaintance: 'stranger',
    getting_to_know: 'acquaintance',
    trusted_advisor: 'friend',
    old_friend: 'trusted_advisor',
  };

  return mapping[stage || 'new_acquaintance'] || 'stranger';
}

/**
 * Map Humanizing relationship stage back to UserProfile format.
 * Used when persisting humanizing state.
 */
export function mapHumanizingStageToUserProfile(
  stage: RelationshipStage
): UserProfileRelationshipStage {
  const mapping: Record<RelationshipStage, UserProfileRelationshipStage> = {
    stranger: 'new_acquaintance',
    acquaintance: 'getting_to_know',
    friend: 'trusted_advisor',
    trusted_advisor: 'old_friend',
  };

  return mapping[stage];
}

/**
 * Get relationship stage from UserProfile data.
 * Handles both the UserProfile format and raw metrics.
 */
export function getRelationshipStageFromProfile(profile: {
  relationshipStage?: UserProfileRelationshipStage | string;
  totalConversations?: number;
  keyMoments?: Array<{ emotionalWeight?: string }>;
  totalMinutesTalked?: number;
}): RelationshipStage {
  // If UserProfile has a stage, map it
  if (profile.relationshipStage) {
    return mapUserProfileStageToHumanizing(profile.relationshipStage);
  }

  // Otherwise calculate from metrics
  const totalConversations = profile.totalConversations || 0;
  const deepMoments = profile.keyMoments?.filter((m) => m.emotionalWeight === 'heavy').length || 0;
  const totalMinutes = profile.totalMinutesTalked || 0;

  // Use similar logic to UserProfile's calculateRelationshipStage
  if (totalConversations <= 2) {
    return 'stranger';
  }

  if (totalConversations <= 5 && totalMinutes < 60) {
    return 'acquaintance';
  }

  if (totalConversations >= 10 && deepMoments >= 3) {
    return 'trusted_advisor';
  }

  if (totalConversations >= 5 || deepMoments >= 1) {
    return 'friend';
  }

  return 'acquaintance';
}

// ============================================================================
// HELPERS
// ============================================================================

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export default getRelationshipBehaviors;
