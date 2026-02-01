/**
 * Reception Predictor - Better Than Human Service
 *
 * What no human friend can do: Objectively assess how your words will land.
 *
 * "Based on what you've told me about Mark, this phrase 'you need to...' might
 * trigger his defenses. He tends to respond better when you ask questions.
 * Try: 'What do you think about...?'"
 *
 * @module tools/domains/communication/superhuman-tools/reception-predictor
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import type { ContactCommunicationProfile, ReceptionPrediction } from './types.js';
import { getContactProfile } from './communication-archaeology.js';

const log = createLogger({ module: 'reception-predictor' });

// ============================================================================
// TRIGGER PATTERNS
// ============================================================================

const DEFENSIVE_TRIGGERS = [
  { pattern: /\byou (always|never)\b/i, reason: '"Always/never" statements feel like attacks' },
  {
    pattern: /\byou (need to|should|have to|must)\b/i,
    reason: 'Directive language triggers defensiveness',
  },
  {
    pattern: /\bwhy (didn\'t|don\'t|can\'t|won\'t) you\b/i,
    reason: '"Why didn\'t you" sounds accusatory',
  },
  { pattern: /\bi can\'t believe you\b/i, reason: 'Sounds like judgment, not feedback' },
  { pattern: /\byou made me (feel|think)\b/i, reason: 'Blaming language triggers defense' },
  { pattern: /\bit\'s (your|all your) fault\b/i, reason: 'Direct blame shuts down dialogue' },
  {
    pattern: /\bif you (really|actually) (cared|loved|wanted)\b/i,
    reason: 'Questioning their love/care is a trigger',
  },
  {
    pattern: /\byou\'re (being|so) (selfish|lazy|stupid|ridiculous)\b/i,
    reason: 'Name-calling ends productive conversation',
  },
  { pattern: /\bwhat\'s wrong with you\b/i, reason: 'Sounds like an attack on their character' },
  {
    pattern: /\bi told you (so|this would happen)\b/i,
    reason: '"I told you so" breeds resentment',
  },
];

const SOFTENING_ALTERNATIVES: Record<string, string> = {
  'you always': "I've noticed that sometimes",
  'you never': "I haven't seen you",
  'you need to': 'Would you consider',
  'you should': 'What if you tried',
  'you have to': 'It might help to',
  "why didn't you": "I'm curious what happened with",
  "why don't you": 'Have you thought about',
  "why can't you": 'What makes it hard to',
  'you made me feel': 'I felt',
  "it's your fault": 'I think what happened was',
  "what's wrong with you": 'Help me understand',
};

const POSITIVE_PATTERNS = [
  { pattern: /\bi (feel|felt)\b/i, boost: 0.1, reason: 'I-statements show ownership' },
  {
    pattern: /\bi (understand|hear you|see what)\b/i,
    boost: 0.15,
    reason: 'Acknowledgment builds connection',
  },
  { pattern: /\bwhat do you think\b/i, boost: 0.2, reason: 'Questions invite dialogue' },
  { pattern: /\bhelp me understand\b/i, boost: 0.2, reason: 'Shows genuine curiosity' },
  { pattern: /\bi (appreciate|value|respect)\b/i, boost: 0.15, reason: 'Appreciation opens doors' },
  { pattern: /\bi\'m (sorry|apologize)\b/i, boost: 0.1, reason: 'Accountability builds trust' },
  {
    pattern: /\bwould you (be willing|consider)\b/i,
    boost: 0.15,
    reason: 'Requests feel collaborative',
  },
  {
    pattern: /\bI\'d love (to hear|your thoughts)\b/i,
    boost: 0.2,
    reason: 'Invites their perspective',
  },
];

// ============================================================================
// PERSON-SPECIFIC TRIGGERS
// ============================================================================

/**
 * Get person-specific trigger patterns from their profile.
 */
function getPersonSpecificTriggers(
  profile: ContactCommunicationProfile | null
): Array<{ pattern: RegExp; reason: string }> {
  if (!profile) return [];

  const triggers: Array<{ pattern: RegExp; reason: string }> = [];

  // Convert trigger phrases to patterns
  for (const phrase of profile.triggerPhrases || []) {
    try {
      triggers.push({
        pattern: new RegExp(`\\b${escapeRegex(phrase)}\\b`, 'i'),
        reason: `"${phrase}" has triggered them before`,
      });
    } catch {
      // Invalid regex, skip
    }
  }

  // Convert ineffective approaches to patterns
  for (const approach of profile.ineffectiveApproaches || []) {
    try {
      // Extract key phrases from approaches
      const keyWords = approach.split(/\s+/).slice(0, 4).join('\\s+');
      triggers.push({
        pattern: new RegExp(keyWords, 'i'),
        reason: `This approach hasn't worked with them: "${approach}"`,
      });
    } catch {
      // Invalid regex, skip
    }
  }

  return triggers;
}

