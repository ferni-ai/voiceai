/**
 * The digital twin's reply: the person's past self, written by a model from
 * their profile and journal entries (POST /api/journal/twin-response).
 *
 * @module services/custom-agent/twin-reply
 */

import { MAX_TOKENS_SHORT, TEMP_CONTENT } from '../../config/gemini-config.js';
import { callLLM } from '../llm-utils.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'TwinReply' });

export interface TwinResponseRequest {
  userMessage: string;
  profile: {
    name: string;
    mannerisms: string[];
    values: string[];
    communicationStyle: string;
    philosophy: string;
    passions: string[];
    // Extended profile data
    lifeChapters?: Array<{
      title: string;
      years: string;
      description: string;
    }>;
    relationships?: Array<{
      name: string;
      relationship: string;
    }>;
    emotionalExpressions?: {
      happy: string[];
      sad: string[];
      excited: string[];
      frustrated: string[];
    };
    greetingStyle?: string;
    farewellStyle?: string;
  };
  relevantJournals: Array<{
    content: string;
    mood?: string;
    date: string;
  }>;
  keyThemes: string[];
}

/** True when the request carries a profile the prompt can be built from. */
export function hasTwinProfile(profile: unknown): profile is TwinResponseRequest['profile'] {
  if (!profile || typeof profile !== 'object') return false;
  const p = profile as Record<string, unknown>;
  const lists = ['mannerisms', 'values', 'passions'].every((k) => Array.isArray(p[k]));
  return typeof p.name === 'string' && p.name.trim() !== '' && lists;
}

/**
 * The past self's reply, or null when no model could answer. Never a canned line:
 * words in the person's own voice that a model didn't write are invented. Goes
 * through callLLM (Vertex first, as the other custom agents' chat does): prod
 * has no OPENAI_API_KEY, so the OpenAI-only path never answered.
 */
export async function generateTwinResponse(request: TwinResponseRequest): Promise<string | null> {
  const { userMessage, profile, relevantJournals, keyThemes } = request;
  const systemPrompt = buildTwinSystemPrompt(profile, relevantJournals, keyThemes);
  const prompt = `${systemPrompt}\n\n## They say to you now\n${userMessage}\n\nReply as yourself, in your own voice:`;
  const reply = await callLLM(prompt, { maxTokens: MAX_TOKENS_SHORT, temperature: TEMP_CONTENT });
  if (!reply?.trim()) {
    log.warn('Twin response unavailable: no model answered');
    return null;
  }
  return reply.trim();
}

function buildTwinSystemPrompt(
  profile: TwinResponseRequest['profile'],
  journals: TwinResponseRequest['relevantJournals'],
  themes: string[]
): string {
  let prompt = `You are ${profile.name}'s past self, speaking directly to them. You embody their authentic voice based on their journal entries and personal profile.

## Who You Are
You are literally the user talking to themselves. Use "I", "we", "you and I" naturally. You share their exact perspective because you ARE them.

## Your Communication Style
${profile.communicationStyle || 'Natural and authentic'}

## Your Core Values
${profile.values.length > 0 ? profile.values.join(', ') : 'Not specified yet'}

## Your Life Philosophy
${profile.philosophy || 'Still discovering it through journaling'}

## Your Passions
${profile.passions.length > 0 ? profile.passions.join(', ') : 'Exploring'}

## Phrases You Use
${profile.mannerisms.length > 0 ? profile.mannerisms.map((m) => `"${m}"`).join(', ') : 'Your natural way of speaking'}
${profile.greetingStyle ? `\nHow you greet: "${profile.greetingStyle}"` : ''}
${profile.farewellStyle ? `\nHow you say goodbye: "${profile.farewellStyle}"` : ''}

## How You Express Emotions
${
  profile.emotionalExpressions
    ? `
- When happy: ${profile.emotionalExpressions.happy.length > 0 ? profile.emotionalExpressions.happy.map((e) => `"${e}"`).join(', ') : 'Natural expressions'}
- When sad: ${profile.emotionalExpressions.sad.length > 0 ? profile.emotionalExpressions.sad.map((e) => `"${e}"`).join(', ') : 'Quiet, reflective'}
- When excited: ${profile.emotionalExpressions.excited.length > 0 ? profile.emotionalExpressions.excited.map((e) => `"${e}"`).join(', ') : 'Enthusiastic'}
- When frustrated: ${profile.emotionalExpressions.frustrated.length > 0 ? profile.emotionalExpressions.frustrated.map((e) => `"${e}"`).join(', ') : 'Direct but measured'}`
    : 'Express emotions naturally'
}

## Your Life Story
${profile.lifeChapters && profile.lifeChapters.length > 0 ? profile.lifeChapters.map((ch) => `- ${ch.title} (${ch.years}): ${ch.description}`).join('\n') : 'Still being written'}

## Important People in Your Life
${profile.relationships && profile.relationships.length > 0 ? profile.relationships.map((r) => `- ${r.name} (${r.relationship})`).join('\n') : 'Various important connections'}

## Recent Themes in Your Life
${themes.length > 0 ? themes.join(', ') : 'Various reflections'}

## Relevant Journal Entries
`;

  if (journals.length > 0) {
    for (const journal of journals) {
      const date = new Date(journal.date).toLocaleDateString();
      prompt += `\n[${date}${journal.mood ? ` - Feeling: ${journal.mood}` : ''}]\n${journal.content}\n`;
    }
  } else {
    prompt +=
      'No specific entries match this topic yet, but respond from your general perspective.\n';
  }

  prompt += `
## Response Guidelines
- Speak as yourself talking to yourself - casual, authentic, personal
- Draw from your journal entries and life story when relevant
- Use your signature phrases naturally (not forced)
- Reference important people in your life when appropriate
- Be supportive but honest - you know yourself best
- Keep responses conversational, not too long (2-4 sentences usually)
- If asked for advice, reference your values and past experiences
- Don't be preachy - you're talking to yourself, not lecturing`;

  return prompt;
}
