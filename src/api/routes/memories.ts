/**
 * Cognitive Memories Routes
 *
 * GET /api/cognitive/memories - Get what I've learned about the user
 * DELETE /api/cognitive/memories/:id - Forget a specific memory
 *
 * Memory Lane Routes:
 * GET /api/memories/highlights - Get top memory highlights (scored)
 * GET /api/memories/on-this-day - "On This Day" anniversary memories
 * GET /api/memories/timeline - Chronological timeline of memories
 * PATCH /api/memories/:id/reaction - Record user reaction to memory
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { API_ERRORS } from '../error-messages.js';
import { requireUserId, sendError, sendJSON, sendJSONCached } from '../helpers.js';
import {
  type AnyRecord,
  type Pattern,
  type UIMemory,
  calculateConfidence,
  formatMemoryContent,
  getPersonaName,
  mapMemoryTypeToUIType,
} from './types.js';

const log = createLogger({ module: 'MemoriesAPI' });

/**
 * Extract patterns from user engagement profile
 */
function extractPatternsFromProfile(profile: AnyRecord | null): Pattern[] {
  const patterns: Pattern[] = [];
  if (!profile) return patterns;

  const totalConvos = (profile.totalConversations as number) || 1;

  // Communication style
  if (profile.communicationStyle && profile.communicationStyle !== 'unknown') {
    const styleDescriptions: Record<string, string> = {
      direct: 'You prefer direct, to-the-point communication',
      analytical: 'You like detailed analysis and data-driven discussions',
      warm: 'You appreciate warm, personable conversation',
      reflective: 'You value thoughtful, reflective exchanges',
    };
    patterns.push({
      id: 'comm_style',
      pattern:
        styleDescriptions[profile.communicationStyle as string] ||
        `Prefers ${profile.communicationStyle} communication`,
      frequency: totalConvos,
      examples: [],
      category: 'communication',
    });
  }

  // Preferred topics
  if (profile.preferredTopics?.length) {
    const topTopics = (profile.preferredTopics as string[]).slice(0, 5);
    patterns.push({
      id: 'preferred_topics',
      pattern: `Topics you love: ${topTopics.join(', ')}`,
      frequency: topTopics.length,
      examples: topTopics,
      category: 'interests',
    });
  }

  // Relationship depth
  if (profile.relationshipStage) {
    const stageMessages: Record<string, string> = {
      stranger: "We're just getting to know each other",
      'getting-started': "We're building the foundation of our relationship",
      'building-trust': 'Trust is growing between us',
      established: 'We have a solid, established relationship',
      deep: "We've developed a deep connection",
    };
    if (stageMessages[profile.relationshipStage as string]) {
      patterns.push({
        id: 'relationship_stage',
        pattern: stageMessages[profile.relationshipStage as string],
        frequency: totalConvos,
        examples: [],
        category: 'relationship',
      });
    }
  }

  // Total time together
  if (profile.totalMinutesTalked && (profile.totalMinutesTalked as number) > 10) {
    const totalMins = profile.totalMinutesTalked as number;
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    const timeStr =
      hours > 0
        ? `${hours} hour${hours > 1 ? 's' : ''}${mins > 0 ? ` and ${mins} minutes` : ''}`
        : `${mins} minutes`;
    patterns.push({
      id: 'time_together',
      pattern: `We've spent about ${timeStr} in conversation`,
      frequency: totalConvos,
      examples: [],
      category: 'relationship',
    });
  }

  return patterns;
}

/**
 * GET /api/cognitive/memories - What I've Learned
 */
