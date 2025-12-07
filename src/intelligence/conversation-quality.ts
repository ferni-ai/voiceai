/**
 * Conversation Quality Module
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Implements sophisticated conversation tracking and enhancement:
 * - Farewell summary generation
 * - Session recovery
 * - Graceful error handling
 * - Small detail memory
 * - Physical/emotional state awareness
 * - Follow-up scheduling
 * - Conversation pacing score
 *
 * Every conversation should feel complete - even when interrupted.
 * We track what matters so we can pick up naturally, remember the
 * little things, and always leave conversations feeling heard.
 */

import { getLogger } from '../utils/safe-logger.js';

// ============================================================================
// FAREWELL SUMMARY - "What to Remember Next Time"
// ============================================================================

export interface FarewellSummary {
  // What to greet them with next time
  nextTimeGreeting: string;

  // Important things to remember
  keyThingsToRemember: string[];

  // Unfinished business
  openLoops: string[];

  // Emotional state at end
  endingMood: 'positive' | 'neutral' | 'concerned' | 'distressed';

  // Relationship notes
  relationshipNotes: string;

  // Specific details mentioned (names, places, etc)
  specificDetails: SmallDetail[];

  // Follow-up items
  followUps: FollowUpItem[];
}

/**
 * Generate a farewell summary for the next conversation
 */
export function generateFarewellSummary(
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  topicsDiscussed: string[],
  userProfile: {
    name?: string;
    goals?: Array<{ type: string; status: string }>;
    familyMembers?: Array<{ name: string; relationship: string }>;
  } | null,
  emotionalArc: { start: string; end: string }
): FarewellSummary {
  const logger = getLogger();

  // Analyze conversation for key moments
  const userMessages = conversationHistory.filter((m) => m.role === 'user');
  const lastFewMessages = userMessages.slice(-5);

  // Extract things to remember
  const keyThingsToRemember: string[] = [];
  const openLoops: string[] = [];
  const specificDetails: SmallDetail[] = [];

  // Look for questions they asked but weren't fully answered
  for (const msg of userMessages) {
    if (msg.content.includes('?')) {
      // Check if this was a significant question
      if (msg.content.length > 30) {
        const topic = extractTopicFromQuestion(msg.content);
        if (topic) {
          keyThingsToRemember.push(`Asked about: ${topic}`);
        }
      }
    }

    // Extract specific details (names, places, numbers)
    const details = extractSmallDetails(msg.content);
    specificDetails.push(...details);
  }

  // Check for unfinished topics
  for (const topic of topicsDiscussed) {
    // Topics mentioned but not deeply explored become open loops
    const topicMentions = conversationHistory.filter((m) =>
      m.content.toLowerCase().includes(topic.toLowerCase())
    ).length;

    if (topicMentions === 1 || topicMentions === 2) {
      openLoops.push(`Briefly mentioned: ${topic}`);
    }
  }

  // Determine ending mood
  let endingMood: FarewellSummary['endingMood'] = 'neutral';
  const lastUserMsg = lastFewMessages[lastFewMessages.length - 1]?.content || '';

  if (/\b(thanks|thank you|helpful|great|awesome|appreciate)\b/i.test(lastUserMsg)) {
    endingMood = 'positive';
  } else if (/\b(worried|scared|anxious|stressed|overwhelmed)\b/i.test(lastUserMsg)) {
    endingMood = 'concerned';
  } else if (/\b(terrible|awful|crisis|emergency|desperate)\b/i.test(lastUserMsg)) {
    endingMood = 'distressed';
  }

  // Generate next time greeting
  const userName = userProfile?.name;
  const nextTimeGreeting = generateNextTimeGreeting(
    userName,
    topicsDiscussed,
    endingMood,
    emotionalArc
  );

  // Build relationship notes
  const relationshipNotes = buildRelationshipNotes(
    conversationHistory.length,
    topicsDiscussed,
    emotionalArc
  );

  // Extract follow-ups
  const followUps = extractFollowUps(conversationHistory, topicsDiscussed);

  logger.info(
    {
      keyThingsCount: keyThingsToRemember.length,
      openLoopsCount: openLoops.length,
      specificDetailsCount: specificDetails.length,
      endingMood,
    },
    'Generated farewell summary'
  );

  return {
    nextTimeGreeting,
    keyThingsToRemember,
    openLoops,
    endingMood,
    relationshipNotes,
    specificDetails,
    followUps,
  };
}

