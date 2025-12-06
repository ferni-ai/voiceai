/**
 * Contact Onboarding Service
 *
 * Makes it seamless for users to share their contact info:
 * 1. Auto-detect phone/email in conversation
 * 2. Prompt for contact info at appropriate moments
 * 3. Confirm and save preferences
 *
 * Integrates with proactive outreach to enable follow-ups.
 */

import { getLogger } from '../utils/safe-logger.js';
import {
  setUserContactInfo,
  getUserContactInfo,
  type UserContactInfo,
} from '../tools/proactive-outreach.js';
import { setPreferences, getPreferences } from './outreach-intelligence.js';

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
 * Auto-detect phone numbers and emails in user messages
 */
export function detectContactInfo(text: string): ContactDetectionResult | null {
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
 */
export function getContactPrompt(context: 'commitment' | 'goal' | 'reminder' | 'general'): string {
  const prompts: Record<string, string[]> = {
    commitment: [
      "I'd love to check in with you about this! Would you like me to text you a reminder?",
      'Want me to follow up with you on this? I can send you a text to see how it went.',
      'I can text you tomorrow to see how this goes - would that help?',
    ],
    goal: [
      'I can help keep you accountable! Want me to text you check-ins on your progress?',
      'Would you like me to send you encouragement as you work toward this goal?',
      "I'd love to celebrate with you when you hit this goal! Can I text you?",
    ],
    reminder: [
      "I can definitely remind you! What's the best number to text you at?",
      'Happy to send you a reminder! Should I text or email you?',
      "I'll make sure you don't forget - just need your phone number or email.",
    ],
    general: [
      "By the way, if you'd like me to follow up with you between our chats, I can text or email you. Would that be helpful?",
      'I can send you reminders and check-ins if you share your phone number or email. No pressure though!',
      'Want to stay connected between sessions? I can text you motivational check-ins!',
    ],
  };

  const options = prompts[context] || prompts.general;
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Generate confirmation message when contact info is saved
 */
export function getConfirmationMessage(contactInfo: UserContactInfo): string {
  const parts: string[] = [];

  if (contactInfo.phone) {
    const maskedPhone = `${contactInfo.phone.slice(0, -4)}****`;
    parts.push(`text you at ${maskedPhone}`);
  }

  if (contactInfo.email) {
    const [local, domain] = contactInfo.email.split('@');
    const maskedEmail = `${local.slice(0, 2)}***@${domain}`;
    parts.push(`email you at ${maskedEmail}`);
  }

  if (parts.length === 0) {
    return "Got it! I'll remember that.";
  }

  const methodStr = parts.join(' or ');
  const extras: string[] = [];

  if (contactInfo.preferredMethod === 'sms') {
    extras.push("I'll default to texting");
  } else if (contactInfo.preferredMethod === 'email') {
    extras.push("I'll default to email");
  }

  if (contactInfo.timezone) {
    extras.push(`and I'll respect your ${contactInfo.timezone.split('/')[1]} timezone`);
  }

  let message = `Perfect! I can now ${methodStr} for reminders, check-ins, and celebrations.`;

  if (extras.length > 0) {
    message += ` ${extras.join(', ')}.`;
  }

  message += " I won't spam you - just helpful stuff! 💪";

  return message;
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
