/**
 * Journal Routes
 *
 * API endpoints for the Voice Journal feature (Digital Twin).
 * Provides personalized journaling prompts and transcription.
 *
 * Endpoints:
 * - POST /api/journal/prompt - Get a single personalized prompt
 * - POST /api/journal/prompts - Get multiple prompts
 * - POST /api/journal/transcribe - Transcribe audio to text
 *
 * @module JournalRoutes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getLogger } from '../utils/safe-logger.js';
import {
  generatePrompts,
  getBestPrompt,
  type PromptContext,
} from '../services/trust-systems/journaling-prompts.js';
import { transcribeAudioBuffer } from '../services/custom-agent/memory-capture.service.js';
import OpenAI from 'openai';

const log = getLogger();

// ============================================================================
// HELPERS
// ============================================================================

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data));
}

async function parseBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

/**
 * Handle journal API routes
 *
 * Endpoints:
 * - POST /api/journal/prompt - Get a single personalized prompt
 * - POST /api/journal/prompts - Get multiple prompts
 */
export async function handleJournalRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  const method = req.method?.toUpperCase();

  // Only handle /api/journal/* routes
  if (!pathname.startsWith('/api/journal')) {
    return false;
  }

  try {
    // POST /api/journal/prompt - Get a single prompt
    if (method === 'POST' && pathname === '/api/journal/prompt') {
      const body = await parseBody<{
        userId?: string;
        timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
        mood?: string;
        recentTopics?: string[];
        growthAreas?: string[];
        struggles?: string[];
        wins?: string[];
        relationshipStage?: 'new' | 'building' | 'established' | 'deep';
      }>(req);

      const context: PromptContext = {
        userId: body.userId || 'anonymous',
        timeOfDay: body.timeOfDay,
        currentEmotion: body.mood,
        recentTopics: body.recentTopics,
        growthAreas: body.growthAreas,
        struggles: body.struggles,
        wins: body.wins,
        relationshipStage: body.relationshipStage,
      };

      const prompt = getBestPrompt(context);

      log.debug({ promptId: prompt.id, category: prompt.category }, 'Generated journal prompt');

      sendJson(res, 200, { prompt });
      return true;
    }

    // POST /api/journal/prompts - Get multiple prompts
    if (method === 'POST' && pathname === '/api/journal/prompts') {
      const body = await parseBody<{
        userId?: string;
        count?: number;
        timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
        mood?: string;
        recentTopics?: string[];
        growthAreas?: string[];
        struggles?: string[];
        wins?: string[];
        relationshipStage?: 'new' | 'building' | 'established' | 'deep';
      }>(req);

      const context: PromptContext = {
        userId: body.userId || 'anonymous',
        timeOfDay: body.timeOfDay,
        currentEmotion: body.mood,
        recentTopics: body.recentTopics,
        growthAreas: body.growthAreas,
        struggles: body.struggles,
        wins: body.wins,
        relationshipStage: body.relationshipStage,
      };

      const count = Math.min(body.count || 3, 10); // Cap at 10
      const prompts = generatePrompts(context, count);

      log.debug({ promptCount: prompts.length }, 'Generated journal prompts');

      sendJson(res, 200, { prompts });
      return true;
    }

    // POST /api/journal/transcribe - Transcribe audio to text
    if (method === 'POST' && pathname === '/api/journal/transcribe') {
      const body = await parseBody<{
        audioBase64: string;
        mimeType?: string;
      }>(req);

      if (!body.audioBase64) {
        sendJson(res, 400, { error: 'Missing audioBase64 data' });
        return true;
      }

      try {
        // Decode base64 to buffer
        const nodeBuffer = Buffer.from(body.audioBase64, 'base64');
        // Convert Node.js Buffer to ArrayBuffer
        const audioBuffer = nodeBuffer.buffer.slice(
          nodeBuffer.byteOffset,
          nodeBuffer.byteOffset + nodeBuffer.byteLength
        ) as ArrayBuffer;
        const mimeType = body.mimeType || 'audio/webm';

        log.debug({ bufferSize: audioBuffer.byteLength, mimeType }, 'Transcribing journal audio');

        const transcript = await transcribeAudioBuffer(audioBuffer, mimeType);

        sendJson(res, 200, {
          transcript,
          success: transcript !== '[Transcription unavailable]',
        });
        return true;
      } catch (error) {
        log.error({ error: String(error) }, 'Transcription failed');
        sendJson(res, 500, { error: 'Transcription failed', transcript: '' });
        return true;
      }
    }

    // POST /api/journal/twin-response - Generate response from Digital Twin
    if (method === 'POST' && pathname === '/api/journal/twin-response') {
      const body = await parseBody<{
        userMessage: string;
        profile: {
          name: string;
          mannerisms: string[];
          values: string[];
          communicationStyle: string;
          philosophy: string;
          passions: string[];
        };
        relevantJournals: Array<{
          content: string;
          mood?: string;
          date: string;
        }>;
        keyThemes: string[];
      }>(req);

      if (!body.userMessage) {
        sendJson(res, 400, { error: 'Missing userMessage' });
        return true;
      }

      try {
        const response = await generateTwinResponse(body);
        sendJson(res, 200, { response });
        return true;
      } catch (error) {
        log.error({ error: String(error) }, 'Twin response generation failed');
        sendJson(res, 500, { error: 'Failed to generate response' });
        return true;
      }
    }

    // Not handled
    return false;
  } catch (error) {
    log.error({ error: String(error), pathname }, 'Journal route error');
    sendJson(res, 500, { error: 'Internal server error' });
    return true;
  }
}