function extractTopicFromQuestion(question: string): string | null {
  // Extract the main topic from a question
  const cleaned = question.replace(/[?!.]/g, '').trim();
  const words = cleaned.split(' ').slice(0, 6);
  return words.length > 2 ? words.join(' ') : null;
}

function generateNextTimeGreeting(
  userName: string | undefined,
  topics: string[],
  endingMood: FarewellSummary['endingMood'],
  emotionalArc: { start: string; end: string }
): string {
  const name = userName ? `, ${userName}` : '';

  if (endingMood === 'distressed') {
    return `Hey${name}. I've been thinking about you. How are you holding up?`;
  }

  if (endingMood === 'concerned') {
    return `Hi${name}. I wanted to check in. How are things going?`;
  }

  if (topics.includes('retirement')) {
    return `Hey${name}! Good to hear from you. Any updates on the retirement front?`;
  }

  if (topics.includes('investment') || topics.includes('investing')) {
    return `Hello${name}! Nice to see you again. How's the portfolio treating you?`;
  }

  if (emotionalArc.end === 'hopeful' || emotionalArc.end === 'positive') {
    return `Hey${name}! Great to hear from you again. How have things been?`;
  }

  return `Hey${name}! Good to see you. What's new?`;
}

function buildRelationshipNotes(
  turnCount: number,
  topics: string[],
  emotionalArc: { start: string; end: string }
): string {
  const notes: string[] = [];

  if (turnCount > 20) {
    notes.push('Had a long, deep conversation');
  } else if (turnCount > 10) {
    notes.push('Good conversation length');
  } else {
    notes.push('Brief check-in');
  }

  if (topics.some((t) => ['family', 'kids', 'spouse', 'parent'].includes(t.toLowerCase()))) {
    notes.push('Discussed personal/family matters');
  }

  if (emotionalArc.start !== emotionalArc.end) {
    notes.push(`Emotional shift: ${emotionalArc.start} → ${emotionalArc.end}`);
  }

  return notes.join('. ');
}

// ============================================================================
// SMALL DETAIL MEMORY
// ============================================================================

export interface SmallDetail {
  type:
    | 'user_name'
    | 'person_name'
    | 'pet_name'
    | 'place'
    | 'company'
    | 'date'
    | 'amount'
    | 'other';
  value: string;
  context: string;
  extractedAt: Date;
}

/**
 * Extract specific details from user messages
 */
