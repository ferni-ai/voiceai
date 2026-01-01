/**
 * Farewell Summary Module
 *
 * Generates summaries for the end of conversations to enable
 * better continuity in future sessions.
 *
 * @module conversation-quality/farewell
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { FarewellSummary, SmallDetail, FollowUpItem } from './types.js';
import { extractSmallDetails } from './small-details.js';
import { extractFollowUps } from './follow-ups.js';

const log = getLogger();

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

  log.info(
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

/**
 * Extract the main topic from a question
 */
function extractTopicFromQuestion(question: string): string | null {
  const cleaned = question.replace(/[?!.]/g, '').trim();
  const words = cleaned.split(' ').slice(0, 6);
  return words.length > 2 ? words.join(' ') : null;
}

/**
 * Generate a greeting for next time based on conversation context
 */
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

/**
 * Build relationship notes based on conversation metrics
 */
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