// ============================================================================
// TWIN RESPONSE GENERATION
// ============================================================================

interface TwinResponseRequest {
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

async function generateTwinResponse(request: TwinResponseRequest): Promise<string> {
  const { userMessage, profile, relevantJournals, keyThemes } = request;

  // Build system prompt from profile
  const systemPrompt = buildTwinSystemPrompt(profile, relevantJournals, keyThemes);

  // Try OpenAI if available
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    try {
      const openai = new OpenAI({ apiKey: openaiKey });

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 300,
        temperature: 0.8,
      });

      const response = completion.choices[0]?.message?.content;
      if (response) {
        return response;
      }
    } catch (error) {
      log.error({ error: String(error) }, 'OpenAI twin response failed');
    }
  }

  // Fallback to a simpler pattern-based response
  return generateFallbackTwinResponse(userMessage, profile, relevantJournals);
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

function generateFallbackTwinResponse(
  userMessage: string,
  profile: TwinResponseRequest['profile'],
  journals: TwinResponseRequest['relevantJournals']
): string {
  const lowerMessage = userMessage.toLowerCase();

  // Check for common patterns
  if (lowerMessage.includes('advice') || lowerMessage.includes('should i')) {
    if (profile.philosophy) {
      return `You know what I've learned? "${profile.philosophy}" Whatever you're facing, remember that.`;
    }
    if (profile.values.length > 0) {
      return `Think about what matters to us: ${profile.values.slice(0, 3).join(', ')}. Let those guide you.`;
    }
  }

  if (lowerMessage.includes('feeling') || lowerMessage.includes('feel')) {
    if (journals.length > 0) {
      const recent = journals[0];
      const preview = recent.content.slice(0, 150);
      return `I've felt that too. Remember when I wrote: "${preview}..." We got through it before, we'll get through this too.`;
    }
    return "I hear you. We've been through tough times before and found our way. What's really on your mind?";
  }

  if (lowerMessage.includes('remember') || lowerMessage.includes('past')) {
    if (journals.length > 0) {
      const entry = journals[0];
      return `Yeah, I remember. There was that time I wrote: "${entry.content.slice(0, 120)}..." What made you think of that?`;
    }
  }

  // Use a mannerism if available
  if (profile.mannerisms.length > 0) {
    const phrase = profile.mannerisms[Math.floor(Math.random() * profile.mannerisms.length)];
    return `${phrase} That's something I've been thinking about too. What's on your mind?`;
  }

  return "That's interesting. Tell me more about what you're thinking.";
}
