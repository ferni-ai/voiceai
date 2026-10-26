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
import { isJournalPlaceholder } from '../../services/custom-agent/journal-placeholder.js';
import { deleteVoiceJournalAudio } from '../../services/custom-agent/gcs-storage-service.js';
import { journalOneStoreOn } from '../../services/journal/journal-ports.js';
import { firestoreJournalStore as journalStore } from '../../services/stores/journal-store.js';
import { journalChanged } from './journal-view.js';
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

  // "[Transcription unavailable]" or "[Voice recording - N seconds]" is not something
  // the person said; it used to be saved as their entry with a 201.
  if (body.type === 'journalEntry' && isJournalPlaceholder(body.content)) {
    log.warn({ userId, agentId }, 'Journal entry without words rejected');
    sendJson(res, 422, { error: 'A journal entry needs words' });
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

  // JOURNAL_ONE_STORE: the one journal store, tagged with this agent, not the agent's array
  if (body.type === 'journalEntry' && journalOneStoreOn()) {
    const { phrase: _phrase, context: _context, ...entry } = memory;
    const saved = await journalStore.add(userId, { ...entry, agentId, source: 'digital_twin' });
    journalChanged(userId);
    log.info({ userId, agentId, entryId: saved.id }, 'Journal entry added');
    sendJson(res, 201, { message: 'Memory added', memory: saved });
    return true;
  }

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
  const wantsJournal = journalOneStoreOn() && (!memoryType || memoryType === 'journalEntry');
  const journal = wantsJournal ? await journalStore.listForAgent(userId, agent) : undefined;

  if (memoryType === 'journalEntry' && journal) {
    memories = journal;
  } else if (memoryType) {
    const key = TYPE_MAP[memoryType] as keyof typeof agent.memories;
    if (key && agent.memories[key]) {
      memories = agent.memories[key] as unknown[];
    }
  } else {
    memories = [
      ...agent.memories.stories,
      ...agent.memories.wisdom,
      ...agent.memories.sharedMoments,
      ...(journal ?? agent.memories.journalEntries ?? []),
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
  // The web client used to send no ?type= (so every delete was a 400); find it then.
  const memoryType =
    parsedUrl.searchParams.get('type') ?? (await findMemoryType(userId, agentId, memoryId));

  if (!memoryType) {
    sendJson(res, 404, { error: 'Agent or memory not found' });
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
  // A migrated entry is in both places; leaving the store copy would bring it back.
  if (internalType === 'journalEntries' && journalOneStoreOn()) {
    await journalStore.remove(userId, memoryId);
    journalChanged(userId);
  }
  // A voice entry's recording goes with it (best effort, logs a failure)
  if (internalType === 'journalEntries') await deleteVoiceJournalAudio(userId, agentId, memoryId);

  log.info({ userId, agentId, memoryId }, 'Memory deleted');
  res.writeHead(204);
  res.end();
  return true;
}

/**
 * Which memory type holds `memoryId` on the caller's own agent, or null. With
 * JOURNAL_ONE_STORE on, an id in none of the agent's arrays may be a journal
 * entry that lives only in the journal store.
 */
async function findMemoryType(
  userId: string,
  agentId: string,
  memoryId: string
): Promise<string | null> {
  const agent = await getCustomAgent(userId, agentId);
  if (!agent) return null;
  const memories = agent.memories as unknown as Record<string, Array<{ id?: unknown }> | undefined>;
  const found = Object.entries(TYPE_MAP).find(([, key]) =>
    (memories?.[key] ?? []).some((m) => m?.id === memoryId)
  );
  if (found) return found[0];
  return journalOneStoreOn() ? 'journalEntry' : null;
}
