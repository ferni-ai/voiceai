/**
 * Custom Agent Memory Routes
 *
 * Handles memory CRUD operations for custom agents.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { parseBody } from '../helpers.js';
import {
  getCustomAgent,
  addMemoryToAgent,
  removeMemoryFromAgent,
} from '../../services/custom-agent/custom-agent-persistence-service.js';
import type { MemoryBody } from './types.js';
import { sendJson, extractKeywords } from './helpers.js';

const log = createLogger({ module: 'CustomAgentMemoryRoutes' });

const VALID_MEMORY_TYPES = ['story', 'wisdom', 'sharedMoment', 'journalEntry'];
const TYPE_MAP: Record<string, string> = {
  story: 'stories',
  wisdom: 'wisdom',
  sharedMoment: 'sharedMoments',
  journalEntry: 'journalEntries',
};

/**
 * POST /api/custom-agents/:agentId/memories - Add memory
 */
export async function handleAddMemory(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  agentId: string
): Promise<boolean> {
  const body = await parseBody<MemoryBody>(req);

  if (!body.type || !body.content) {
    sendJson(res, 400, { error: 'Type and content are required' });
    return true;
  }

  if (!VALID_MEMORY_TYPES.includes(body.type)) {
    sendJson(res, 400, { error: 'Invalid memory type' });
    return true;
  }

  const agent = await getCustomAgent(userId, agentId);
  if (!agent) {
    sendJson(res, 404, { error: 'Agent not found' });
    return true;
  }

  const memory = {
    content: body.content,
    audioUrl: body.audioUrl,
    title: body.title,
    phrase: body.phrase,
    context: body.context,
    mood: body.mood,
    themes: body.themes || [],
    emotions: body.emotions || [],
    keywords: body.keywords || extractKeywords(body.content),
  };

  const updated = await addMemoryToAgent(userId, agentId, TYPE_MAP[body.type] as never, memory);

  if (!updated) {
    sendJson(res, 500, { error: 'Failed to add memory' });
    return true;
  }

  log.info({ userId, agentId, type: body.type }, 'Memory added');
  sendJson(res, 201, { message: 'Memory added', memory });
  return true;
}

/**
 * GET /api/custom-agents/:agentId/memories - List memories
 */
export async function handleListMemories(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  agentId: string,
  parsedUrl: URL
): Promise<boolean> {
  const memoryType = parsedUrl.searchParams.get('type');

  const agent = await getCustomAgent(userId, agentId);
  if (!agent) {
    sendJson(res, 404, { error: 'Agent not found' });
    return true;
  }

  let memories: unknown[] = [];

  if (memoryType) {
    const key = TYPE_MAP[memoryType] as keyof typeof agent.memories;
    if (key && agent.memories[key]) {
      memories = agent.memories[key] as unknown[];
    }
  } else {
    memories = [
      ...agent.memories.stories,
      ...agent.memories.wisdom,
      ...agent.memories.sharedMoments,
      ...(agent.memories.journalEntries || []),
    ];
  }

  sendJson(res, 200, memories);
  return true;
}

/**
 * DELETE /api/custom-agents/:agentId/memories/:memoryId - Delete memory
 */
export async function handleDeleteMemory(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  agentId: string,
  memoryId: string,
  parsedUrl: URL
): Promise<boolean> {
  const memoryType = parsedUrl.searchParams.get('type');

  if (!memoryType) {
    sendJson(res, 400, { error: 'Memory type is required' });
    return true;
  }

  const internalType = TYPE_MAP[memoryType];
  if (!internalType) {
    sendJson(res, 400, { error: 'Invalid memory type' });
    return true;
  }

  const updated = await removeMemoryFromAgent(userId, agentId, internalType as never, memoryId);

  if (!updated) {
    sendJson(res, 404, { error: 'Agent or memory not found' });
    return true;
  }

  log.info({ userId, agentId, memoryId }, 'Memory deleted');
  res.writeHead(204);
  res.end();
  return true;
}
