/**
 * Natural Voice Authentication
 *
 * The most HUMAN way to remember users - combining multiple signals
 * for a seamless, natural experience:
 *
 * 1. Voice Signature (Primary) - Silent, automatic, like recognizing a friend's voice
 * 2. Device Recognition - Same phone/computer
 * 3. Phone Number - Caller ID from calls
 * 4. Conversational Context - "We talked about your trip to Hawaii"
 * 5. Gentle Confirmation - "Is this Sarah?" (only when uncertain)
 *
 * Philosophy: Recognition should feel like running into a friend,
 * not like logging into a bank.
 */

import { getDefaultStore } from '../memory/index.js';
import type { UserProfile, VoiceSketch } from '../../types/user-profile.js';
import { getLogger } from '../../utils/safe-logger.js';
import {
  identifyWithVoice,
  mergeVoiceSketch,
  type VoiceIdentificationResult,
} from '../voice/voice-identification.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * How confident are we about who this is?
 */
export type ConfidenceLevel = 'certain' | 'likely' | 'possible' | 'unknown';

/**
 * What should the agent do?
 */
export type AuthAction =
  | 'greet_warmly' // "Sarah! Great to hear from you!"
  | 'greet_casually' // "Hey, welcome back"
  | 'confirm_gently' // "Is this Sarah?"
  | 'ask_naturally' // "I don't think we've met - what's your name?"
  | 'verify_security' // "Just to make sure - what's your dog's name?" (sensitive ops)
  | 'enroll_voice'; // Build voice signature for next time

/**
 * Complete auth context for the agent
 */
export interface AuthContext {
  // Who we think they are
  userId: string;
  userName?: string;
  confidence: ConfidenceLevel;

  // What to do
  action: AuthAction;
  greeting?: string; // Suggested natural greeting

  // Context for the agent
  isNewUser: boolean;
  isReturningUser: boolean;
  lastConversation?: Date;
  conversationCount: number;

  // What we remember
  rememberedTopics?: string[];
  lastMilestone?: string;
  relationshipStage: 'stranger' | 'acquaintance' | 'familiar' | 'friend';

  // Voice specifics
  voiceConfidence: number;
  voiceEnrolled: boolean;
  shouldEnrollVoice: boolean;

  // Security context
  requiresVerification: boolean;
  verificationQuestion?: string;
}

/**
 * Security questions we can use for verification
 */
interface SecurityContext {
  questions: string[];
  answers: string[];
}

// ============================================================================
// MAIN AUTHENTICATION FLOW
// ============================================================================

/**
 * Natural authentication - identify user from all available signals
 */
export async function authenticateNaturally(params: {
  metadata: Record<string, unknown>;
  voiceSketch?: VoiceSketch | null;
  requireVerification?: boolean;
}): Promise<AuthContext> {
  const { metadata, voiceSketch, requireVerification = false } = params;

  const store = getDefaultStore();
  await store.initialize();

  // Use existing voice identification
  const voiceResult = await identifyWithVoice(metadata, store, voiceSketch);

  getLogger().info(
    {
      method: voiceResult.identificationMethod,
      suggestedAction: voiceResult.suggestedAction,
      confidence: voiceResult.voice?.matchConfidence?.toFixed(2),
    },
    '🔐 Natural auth result'
  );

  // Build auth context from voice result
  const authContext = buildAuthContext(voiceResult, requireVerification);

  // Log for debugging
  getLogger().debug(
    {
      userId: authContext.userId,
      confidence: authContext.confidence,
      action: authContext.action,
      relationshipStage: authContext.relationshipStage,
    },
    'Auth context built'
  );

  return authContext;
}

/**
 * Verify user identity conversationally
 * Use for sensitive operations (financial, health data)
 */
