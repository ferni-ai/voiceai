/**
 * Ask Service - Ask Ferni Anything
 *
 * Allows users to ask Ferni questions with context-aware LLM responses.
 * Builds context from user's goals, wins, energy, and journal entries.
 *
 * @module services/ceo/ask
 */

import OpenAI from 'openai';
import { createLogger } from '../../utils/safe-logger.js';
import { OPENAI_FALLBACK_MODEL } from '../../config/gemini-config.js';
import { goalsService, type Goal } from './goals.js';
import { winsService, type Win } from './wins.js';
import { energyService, type EnergyLog } from './energy.js';
import { journalService, type JournalEntry } from './journal.js';

const log = createLogger({ module: 'ceo-ask' });

// ============================================================================
// TYPES
// ============================================================================

export interface AskContext {
  goals: Goal[];
  recentWins: Win[];
  todayEnergy: EnergyLog[];
  recentJournal: JournalEntry[];
}

export interface AskResponse {
  answer: string;
  sources: string[];
  followUpQuestions: string[];
}

export interface AskService {
  ask: (userId: string, question: string) => AsyncGenerator<string, AskResponse, unknown>;
  buildContext: (userId: string) => Promise<AskContext>;
}

// ============================================================================
// OPENAI CLIENT
// ============================================================================

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required for Ask service');
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

function buildSystemPrompt(context: AskContext): string {
  const goalsSummary =
    context.goals.length > 0
      ? context.goals
          .map(
            (g) => `- ${g.title} (${g.status}, ${g.progress}% complete, category: ${g.category})`
          )
          .join('\n')
      : 'No active goals';

  const winsSummary =
    context.recentWins.length > 0
      ? context.recentWins
          .map((w) => `- ${w.description}${w.category ? ` (${w.category})` : ''}`)
          .join('\n')
      : 'No recent wins recorded';

  const energySummary =
    context.todayEnergy.length > 0
      ? `Today's energy levels: ${context.todayEnergy.map((e) => `${e.level}/10${e.notes ? ` - ${e.notes}` : ''}`).join(', ')}`
      : 'No energy data for today';

  const journalSummary =
    context.recentJournal.length > 0
      ? context.recentJournal
          .map(
            (j) =>
              `- "${j.content.slice(0, 100)}${j.content.length > 100 ? '...' : ''}" (${j.sentiment || 'neutral'})`
          )
          .join('\n')
      : 'No recent journal entries';

  return `You are Ferni, a helpful AI assistant and personal coach. You have access to the user's personal data to provide context-aware, personalized responses.

Your personality:
- Warm, supportive, and encouraging
- Direct but kind - you celebrate wins and gently challenge when needed
- You remember context and connect dots across different areas of life
- You're like a thoughtful friend who happens to have perfect recall

Current User Context:

GOALS:
${goalsSummary}

RECENT WINS:
${winsSummary}

ENERGY:
${energySummary}

RECENT JOURNAL ENTRIES:
${journalSummary}

Guidelines:
- Use the context above to personalize your responses
- Reference specific goals, wins, or journal entries when relevant
- Be concise but thorough - respect the user's time
- If you don't have enough context to answer well, acknowledge that
- Suggest actionable next steps when appropriate
- At the end of your response, suggest 1-2 relevant follow-up questions the user might want to explore`;
}

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

/**
 * Build context from user's personal data.
 */
export async function buildContext(userId: string): Promise<AskContext> {
  log.debug({ userId }, 'Building context for ask');

  // Fetch data in parallel for performance
  const [goals, recentWins, todayEnergy, recentJournal] = await Promise.all([
    goalsService.getGoals(userId, 'active'),
    winsService.getWins(userId, 'week'),
    energyService.getToday(userId),
    journalService.getEntries(userId, 'week'),
  ]);

  const context: AskContext = {
    goals,
    recentWins,
    todayEnergy,
    recentJournal: recentJournal.slice(0, 5), // Limit journal entries to avoid token bloat
  };

  log.debug(
    {
      userId,
      goalsCount: goals.length,
      winsCount: recentWins.length,
      energyCount: todayEnergy.length,
      journalCount: context.recentJournal.length,
    },
    'Context built'
  );

  return context;
}

/**
 * Extract follow-up questions from the response.
 */
function extractFollowUpQuestions(answer: string): string[] {
  const questions: string[] = [];

  // Look for questions at the end of the response
  const lines = answer.split('\n');
  for (let i = lines.length - 1; i >= 0 && questions.length < 3; i--) {
    const line = lines[i].trim();
    if (line.endsWith('?') && line.length > 10) {
      // Remove bullet points, numbers, or other prefixes
      const cleanedQuestion = line.replace(/^[-•*\d.)\s]+/, '').trim();
      if (cleanedQuestion.length > 10) {
        questions.unshift(cleanedQuestion);
      }
    }
  }

  return questions;
}

/**
 * Determine which data sources were used based on the answer content.
 */
function determineSources(answer: string, context: AskContext): string[] {
  const sources: string[] = [];

  // Check if goals were referenced
  if (context.goals.some((g) => answer.toLowerCase().includes(g.title.toLowerCase()))) {
    sources.push('goals');
  }

  // Check if wins were referenced
  if (
    context.recentWins.some((w) =>
      answer.toLowerCase().includes(w.description.slice(0, 20).toLowerCase())
    )
  ) {
    sources.push('wins');
  }

  // Check if energy was referenced
  if (answer.toLowerCase().includes('energy') && context.todayEnergy.length > 0) {
    sources.push('energy');
  }

  // Check if journal was referenced
  if (
    answer.toLowerCase().includes('journal') ||
    context.recentJournal.some((j) =>
      answer.toLowerCase().includes(j.content.slice(0, 20).toLowerCase())
    )
  ) {
    sources.push('journal');
  }

  return sources;
}

/**
 * Ask Ferni a question with streaming response.
 * Yields chunks of the response, then returns the complete AskResponse.
 */
export async function* ask(
  userId: string,
  question: string
): AsyncGenerator<string, AskResponse, unknown> {
  log.info({ userId, questionLength: question.length }, 'Processing ask request');

  // Build context from user's data
  const context = await buildContext(userId);

  // Build system prompt with context
  const systemPrompt = buildSystemPrompt(context);

  // Get OpenAI client
  const client = getOpenAIClient();

  // Create streaming completion
  const stream = await client.chat.completions.create({
    model: OPENAI_FALLBACK_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: question },
    ],
    max_tokens: 1024,
    temperature: 0.7,
    stream: true,
  });

  let fullAnswer = '';

  // Stream response chunks
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      fullAnswer += content;
      yield content;
    }
  }

  log.info({ userId, answerLength: fullAnswer.length }, 'Ask request completed');

  // Extract metadata from the complete answer
  const followUpQuestions = extractFollowUpQuestions(fullAnswer);
  const sources = determineSources(fullAnswer, context);

  return {
    answer: fullAnswer,
    sources,
    followUpQuestions,
  };
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const askService: AskService = {
  ask,
  buildContext,
};
