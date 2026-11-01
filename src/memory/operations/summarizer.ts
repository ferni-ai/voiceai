/**
 * Conversation Summarizer
 *
 * Generates summaries of conversations for long-term memory.
 * Uses LLM for intelligent summarization or falls back to extraction.
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { ConversationSummary } from '../../types/user-profile.js';
import { embed } from '../embeddings.js';
import { callMomentLine, callerTimeZoneFor } from './call-moment.js';
import { INSIDE_JOKES_PROMPT_TAIL, parseInsideJokes, summaryInsideJokes } from './inside-jokes.js';
import * as caller from '../caller-assertions.js';

// ============================================================================
// TYPES
// ============================================================================

/** A single turn in a conversation */
export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
}

/** Options for summarization */
export interface SummarizationOptions {
  maxLength?: number;
  includeEmotionalArc?: boolean;
  includeKeyTopics?: boolean;
  generateEmbedding?: boolean;
  /** Use LLM for richer summarization (optional, falls back to extraction) */
  useLLM?: boolean;
  /** LLM call function for summarization */
  llmCall?: (prompt: string) => Promise<string>;
  /** The caller's IANA zone (default: the one recorded for the session), for absolute dates. */
  timeZone?: string;
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
    goals: ['goal', 'plan', 'target', 'objective', 'dream', 'ambition', 'aspiration'],
    risk: ['risk', 'volatility', 'conservative', 'aggressive'],
    family: ['family', 'kids', 'children', 'spouse', 'wife', 'husband', 'mom', 'dad', 'parents'],
    emotions: ['worried', 'anxious', 'scared', 'happy', 'excited', 'stressed'],
    education: ['college', 'education', 'tuition', '529'],
    home: ['house', 'home', 'mortgage', 'down payment'],
    // Life-coaching topics (aligned with fast-capture TOPIC_PATTERNS)
    work: ['work', 'job', 'career', 'office', 'boss', 'meeting', 'project', 'deadline'],
    health: ['health', 'doctor', 'sick', 'pain', 'medication', 'symptoms', 'diagnosis'],
    relationships: ['relationship', 'dating', 'marriage', 'divorce', 'partner'],
    finances: ['money', 'financial', 'bills', 'budget', 'rent'],
    mental_health: ['stress', 'anxiety', 'depression', 'therapy', 'mental health'],
    sleep: ['sleep', 'tired', 'exhausted', 'insomnia', 'rest'],
    fitness: ['exercise', 'gym', 'workout', 'run', 'fitness'],
    creative: ['hobby', 'creative', 'art', 'music', 'writing'],
    habits: ['habit', 'routine', 'streak', 'ritual'],
    grief: ['grief', 'loss', 'mourning', 'passed away', 'funeral'],
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
    'what matters',
    'notice that',
    'i notice',
    "let's",
    'try this',
    'next step',
    'one thing',
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

/** Seconds from the first turn to the last, or ~30 seconds a turn without timestamps. */
function durationOf(turns: ConversationTurn[]): number {
  const first = turns[0]?.timestamp;
  const last = turns.at(-1)?.timestamp;
  return first && last ? Math.floor((last.getTime() - first.getTime()) / 1000) : turns.length * 30;
}

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

  // Topics from the caller's lines only: what Ferni or a teammate said is not theirs
  const mainTopics = opts.includeKeyTopics
    ? extractTopics(turns.filter((t) => t.role === 'user'))
    : [];
  const keyPoints = extractKeyPoints(turns);
  const emotionalArc = opts.includeEmotionalArc ? detectEmotionalArc(turns) : '';

  // Generate text summary
  const textSummary = generateTextSummary(turns, mainTopics, keyPoints);

  const duration = durationOf(turns);

  // Ferni's own key sentences are kept, labelled as hers (assistantRaisedItems)
  const summary = caller.withCallerProvenance<ConversationSummary>(
    {
      id: `summary_${sessionId}_${now.getTime()}`,
      sessionId,
      timestamp: now,
      duration,
      turnCount: turns.length,
      mainTopics,
      keyPoints,
      emotionalArc,
    },
    turns,
    ['keyPoints']
  );

  // Generate embedding for semantic search
  // CRITICAL: This enables future retrieval of past conversations
  if (opts.generateEmbedding) {
    try {
      const embeddingText = [textSummary, ...mainTopics, ...keyPoints].join(' ');
      summary.embedding = await embed(embeddingText);

      if (summary.embedding && summary.embedding.length > 0) {
        getLogger().debug(
          {
            embeddingDimensions: summary.embedding.length,
            textLength: embeddingText.length,
          },
          'Summary embedding generated successfully'
        );
      } else {
        getLogger().warn(
          'Embedding generation returned empty array - conversation may not be searchable'
        );
      }
    } catch (error) {
      getLogger().warn(
        { error: String(error) },
        'Failed to generate summary embedding - conversation will not be semantically searchable'
      );
    }
  } else {
    getLogger().debug(
      'Embedding generation skipped per options - conversation will not be semantically searchable'
    );
  }

