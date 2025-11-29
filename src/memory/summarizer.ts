/**
 * Conversation Summarizer
 *
 * Generates summaries of conversations for long-term memory.
 * Uses LLM for intelligent summarization or falls back to extraction.
 */

import { log } from '@livekit/agents';
import type { ConversationSummary } from '../types/user-profile.js';
import { embed } from './embeddings.js';

const getLogger = () => log();

// ============================================================================
// TYPES
// ============================================================================

/**
 * A single turn in a conversation
 */
export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
}

/**
 * Options for summarization
 */
export interface SummarizationOptions {
  maxLength?: number;
  includeEmotionalArc?: boolean;
  includeKeyTopics?: boolean;
  generateEmbedding?: boolean;
}

// ============================================================================
// EXTRACTION HELPERS
// ============================================================================

/**
 * Extract main topics from conversation
 */
function extractTopics(turns: ConversationTurn[]): string[] {
  const topicKeywords: Record<string, string[]> = {
    retirement: ['retire', 'retirement', '401k', 'pension', 'social security'],
    investing: ['invest', 'portfolio', 'stock', 'bond', 'fund', 'market'],
    savings: ['save', 'saving', 'emergency fund', 'savings account'],
    debt: ['debt', 'loan', 'mortgage', 'credit card', 'pay off'],
    fees: ['fee', 'cost', 'expense ratio', 'charges'],
    goals: ['goal', 'plan', 'target', 'objective'],
    risk: ['risk', 'volatility', 'conservative', 'aggressive'],
    family: ['family', 'kids', 'children', 'spouse', 'wife', 'husband'],
    emotions: ['worried', 'anxious', 'scared', 'happy', 'excited', 'stressed'],
    education: ['college', 'education', 'tuition', '529'],
    home: ['house', 'home', 'mortgage', 'down payment'],
  };

  const text = turns
    .map((t) => t.content)
    .join(' ')
    .toLowerCase();
  const foundTopics: string[] = [];

  for (const [topic, keywords] of Object.entries(topicKeywords)) {
    if (keywords.some((kw) => text.includes(kw))) {
      foundTopics.push(topic);
    }
  }

  return foundTopics;
}

/**
 * Extract key points from conversation
 */
function extractKeyPoints(turns: ConversationTurn[]): string[] {
  const keyPoints: string[] = [];

  // Look for questions from user
  for (const turn of turns) {
    if (turn.role === 'user' && turn.content.includes('?')) {
      const questions = turn.content.split(/[.!]/).filter((s) => s.includes('?'));
      for (const q of questions.slice(0, 2)) {
        keyPoints.push(`User asked: ${q.trim()}`);
      }
    }
  }

  // Look for key statements from assistant
  const keyPhrases = [
    'remember',
    'important',
    'key',
    'the thing is',
    "here's what",
    'my advice',
    'I recommend',
    'stay the course',
  ];

  for (const turn of turns) {
    if (turn.role === 'assistant') {
      for (const phrase of keyPhrases) {
        if (turn.content.toLowerCase().includes(phrase)) {
          // Extract the sentence containing the phrase
          const sentences = turn.content.split(/[.!?]/);
          for (const sentence of sentences) {
            if (sentence.toLowerCase().includes(phrase) && sentence.length > 20) {
              keyPoints.push(sentence.trim().slice(0, 150));
              break;
            }
          }
          break;
        }
      }
    }
  }

  return keyPoints.slice(0, 5);
}

/**
 * Detect emotional arc of conversation
 */
function detectEmotionalArc(turns: ConversationTurn[]): string {
  const emotionKeywords: Record<string, string[]> = {
    anxious: ['worried', 'anxious', 'nervous', 'scared', 'afraid', 'concerned'],
    hopeful: ['hope', 'hopeful', 'optimistic', 'looking forward', 'excited'],
    frustrated: ['frustrated', 'annoyed', 'upset', 'angry', 'mad'],
    calm: ['calm', 'peaceful', 'relaxed', 'comfortable', 'at ease'],
    confused: ['confused', "don't understand", 'not sure', 'unclear'],
    grateful: ['thank', 'grateful', 'appreciate', 'helped'],
  };

  // Analyze first half vs second half
  const midpoint = Math.floor(turns.length / 2);
  const firstHalf = turns.slice(0, midpoint);
  const secondHalf = turns.slice(midpoint);

  function detectEmotion(turnSubset: ConversationTurn[]): string {
    const text = turnSubset
      .filter((t) => t.role === 'user')
      .map((t) => t.content)
      .join(' ')
      .toLowerCase();

    for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
      if (keywords.some((kw) => text.includes(kw))) {
        return emotion;
      }
    }
    return 'neutral';
  }

  const startEmotion = detectEmotion(firstHalf);
  const endEmotion = detectEmotion(secondHalf);

  if (startEmotion === endEmotion) {
    return `Maintained ${startEmotion} throughout`;
  }

  return `Started ${startEmotion}, ended ${endEmotion}`;
}

