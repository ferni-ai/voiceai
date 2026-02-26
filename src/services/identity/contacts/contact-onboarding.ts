/**
 * Contact Onboarding Service
 *
 * Makes it seamless for users to share their contact info:
 * 1. Auto-detect phone/email in conversation
 * 2. Prompt for contact info at appropriate moments
 * 3. Confirm and save preferences
 *
 * Integrates with proactive outreach to enable follow-ups.
 *
 * @module identity/contacts/contact-onboarding
 */

import {
  getUserContactInfo,
  setUserContactInfo,
  type UserContactInfo,
} from '../../outreach/user-contact.js';
import { getLogger } from '../../../utils/safe-logger.js';
import { setPreferences } from '../../outreach-intelligence.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ContactDetectionResult {
  phone?: string;
  email?: string;
  timezone?: string;
  preferredMethod?: 'sms' | 'email' | 'call';
  confidence: number;
  extractedFrom: string;
}

export interface OnboardingState {
  userId: string;
  hasContactInfo: boolean;
  hasAskedForContact: boolean;
  contactInfo?: UserContactInfo;
  onboardingComplete: boolean;
  lastPromptTime?: Date;
}

// ============================================================================
// STORAGE
// ============================================================================

const onboardingStateStore = new Map<string, OnboardingState>();

// ============================================================================
// CONTACT DETECTION
// ============================================================================

/**
 * Check if the message indicates the phone number belongs to a third party
 * (not the user's own contact info)
 *
 * Examples of third-party references:
 * - "call my mom at 555-123-4567" → third party (mom)
 * - "call John at 555-123-4567" → third party (John)
 * - "her number is 555-123-4567" → third party
 * - "his phone is 555-123-4567" → third party
 *
 * Examples of self-references (user's own contact):
 * - "my number is 555-123-4567" → self
 * - "text me at 555-123-4567" → self
 * - "reach me at 555-123-4567" → self
 */
function isThirdPartyPhoneReference(text: string): boolean {
  const lower = text.toLowerCase();

  // Patterns that indicate a THIRD-PARTY phone number (not the user's own)
  // All relationship words that indicate someone else's phone number
  const relationshipWords =
    'mom|mother|dad|father|parent|brother|sister|friend|wife|husband|spouse|boss|doctor|dentist|therapist|coworker|colleague|partner|girlfriend|boyfriend|aunt|uncle|grandma|grandpa|grandmother|grandfather';

  const thirdPartyPatterns = [
    // "call/phone/ring/text/reach my [person]" patterns
    new RegExp(`(call|phone|ring|text|reach|contact)\\s+(my\\s+)?(${relationshipWords})`, 'i'),
    // "call/phone/ring/text [name]" patterns (proper nouns before "at" + number)
    // Exclude self-references: "text me at" is NOT third-party
    /(call|phone|ring|text)\s+(?!me\s|myself\s)[A-Z][a-z]{2,}(\s+[A-Z][a-z]+)?\s+(at|on)/i,
    // "call/phone/ring Dr./Mr./Mrs. [name]" patterns (titles)
    /(call|phone|ring|text)\s+(Dr|Mr|Mrs|Ms|Prof)\.?\s+[A-Z][a-z]+\s+(at|on)/i,
    // "her/his/their number/phone"
    /\b(her|his|their)\s+(number|phone|cell|mobile)/i,
    // "[person]'s number" - expanded list
    new RegExp(`(${relationshipWords})'?s?\\s+(number|phone|cell)`, 'i'),
    // "get a hold of/get in touch with my [person]"
    new RegExp(
      `(get\\s+a\\s+hold\\s+of|get\\s+in\\s+touch\\s+with)\\s+(my\\s+)?(${relationshipWords})`,
      'i'
    ),
    // "my friend's/mom's number is"
    new RegExp(`my\\s+(${relationshipWords.replace(/\|/g, "'s|")})'s?\\s+number`, 'i'),
  ];

  for (const pattern of thirdPartyPatterns) {
    if (pattern.test(lower)) {
      getLogger().debug(
        { text: lower.substring(0, 50) },
        '📱 Third-party phone reference detected, skipping contact onboarding'
      );
      return true;
    }
  }

  return false;
}

/**
 * Auto-detect phone numbers and emails in user messages
 *
 * IMPORTANT: This function only detects the USER's own contact info.
 * It will return null if the phone number appears to belong to a third party
 * (e.g., "call my mom at 555-123-4567" - that's mom's number, not the user's).
 */
