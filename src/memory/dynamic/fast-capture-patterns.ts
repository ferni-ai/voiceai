/**
 * Fast Capture - detection patterns
 *
 * FAST DETECTION PATTERNS (Regex-based, < 10ms): relationship words, emotion,
 * date, relationship, topic and linking patterns used by fast-capture.ts.
 *
 * @module memory/dynamic/fast-capture-patterns
 */

/** Common relationship words that indicate a person mention */
export const RELATIONSHIP_WORDS = [
  'mom',
  'dad',
  'mother',
  'father',
  'brother',
  'sister',
  'wife',
  'husband',
  'partner',
  'girlfriend',
  'boyfriend',
  'son',
  'daughter',
  'grandma',
  'grandpa',
  'aunt',
  'uncle',
  'cousin',
  'friend',
  'coworker',
  'boss',
  'therapist',
  'doctor',
  'neighbor',
  'roommate',
  'ex',
  'fiancé',
  'fiancée',
];

/** Emotion keywords with intensity */
export const EMOTION_PATTERNS: Array<{
  pattern: RegExp;
  emotion: string;
  intensity: 'low' | 'medium' | 'high';
}> = [
  // High intensity negative
  {
    pattern: /\b(furious|devastated|terrified|heartbroken|enraged)\b/i,
    emotion: 'distress',
    intensity: 'high',
  },
  {
    pattern: /\b(can't take|breaking down|falling apart|at my limit)\b/i,
    emotion: 'overwhelm',
    intensity: 'high',
  },

  // Medium intensity negative
  {
    pattern: /\b(frustrated|annoyed|worried|anxious|stressed|upset)\b/i,
    emotion: 'stress',
    intensity: 'medium',
  },
  { pattern: /\b(sad|down|lonely|disappointed|hurt)\b/i, emotion: 'sadness', intensity: 'medium' },

  // Low intensity negative
  {
    pattern: /\b(kind of|a bit|slightly|somewhat)\s+(worried|stressed|anxious)/i,
    emotion: 'concern',
    intensity: 'low',
  },

  // High intensity positive
  {
    pattern: /\b(ecstatic|thrilled|overjoyed|elated|incredible)\b/i,
    emotion: 'joy',
    intensity: 'high',
  },
  {
    pattern: /\b(best day|amazing news|so happy|couldn't be happier)\b/i,
    emotion: 'celebration',
    intensity: 'high',
  },

  // Medium intensity positive
  {
    pattern: /\b(happy|excited|grateful|proud|relieved)\b/i,
    emotion: 'positive',
    intensity: 'medium',
  },
  { pattern: /\b(good|great|nice|wonderful)\b/i, emotion: 'contentment', intensity: 'medium' },

  // Low intensity positive
  { pattern: /\b(okay|fine|not bad|alright)\b/i, emotion: 'neutral', intensity: 'low' },
];

/** Date patterns for important moments */
export const DATE_PATTERNS: Array<{
  pattern: RegExp;
  type: 'absolute' | 'relative' | 'recurring';
}> = [
  // Absolute dates
  {
    pattern:
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?\b/i,
    type: 'absolute',
  },
  { pattern: /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/, type: 'absolute' },

  // Relative dates
  { pattern: /\b(tomorrow|yesterday|today|tonight)\b/i, type: 'relative' },
  {
    pattern:
      /\b(next|this|last)\s+(week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    type: 'relative',
  },
  { pattern: /\b(in|after)\s+(\d+|a|an)\s+(day|week|month|year)s?\b/i, type: 'relative' },

  // Recurring
  {
    pattern:
      /\b(every|each)\s+(day|week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    type: 'recurring',
  },
  { pattern: /\b(birthday|anniversary|holiday)\b/i, type: 'recurring' },
];

/** Relationship patterns */
export const RELATIONSHIP_PATTERNS = [
  /my\s+(\w+)'s\s+(\w+)/i, // "my mom's birthday"
  /(\w+)\s+is\s+my\s+(\w+)/i, // "Sarah is my sister"
  /(\w+),?\s+(?:who is|who's)\s+my\s+(\w+)/i, // "Mike, who is my brother"
  /(?:told|called|texted|emailed|talked to|met with)\s+(?:my\s+)?(\w+)/i, // "told my mom"
];

/** Topic hint patterns */
export const TOPIC_PATTERNS: Array<{ pattern: RegExp; topic: string }> = [
  { pattern: /\b(work|job|career|office|boss|meeting|project|deadline)\b/i, topic: 'work' },
  { pattern: /\b(health|doctor|sick|pain|medication|symptoms|diagnosis)\b/i, topic: 'health' },
  { pattern: /\b(relationship|dating|marriage|divorce|partner)\b/i, topic: 'relationships' },
  { pattern: /\b(money|financial|debt|bills|savings|budget|rent|mortgage)\b/i, topic: 'finances' },
  { pattern: /\b(family|mom|dad|kids|parents|siblings)\b/i, topic: 'family' },
  { pattern: /\b(stress|anxiety|depression|therapy|mental health)\b/i, topic: 'mental_health' },
  { pattern: /\b(sleep|tired|exhausted|insomnia|rest)\b/i, topic: 'sleep' },
  { pattern: /\b(exercise|gym|workout|run|fitness)\b/i, topic: 'fitness' },
  { pattern: /\b(goal|dream|ambition|aspiration|future)\b/i, topic: 'goals' },
  { pattern: /\b(hobby|creative|art|music|writing|project)\b/i, topic: 'creative' },
];

/** Account linking trigger patterns */
export const LINKING_PATTERNS: Array<{
  pattern: RegExp;
  type: 'email_mention' | 'app_mention' | 'web_mention' | 'account_mention';
  extractGroup?: number;
}> = [
  // Email mentions
  {
    pattern: /my\s+email\s+is\s+([\w.+-]+@[\w.-]+\.\w{2,})/i,
    type: 'email_mention',
    extractGroup: 1,
  },
  {
    pattern: /email\s+(?:me\s+)?at\s+([\w.+-]+@[\w.-]+\.\w{2,})/i,
    type: 'email_mention',
    extractGroup: 1,
  },
  { pattern: /([\w.+-]+@[\w.-]+\.\w{2,})/i, type: 'email_mention', extractGroup: 1 }, // Plain email mention

  // App/web account mentions
  { pattern: /i\s+(?:also\s+)?use\s+the\s+(?:ferni\s+)?app/i, type: 'app_mention' },
  { pattern: /i\s+have\s+an?\s+(?:ferni\s+)?account/i, type: 'account_mention' },
  {
    pattern: /i'm\s+(?:also\s+)?(?:on|using)\s+(?:the\s+)?(?:ferni\s+)?(?:app|website)/i,
    type: 'app_mention',
  },
  {
    pattern: /we'?ve\s+(?:talked|chatted|spoken)\s+(?:on\s+)?(?:the\s+)?(?:website|web|app)/i,
    type: 'web_mention',
  },
  {
    pattern:
      /i\s+(?:usually\s+)?(?:use|call)\s+(?:you\s+)?(?:from\s+)?(?:the\s+)?(?:website|web|app)/i,
    type: 'web_mention',
  },
  { pattern: /my\s+(?:phone\s+)?number\s+is\s+different/i, type: 'account_mention' },
  {
    pattern: /this\s+is\s+(?:my|a)\s+(?:new|different)\s+(?:phone|number)/i,
    type: 'account_mention',
  },
];