export async function verifyIdentity(
  userId: string,
  userResponse: string
): Promise<{ verified: boolean; confidence: number; reason: string }> {
  const store = getDefaultStore();
  const profile = await store.getProfile(userId);

  if (!profile) {
    return { verified: false, confidence: 0, reason: 'No profile found' };
  }

  // Check against known facts about user
  const securityContext = buildSecurityContext(profile);

  for (const answerItem of securityContext.answers) {
    const answer = answerItem.toLowerCase();
    const response = userResponse.toLowerCase();

    // Fuzzy match
    if (response.includes(answer) || answer.includes(response)) {
      return {
        verified: true,
        confidence: 0.9,
        reason: 'Correct answer to security question',
      };
    }
  }

  // Check against conversation history topics
  const summaries = await store.getSummaries(userId, { limit: 3 });
  for (const summary of summaries) {
    const topics = summary.mainTopics || [];
    for (const topic of topics) {
      if (userResponse.toLowerCase().includes(topic.toLowerCase())) {
        return {
          verified: true,
          confidence: 0.7,
          reason: 'Referenced recent conversation topic',
        };
      }
    }
  }

  return {
    verified: false,
    confidence: 0.3,
    reason: 'Could not verify identity',
  };
}

/**
 * Enroll user's voice signature
 * Called after confirming identity
 */
export async function enrollVoice(userId: string, voiceSketch: VoiceSketch): Promise<void> {
  const store = getDefaultStore();
  const profile = await store.getProfile(userId);

  if (!profile) {
    getLogger().warn({ userId }, 'Cannot enroll voice - no profile');
    return;
  }

  // Merge with existing voice data (if any)
  const mergedSketch = mergeVoiceSketch(profile.voiceSketch, voiceSketch);

  // Save to profile
  profile.voiceSketch = mergedSketch;
  await store.saveProfile(profile);

  getLogger().info(
    {
      userId,
      confidence: mergedSketch.confidence.toFixed(2),
      samples: mergedSketch.samplesAnalyzed,
    },
    '🎤 Voice enrolled/updated'
  );
}

/**
 * Update voice signature during conversation
 * Called periodically to improve recognition
 */
export async function updateVoiceSignature(
  userId: string,
  voiceSketch: VoiceSketch
): Promise<void> {
  // Only update if we have enough new data
  if (voiceSketch.samplesAnalyzed < 5) {
    return;
  }

  await enrollVoice(userId, voiceSketch);
}

/**
 * Link a new identifier to an existing user
 * (e.g., user calls from new phone, logs in on new device)
 */
export async function linkIdentifier(
  userId: string,
  identifier: { type: 'phone' | 'device' | 'email'; value: string }
): Promise<void> {
  const store = getDefaultStore();
  const profile = await store.getProfile(userId);

  if (!profile) {
    getLogger().warn({ userId }, 'Cannot link identifier - no profile');
    return;
  }

  // Add to linked identifiers (stored as strings in format "type:value")
  if (!profile.linkedIdentifiers) {
    profile.linkedIdentifiers = [];
  }

  const identifierString = `${identifier.type}:${identifier.value}`;

  // Check if already linked
  if (!profile.linkedIdentifiers.includes(identifierString)) {
    profile.linkedIdentifiers.push(identifierString);

    await store.saveProfile(profile);

    getLogger().info({ userId, identifier: identifierString }, '🔗 Identifier linked');
  }
}

// ============================================================================
// CONTEXT BUILDERS
// ============================================================================