export async function handleGetCognitiveMemories(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const { getAllUserMemories } = await import('../../services/memory/persona-memories.js');
    const { getDefaultStore } = await import('../../memory/index.js');
    const { extractLearnedMemories } = await import('../../services/memory/learned-memories.js');

    const rawMemories = (await getAllUserMemories(userId)) as unknown as AnyRecord[];
    const store = getDefaultStore();
    const userProfile = (await store.getProfile(userId)) as unknown as AnyRecord | null;

    // Transform persona memories
    const personaMemories: UIMemory[] = rawMemories.map((m) => ({
      id: m.id as string,
      type: mapMemoryTypeToUIType(m.type as string),
      content: formatMemoryContent(m),
      confidence: calculateConfidence(m),
      source: getPersonaName(m.personaId as string),
      learnedAt: (m.createdAt as Date)?.toISOString?.() || new Date().toISOString(),
      personaId: m.personaId as string,
      sourceType: 'persona_memory',
    }));

    // Extract from profile
    let profileMemories: UIMemory[] = [];
    let profilePatterns: Pattern[] = [];
    if (userProfile) {
      const profileData = await extractLearnedMemories(
        userProfile as unknown as Parameters<typeof extractLearnedMemories>[0]
      );
      profileMemories = (profileData.memories || []).map((m) => ({
        id: ((m as AnyRecord).id as string) || '',
        type: ((m as AnyRecord).type as string) || 'fact',
        content: ((m as AnyRecord).content as string) || '',
        confidence: ((m as AnyRecord).confidence as number) ?? 0.7,
        source: ((m as AnyRecord).source as string) || 'profile',
        learnedAt: ((m as AnyRecord).learnedAt as string) || new Date().toISOString(),
        personaId: (m as AnyRecord).personaId as string,
        sourceType: ((m as AnyRecord).sourceType as string) || 'profile',
      }));
      profilePatterns = (profileData.patterns || []).map((p) => ({
        id: ((p as AnyRecord).id as string) || '',
        pattern: ((p as AnyRecord).pattern as string) || '',
        frequency: ((p as AnyRecord).frequency as number) ?? 1,
        examples: ((p as AnyRecord).examples as string[]) || [],
        category: ((p as AnyRecord).category as string) || 'general',
      }));
    }

    // Deduplicate
    const seenContent = new Set(personaMemories.map((m) => m.content.toLowerCase()));
    const uniqueProfileMemories = profileMemories.filter(
      (m) => !seenContent.has(m.content.toLowerCase())
    );

    const allMemories = [...personaMemories, ...uniqueProfileMemories];
    allMemories.sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return new Date(b.learnedAt).getTime() - new Date(a.learnedAt).getTime();
    });

    const patterns = [...extractPatternsFromProfile(userProfile), ...profilePatterns];
    const seenPatterns = new Set<string>();
    const uniquePatterns = patterns.filter((p) => {
      if (seenPatterns.has(p.pattern)) return false;
      seenPatterns.add(p.pattern);
      return true;
    });

    const totalInteractions = (userProfile?.totalConversations as number) || 0;
    const knowledgeScore = Math.min(
      100,
      Math.round(allMemories.length * 3 + totalInteractions * 2 + uniquePatterns.length * 5)
    );

    sendJSONCached(
      res,
      { memories: allMemories, patterns: uniquePatterns, totalInteractions, knowledgeScore },
      60
    );
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to get cognitive memories');
    sendJSON(res, { memories: [], patterns: [], totalInteractions: 0, knowledgeScore: 0 }, 500);
  }
}

/**
 * DELETE /api/cognitive/memories/:id - Forget a specific memory
 */
export async function handleDeleteMemory(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL,
  memoryId: string
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    let deleted = false;
    let deleteSource = '';

    // Try persona memories first
    const { forget } = await import('../../services/memory/persona-memories.js');
    const personaDeleted = await forget(memoryId);
    if (personaDeleted) {
      deleted = true;
      deleteSource = 'persona_memory';
    }

    // Try profile-based memories
    if (!deleted) {
      const { deleteMemoryFromProfile } = await import('../../services/memory/learned-memories.js');
      const { getDefaultStore } = await import('../../memory/index.js');

      const store = getDefaultStore();
      const profile = await store.getProfile(userId);

      if (profile) {
        const result = deleteMemoryFromProfile(profile, memoryId);
        if (result.success) {
          await store.saveProfile(result.profile);
          deleted = true;
          deleteSource = result.deletedType || 'profile';
        }
      }
    }

    if (deleted) {
      log.info({ memoryId, source: deleteSource, userId }, 'Memory deleted');
      sendJSON(res, { success: true, memoryId, source: deleteSource });
    } else {
      sendError(res, API_ERRORS.MEMORY_NOT_FOUND, 404);
    }
  } catch (err) {
    log.error({ error: err, memoryId, userId }, 'Failed to delete memory');
    sendError(res, API_ERRORS.OPERATION_FAILED, 500);
  }
}

