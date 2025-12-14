/**
 * Cognitive Memories Routes
 *
 * GET /api/cognitive/memories - Get what I've learned about the user
 * DELETE /api/cognitive/memories/:id - Forget a specific memory
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { requireUserId, sendJSON, sendJSONCached, sendError } from '../helpers.js';
import { API_ERRORS } from '../error-messages.js';
import {
  type AnyRecord,
  type UIMemory,
  type Pattern,
  mapMemoryTypeToUIType,
  formatMemoryContent,
  calculateConfidence,
  getPersonaName,
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
    const { getAllUserMemories } = await import('../../services/persona-memories.js');
    const { getDefaultStore } = await import('../../memory/index.js');
    const { extractLearnedMemories } = await import('../../services/learned-memories.js');

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
      const profileData = extractLearnedMemories(
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
    const { forget } = await import('../../services/persona-memories.js');
    const personaDeleted = await forget(memoryId);
    if (personaDeleted) {
      deleted = true;
      deleteSource = 'persona_memory';
    }

    // Try profile-based memories
    if (!deleted) {
      const { deleteMemoryFromProfile } = await import('../../services/learned-memories.js');
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
      { userId, insightCount: uiInsights.length, highPriority: uiInsights.filter((i) => i.priority === 'high').length },
      'Returning superhuman insights'
    );

    sendJSONCached(res, {
      insights: uiInsights,
      temporalContext: context.temporalContext,
      topicAbsences,
      comfortGuidance: {
        stressLevel: context.comfortGuidance.stressLevel,
        supportType: context.comfortGuidance.supportType,
      },
    }, 300); // Cache for 5 minutes
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to get superhuman insights');
    sendError(res, API_ERRORS.OPERATION_FAILED, 500);
  }
}

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

  const deleteMatch = pathname.match(/^\/api\/cognitive\/memories\/([^/]+)$/);
  if (deleteMatch && req.method === 'DELETE') {
    await handleDeleteMemory(req, res, parsedUrl, decodeURIComponent(deleteMatch[1]));
    return true;
  }

  return false;
}
