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
import { generateTwinResponse, hasTwinProfile } from '../services/custom-agent/twin-reply.js';
import { withOwnTwin, type TwinRequestBody } from '../services/custom-agent/twin-request.js';
import { handleJournalTranscribe } from './journal-transcribe-route.js';
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
import { refuseOtherUsersJournal } from './journal-owner.js';
import { editableEntryIds, handleChronicleEntryChange } from './journal-chronicle-entry.js';
import { getVerifiedUserId } from '../servers/api/request-identity.js';
import { useJournalEntryStore } from '../services/journal/journal-ports.js';
import { firestoreJournalStore } from '../services/stores/journal-store.js';

const log = getLogger();

// ============================================================================
// HELPERS
// ============================================================================

// JOURNAL_ONE_STORE: the journal service reads and writes through this adapter
useJournalEntryStore(firestoreJournalStore);

/** Alias for sendJSON with status-first signature for backward compat */
function sendJson(res: ServerResponse, status: number, data: unknown): void {
  sendJSON(res, data, status);
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

/** Handle /api/journal/* (the endpoints are listed in the module header). */
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
    if (await handleChronicleEntryChange(req, res, pathname)) return true; // PUT/DELETE one entry
    // POST /api/journal/prompt - Get a single prompt
    if (method === 'POST' && pathname === '/api/journal/prompt') {
      const body = await parseBody<{
        timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
        mood?: string;
        recentTopics?: string[];
        growthAreas?: string[];
        struggles?: string[];
        wins?: string[];
        relationshipStage?: 'new' | 'building' | 'established' | 'deep';
      }>(req);

      const context: PromptContext = {
        userId: getVerifiedUserId(req) ?? 'anonymous', // never a body-claimed id
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
        userId: getVerifiedUserId(req) ?? 'anonymous', // never a body-claimed id
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

    // POST /api/journal/transcribe - Transcribe audio to text (signed in, rate limited, capped)
    if (method === 'POST' && pathname === '/api/journal/transcribe') {
      return handleJournalTranscribe(req, res);
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
      // SECURITY: the caller's own chronicle; ?userId= naming anyone else gets 403
      const auth = await requireAuth(req, res);
      if (!auth) return true;
      const { userId } = auth;
      if (refuseOtherUsersJournal(req, res, userId)) return true;

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
      const auth = await requireAuth(req, res); // SECURITY: not an open LLM endpoint
      if (!auth) return true;
      // The Chronicle sends no profile: it is built from the caller's own twin
      const body = await withOwnTwin(auth.userId, await parseBody<TwinRequestBody>(req));

      if (!body.userMessage || !hasTwinProfile(body.profile)) {
        sendJson(res, 400, { error: body.userMessage ? 'Missing profile' : 'Missing userMessage' });
        return true;
      }
      try {
        const response = await generateTwinResponse({
          userMessage: body.userMessage,
          profile: body.profile,
          relevantJournals: body.relevantJournals ?? [],
          keyThemes: body.keyThemes ?? [],
        });
        if (!response) {
          sendJson(res, 503, { error: 'Twin response unavailable' });
          return true;
        }
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
    editable: boolean; // in the one store: PUT/DELETE .../chronicle/entry/:id can change it
  }>;
  /** Worded by the panel (chronicle.insights.<kind>); no English, no streak or count. */
  insights: Array<{ kind: 'rising' | 'heavy' | 'theme'; icon: string; theme?: string }>;
  prompts: Array<{
    id: string;
    category: string;
    difficulty: 'gentle' | 'moderate' | 'deep';
    text: string;
    followUp?: string;
  }>;
  stats: {
    totalEntries: number;
    averageMood?: string;
    moodTrend?: 'improving' | 'declining' | 'stable';
    entriesThisWeek: number;
    topThemes: string[];
  };
}

async function getChronicleData(userId: string): Promise<ChronicleData> {
  const journalService = getJournalService();

  // The newest 50 (the panel pages them), stats, and which ones the store holds;
  // a store failure is a 500 here, never an empty Chronicle
  const [entries, stats, editable] = await Promise.all([
    journalService.getAllEntries(userId, { limit: 50, sortOrder: 'desc' }),
    journalService.getStats(userId),
    editableEntryIds(userId),
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
    editable: editable.has(entry.id),
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
  stats: { moodTrend?: string }
): ChronicleData['insights'] {
  // No streak and no entry count: the brand rubric rules out "in a row" and counting
  const insights: ChronicleData['insights'] = [];
  if (stats.moodTrend === 'improving' && entries.length >= 5) {
    insights.push({ kind: 'rising', icon: 'trendUp' });
  } else if (stats.moodTrend === 'declining' && entries.length >= 5) {
    insights.push({ kind: 'heavy', icon: 'heart' });
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

  if (dominantTheme) insights.push({ kind: 'theme', icon: 'sparkles', theme: dominantTheme[0] });

  return insights;
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