function buildAuthContext(
  voiceResult: VoiceIdentificationResult,
  requireVerification: boolean
): AuthContext {
  const { profile } = voiceResult;
  const { isNew } = voiceResult;
  const { isReturning } = voiceResult;

  // Determine confidence level
  let confidence: ConfidenceLevel;
  if (voiceResult.identificationMethod === 'both') {
    confidence = 'certain';
  } else if (
    voiceResult.identificationMethod === 'voice' &&
    (voiceResult.voice?.matchConfidence ?? 0) > 0.8
  ) {
    confidence = 'certain';
  } else if (voiceResult.identificationMethod === 'device' && profile?.name) {
    confidence = 'likely';
  } else if ((voiceResult.voice?.matchConfidence ?? 0) > 0.5) {
    confidence = 'possible';
  } else {
    confidence = 'unknown';
  }

  // Determine relationship stage
  const conversationCount = profile?.totalConversations || 0;
  let relationshipStage: AuthContext['relationshipStage'];
  if (conversationCount === 0) {
    relationshipStage = 'stranger';
  } else if (conversationCount < 3) {
    relationshipStage = 'acquaintance';
  } else if (conversationCount < 10) {
    relationshipStage = 'familiar';
  } else {
    relationshipStage = 'friend';
  }

  // Determine action
  let action: AuthAction;
  let greeting: string | undefined;

  switch (voiceResult.suggestedAction) {
    case 'greet_by_name':
      if (relationshipStage === 'friend') {
        action = 'greet_warmly';
        greeting = buildWarmGreeting(profile?.name);
      } else {
        action = 'greet_casually';
        greeting = buildCasualGreeting(profile?.name);
      }
      break;

    case 'suggest_identity':
    case 'verify_identity':
      action = 'confirm_gently';
      greeting = buildConfirmationGreeting(profile?.name);
      break;

    case 'enroll_voice':
      action = 'enroll_voice';
      greeting = profile?.name ? `Hey ${profile.name}!` : undefined;
      break;

    case 'ask_name':
    default:
      action = 'ask_naturally';
      greeting = "Hey there! I don't think we've met yet.";
      break;
  }

  // Override for security if needed
  if (requireVerification && confidence !== 'certain') {
    action = 'verify_security';
    greeting = undefined;
  }

  // Build remembered topics
  const rememberedTopics = extractRememberedTopics(profile);

  // Find last milestone from key moments
  const lastMilestoneEvent = profile?.keyMoments?.find((m) => m.type === 'milestone');
  const lastMilestone = lastMilestoneEvent?.summary;

  return {
    userId: voiceResult.userId,
    userName: profile?.name,
    confidence,
    action,
    greeting,
    isNewUser: isNew,
    isReturningUser: isReturning,
    lastConversation: profile?.lastContact,
    conversationCount,
    rememberedTopics,
    lastMilestone,
    relationshipStage,
    voiceConfidence: voiceResult.voice?.matchConfidence ?? 0,
    voiceEnrolled: voiceResult.voice?.hasSketch ?? false,
    shouldEnrollVoice: voiceResult.voice?.needsEnrollment ?? false,
    requiresVerification: requireVerification && confidence !== 'certain',
    verificationQuestion: requireVerification ? getVerificationQuestion(profile) : undefined,
  };
}

function buildWarmGreeting(name?: string): string {
  const greetings = name
    ? [
        `${name}! So good to hear from you!`,
        `Hey ${name}! I was just thinking about you!`,
        `${name}, my friend! How are you?`,
        `There you are, ${name}! Welcome back!`,
      ]
    : ['Hey, welcome back!', 'Good to hear from you again!'];

  return greetings[Math.floor(Math.random() * greetings.length)];
}

function buildCasualGreeting(name?: string): string {
  const greetings = name
    ? [`Hey ${name}!`, `Hi ${name}, good to see you.`, `${name}! How's it going?`]
    : ['Hey there!', 'Hi! Welcome back.'];

  return greetings[Math.floor(Math.random() * greetings.length)];
}

function buildConfirmationGreeting(name?: string): string {
  if (name) {
    return `Your voice sounds familiar... is this ${name}?`;
  }
  return 'Your voice sounds familiar - have we talked before?';
}

function extractRememberedTopics(profile: UserProfile | null): string[] {
  if (!profile) return [];

  const topics: string[] = [];

  // From preferred topics
  if (profile.preferredTopics) {
    topics.push(...profile.preferredTopics.slice(0, 3));
  }

  // From goals
  if (profile.goals) {
    for (const goal of profile.goals.slice(0, 2)) {
      topics.push(goal.name || goal.type);
    }
  }

  // From key moments
  if (profile.keyMoments) {
    for (const moment of profile.keyMoments.slice(0, 2)) {
      topics.push(moment.type);
    }
  }

  return [...new Set(topics)].slice(0, 5);
}