/**
 * GET /api/cognitive/superhuman-insights - Get proactive superhuman memory insights
 *
 * Returns insights like upcoming important dates, growth celebrations,
 * comfort pattern guidance, and topic absences.
 */
export async function handleGetSuperhumanInsights(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const { getDefaultStore } = await import('../../memory/index.js');
    const { buildSuperhumanContext } = await import('../../intelligence/superhuman-memory.js');

    const store = getDefaultStore();
    const profile = await store.getProfile(userId);

    if (!profile) {
      sendJSON(res, {
        insights: [],
        temporalContext: { isSpecialDate: false },
        message: 'No profile found',
      });
      return;
    }

    // Build superhuman context
    const context = buildSuperhumanContext(profile, {
      sessionCount: profile.totalConversations || 0,
      recentTopics: profile.preferredTopics || [],
    });

    // Format for UI
    const uiInsights = context.insights.map((insight) => ({
      id: insight.id,
      type: insight.type,
      priority: insight.priority,
      content: insight.content,
      naturalPhrase: insight.naturalPhrase,
      timing: insight.context.timing,
      tone: insight.context.tone,
      generatedAt: insight.generatedAt,
    }));

    // Format topic absences
    const topicAbsences = context.topicAbsences.map((absence) => ({
      topic: absence.topic,
      lastMentioned: absence.lastMentioned,
      sessionsSince: absence.sessionsSinceLastMention,
      suggestedApproach: absence.suggestedApproach,
      prompt: absence.naturalPrompt,
    }));

    log.info(
      {
        userId,
        insightCount: uiInsights.length,
        highPriority: uiInsights.filter((i) => i.priority === 'high').length,
      },
      'Returning superhuman insights'
    );

    sendJSONCached(
      res,
      {
        insights: uiInsights,
        temporalContext: context.temporalContext,
        topicAbsences,
        comfortGuidance: {
          stressLevel: context.comfortGuidance.stressLevel,
          supportType: context.comfortGuidance.supportType,
        },
      },
      300
    ); // Cache for 5 minutes
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to get superhuman insights');
    sendError(res, API_ERRORS.OPERATION_FAILED, 500);
  }
}

/**
 * GET /api/memories/on-this-day - Memory Lane "On This Day" memories
 *
 * Returns memories and events from the same day in previous years.
 * Uses the new Memory Lane service for consistent format with highlights.
 */
export async function handleGetOnThisDay(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const { getOnThisDayHighlights, collectAllMemories } =
      await import('../../services/memory-lane/index.js');

    // Collect any new memories first (lightweight operation)
    await collectAllMemories(userId);

    // Get "On This Day" memories from the new service
    const result = await getOnThisDayHighlights(userId, { limit: 20 });

    const today = new Date();

    // Transform to DTO format matching frontend expectations
    const memoriesDTO = result.memories.map((m) => ({
      id: m.id,
      content: m.content,
      title: m.title,
      type: m.type,
      emotionalTone: m.emotionalTone,
      occurredAt: m.occurredAt instanceof Date ? m.occurredAt.toISOString() : m.occurredAt,
      personaId: m.personaId,
      personaName: m.personaId ? getPersonaName(m.personaId) : undefined,
      topicTags: m.topicTags,
      yearAgo: calculateYearsAgo(m.occurredAt),
      score: m.score,
      userReaction:
        m.reactions.length > 0 ? m.reactions[m.reactions.length - 1].reaction : undefined,
    }));

    sendJSONCached(
      res,
      {
        memories: memoriesDTO,
        today: {
          month: today.getMonth() + 1, // 1-indexed for display
          date: today.getDate(),
          formatted: today.toLocaleDateString(undefined, { month: 'long', day: 'numeric' }),
        },
        hasContent: memoriesDTO.length > 0,
      },
      300 // Cache for 5 minutes
    );
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to get on-this-day memories');
    sendJSON(
      res,
      { memories: [], today: { month: 0, date: 0, formatted: '' }, hasContent: false },
      500
    );
  }
}

/**
 * GET /api/memories/highlights - Memory Lane highlights (scored)
 *
 * Returns top-scored memory highlights for the user.
 * Query params:
 *   - limit: max results (default 20)
 *   - type: filter by memory type
 *   - persona: filter by persona ID
 *   - cursor: pagination cursor
 */