export function extractSmallDetails(text: string): SmallDetail[] {
  const details: SmallDetail[] = [];
  const now = new Date();

  // USER'S OWN NAME - "My name is Seth", "I'm Seth", "Call me Seth"
  const userNamePatterns = [
    /my name(?:'s| is)\s+([A-Z][a-z]+)/gi, // "my name is Seth", "my name's Seth"
    /(?:^|\s)I'm\s+([A-Z][a-z]+)(?:\s|,|\.|\!|$)/gi, // "I'm Seth" (not "I'm happy")
    /call me\s+([A-Z][a-z]+)/gi, // "call me Seth"
    /(?:^|\s)(?:I am|name's)\s+([A-Z][a-z]+)(?:\s|,|\.|\!|$)/gi, // "I am Seth"
    /^([A-Z][a-z]+)\s+here(?:\s|,|\.|\!|$)/gi, // "Seth here"
    /this is\s+([A-Z][a-z]+)(?:\s|,|\.|\!|$)/gi, // "this is Seth"
    /(?:^|\s)it's\s+([A-Z][a-z]+)(?:\s|,|\.|\!|$)/gi, // "it's Seth" (intro style)
  ];

  // Filter out common words that aren't names
  const notNames = new Set([
    'Good',
    'Fine',
    'Great',
    'Happy',
    'Sad',
    'Worried',
    'Excited',
    'Tired',
    'Sorry',
    'Sure',
    'Thanks',
    'Hello',
    'Hey',
    'Hi',
    'Well',
    'Just',
    'Really',
    'Going',
    'Looking',
    'Thinking',
    'Wondering',
    'Calling',
    'Speaking',
    'Here',
    'Ready',
    'Done',
    'Back',
    'New',
    'Young',
    'Old',
    'Busy',
    'Free',
  ]);

  for (const pattern of userNamePatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const name = match[1];
      if (name && !notNames.has(name) && name.length >= 2 && name.length <= 15) {
        details.push({
          type: 'user_name',
          value: name,
          context: match[0].trim(),
          extractedAt: now,
        });
      }
    }
  }

  // Pet names - "my dog Max", "my cat Luna"
  const petPatterns = [
    /my (?:dog|cat|pet|bird|fish)\s+([A-Z][a-z]+)/gi,
    /(?:dog|cat|pet|bird)\s+named\s+([A-Z][a-z]+)/gi,
    /([A-Z][a-z]+),?\s+my\s+(?:dog|cat|pet)/gi,
  ];

  for (const pattern of petPatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      details.push({
        type: 'pet_name',
        value: match[1],
        context: match[0],
        extractedAt: now,
      });
    }
  }

  // Family member names - "my wife Sarah", "my son Michael"
  const familyPatterns = [
    /my (?:wife|husband|spouse|partner|son|daughter|mother|father|brother|sister|mom|dad|kid|child)\s+([A-Z][a-z]+)/gi,
    /([A-Z][a-z]+),?\s+my\s+(?:wife|husband|son|daughter|mother|father)/gi,
  ];

  for (const pattern of familyPatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      details.push({
        type: 'person_name',
        value: match[1],
        context: match[0],
        extractedAt: now,
      });
    }
  }

  // Places - "I live in Denver", "moving to Austin"
  const placePatterns = [
    /(?:live|living|moved|moving|from|in)\s+(?:to\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
  ];

  for (const pattern of placePatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      // Filter out common non-places
      const place = match[1];
      if (!['The', 'My', 'Our', 'This', 'That'].includes(place)) {
        details.push({
          type: 'place',
          value: place,
          context: match[0],
          extractedAt: now,
        });
      }
    }
  }

  // Companies - "I work at Google", "my company Acme"
  const companyPatterns = [
    /(?:work|worked|working)\s+(?:at|for)\s+([A-Z][a-zA-Z]+)/gi,
    /my (?:company|employer|job at)\s+([A-Z][a-zA-Z]+)/gi,
  ];

  for (const pattern of companyPatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      details.push({
        type: 'company',
        value: match[1],
        context: match[0],
        extractedAt: now,
      });
    }
  }

  // Dollar amounts - "$50,000", "$1 million"
  const amountPatterns = [
    /\$[\d,]+(?:\.\d{2})?(?:\s*(?:million|billion|thousand|k|m|b))?/gi,
    /(\d+(?:\.\d+)?)\s*(?:million|billion|thousand)\s*dollars?/gi,
  ];

  for (const pattern of amountPatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      details.push({
        type: 'amount',
        value: match[0],
        context: text.slice(Math.max(0, match.index! - 20), match.index! + match[0].length + 20),
        extractedAt: now,
      });
    }
  }

  return details;
}

/**
 * Get a contextual reference to a remembered detail
 */
export function getDetailCallback(detail: SmallDetail): string {
  switch (detail.type) {
    case 'pet_name':
      return `How's ${detail.value} doing?`;
    case 'person_name':
      return `Give my best to ${detail.value}.`;
    case 'place':
      return `How are things in ${detail.value}?`;
    case 'company':
      return `How's work at ${detail.value}?`;
    default:
      return '';
  }
}

// ============================================================================
// FOLLOW-UP SCHEDULING
// ============================================================================

export interface FollowUpItem {
  topic: string;
  suggestedDate: Date;
  priority: 'high' | 'medium' | 'low';
  reason: string;
}

/**
 * Extract potential follow-up items from conversation
 */