/**
 * Get person-specific positive patterns.
 */
function getPersonSpecificPositives(
  profile: ContactCommunicationProfile | null
): Array<{ pattern: RegExp; boost: number; reason: string }> {
  if (!profile) return [];

  const positives: Array<{ pattern: RegExp; boost: number; reason: string }> = [];

  // Convert effective approaches to patterns
  for (const approach of profile.effectiveApproaches || []) {
    try {
      const keyWords = approach.split(/\s+/).slice(0, 4).join('\\s+');
      positives.push({
        pattern: new RegExp(keyWords, 'i'),
        boost: 0.15,
        reason: `This approach has worked with them: "${approach}"`,
      });
    } catch {
      // Invalid regex, skip
    }
  }

  return positives;
}

// ============================================================================
// PREDICTION
// ============================================================================

/**
 * Predict how a message will be received by a specific person.
 */
export async function predictReception(
  userId: string,
  message: string,
  contactName: string
): Promise<ReceptionPrediction> {
  // Get contact profile for personalized prediction
  const profile = await getContactProfile(userId, contactName);

  // Combine generic and person-specific triggers
  const allTriggers = [...DEFENSIVE_TRIGGERS, ...getPersonSpecificTriggers(profile)];
  const allPositives = [...POSITIVE_PATTERNS, ...getPersonSpecificPositives(profile)];

  // Start with neutral baseline
  let score = 0.5;
  const warningFlags: string[] = [];
  const positiveSignals: string[] = [];
  let reasoning = '';

  // Check for negative triggers
  for (const { pattern, reason } of allTriggers) {
    if (pattern.test(message)) {
      score -= 0.15;
      warningFlags.push(reason);
    }
  }

  // Check for positive patterns
  for (const { pattern, boost, reason } of allPositives) {
    if (pattern.test(message)) {
      score += boost;
      positiveSignals.push(reason);
    }
  }

  // Adjust for profile-specific tone preferences
  if (profile) {
    const messageTone = detectMessageTone(message);
    if (messageTone !== profile.preferredTone) {
      if (profile.preferredTone === 'formal' && messageTone === 'casual') {
        score -= 0.1;
        warningFlags.push(`${contactName} prefers formal communication`);
      } else if (profile.preferredTone === 'direct' && messageTone === 'indirect') {
        score -= 0.1;
        warningFlags.push(`${contactName} prefers direct communication`);
      }
    }
  }

  // Clamp score
  score = Math.max(0, Math.min(1, score));

  // Determine predicted reception
  let predictedReception: ReceptionPrediction['predictedReception'];
  if (score >= 0.7) {
    predictedReception = 'positive';
    reasoning = `This message uses good communication patterns${positiveSignals.length > 0 ? `: ${positiveSignals.slice(0, 2).join(', ')}` : ''}. It should land well.`;
  } else if (score >= 0.5) {
    predictedReception = 'neutral';
    reasoning = `This message is neutral. ${warningFlags.length > 0 ? `Watch out for: ${warningFlags[0]}` : 'Consider adding more collaborative language.'}`;
  } else if (score >= 0.3) {
    predictedReception = 'defensive';
    reasoning = `This message may trigger defensiveness. ${warningFlags.slice(0, 2).join('. ')}.`;
  } else {
    predictedReception = 'negative';
    reasoning = `This message is likely to land poorly. ${warningFlags.slice(0, 3).join('. ')}. Consider a significant rewrite.`;
  }

  // Generate suggested rewording if there are issues
  let suggestedRewording: string | undefined;
  if (warningFlags.length > 0 && score < 0.6) {
    suggestedRewording = generateSoftenedVersion(message);
  }

  log.debug(
    { userId, contactName, score, predictedReception, warningCount: warningFlags.length },
    '🎯 Reception prediction generated'
  );

  return {
    confidence: Math.abs(score - 0.5) * 2, // Higher when further from neutral
    predictedReception,
    reasoning,
    suggestedRewording,
    warningFlags,
  };
}

/**
 * Predict reception without a specific contact (general patterns only).
 */
export function predictGeneralReception(message: string): ReceptionPrediction {
  let score = 0.5;
  const warningFlags: string[] = [];

  // Check generic triggers
  for (const { pattern, reason } of DEFENSIVE_TRIGGERS) {
    if (pattern.test(message)) {
      score -= 0.15;
      warningFlags.push(reason);
    }
  }

  // Check positive patterns
  for (const { pattern, boost } of POSITIVE_PATTERNS) {
    if (pattern.test(message)) {
      score += boost;
    }
  }

  score = Math.max(0, Math.min(1, score));

  let predictedReception: ReceptionPrediction['predictedReception'];
  let reasoning: string;

  if (score >= 0.7) {
    predictedReception = 'positive';
    reasoning =
      'This message uses good communication practices. Should land well with most people.';
  } else if (score >= 0.5) {
    predictedReception = 'neutral';
    reasoning = `Message is okay. ${warningFlags.length > 0 ? `Consider: ${warningFlags[0]}` : ''}`;
  } else if (score >= 0.3) {
    predictedReception = 'defensive';
    reasoning = `May trigger defensiveness. ${warningFlags.slice(0, 2).join('. ')}.`;
  } else {
    predictedReception = 'negative';
    reasoning = `Likely to land poorly. ${warningFlags.slice(0, 3).join('. ')}.`;
  }

  return {
    confidence: Math.abs(score - 0.5) * 2,
    predictedReception,
    reasoning,
    suggestedRewording: warningFlags.length > 0 ? generateSoftenedVersion(message) : undefined,
    warningFlags,
  };
}