export function detectContactInfo(text: string): ContactDetectionResult | null {
  // First, check if this is a third-party phone reference
  // If so, we should NOT treat it as the user's contact info
  if (isThirdPartyPhoneReference(text)) {
    return null;
  }

  const results: ContactDetectionResult = {
    confidence: 0,
    extractedFrom: text,
  };

  // Phone number patterns (various formats)
  const phonePatterns = [
    // Standard formats: (555) 123-4567, 555-123-4567, 555.123.4567
    /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/,
    // With country code: +1 555 123 4567, 1-555-123-4567
    /\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/,
    // Spoken format: "five five five one two three four five six seven"
    // (handled separately)
  ];

  for (const pattern of phonePatterns) {
    const match = text.match(pattern);
    if (match) {
      results.phone = normalizePhone(match[0]);
      results.confidence = 0.9;
      break;
    }
  }

  // Email pattern
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const emailMatch = text.match(emailPattern);
  if (emailMatch) {
    results.email = emailMatch[0].toLowerCase();
    results.confidence = Math.max(results.confidence, 0.95);
  }

  // Detect preferred method from context
  const lower = text.toLowerCase();
  if (lower.includes('text me') || lower.includes('sms') || lower.includes('send me a text')) {
    results.preferredMethod = 'sms';
    results.confidence = Math.max(results.confidence, 0.8);
  } else if (lower.includes('email me') || lower.includes('send me an email')) {
    results.preferredMethod = 'email';
    results.confidence = Math.max(results.confidence, 0.8);
  } else if (lower.includes('call me') || lower.includes('give me a call')) {
    results.preferredMethod = 'call';
    results.confidence = Math.max(results.confidence, 0.8);
  }

  // Detect timezone mentions
  const timezonePatterns = [
    { pattern: /\b(pacific|pst|pdt)\b/i, tz: 'America/Los_Angeles' },
    { pattern: /\b(mountain|mst|mdt)\b/i, tz: 'America/Denver' },
    { pattern: /\b(central|cst|cdt)\b/i, tz: 'America/Chicago' },
    { pattern: /\b(eastern|est|edt)\b/i, tz: 'America/New_York' },
  ];

  for (const { pattern, tz } of timezonePatterns) {
    if (pattern.test(text)) {
      results.timezone = tz;
      break;
    }
  }

  // Only return if we found something
  if (results.phone || results.email || results.preferredMethod) {
    getLogger().info(
      {
        hasPhone: !!results.phone,
        hasEmail: !!results.email,
        method: results.preferredMethod,
        confidence: results.confidence,
      },
      '📱 Contact info detected in message'
    );
    return results;
  }

  return null;
}

/**
 * Normalize phone number to E.164 format
 */
function normalizePhone(phone: string): string {
  // Remove all non-digits
  let digits = phone.replace(/\D/g, '');

  // Add country code if missing
  if (digits.length === 10) {
    digits = `1${digits}`;
  }

  return `+${digits}`;
}

// ============================================================================
// ONBOARDING STATE MANAGEMENT
// ============================================================================

/**
 * Get or create onboarding state for user
 */
export async function getOnboardingState(userId: string): Promise<OnboardingState> {
  let state = onboardingStateStore.get(userId);

  if (!state) {
    const existingContact = await getUserContactInfo(userId);
    state = {
      userId,
      hasContactInfo: !!existingContact?.phone || !!existingContact?.email,
      hasAskedForContact: false,
      contactInfo: existingContact,
      onboardingComplete: !!existingContact?.phone || !!existingContact?.email,
    };
    onboardingStateStore.set(userId, state);
  }

  return state;
}

/**
 * Update onboarding state when contact info is provided
 */