/**
 * Generate a text summary of the conversation
 */
function generateTextSummary(
  turns: ConversationTurn[],
  topics: string[],
  keyPoints: string[]
): string {
  const userTurns = turns.filter((t) => t.role === 'user').length;
  const topicsStr = topics.length > 0 ? topics.join(', ') : 'general conversation';

  let summary = `${userTurns}-turn conversation about ${topicsStr}. `;

  if (keyPoints.length > 0) {
    summary += `Key points: ${keyPoints.slice(0, 3).join('; ')}. `;
  }

  return summary.trim();
}

// ============================================================================
// MAIN SUMMARIZATION FUNCTION
// ============================================================================

/**
 * Generate a conversation summary
 */
export async function summarizeConversation(
  sessionId: string,
  turns: ConversationTurn[],
  options?: SummarizationOptions
): Promise<ConversationSummary> {
  const now = new Date();
  const opts = {
    maxLength: 500,
    includeEmotionalArc: true,
    includeKeyTopics: true,
    generateEmbedding: true,
    ...options,
  };

  // Extract information
  const mainTopics = opts.includeKeyTopics ? extractTopics(turns) : [];
  const keyPoints = extractKeyPoints(turns);
  const emotionalArc = opts.includeEmotionalArc ? detectEmotionalArc(turns) : '';

  // Generate text summary
  const textSummary = generateTextSummary(turns, mainTopics, keyPoints);

  // Calculate duration (estimate if no timestamps)
  let duration = 0;
  if (turns.length > 0 && turns[0].timestamp && turns[turns.length - 1].timestamp) {
    duration = Math.floor(
      (turns[turns.length - 1].timestamp!.getTime() - turns[0].timestamp!.getTime()) / 1000
    );
  } else {
    // Estimate: ~30 seconds per turn
    duration = turns.length * 30;
  }

  // Build summary object
  const summary: ConversationSummary = {
    id: `summary_${sessionId}_${now.getTime()}`,
    sessionId,
    timestamp: now,
    duration,
    turnCount: turns.length,
    mainTopics,
    keyPoints,
    emotionalArc,
  };

  // Generate embedding for semantic search
  if (opts.generateEmbedding) {
    try {
      const embeddingText = [textSummary, ...mainTopics, ...keyPoints].join(' ');
      summary.embedding = await embed(embeddingText);
    } catch (error) {
      getLogger().warn(`Failed to generate summary embedding: ${error}`);
    }
  }

  getLogger().info(`Generated conversation summary: ${summary.id}`);
  return summary;
}

/**
 * Generate a rolling summary (for long conversations)
 */
export function generateRollingSummary(
  turns: ConversationTurn[],
  previousSummary?: string
): Promise<string> {
  // Get last N turns
  const recentTurns = turns.slice(-10);
  const topics = extractTopics(recentTurns);
  const keyPoints = extractKeyPoints(recentTurns);

  let summary = '';

  if (previousSummary) {
    summary = `Previously: ${previousSummary.slice(0, 200)}... `;
  }

  summary += `Recent discussion: ${topics.join(', ') || 'various topics'}. `;

  if (keyPoints.length > 0) {
    summary += `Key points: ${keyPoints.slice(0, 2).join('; ')}.`;
  }

  return Promise.resolve(summary.slice(0, 500));
}

/**
 * Extract questions that weren't fully answered
 */
export function extractOpenQuestions(turns: ConversationTurn[]): string[] {
  const openQuestions: string[] = [];

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    if (turn.role === 'user' && turn.content.includes('?')) {
      // Check if next assistant turn addresses it
      const nextTurn = turns[i + 1];
      if (!nextTurn || nextTurn.role !== 'assistant') {
        // Extract questions
        const questions = turn.content.match(/[^.!?]*\?/g) || [];
        openQuestions.push(...questions.map((q) => q.trim()));
      }
    }
  }

  return openQuestions.slice(0, 5);
}

/**
 * Extract follow-up items mentioned in conversation
 */
export function extractFollowUpItems(turns: ConversationTurn[]): string[] {
  const followUpPhrases = [
    /let's talk about .+ next time/gi,
    /we should discuss .+ later/gi,
    /remind me to .+/gi,
    /don't forget to .+/gi,
    /i'll .+ later/gi,
    /we can .+ next time/gi,
  ];

  const items: string[] = [];

  for (const turn of turns) {
    for (const pattern of followUpPhrases) {
      const matches = turn.content.match(pattern);
      if (matches) {
        items.push(...matches);
      }
    }
  }

  return items.slice(0, 5);
}

export default {
  summarizeConversation,
  generateRollingSummary,
  extractOpenQuestions,
  extractFollowUpItems,
};