// ============================================================================
// REWORDING
// ============================================================================

/**
 * Generate a softened version of the message.
 */
export function generateSoftenedVersion(message: string): string {
  let softened = message;

  // Apply softening alternatives
  for (const [trigger, alternative] of Object.entries(SOFTENING_ALTERNATIVES)) {
    const pattern = new RegExp(`\\b${escapeRegex(trigger)}\\b`, 'gi');
    softened = softened.replace(pattern, alternative);
  }

  // If still the same, add opening softener
  if (softened === message && !message.toLowerCase().startsWith('i ')) {
    // Add a softening opener
    const openers = [
      'I wanted to share something with you. ',
      "I've been thinking about this, and ",
      'Help me understand - ',
    ];
    const opener = openers[Math.floor(Math.random() * openers.length)];
    softened = opener + message.charAt(0).toLowerCase() + message.slice(1);
  }

  return softened;
}

/**
 * Generate alternative phrasings for a specific trigger phrase.
 */
export function generateAlternatives(triggerPhrase: string): string[] {
  const lower = triggerPhrase.toLowerCase();
  const alternatives: string[] = [];

  // Direct alternatives
  for (const [trigger, alternative] of Object.entries(SOFTENING_ALTERNATIVES)) {
    if (lower.includes(trigger)) {
      alternatives.push(triggerPhrase.replace(new RegExp(trigger, 'i'), alternative));
    }
  }

  // General patterns
  if (lower.includes('you')) {
    // Convert to I-statement
    alternatives.push(triggerPhrase.replace(/you\b/gi, 'I').replace(/your\b/gi, 'my'));
  }

  if (alternatives.length === 0) {
    // Fallback: add softening prefix
    alternatives.push(`I feel like ${triggerPhrase.toLowerCase()}`);
    alternatives.push(`It seems like ${triggerPhrase.toLowerCase()}`);
  }

  return alternatives.slice(0, 3);
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Build context for LLM about reception prediction capabilities.
 */
export function buildReceptionPredictorContext(): string {
  return `[RECEPTION PREDICTOR - Better Than Human]
You can predict how messages will land with specific people.

**When helping with difficult messages:**
- Check for defensive triggers ("you always", "you never", "you need to")
- Suggest I-statements instead of you-statements
- Consider the recipient's known communication preferences
- Offer softened alternatives when needed

**Red flags to watch for:**
- Blame language ("it's your fault", "you made me")
- Absolutist language ("always", "never")
- Accusatory questions ("why didn't you", "what's wrong with you")
- Directive language ("you should", "you need to", "you have to")

**Better patterns:**
- I-statements ("I feel", "I noticed", "I need")
- Questions ("What do you think?", "Would you consider?")
- Acknowledgment ("I understand", "I hear you")
- Collaborative framing ("What if we", "Can we talk about")`;
}

// ============================================================================
// HELPERS
// ============================================================================

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function detectMessageTone(message: string): 'formal' | 'casual' | 'warm' | 'direct' | 'indirect' {
  const lower = message.toLowerCase();

  // Formal indicators
  if (
    /\b(dear|sincerely|regards|respectfully|kindly)\b/.test(lower) ||
    /\b(would you be so kind|i would appreciate)\b/.test(lower)
  ) {
    return 'formal';
  }

  // Direct indicators
  if (/\b(i need|i want|please do|you must)\b/.test(lower) || message.split('.').length <= 2) {
    return 'direct';
  }

  // Warm indicators
  if (
    /\b(love|care|appreciate|thinking of you|miss you)\b/.test(lower) ||
    /❤️|😊|💕|🤗/.test(message)
  ) {
    return 'warm';
  }

  // Indirect indicators
  if (/\b(maybe|perhaps|might|could possibly|if you have time)\b/.test(lower)) {
    return 'indirect';
  }

  return 'casual';
}

// ============================================================================
// EXPORTS
// ============================================================================

export const receptionPredictor = {
  predict: predictReception,
  predictGeneral: predictGeneralReception,
  soften: generateSoftenedVersion,
  alternatives: generateAlternatives,
  buildContext: buildReceptionPredictorContext,
};

export default receptionPredictor;