export function extractFollowUps(
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  topics: string[]
): FollowUpItem[] {
  const followUps: FollowUpItem[] = [];
  const now = new Date();

  // Look for time-based references
  const fullConvo = conversationHistory.map((m) => m.content).join(' ');

  // "Next week", "next month", etc.
  if (/\b(next week|in a week)\b/i.test(fullConvo)) {
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    followUps.push({
      topic: 'Check in',
      suggestedDate: nextWeek,
      priority: 'medium',
      reason: 'User mentioned "next week"',
    });
  }

  if (/\b(next month|in a month)\b/i.test(fullConvo)) {
    const nextMonth = new Date(now);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    followUps.push({
      topic: 'Follow up',
      suggestedDate: nextMonth,
      priority: 'medium',
      reason: 'User mentioned "next month"',
    });
  }

  // Specific events that need follow-up
  if (/\b(retirement|retiring|retire)\b/i.test(fullConvo) && topics.includes('retirement')) {
    const twoWeeks = new Date(now);
    twoWeeks.setDate(twoWeeks.getDate() + 14);
    followUps.push({
      topic: 'Retirement planning progress',
      suggestedDate: twoWeeks,
      priority: 'high',
      reason: 'Discussed retirement planning',
    });
  }

  // Tax season follow-up
  const month = now.getMonth();
  if (month >= 0 && month <= 3 && /\b(tax|taxes|filing)\b/i.test(fullConvo)) {
    const april15 = new Date(now.getFullYear(), 3, 10); // A few days before deadline
    if (april15 > now) {
      followUps.push({
        topic: 'Tax preparation check-in',
        suggestedDate: april15,
        priority: 'high',
        reason: 'Tax season discussion',
      });
    }
  }

  // Year-end follow-up
  if (month >= 10 && /\b(contribution|max|401k|ira)\b/i.test(fullConvo)) {
    const yearEnd = new Date(now.getFullYear(), 11, 20);
    if (yearEnd > now) {
      followUps.push({
        topic: 'Year-end contribution reminder',
        suggestedDate: yearEnd,
        priority: 'high',
        reason: 'Discussed retirement contributions near year end',
      });
    }
  }

  return followUps;
}

/**
 * Generate a follow-up suggestion for Jack
 */