export async function completeOnboarding(
  userId: string,
  contactInfo: Partial<UserContactInfo>
): Promise<OnboardingState> {
  const state = await getOnboardingState(userId);

  // Merge with existing contact info
  const merged: UserContactInfo = {
    ...state.contactInfo,
    ...contactInfo,
  };

  // Save to proactive outreach system
  await setUserContactInfo(userId, merged);

  // Update preferences if method specified (cast to compatible type)
  if (contactInfo.preferredMethod && contactInfo.preferredMethod !== 'voice_message') {
    setPreferences(userId, { preferredMethod: contactInfo.preferredMethod });
  }
  if (contactInfo.timezone) {
    setPreferences(userId, { timezone: contactInfo.timezone });
  }

  // Update state
  state.contactInfo = merged;
  state.hasContactInfo = !!merged.phone || !!merged.email;
  state.onboardingComplete = state.hasContactInfo;

  onboardingStateStore.set(userId, state);

  getLogger().info(
    { userId, hasPhone: !!merged.phone, hasEmail: !!merged.email },
    '✅ Contact onboarding complete'
  );

  return state;
}

/**
 * Mark that we've asked for contact info (to avoid repeated prompts)
 */
export async function markAskedForContact(userId: string): Promise<void> {
  const state = await getOnboardingState(userId);
  state.hasAskedForContact = true;
  state.lastPromptTime = new Date();
  onboardingStateStore.set(userId, state);
}

// ============================================================================
// PROMPT GENERATION
// ============================================================================

/**
 * Determine if we should prompt for contact info
 */
export async function shouldPromptForContact(userId: string, turnCount: number): Promise<boolean> {
  const state = await getOnboardingState(userId);

  // Already have contact info
  if (state.hasContactInfo) {
    return false;
  }

  // Already asked recently
  if (state.hasAskedForContact && state.lastPromptTime) {
    const hoursSinceAsk = (Date.now() - state.lastPromptTime.getTime()) / (1000 * 60 * 60);
    if (hoursSinceAsk < 24) {
      return false;
    }
  }

  // Good times to ask:
  // - After turn 3 (rapport built)
  // - When discussing goals/commitments
  // - When user mentions wanting reminders
  return turnCount >= 3 && !state.hasAskedForContact;
}

/**
 * Get contextual prompt for asking for contact info
 *
 * Philosophy: Ferni asks like a friend wanting to stay in touch, not like
 * a service requesting permissions. The ask should feel:
 * - Natural, like something a caring friend would say
 * - Connected to what they just shared
 * - Opt-in feeling, no pressure
 * - Warm, not transactional
 */