function buildSecurityContext(profile: UserProfile): SecurityContext {
  const questions: string[] = [];
  const answers: string[] = [];

  // Use profile data for verification
  if (profile.name) {
    questions.push('What name should I call you?');
    answers.push(profile.name);
  }

  // Use family members if known (from familyMembers array)
  if (profile.familyMembers?.length) {
    const spouse = profile.familyMembers.find(
      (m) =>
        m.relationship.toLowerCase().includes('spouse') ||
        m.relationship.toLowerCase().includes('wife') ||
        m.relationship.toLowerCase().includes('husband')
    );
    if (spouse?.name) {
      questions.push("What's your spouse's name?");
      answers.push(spouse.name);
    }

    const children = profile.familyMembers.filter(
      (m) =>
        m.relationship.toLowerCase().includes('son') ||
        m.relationship.toLowerCase().includes('daughter') ||
        m.relationship.toLowerCase().includes('child')
    );
    if (children.length > 0) {
      questions.push("What's one of your children's names?");
      for (const child of children) {
        if (child.name) answers.push(child.name);
      }
    }

    const pets = profile.familyMembers.filter(
      (m) =>
        m.relationship.toLowerCase().includes('pet') ||
        m.relationship.toLowerCase().includes('dog') ||
        m.relationship.toLowerCase().includes('cat')
    );
    if (pets.length > 0) {
      questions.push("What's your pet's name?");
      for (const pet of pets) {
        if (pet.name) answers.push(pet.name);
      }
    }
  }

  // Use recent topics
  if (profile.preferredTopics?.length) {
    questions.push('What topics have we discussed recently?');
    answers.push(...profile.preferredTopics);
  }

  return { questions, answers };
}

function getVerificationQuestion(profile: UserProfile | null): string | undefined {
  if (!profile) return undefined;

  const securityContext = buildSecurityContext(profile);

  if (securityContext.questions.length === 0) {
    return 'Can you tell me something we talked about before?';
  }

  // Pick a random question
  const idx = Math.floor(Math.random() * securityContext.questions.length);
  return securityContext.questions[idx];
}

// ============================================================================
// NATURAL LANGUAGE HELPERS
// ============================================================================

/**
 * Generate natural greeting based on time and relationship
 */
export function getNaturalGreeting(authContext: AuthContext): string {
  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const { userName, relationshipStage, lastConversation, greeting } = authContext;

  // Use suggested greeting if available
  if (greeting) {
    return greeting;
  }

  // Build contextual greeting
  if (relationshipStage === 'friend' && userName) {
    const daysSince = lastConversation
      ? Math.floor((Date.now() - lastConversation.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    if (daysSince > 7) {
      return `${userName}! It's been a while! How have you been?`;
    }
    return `${timeGreeting}, ${userName}! Great to hear from you!`;
  }

  if (userName) {
    return `${timeGreeting}, ${userName}!`;
  }

  return `${timeGreeting}! What's on your mind?`;
}

/**
 * Generate context message for the LLM
 */
export function generateContextForLLM(authContext: AuthContext): string {
  const lines: string[] = [];

  lines.push(`[USER CONTEXT]`);
  lines.push(`Confidence: ${authContext.confidence}`);
  lines.push(`Relationship: ${authContext.relationshipStage}`);
  lines.push(`Conversations: ${authContext.conversationCount}`);

  if (authContext.userName) {
    lines.push(`Name: ${authContext.userName}`);
  }

  if (authContext.rememberedTopics?.length) {
    lines.push(`Remember: ${authContext.rememberedTopics.join(', ')}`);
  }

  if (authContext.lastMilestone) {
    lines.push(`Last milestone: ${authContext.lastMilestone}`);
  }

  lines.push('');
  lines.push(`[GREETING GUIDANCE]`);

  switch (authContext.action) {
    case 'greet_warmly':
      lines.push(`Greet ${authContext.userName} warmly like an old friend.`);
      break;
    case 'greet_casually':
      lines.push(`Greet ${authContext.userName} casually but warmly.`);
      break;
    case 'confirm_gently':
      lines.push(
        `Ask gently if this is ${authContext.userName}. Your voice recognition suggests it might be them.`
      );
      break;
    case 'ask_naturally':
      lines.push(`This appears to be a new user. Ask their name naturally in conversation.`);
      break;
    case 'verify_security':
      lines.push(
        `Before proceeding with sensitive operations, verify identity: "${authContext.verificationQuestion}"`
      );
      break;
    case 'enroll_voice':
      lines.push(
        `Known user but no voice signature yet. Greet normally - voice will be enrolled automatically.`
      );
      break;
  }

  return lines.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  authenticateNaturally,
  verifyIdentity,
  enrollVoice,
  updateVoiceSignature,
  linkIdentifier,
  getNaturalGreeting,
  generateContextForLLM,
};