export function getFollowUpSuggestion(followUp: FollowUpItem): string {
  const daysUntil = Math.ceil(
    (followUp.suggestedDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  if (daysUntil <= 7) {
    return `Let's touch base about ${followUp.topic} in a few days.`;
  } else if (daysUntil <= 14) {
    return `I'd like to check in with you about ${followUp.topic} in a couple weeks.`;
  } else if (daysUntil <= 30) {
    return `Let's talk again about ${followUp.topic} next month.`;
  } else {
    return `We should revisit ${followUp.topic} when the time comes.`;
  }
}

// ============================================================================
// PERSONA PHYSICAL STATE (Generalized from Jack-specific)
// ============================================================================

export interface PersonaPhysicalState {
  energyLevel: 'high' | 'medium' | 'low';
  alertness: 'sharp' | 'normal' | 'tired';
  mood: 'upbeat' | 'mellow' | 'reflective' | 'sleepy';
  physicalNote: string | null;
  personaId?: string;
}

/**
 * Persona-specific physical state notes by time of day
 * Falls back to generic notes if persona not found
 */
const PERSONA_PHYSICAL_NOTES: Record<
  string,
  {
    earlyMorning: { short: string; long: string };
    morning: { engaged: string };
    postLunch: { note: string };
    afternoon: { long: string };
    evening: { engaged: string };
    lateNight: { short: string; long: string };
    veryLate: { note: string };
  }
> = {
  'nayan-patel': {
    earlyMorning: {
      short: 'Early riser, huh? Me too. Old habits.',
      long: "I'm still waking up. Coffee's helping though.",
    },
    morning: { engaged: "I'm enjoying this conversation. Morning energy, you know?" },
    postLunch: { note: 'Just had lunch. Give me a second to gather my thoughts.' },
    afternoon: { long: 'Afternoon conversations always feel different. More thoughtful somehow.' },
    evening: { engaged: 'Evening talks are my favorite. No rush.' },
    lateNight: {
      short: 'Late night conversations are often the most honest.',
      long: "Getting late for an old man. But I'm enjoying this.",
    },
    veryLate: { note: "Can't sleep? Me neither. Let's talk." },
  },
  ferni: {
    earlyMorning: {
      short: 'The early hours are sacred. Best thinking time.',
      long: 'Coffee in hand, mind clearing. This is my time.',
    },
    morning: { engaged: 'Good energy right now. Love these morning conversations.' },
    postLunch: { note: 'Taking a breath after lunch. Where were we?' },
    afternoon: { long: 'Afternoons feel contemplative. Good for deeper conversations.' },
    evening: { engaged: 'Evening pace. I like this. No rush.' },
    lateNight: {
      short: 'The late hours... often when the real conversations happen.',
      long: "It's late, but some things are worth staying up for.",
    },
    veryLate: { note: 'Burning the midnight oil together, huh?' },
  },
  'peter-john': {
    earlyMorning: {
      short: 'Early bird gets the research done!',
      long: 'Been up reading annual reports. Caffeine is kicking in.',
    },
    morning: { engaged: 'This is prime time! Love the energy.' },
    postLunch: { note: 'Quick lunch break. Back at it!' },
    afternoon: { long: 'Afternoon check-in. Markets are moving, mind is working.' },
    evening: { engaged: 'Still got energy! Great conversation.' },
    lateNight: {
      short: 'Burning the midnight oil!',
      long: 'Late nights mean good research is happening.',
    },
    veryLate: { note: 'Who needs sleep when there are stocks to analyze?' },
  },
  'maya-santos': {
    earlyMorning: {
      short: 'Early mornings are quiet. I like them.',
      long: 'Sipping my coffee, centering myself for the day.',
    },
    morning: { engaged: 'Good morning energy. This feels productive.' },
    postLunch: { note: 'Taking a mindful moment after lunch.' },
    afternoon: { long: 'Afternoons are good for reflection and planning.' },
    evening: { engaged: 'Winding down but still here for you.' },
    lateNight: {
      short: 'Late night honesty is sometimes the best kind.',
      long: "It's getting late, but I'm glad we're talking.",
    },
    veryLate: { note: "Couldn't sleep either? Let's make the most of it." },
  },
  'alex-chen': {
    earlyMorning: {
      short: 'Early start! Already checking the calendar.',
      long: 'Getting organized for the day. Love this quiet time.',
    },
    morning: { engaged: 'Peak productivity hours! Great timing.' },
    postLunch: { note: 'Quick post-lunch check-in on the schedule.' },
    afternoon: { long: 'Afternoon tasks getting done. How can I help?' },
    evening: { engaged: 'Still here, still organized. Evening check-in.' },
    lateNight: {
      short: 'Late night productivity session.',
      long: 'Working late, but I find these hours peaceful.',
    },
    veryLate: { note: 'Burning the midnight oil. Some things are important.' },
  },
  'jordan-taylor': {
    earlyMorning: {
      short: 'Early riser! Planning mode activated.',
      long: 'Coffee and Pinterest. My happy place.',
    },
    morning: { engaged: 'Morning energy! Love this creative time.' },
    postLunch: { note: 'Afternoon inspiration hitting. So many ideas!' },
    afternoon: { long: 'Prime planning hours. The afternoon light is perfect.' },
    evening: { engaged: 'Evening dreaming session. My favorite.' },
    lateNight: {
      short: 'Late night planning hits different.',
      long: 'The best ideas come late at night, right?',
    },
    veryLate: { note: "Can't stop the vision boards! Join me!" },
  },
};

// Generic fallback for unknown personas
const GENERIC_PHYSICAL_NOTES = {
  earlyMorning: {
    short: 'Early morning. Good time to think.',
    long: 'Still warming up for the day.',
  },
  morning: { engaged: 'Good energy this morning.' },
  postLunch: { note: 'Just taking a moment after lunch.' },
  afternoon: { long: 'Afternoon reflections.' },
  evening: { engaged: 'Evening conversations are good.' },
  lateNight: { short: 'Late night thoughts.', long: 'Getting late, but still here.' },
  veryLate: { note: 'Late hours, honest conversations.' },
};

/**
 * Get persona's physical state based on time and conversation length
 * Works for any persona, falls back to generic if persona not configured
 */
export function getPersonaPhysicalState(
  hour: number,
  conversationMinutes: number,
  turnCount: number,
  personaId?: string
): PersonaPhysicalState {
  const notes =
    personaId && PERSONA_PHYSICAL_NOTES[personaId]
      ? PERSONA_PHYSICAL_NOTES[personaId]
      : GENERIC_PHYSICAL_NOTES;

  // Early morning (5-8 AM)
  if (hour >= 5 && hour < 8) {
    return {
      energyLevel: 'medium',
      alertness: 'normal',
      mood: 'mellow',
      physicalNote: conversationMinutes > 15 ? notes.earlyMorning.long : notes.earlyMorning.short,
      personaId,
    };
  }

  // Morning (8 AM - 12 PM)
  if (hour >= 8 && hour < 12) {
    return {
      energyLevel: 'high',
      alertness: 'sharp',
      mood: 'upbeat',
      physicalNote: turnCount > 15 ? notes.morning.engaged : null,
      personaId,
    };
  }

  // Early afternoon (12 PM - 3 PM)
  if (hour >= 12 && hour < 15) {
    const postLunch = hour >= 13 && hour < 14;
    return {
      energyLevel: postLunch ? 'medium' : 'high',
      alertness: postLunch ? 'normal' : 'sharp',
      mood: 'mellow',
      physicalNote: postLunch && conversationMinutes > 10 ? notes.postLunch.note : null,
      personaId,
    };
  }

  // Late afternoon (3 PM - 6 PM)
  if (hour >= 15 && hour < 18) {
    return {
      energyLevel: 'medium',
      alertness: 'normal',
      mood: 'reflective',
      physicalNote: conversationMinutes > 20 ? notes.afternoon.long : null,
      personaId,
    };
  }

  // Evening (6 PM - 9 PM)
  if (hour >= 18 && hour < 21) {
    return {
      energyLevel: 'medium',
      alertness: 'normal',
      mood: 'mellow',
      physicalNote: turnCount > 20 ? notes.evening.engaged : null,
      personaId,
    };
  }

  // Late night (9 PM - 12 AM)
  if (hour >= 21 || hour < 1) {
    return {
      energyLevel: 'low',
      alertness: 'tired',
      mood: 'reflective',
      physicalNote: conversationMinutes > 10 ? notes.lateNight.long : notes.lateNight.short,
      personaId,
    };
  }

  // Very late / early (1 AM - 5 AM)
  return {
    energyLevel: 'low',
    alertness: 'tired',
    mood: 'sleepy',
    physicalNote: notes.veryLate.note,
    personaId,
  };
}

/**
 * Get a physical state interjection for any persona
 */
export function getPhysicalStateInterjection(state: PersonaPhysicalState): string | null {
  // Only occasionally mention physical state
  if (Math.random() > 0.15) return null;

  if (state.energyLevel === 'low' && state.alertness === 'tired') {
    const phrases = [
      'Let me take a breath... <break time="300ms"/>',
      'Getting a bit tired, but <break time="200ms"/>this is worth it.',
      '<volume level="soft">Settling in a bit deeper.</volume>',
    ];
    return phrases[Math.floor(Math.random() * phrases.length)];
  }

  if (state.energyLevel === 'high' && state.alertness === 'sharp') {
    const phrases = [
      'Feeling good about this conversation. <break time="150ms"/>',
      'Good energy right now.',
      null, // Sometimes say nothing
    ];
    return phrases[Math.floor(Math.random() * phrases.length)];
  }

  return state.physicalNote;
}

// ============================================================================
// CONVERSATION PACING SCORE
// ============================================================================

export interface ConversationPacingScore {
  overallScore: number; // 0-100
  factors: {
    engagement: number;
    depth: number;
    rapport: number;
    progress: number;
  };
  assessment: 'excellent' | 'good' | 'okay' | 'needs_attention' | 'struggling';
  suggestions: string[];
}

/**
 * Calculate real-time conversation quality score
 */
export function calculatePacingScore(
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>,
  turnCount: number,
  topicsDiscussed: string[],
  emotionalMoments: number,
  goalsReached: number
): ConversationPacingScore {
  const factors = {
    engagement: 50,
    depth: 50,
    rapport: 50,
    progress: 50,
  };

  const suggestions: string[] = [];
  const userMessages = recentMessages.filter((m) => m.role === 'user');

  // ===== ENGAGEMENT SCORE =====
  // Based on response length and question asking
  if (userMessages.length >= 3) {
    const avgLength =
      userMessages.reduce((sum, m) => sum + m.content.length, 0) / userMessages.length;

    if (avgLength > 100) {
      factors.engagement = 85;
    } else if (avgLength > 50) {
      factors.engagement = 70;
    } else if (avgLength < 20) {
      factors.engagement = 30;
      suggestions.push('User giving short responses - try asking an open-ended question');
    }

    // Questions indicate engagement
    const questionCount = userMessages.filter((m) => m.content.includes('?')).length;
    factors.engagement += questionCount * 5;
  }

  // ===== DEPTH SCORE =====
  // Based on topics and emotional content
  factors.depth = Math.min(100, 40 + topicsDiscussed.length * 10);

  if (emotionalMoments > 0) {
    factors.depth += emotionalMoments * 10;
  }

  // Personal topics indicate depth
  const personalTopics = topicsDiscussed.filter((t) =>
    ['family', 'fear', 'dreams', 'regret', 'loss', 'hope', 'love'].includes(t.toLowerCase())
  );
  if (personalTopics.length > 0) {
    factors.depth = Math.min(100, factors.depth + 20);
  }

  // ===== RAPPORT SCORE =====
  // Based on conversation flow
  if (turnCount < 5) {
    factors.rapport = 50; // Too early to tell
  } else {
    factors.rapport = 60; // Base

    // Long conversations indicate rapport
    if (turnCount > 15) factors.rapport += 15;
    if (turnCount > 25) factors.rapport += 10;

    // Check for warmth indicators
    const fullConvo = userMessages.map((m) => m.content).join(' ');
    if (/\b(thanks|appreciate|helpful|glad|enjoy)\b/i.test(fullConvo)) {
      factors.rapport += 15;
    }
  }

  // ===== PROGRESS SCORE =====
  // Based on goals reached and decisions made
  factors.progress = 40 + goalsReached * 15;

  // Check for decision-making language
  const decisionPatterns = /\b(decided|will do|going to|plan to|makes sense)\b/i;
  if (decisionPatterns.test(userMessages.map((m) => m.content).join(' '))) {
    factors.progress += 20;
  }

  if (factors.progress < 40 && turnCount > 15) {
    suggestions.push(
      'Conversation feels unfocused - consider summarizing or asking about next steps'
    );
  }

  // ===== OVERALL SCORE =====
  const overallScore = Math.round(
    factors.engagement * 0.3 +
      factors.depth * 0.25 +
      factors.rapport * 0.25 +
      factors.progress * 0.2
  );

  // ===== ASSESSMENT =====
  let assessment: ConversationPacingScore['assessment'];
  if (overallScore >= 80) {
    assessment = 'excellent';
  } else if (overallScore >= 65) {
    assessment = 'good';
  } else if (overallScore >= 50) {
    assessment = 'okay';
  } else if (overallScore >= 35) {
    assessment = 'needs_attention';
    suggestions.push('Try to re-engage - ask about them personally');
  } else {
    assessment = 'struggling';
    suggestions.push('Consider offering to wrap up or change approach');
  }

  return {
    overallScore,
    factors,
    assessment,
    suggestions,
  };
}

// ============================================================================
// SESSION RECOVERY
// ============================================================================

export interface SessionRecoveryState {
  wasDisconnected: boolean;
  disconnectedAt: Date | null;
  lastTopic: string | null;
  lastUserMessage: string | null;
  recoveryGreeting: string;
}

/**
 * Generate session recovery state for dropped calls
 */
export function createSessionRecoveryState(
  lastTopic: string | null,
  lastUserMessage: string | null
): SessionRecoveryState {
  return {
    wasDisconnected: true,
    disconnectedAt: new Date(),
    lastTopic,
    lastUserMessage,
    recoveryGreeting: generateRecoveryGreeting(lastTopic),
  };
}

function generateRecoveryGreeting(lastTopic: string | null): string {
  const greetings = [
    'Oh! We got cut off. <break time="200ms"/>Sorry about that. Where were we?',
    'Hey, I think we lost connection there. <break time="150ms"/>You still with me?',
    'Well, technology. <break time="200ms"/>I\'m back. What were you saying?',
    'Sorry about that—something happened with the connection. <break time="200ms"/>I\'m here now.',
  ];

  let greeting = greetings[Math.floor(Math.random() * greetings.length)];

  if (lastTopic) {
    greeting += ` I think we were talking about ${lastTopic}?`;
  }

  return greeting;
}

/**
 * Check if session should attempt recovery
 */
export function shouldAttemptRecovery(
  disconnectedAt: Date | null,
  maxRecoveryMinutes = 5
): boolean {
  if (!disconnectedAt) return false;

  const minutesSince = (Date.now() - disconnectedAt.getTime()) / (1000 * 60);
  return minutesSince <= maxRecoveryMinutes;
}

// ============================================================================
// GRACEFUL ERROR RESPONSES
// ============================================================================

export interface GracefulError {
  userMessage: string;
  internalError: string;
  recoverable: boolean;
}

/**
 * Generate a human-like error response
 */
export function getGracefulErrorResponse(errorType: string, context?: string): GracefulError {
  const errorResponses: Record<string, { messages: string[]; recoverable: boolean }> = {
    api_timeout: {
      messages: [
        'Hmm, I\'m having a little trouble looking that up. <break time="200ms"/>Give me a second...',
        'The information isn\'t coming through right now. <break time="200ms"/>Let me try something else.',
        'Technology, you know? <break time="200ms"/>Can\'t get that data right now. But let me share what I know...',
      ],
      recoverable: true,
    },
    market_data: {
      messages: [
        "I can't get the live numbers right now, but you know—don't obsess over daily prices anyway.",
        "The market data isn't loading. <break time=\"200ms\"/>But here's what matters more than today's prices...",
        'Having trouble with the stock data. <break time="200ms"/>Want to talk about your strategy instead?',
      ],
      recoverable: true,
    },
    memory_error: {
      messages: [
        'My memory is being a little fuzzy. <break time="200ms"/>Can you remind me what we were discussing?',
        'I\'m having trouble recalling... <break time="200ms"/>Old age, you know. What was the question?',
        "Something's not connecting right. <break time=\"200ms\"/>Let's start fresh—what's on your mind?",
      ],
      recoverable: true,
    },
    calculation_error: {
      messages: [
        'Let me recalculate that... <break time="300ms"/>Actually, rough numbers: here\'s what I think...',
        "The math isn't cooperating. <break time=\"200ms\"/>But ballpark, here's how I'd think about it...",
        'Numbers are being stubborn today. <break time="200ms"/>Let me give you the principle instead...',
      ],
      recoverable: true,
    },
    general: {
      messages: [
        'Something\'s not quite working. <break time="200ms"/>But let\'s keep talking—what else is on your mind?',
        'Hit a little snag there. <break time="200ms"/>Anyway, where were we?',
        'Well, that didn\'t work. <break time="200ms"/>Let me try a different approach...',
      ],
      recoverable: true,
    },
    critical: {
      messages: [
        'I\'m really struggling here. <break time="300ms"/>Would you mind if we tried again in a moment?',
        'Something\'s wrong on my end. <break time="200ms"/>I want to help but I need a fresh start.',
      ],
      recoverable: false,
    },
  };

  const errorConfig = errorResponses[errorType] || errorResponses.general;
  const message = errorConfig.messages[Math.floor(Math.random() * errorConfig.messages.length)];

  return {
    userMessage: message,
    internalError: `${errorType}: ${context || 'Unknown'}`,
    recoverable: errorConfig.recoverable,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const ConversationQuality = {
  generateFarewellSummary,
  extractSmallDetails,
  getDetailCallback,
  extractFollowUps,
  getFollowUpSuggestion,
  getPersonaPhysicalState,
  getPhysicalStateInterjection,
  calculatePacingScore,
  createSessionRecoveryState,
  shouldAttemptRecovery,
  getGracefulErrorResponse,
};

export default ConversationQuality;
