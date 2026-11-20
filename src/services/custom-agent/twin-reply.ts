/**
 * The digital twin's reply: the person's past self, written by a model from
 * their profile and journal entries (POST /api/journal/twin-response).
 *
 * @module services/custom-agent/twin-reply
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import { MAX_TOKENS_SHORT, TEMP_CONTENT } from '../../config/gemini-config.js';
import { callLLM } from '../llm-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { withoutDashes } from '../../utils/text-utils.js';

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
  /** The conversation so far, oldest first, in the custom-agent chat's shape; read only under TWIN_CONVERSATION_V2. */
  history?: Array<{ from: 'person' | 'agent'; text: string }>;
}

/** TWIN_CONVERSATION_V2: where the reply sits in the conversation. */
interface ConversationPlace {
  firstTurn: boolean;
}

/** TWIN_CONVERSATION_V2: the past self knows only what it was told, and says so. */
const NO_INVENTED_FACTS = `- Never invent facts about your life: no people, pets, places, dates or events that aren't in your profile, the journal entries above or this conversation. If they ask about something that isn't there, say you don't remember, or ask them
- No em dashes`;
const MID_CONVERSATION = `- You are already mid-conversation: don't greet them again, and don't sign off unless they are leaving`;

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
export async function generateTwinResponse(
  request: TwinResponseRequest,
  // The crisis read's guidance (readTypedMessageForCrisis), read last, after the style line.
  // An argument, never a request field, so no request body can set it.
  guidanceNote = '',
  env: Env = process.env
): Promise<string | null> {
  const { userMessage, profile, relevantJournals, keyThemes } = request;
  const v2 = flagOn('TWIN_CONVERSATION_V2', env);
  const history = v2 ? (request.history ?? []) : [];
  const place = v2 ? { firstTurn: history.length === 0 } : undefined;
  // A crisis read guided this turn: no canned greeting or sign-off next to its guidance.
  const styled = guidanceNote ? { ...profile, greetingStyle: '', farewellStyle: '' } : profile;
  const systemPrompt = buildTwinSystemPrompt(styled, relevantJournals, keyThemes, place);
  const said = history.length
    ? `\n\n## The conversation so far\n${history.map((t) => `${t.from === 'person' ? 'Them' : 'You'}: ${t.text}`).join('\n')}`
    : '';
  const ask = `${systemPrompt}${said}\n\n## They say to you now\n${userMessage}\n\nReply as yourself, in your own voice:`;
  const prompt = guidanceNote ? `${ask}\n\n${guidanceNote}` : ask;
  const reply = await callLLM(prompt, { maxTokens: MAX_TOKENS_SHORT, temperature: TEMP_CONTENT });
  if (!reply?.trim()) {
    log.warn('Twin response unavailable: no model answered');
    return null;
  }
  return v2 ? withoutDashes(reply.trim()) : reply.trim();
}

function buildTwinSystemPrompt(
  profile: TwinResponseRequest['profile'],
  journals: TwinResponseRequest['relevantJournals'],
  themes: string[],
  // Absent: the prompt as it was before TWIN_CONVERSATION_V2, byte for byte.
  place?: ConversationPlace
): string {
  const greeting =
    profile.greetingStyle && (!place || place.firstTurn)
      ? `\nHow you greet${place ? ', at the start of a conversation' : ''}: "${profile.greetingStyle}"`
      : '';
  const farewell = profile.farewellStyle
    ? `\nHow you say goodbye${place ? ', only when they are leaving' : ''}: "${profile.farewellStyle}"`
    : '';
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
${greeting}
${farewell}

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
  if (place) prompt += `\n${NO_INVENTED_FACTS}${place.firstTurn ? '' : `\n${MID_CONVERSATION}`}`;

  return prompt;
}