  getLogger().info(
    {
      summaryId: summary.id,
      topics: summary.mainTopics.length,
      keyPoints: summary.keyPoints.length,
      hasEmbedding: !!summary.embedding?.length,
    },
    'Generated conversation summary'
  );
  return summary;
}

// ============================================================================
// LLM-ENHANCED SUMMARIZATION
// ============================================================================

/** LLM-based summarization result */
interface LLMSummaryResult {
  mainTopics: string[];
  keyPoints: string[];
  emotionalArc: string;
  openThreads: string[];
  followUps: string[];
  userConcerns: string[];
  relationshipProgress: string;
  insideJokes?: unknown;
}

/** Generate a summary using LLM for richer understanding; falls back to extraction if it fails */
export async function summarizeWithLLM(
  sessionId: string,
  turns: ConversationTurn[],
  llmCall: (prompt: string) => Promise<string>,
  options?: Omit<SummarizationOptions, 'useLLM' | 'llmCall'>
): Promise<ConversationSummary> {
  const now = new Date();
  const opts = {
    maxLength: 500,
    includeEmotionalArc: true,
    includeKeyTopics: true,
    generateEmbedding: true,
    ...options,
  };

  // Build conversation transcript (truncate if very long)
  const MAX_TRANSCRIPT_LENGTH = 4000;
  let transcript = turns.map((t) => `${t.role.toUpperCase()}: ${t.content}`).join('\n');

  if (transcript.length > MAX_TRANSCRIPT_LENGTH) {
    // Keep first and last parts
    const firstPart = transcript.slice(0, MAX_TRANSCRIPT_LENGTH / 2);
    const lastPart = transcript.slice(-MAX_TRANSCRIPT_LENGTH / 2);
    transcript = `${firstPart}\n\n[... middle portion truncated ...]\n\n${lastPart}`;
  }

  const prompt = `Summarize this conversation for future reference. Focus on what matters for continuing the relationship.${caller.summaryAssertionRule()}
${callMomentLine(turns[0]?.timestamp ?? now, opts.timeZone ?? callerTimeZoneFor(sessionId))}

CONVERSATION:
${transcript}

followUps: only what a close friend would ask about next time (a plan, an event, a worry, a person). Never routine daily life (sleep, meals, chores, a run). Use [] when nothing qualifies.
Respond with ONLY valid JSON (no markdown, no explanation):
{
  "mainTopics": ["topic1", "topic2"],
  "keyPoints": ["key insight 1", "key insight 2"],
  "emotionalArc": "brief description of emotional journey",
  "openThreads": ["topic that wasn't fully resolved"],
  "followUps": ["thing to check on next time"],
  "userConcerns": ["worry or concern user expressed"],
  "relationshipProgress": "brief note on how relationship deepened",
${INSIDE_JOKES_PROMPT_TAIL}`;

  try {
    const response = await llmCall(prompt);

    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      getLogger().debug('LLM summary response did not contain JSON, falling back to extraction');
      return summarizeConversation(sessionId, turns, { ...opts, useLLM: false });
    }

    const llmResult = JSON.parse(jsonMatch[0]) as LLMSummaryResult;

    const duration = durationOf(turns);

    // Each item the caller's own lines don't back is moved to assistantRaisedItems
    const summary = caller.withCallerProvenance<ConversationSummary>(
      {
        id: `summary_${sessionId}_${now.getTime()}`,
        sessionId,
        timestamp: now,
        duration,
        turnCount: turns.length,
        mainTopics: llmResult.mainTopics || [],
        keyPoints: llmResult.keyPoints || [],
        emotionalArc: llmResult.emotionalArc || '',
        questionsRemaining: llmResult.openThreads,
        followUpItems: llmResult.followUps,
      },
      turns
    );
    // No bits: the summary is as before, with no insideJokes field
    Object.assign(summary, summaryInsideJokes(parseInsideJokes(llmResult.insideJokes, turns)));

    // Generate embedding
    if (opts.generateEmbedding) {
      try {
        const embeddingText = [
          ...summary.mainTopics,
          ...summary.keyPoints,
          summary.emotionalArc,
          ...caller.theirs(llmResult.userConcerns ?? [], turns),
        ].join(' ');
        summary.embedding = await embed(embeddingText);

        if (summary.embedding?.length) {
          getLogger().debug(
            {
              embeddingDimensions: summary.embedding.length,
            },
            'LLM summary embedding generated'
          );
        }
      } catch (error) {
        getLogger().warn({ error: String(error) }, 'Failed to generate LLM summary embedding');
      }
    }

    getLogger().info(
      {
        summaryId: summary.id,
        method: 'llm',
        topics: summary.mainTopics.length,
        keyPoints: summary.keyPoints.length,
        hasEmbedding: !!summary.embedding?.length,
      },
      'Generated LLM-enhanced conversation summary'
    );

    return summary;
  } catch (error) {
    getLogger().warn(
      { error: String(error) },
      'LLM summarization failed, falling back to extraction'
    );
    return summarizeConversation(sessionId, turns, { ...opts, useLLM: false });
  }
}

/**
 * Generate a rolling summary (for long conversations)
 */
export async function generateRollingSummary(
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
