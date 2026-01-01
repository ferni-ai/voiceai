/**
 * Journal Routes
 *
 * API endpoints for the Voice Journal feature (Digital Twin).
 * Provides personalized journaling prompts, transcription, and auto-capture.
 *
 * Endpoints:
 * - POST /api/journal/prompt - Get a single personalized prompt
 * - POST /api/journal/prompts - Get multiple prompts
 * - POST /api/journal/transcribe - Transcribe audio to text
 * - POST /api/journal/capture - Save auto-captured moment
 * - GET  /api/journal/entries - Get all journal entries
 * - GET  /api/journal/stats - Get journal statistics
 *
 * @module JournalRoutes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import OpenAI from 'openai';
import { transcribeAudioBuffer } from '../services/custom-agent/memory-capture.service.js';
import {
  generatePrompts,
  getBestPrompt,
  type PromptContext,
} from '../services/trust-systems/journaling-prompts.js';
import {
  getJournalService,
  type JournalQueryOptions,
  type JournalSource,
} from '../services/journal/index.js';
import { getLogger } from '../utils/safe-logger.js';
import { parseBody, sendJSON } from './helpers.js';
import { requireAuth } from './auth-middleware.js';

const log = getLogger();

// ============================================================================
// HELPERS
// ============================================================================

// parseBody and sendJSON imported from './helpers.js'

/** Alias for sendJSON with status-first signature for backward compat */
function sendJson(res: ServerResponse, status: number, data: unknown): void {
  sendJSON(res, data, status);
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

    // POST /api/journal/capture - Save auto-captured moment
    if (method === 'POST' && pathname === '/api/journal/capture') {
      // SECURITY: Use Firebase auth instead of deprecated x-user-id header
      const auth = await requireAuth(req, res);
      if (!auth) return true; // 401 already sent
      const { userId } = auth;

      const body = await parseBody<{
        type: string; // MomentType
        content: string;
        context?: string;
        mood?: string;
        themes?: string[];
        intensity?: number;
        conversationId?: string;
        personaId?: string;
        agentId?: string; // Digital Twin agent ID
        capturedAt?: string;
      }>(req);

      if (!body.content) {
        sendJson(res, 400, { error: 'Content is required' });
        return true;
      }

      try {
        const journalService = getJournalService();

        const entry = await journalService.createEntry(userId, {
          source: 'auto_capture' as JournalSource,
          content: body.content,
          agentId: body.agentId,
          personaId: body.personaId,
          conversationId: body.conversationId,
          mood: body.mood
            ? {
                id: body.mood as 'happy' | 'sad' | 'calm' | 'anxious' | 'neutral',
                score: 5,
                label: body.mood,
              }
            : undefined,
          themes: body.themes,
          momentType: body.type,
          intensity: body.intensity,
        });

        log.info(
          { userId, entryId: entry.id, momentType: body.type },
          'Auto-captured moment saved'
        );

        sendJson(res, 201, { success: true, entry });
        return true;
      } catch (error) {
        log.error({ error: String(error), userId }, 'Failed to save captured moment');
        sendJson(res, 500, { error: 'Failed to save moment' });
        return true;
      }
    }

    // GET /api/journal/entries - Get all journal entries
    if (method === 'GET' && pathname === '/api/journal/entries') {
      // SECURITY: Use Firebase auth instead of deprecated x-user-id header
      const auth = await requireAuth(req, res);
      if (!auth) return true; // 401 already sent
      const { userId } = auth;

      try {
        // Parse query parameters from URL
        const url = new URL(req.url || '', `http://${req.headers.host}`);
        const options: JournalQueryOptions = {
          limit: url.searchParams.get('limit')
            ? parseInt(url.searchParams.get('limit')!, 10)
            : undefined,
          offset: url.searchParams.get('offset')
            ? parseInt(url.searchParams.get('offset')!, 10)
            : undefined,
          source: url.searchParams.get('source') as JournalSource | undefined,
          agentId: url.searchParams.get('agentId') || undefined,
          hasTranscript: url.searchParams.get('hasTranscript') === 'true',
          sortBy: (url.searchParams.get('sortBy') as 'createdAt' | 'mood') || 'createdAt',
          sortOrder: (url.searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc',
        };

        const journalService = getJournalService();
        const entries = await journalService.getAllEntries(userId, options);

        sendJson(res, 200, { entries, count: entries.length });
        return true;
      } catch (error) {
        log.error({ error: String(error), userId }, 'Failed to get journal entries');
        sendJson(res, 500, { error: 'Failed to get entries' });
        return true;
      }
    }

    // GET /api/journal/stats - Get journal statistics
    if (method === 'GET' && pathname === '/api/journal/stats') {
      // SECURITY: Use Firebase auth instead of deprecated x-user-id header
      const auth = await requireAuth(req, res);
      if (!auth) return true; // 401 already sent
      const { userId } = auth;

      try {
        const journalService = getJournalService();
        const stats = await journalService.getStats(userId);

        sendJson(res, 200, { stats });
        return true;
      } catch (error) {
        log.error({ error: String(error), userId }, 'Failed to get journal stats');
        sendJson(res, 500, { error: 'Failed to get stats' });
        return true;
      }
    }

    // GET /api/journal/search - Search journal entries
    if (method === 'GET' && pathname === '/api/journal/search') {
      // SECURITY: Use Firebase auth instead of deprecated x-user-id header
      const auth = await requireAuth(req, res);
      if (!auth) return true; // 401 already sent
      const { userId } = auth;

      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const query = url.searchParams.get('q');

      if (!query) {
        sendJson(res, 400, { error: 'Search query (q) is required' });
        return true;
      }

      try {
        const journalService = getJournalService();
        const entries = await journalService.searchEntries(userId, query);

        sendJson(res, 200, { entries, count: entries.length, query });
        return true;
      } catch (error) {
        log.error({ error: String(error), userId, query }, 'Journal search failed');
        sendJson(res, 500, { error: 'Search failed' });
        return true;
      }
    }

    // GET /api/journal/aggregated - Get entries from ALL Digital Twins
    // This provides a unified view across all user's agents
    if (method === 'GET' && pathname === '/api/journal/aggregated') {
      // SECURITY: Use Firebase auth instead of deprecated x-user-id header
      const auth = await requireAuth(req, res);
      if (!auth) return true; // 401 already sent
      const { userId } = auth;

      try {
        const url = new URL(req.url || '', `http://${req.headers.host}`);
        const options: JournalQueryOptions = {
          limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!, 10) : 50,
          source: 'digital_twin',
          sortOrder: 'desc',
        };

        const journalService = getJournalService();
        const entries = await journalService.getAllEntries(userId, options);
        const stats = await journalService.getStats(userId);

        // Group by agent for easier frontend consumption
        const byAgent: Record<string, typeof entries> = {};
        for (const entry of entries) {
          const agentId = entry.agentId || 'unknown';
          if (!byAgent[agentId]) {
            byAgent[agentId] = [];
          }
          byAgent[agentId].push(entry);
        }

        sendJson(res, 200, {
          entries,
          byAgent,
          stats: {
            totalEntries: stats.totalEntries,
            entriesBySource: stats.entriesBySource,
            averageMood: stats.averageMood,
            moodTrend: stats.moodTrend,
            currentStreak: stats.currentStreak,
          },
        });
        return true;
      } catch (error) {
        log.error({ error: String(error), userId }, 'Failed to get aggregated entries');
        sendJson(res, 500, { error: 'Failed to get aggregated entries' });
        return true;
      }
    }

    // GET /api/journal/export - Export all journal data for download
    if (method === 'GET' && pathname === '/api/journal/export') {
      // SECURITY: Use Firebase auth instead of deprecated x-user-id header
      const auth = await requireAuth(req, res);
      if (!auth) return true; // 401 already sent
      const { userId } = auth;

      try {
        const url = new URL(req.url || '', `http://${req.headers.host}`);
        const format = url.searchParams.get('format') || 'json';

        const journalService = getJournalService();
        const entries = await journalService.getAllEntries(userId, {
          sortOrder: 'asc', // Chronological order for export
        });

        if (format === 'json') {
          // Full JSON export
          res.setHeader('Content-Type', 'application/json');
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="ferni-journal-${new Date().toISOString().split('T')[0]}.json"`
          );
          sendJson(res, 200, {
            exportedAt: new Date().toISOString(),
            userId,
            totalEntries: entries.length,
            entries: entries.map((e) => ({
              id: e.id,
              source: e.source,
              content: e.content,
              transcript: e.transcript,
              mood: e.mood,
              themes: e.themes,
              promptText: e.promptText,
              agentId: e.agentId,
              createdAt: e.createdAt.toISOString(),
            })),
          });
        } else if (format === 'markdown') {
          // Markdown export for human reading
          let markdown = `# My Ferni Journal\n\n`;
          markdown += `*Exported: ${new Date().toLocaleDateString()}*\n\n`;
          markdown += `---\n\n`;

          for (const entry of entries) {
            const date = entry.createdAt.toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            });
            markdown += `## ${date}\n\n`;
            if (entry.mood) {
              markdown += `**Mood:** ${entry.mood.label}\n\n`;
            }
            if (entry.promptText) {
              markdown += `> *Prompt: ${entry.promptText}*\n\n`;
            }
            markdown += `${entry.content}\n\n`;
            if (entry.themes && entry.themes.length > 0) {
              markdown += `*Themes: ${entry.themes.join(', ')}*\n\n`;
            }
            markdown += `---\n\n`;
          }

          res.setHeader('Content-Type', 'text/markdown');
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="ferni-journal-${new Date().toISOString().split('T')[0]}.md"`
          );
          res.statusCode = 200;
          res.end(markdown);
        } else {
          sendJson(res, 400, { error: 'Unsupported format. Use "json" or "markdown"' });
        }
        return true;
      } catch (error) {
        log.error({ error: String(error), userId }, 'Failed to export journal');
        sendJson(res, 500, { error: 'Export failed' });
        return true;
      }
    }

    // GET /api/journal/chronicle - Get Chronicle data for The Chronicle UI
    if (method === 'GET' && pathname.startsWith('/api/journal/chronicle')) {
      // Extract userId from query string
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const userId = url.searchParams.get('userId');

      if (!userId) {
        sendJson(res, 400, { error: 'Missing userId parameter' });
        return true;
      }

      try {
        const chronicleData = await getChronicleData(userId);
        sendJson(res, 200, chronicleData);
        return true;
      } catch (error) {
        log.error({ error: String(error), userId }, 'Failed to get chronicle data');
        sendJson(res, 500, { error: 'Failed to load chronicle data' });
        return true;
      }
    }

    // POST /api/journal/chronicle/entry - Save a text journal entry
    if (method === 'POST' && pathname === '/api/journal/chronicle/entry') {
      // SECURITY: Use Firebase auth
      const auth = await requireAuth(req, res);
      if (!auth) return true;
      const { userId } = auth;

      const body = await parseBody<{
        content: string;
        agentId?: string;
        promptId?: string;
        promptText?: string;
        mood?: string;
        type?: 'text' | 'voice';
      }>(req);

      if (!body.content?.trim()) {
        sendJson(res, 400, { error: 'Content is required' });
        return true;
      }

      try {
        const journalService = getJournalService();
        const entry = await journalService.createEntry(userId, {
          source: 'digital_twin' as JournalSource,
          content: body.content.trim(),
          agentId: body.agentId,
          promptId: body.promptId,
          promptText: body.promptText,
          mood: body.mood
            ? {
                id: body.mood as 'happy' | 'sad' | 'calm' | 'anxious' | 'neutral',
                score: 5,
                label: body.mood,
              }
            : undefined,
        });

        log.info({ userId, entryId: entry.id, type: body.type }, 'Chronicle entry saved');
        sendJson(res, 201, { success: true, entry });
        return true;
      } catch (error) {
        log.error({ error: String(error), userId }, 'Failed to save chronicle entry');
        sendJson(res, 500, { error: 'Failed to save entry' });
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

// ============================================================================
// CHRONICLE DATA FETCHING
// ============================================================================

interface ChronicleData {
  recentEntries: Array<{
    id: string;
    content: string;
    type: 'voice' | 'text';
    createdAt: string;
    mood?: string;
    audioUrl?: string;
    themes?: string[];
  }>;
  insights: Array<{
    icon: string;
    title: string;
    text: string;
  }>;
  prompts: Array<{
    id: string;
    category: string;
    difficulty: 'gentle' | 'moderate' | 'deep';
    text: string;
    followUp?: string;
  }>;
  stats: {
    totalEntries: number;
    currentStreak: number;
    averageMood?: string;
    moodTrend?: 'improving' | 'declining' | 'stable';
    entriesThisWeek: number;
    topThemes: string[];
  };
}

async function getChronicleData(userId: string): Promise<ChronicleData> {
  const journalService = getJournalService();

  // Fetch recent entries and stats in parallel
  const [entries, stats] = await Promise.all([
    journalService.getAllEntries(userId, {
      limit: 20,
      sortOrder: 'desc',
    }),
    journalService.getStats(userId),
  ]);

  // Transform entries for Chronicle UI
  const recentEntries = entries.map((entry) => ({
    id: entry.id,
    content: entry.content,
    type: (entry.audioUrl ? 'voice' : 'text') as 'voice' | 'text',
    createdAt: entry.createdAt.toISOString(),
    mood: entry.mood?.label,
    audioUrl: entry.audioUrl,
    themes: entry.themes,
  }));

  // Generate insights from entries
  const insights = generateChronicleInsights(entries, stats);

  // Get personalized prompts
  const context: PromptContext = {
    userId,
    timeOfDay: getTimeOfDay(),
    recentTopics: extractTopThemes(entries),
  };
  const prompts = generatePrompts(context, 5).map((p) => ({
    id: p.id,
    category: p.category,
    difficulty: p.difficulty,
    text: p.prompt,
    followUp: p.followUp,
  }));

  // Extract top themes from entries
  const themeCounts: Record<string, number> = {};
  for (const entry of entries) {
    for (const theme of entry.themes || []) {
      themeCounts[theme] = (themeCounts[theme] || 0) + 1;
    }
  }
  const topThemes = Object.entries(themeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([theme]) => theme);

  return {
    recentEntries,
    insights,
    prompts,
    stats: {
      totalEntries: stats.totalEntries,
      currentStreak: stats.currentStreak,
      averageMood: stats.averageMood?.label,
      moodTrend: stats.moodTrend,
      entriesThisWeek: stats.entriesThisWeek,
      topThemes,
    },
  };
}

function generateChronicleInsights(
  entries: Array<{
    content: string;
    mood?: { label: string; score: number };
    themes?: string[];
    createdAt: Date;
  }>,
  stats: {
    currentStreak: number;
    averageMood?: { label: string };
    moodTrend?: string;
  }
): ChronicleData['insights'] {
  const insights: ChronicleData['insights'] = [];

  // Streak insight
  if (stats.currentStreak >= 3) {
    insights.push({
      icon: 'flame',
      title: `${stats.currentStreak}-Day Streak`,
      text:
        stats.currentStreak >= 7
          ? "A full week of reflection. You're building something powerful."
          : "You're showing up for yourself. That consistency matters.",
    });
  }

  // Mood trend insight
  if (stats.moodTrend === 'improving' && entries.length >= 5) {
    insights.push({
      icon: 'trending-up',
      title: 'Rising Energy',
      text: "Your recent entries show a lighter spirit. Something's shifting.",
    });
  } else if (stats.moodTrend === 'declining' && entries.length >= 5) {
    insights.push({
      icon: 'heart',
      title: 'Heavy Days',
      text: "I notice things have felt heavier lately. I'm here when you need to talk.",
    });
  }

  // Theme pattern insight
  const recentThemes = entries.slice(0, 5).flatMap((e) => e.themes || []);
  const themeCounts: Record<string, number> = {};
  for (const theme of recentThemes) {
    themeCounts[theme] = (themeCounts[theme] || 0) + 1;
  }
  const dominantTheme = Object.entries(themeCounts)
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])[0];

  if (dominantTheme) {
    insights.push({
      icon: 'sparkles',
      title: 'Recurring Theme',
      text: `${dominantTheme[0]} keeps coming up in your thoughts. What's drawing you there?`,
    });
  }

  // Entry count insight
  if (entries.length >= 10) {
    insights.push({
      icon: 'book',
      title: 'Growing Archive',
      text: `${entries.length} entries captured. Your future self will thank you for this.`,
    });
  }

  return insights.slice(0, 3); // Return top 3 insights
}

function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

function extractTopThemes(entries: Array<{ themes?: string[] }>): string[] {
  const themeCounts: Record<string, number> = {};
  for (const entry of entries.slice(0, 10)) {
    for (const theme of entry.themes || []) {
      themeCounts[theme] = (themeCounts[theme] || 0) + 1;
    }
  }
  return Object.entries(themeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([theme]) => theme);
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