export async function handleGetHighlights(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const { getHighlights, collectAllMemories } =
      await import('../../services/memory-lane/index.js');

    // Parse query params
    const limit = parseInt(parsedUrl.searchParams.get('limit') || '20', 10);
    const type = parsedUrl.searchParams.get('type') || undefined;
    const personaId = parsedUrl.searchParams.get('persona') || undefined;
    const cursor = parsedUrl.searchParams.get('cursor') || undefined;

    // Collect any new memories first (lightweight operation)
    await collectAllMemories(userId);

    // Get scored highlights
    const result = await getHighlights(userId, {
      types: type ? [type as never] : undefined,
      personaId,
      cursor,
      limit,
      sortBy: 'score',
      sortOrder: 'desc',
    });

    // Transform to DTO
    const memoriesDTO = result.memories.map((m) => ({
      id: m.id,
      content: m.content,
      title: m.title,
      type: m.type,
      emotionalTone: m.emotionalTone,
      occurredAt: m.occurredAt instanceof Date ? m.occurredAt.toISOString() : m.occurredAt,
      personaId: m.personaId,
      personaName: m.personaId ? getPersonaName(m.personaId) : undefined,
      topicTags: m.topicTags,
      yearAgo: calculateYearsAgo(m.occurredAt),
      score: m.score,
      userReaction:
        m.reactions.length > 0 ? m.reactions[m.reactions.length - 1].reaction : undefined,
    }));

    sendJSONCached(
      res,
      {
        memories: memoriesDTO,
        hasMore: result.hasMore,
        nextCursor: result.nextCursor,
      },
      60 // Cache for 1 minute
    );
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to get memory highlights');
    sendJSON(res, { memories: [], hasMore: false }, 500);
  }
}

/**
 * GET /api/memories/timeline - Chronological memory timeline
 *
 * Returns memories grouped by time period.
 * Query params:
 *   - limit: max results per group (default 20)
 *   - cursor: pagination cursor
 *   - groupBy: 'month' or 'year' (default 'month')
 */
export async function handleGetTimeline(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const { loadMemories } = await import('../../services/memory-lane/index.js');

    // Parse query params
    const limit = Math.min(parseInt(parsedUrl.searchParams.get('limit') || '50', 10), 200);
    const cursor = parsedUrl.searchParams.get('cursor') || undefined;
    const groupBy = (parsedUrl.searchParams.get('groupBy') || 'month') as 'month' | 'year';

    // Request one extra to detect if there are more pages
    const fetchLimit = limit + 1;

    // Load memories (with cursor-based pagination via limit)
    const memories = await loadMemories(userId, { limit: fetchLimit });

    // Apply cursor: skip memories up to and including the cursor ID
    let paginatedMemories = memories;
    if (cursor) {
      const cursorIndex = memories.findIndex((m) => m.id === cursor);
      if (cursorIndex >= 0) {
        paginatedMemories = memories.slice(cursorIndex + 1);
      }
    }

    // Detect if there are more pages
    const hasMore = paginatedMemories.length > limit;
    const pageMemories = paginatedMemories.slice(0, limit);

    // Build next cursor from the last memory in this page
    const nextCursor =
      hasMore && pageMemories.length > 0 ? pageMemories[pageMemories.length - 1].id : undefined;

    // Group by time period
    const groups = groupMemoriesByPeriod(pageMemories, groupBy);

    // Transform to response format
    const response = {
      groups: groups.map((g) => ({
        label: g.label,
        memories: g.memories.map((m) => ({
          id: m.id,
          content: m.content,
          title: m.title,
          type: m.type,
          emotionalTone: m.emotionalTone,
          occurredAt: m.occurredAt instanceof Date ? m.occurredAt.toISOString() : m.occurredAt,
          personaId: m.personaId,
          personaName: m.personaId ? getPersonaName(m.personaId) : undefined,
          topicTags: m.topicTags,
          yearAgo: calculateYearsAgo(m.occurredAt),
        })),
        count: g.memories.length,
      })),
      totalMemories: pageMemories.length,
      hasMore,
      nextCursor,
    };

    sendJSONCached(res, response, 60);
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to get memory timeline');
    sendJSON(res, { groups: [], totalMemories: 0, hasMore: false }, 500);
  }
}