export function getContactPrompt(
  context: 'commitment' | 'goal' | 'reminder' | 'general' | 'emotional' | 'celebration'
): string {
  const prompts: Record<string, string[]> = {
    // When they've made a commitment
    commitment: [
      "You know what? I'd love to check in on how this goes. " +
        "If you want, give me your number and I'll shoot you a text.",
      'I really want to know how this turns out for you. ' +
        "Want me to text you about it? What's your number?",
      'This sounds important to you. I could text you to see how it went - would that help?',
    ],

    // When they're working toward a goal
    goal: [
      "I'm genuinely rooting for you on this. " +
        "Can I text you sometimes to cheer you on? What's your number?",
      'I want to be in your corner on this journey. ' +
        'If you give me your number, I can check in and celebrate the wins with you.',
      'This matters to you, which means it matters to me. ' +
        'Would it help if I texted you encouragement along the way?',
    ],

    // When they explicitly want a reminder
    reminder: [
      "I've got you. What's the best number to text you at?",
      "Consider it done. Just need your number and I'll make sure you don't forget.",
      "I'll remember so you don't have to. What's your number?",
    ],

    // When they've shared something emotional
    emotional: [
      'Thank you for sharing that with me. ' +
        "Sometimes it helps to have someone check in - want me to text you tomorrow to see how you're doing?",
      "I hear you, and I'm not going to forget this. " +
        "If you want, I can reach out in a few days to see how you're holding up. What's your number?",
      "That's a lot to carry. I'd like to check in on you. Can I text you?",
    ],

    // When there's something to celebrate
    celebration: [
      'This is huge! I want to celebrate this with you properly. ' +
        "Can I text you? I might just randomly send you a 'still proud of you' message.",
      "I'm so happy for you. " +
        'Give me your number so I can check in and see how things keep going!',
    ],

    // Natural conversation - most casual
    general: [
      'Hey, I really enjoy our conversations. ' +
        "If you ever want me to reach out between chats - just to check in or share something I think you'd like - I can do that. " +
        'Just need your number. No pressure though.',
      "You know, I think about the people I talk to even when we're not chatting. " +
        'If you want, give me your number and I can actually reach out when you cross my mind.',
      "I'd love to stay more connected between our conversations. " +
        'Would you be open to me texting you sometimes?',
    ],
  };

  const options = prompts[context] || prompts.general;
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Get a warm Ferni-style opener to the phone ask based on conversation flow
 * This makes the ask feel natural, not like a system prompt
 */
export function getPhoneAskOpener(
  relationshipStage: 'new' | 'building' | 'established' | 'deep'
): string {
  const openers: Record<string, string[]> = {
    new: ['Oh, one thing -', 'Hey, random question -', 'By the way -'],
    building: [
      'You know what I was thinking?',
      'Oh, this just occurred to me -',
      'Actually, I have an idea -',
    ],
    established: [
      'Hey, can I ask you something?',
      "I've been meaning to mention -",
      "So here's a thought -",
    ],
    deep: [
      'Okay, real talk -',
      'You know what would be nice?',
      'I was thinking about us staying more connected -',
    ],
  };

  const options = openers[relationshipStage] || openers.new;
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Generate confirmation message when contact info is saved
 *
 * Ferni style: Warm, personal, makes them feel good about sharing
 * Not: "Your preferences have been saved to our database"
 * Yes: "I'm really glad we can stay connected"
 */
export function getConfirmationMessage(contactInfo: UserContactInfo): string {
  // Simple, warm confirmations
  const warmConfirmations = [
    "Got it. I'm really glad we can stay connected now.",
    "Perfect. I'll only reach out when it matters.",
    'Awesome. This means a lot to me, being able to check in on you.',
    "Great. I promise I'll only text when I have something meaningful to say.",
  ];

  const phoneConfirmations = [
    "Got your number. I'll text you, but only when there's a reason to - like when I'm thinking of you or there's something to celebrate.",
    "Perfect. Now I can actually reach out when you cross my mind. I'll use it wisely.",
    "Got it. I won't spam you - I'll just check in when it matters.",
  ];

  const emailConfirmations = [
    "Got your email. I'll write you sometimes - real letters, not marketing stuff.",
    'Perfect. I might send you something thoughtful now and then.',
  ];

  // If they gave a phone number
  if (contactInfo.phone) {
    return phoneConfirmations[Math.floor(Math.random() * phoneConfirmations.length)];
  }

  // If they gave an email
  if (contactInfo.email) {
    return emailConfirmations[Math.floor(Math.random() * emailConfirmations.length)];
  }

  // Generic
  return warmConfirmations[Math.floor(Math.random() * warmConfirmations.length)];
}

// ============================================================================
// CONVERSATION HOOK
// ============================================================================

/**
 * Process a user message for contact info and onboarding
 * Call this from the voice agent on each user turn
 */
export async function processMessageForOnboarding(
  userId: string,
  message: string,
  turnCount: number
): Promise<{
  detectedContact: ContactDetectionResult | null;
  shouldPrompt: boolean;
  prompt?: string;
  confirmation?: string;
}> {
  // Try to detect contact info in the message
  const detected = detectContactInfo(message);

  if (detected && (detected.phone || detected.email)) {
    // Auto-save detected contact info
    const state = await completeOnboarding(userId, {
      phone: detected.phone,
      email: detected.email,
      preferredMethod: detected.preferredMethod,
      timezone: detected.timezone,
    });

    return {
      detectedContact: detected,
      shouldPrompt: false,
      confirmation: getConfirmationMessage(state.contactInfo!),
    };
  }

  // Check if we should prompt for contact
  const shouldPromptResult = await shouldPromptForContact(userId, turnCount);

  // Determine context for prompt
  let promptContext: 'commitment' | 'goal' | 'reminder' | 'general' = 'general';
  const lower = message.toLowerCase();

  if (lower.includes('remind') || lower.includes('reminder')) {
    promptContext = 'reminder';
  } else if (lower.includes("i'll") || lower.includes('i will') || lower.includes('going to')) {
    promptContext = 'commitment';
  } else if (lower.includes('goal') || lower.includes('want to') || lower.includes('trying to')) {
    promptContext = 'goal';
  }

  return {
    detectedContact: detected,
    shouldPrompt: shouldPromptResult,
    prompt: shouldPromptResult ? getContactPrompt(promptContext) : undefined,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  detectContactInfo,
  getOnboardingState,
  completeOnboarding,
  markAskedForContact,
  shouldPromptForContact,
  getContactPrompt,
  getConfirmationMessage,
  processMessageForOnboarding,
};