/**
 * PATCH /api/memories/:id/reaction - Record user reaction to memory
 *
 * Body: { reaction: 'loved' | 'dismissed' | 'shared' | 'revisited' }
 */
export async function handleMemoryReaction(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL,
  memoryId: string
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    // Parse request body
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }

    const { reaction } = JSON.parse(body || '{}') as {
      reaction?: 'loved' | 'dismissed' | 'shared' | 'revisited';
    };

    if (!reaction || !['loved', 'dismissed', 'shared', 'revisited'].includes(reaction)) {
      sendError(res, 'Invalid reaction type', 400);
      return;
    }

    const { recordReaction } = await import('../../services/memory-lane/index.js');
    const success = await recordReaction(userId, memoryId, reaction, 'browse');

    if (success) {
      log.info({ userId, memoryId, reaction }, 'Recorded memory reaction');
      sendJSON(res, { success: true, memoryId, reaction });
    } else {
      sendError(res, API_ERRORS.OPERATION_FAILED, 500);
    }
  } catch (err) {
    log.error({ error: err, userId, memoryId }, 'Failed to record memory reaction');
    sendError(res, API_ERRORS.OPERATION_FAILED, 500);
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

interface MemoryForGrouping {
  id: string;
  content: string;
  title?: string;
  type: string;
  emotionalTone: string;
  occurredAt: Date | string;
  personaId?: string;
  topicTags: string[];
}

interface MemoryGroup {
  label: string;
  startDate: Date;
  memories: MemoryForGrouping[];
}

function groupMemoriesByPeriod(
  memories: MemoryForGrouping[],
  groupBy: 'month' | 'year'
): MemoryGroup[] {
  const groups = new Map<string, MemoryGroup>();

  for (const memory of memories) {
    const date =
      memory.occurredAt instanceof Date ? memory.occurredAt : new Date(memory.occurredAt);
    let key: string;
    let label: string;

    if (groupBy === 'month') {
      key = `${date.getFullYear()}-${date.getMonth()}`;
      label = date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    } else {
      key = `${date.getFullYear()}`;
      label = date.getFullYear().toString();
    }

    if (!groups.has(key)) {
      groups.set(key, {
        label,
        startDate: new Date(date.getFullYear(), groupBy === 'month' ? date.getMonth() : 0, 1),
        memories: [],
      });
    }

    groups.get(key)!.memories.push(memory);
  }

  // Sort groups by date (most recent first)
  return Array.from(groups.values()).sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
}

function calculateYearsAgo(occurredAt: Date | string): number {
  const date = occurredAt instanceof Date ? occurredAt : new Date(occurredAt);
  const now = new Date();
  return now.getFullYear() - date.getFullYear();
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

/**
 * Route handler for memories endpoints
 */
export async function handleMemoriesRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  if (pathname === '/api/cognitive/memories' && req.method === 'GET') {
    await handleGetCognitiveMemories(req, res, parsedUrl);
    return true;
  }

  if (pathname === '/api/cognitive/superhuman-insights' && req.method === 'GET') {
    await handleGetSuperhumanInsights(req, res, parsedUrl);
    return true;
  }

  // Memory Lane - On This Day
  if (pathname === '/api/memories/on-this-day' && req.method === 'GET') {
    await handleGetOnThisDay(req, res, parsedUrl);
    return true;
  }

  // Memory Lane - Highlights (NEW)
  if (pathname === '/api/memories/highlights' && req.method === 'GET') {
    await handleGetHighlights(req, res, parsedUrl);
    return true;
  }

  // Memory Lane - Timeline (NEW)
  if (pathname === '/api/memories/timeline' && req.method === 'GET') {
    await handleGetTimeline(req, res, parsedUrl);
    return true;
  }

  // Memory Lane - Reaction (NEW)
  const reactionMatch = pathname.match(/^\/api\/memories\/([^/]+)\/reaction$/);
  if (reactionMatch && req.method === 'PATCH') {
    await handleMemoryReaction(req, res, parsedUrl, decodeURIComponent(reactionMatch[1]));
    return true;
  }

  const deleteMatch = pathname.match(/^\/api\/cognitive\/memories\/([^/]+)$/);
  if (deleteMatch && req.method === 'DELETE') {
    await handleDeleteMemory(req, res, parsedUrl, decodeURIComponent(deleteMatch[1]));
    return true;
  }

  return false;
}
