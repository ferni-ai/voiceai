/**
 * Custom Agent Journal Routes
 *
 * Handles voice journal entries for Digital Twin agents.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { parseBody } from '../helpers.js';
import {
  getCustomAgent,
  addMemoryToAgent,
} from '../../services/custom-agent/custom-agent-persistence-service.js';
import type { JournalEntryBody } from './types.js';
import { sendJson } from './helpers.js';

const log = createLogger({ module: 'CustomAgentJournalRoutes' });

/**
 * POST /api/custom-agents/:agentId/journal/entry - Record journal entry
 */
export async function handleCreateJournalEntry(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  agentId: string
): Promise<boolean> {
  const body = await parseBody<JournalEntryBody>(req);

  if (!body.audio) {
    sendJson(res, 400, { error: 'Audio data is required' });
    return true;
  }

  const agent = await getCustomAgent(userId, agentId);
  if (!agent) {
    sendJson(res, 404, { error: 'Agent not found' });
    return true;
  }

  // Only allow journal entries for Digital Twin agents
  if (agent.type !== 'twin') {
    sendJson(res, 400, { error: 'Voice journal is only available for Digital Twin agents' });
    return true;
  }

  try {
    const { uploadVoiceJournalEntry } =
      await import('../../services/custom-agent/gcs-storage-service.js');
    const { transcribeAudioBuffer, extractMetadata } =
      await import('../../services/custom-agent/memory-capture-service.js');

    // Decode base64 audio
    const audioBuffer = Buffer.from(body.audio, 'base64');
    const mimeType = body.mimeType || 'audio/webm';
    const timestamp = new Date().toISOString();

    // Upload to GCS
    let audioUrl: string | null = null;
    const entryId = `journal_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const uploadResult = await uploadVoiceJournalEntry(audioBuffer, userId, agentId, entryId);

    if (uploadResult) {
      audioUrl = uploadResult.publicUrl;
      log.info({ audioUrl }, 'Journal audio uploaded to GCS');
    } else {
      log.warn('GCS upload failed, continuing without audio URL');
    }

    // Transcribe audio
    const transcript = await transcribeAudioBuffer(
      audioBuffer.buffer.slice(
        audioBuffer.byteOffset,
        audioBuffer.byteOffset + audioBuffer.byteLength
      ),
      mimeType
    );

    // Extract metadata from transcript
    const metadata = await extractMetadata(transcript, 'journal_entry');

    // Create journal entry
    const journalEntry = {
      id: entryId,
      content: transcript,
      audioUrl,
      title: metadata.title || `Journal Entry - ${new Date().toLocaleDateString()}`,
      mood: body.mood || metadata.emotions?.[0] || 'reflective',
      context: body.context,
      themes: metadata.themes || [],
      emotions: metadata.emotions || [],
      keywords: metadata.keyPhrases || [],
      summary: metadata.summary,
      timestamp,
      createdAt: new Date(),
    };

    // Add to agent's journal entries
    const updated = await addMemoryToAgent(
      userId,
      agentId,
      'journalEntries' as never,
      journalEntry
    );

    if (!updated) {
      sendJson(res, 500, { error: 'Failed to save journal entry' });
      return true;
    }

    log.info({ userId, agentId, entryId: journalEntry.id }, 'Journal entry created');
    sendJson(res, 201, {
      message: 'Journal entry recorded',
      entry: journalEntry,
      transcriptLength: transcript.length,
    });
  } catch (error) {
    log.error({ error: String(error), userId, agentId }, 'Journal entry creation failed');
    sendJson(res, 500, { error: 'Failed to create journal entry' });
  }
  return true;
}

/**
 * GET /api/custom-agents/:agentId/journal/entries - List journal entries
 */
export async function handleListJournalEntries(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  agentId: string,
  parsedUrl: URL
): Promise<boolean> {
  const limit = parseInt(parsedUrl.searchParams.get('limit') || '10', 10);

  const agent = await getCustomAgent(userId, agentId);
  if (!agent) {
    sendJson(res, 404, { error: 'Agent not found' });
    return true;
  }

  const entries = (agent.memories.journalEntries || [])
    .sort((a, b) => {
      const aEntry = a as { createdAt?: Date | string };
      const bEntry = b as { createdAt?: Date | string };
      const aTime = aEntry.createdAt ? new Date(aEntry.createdAt).getTime() : 0;
      const bTime = bEntry.createdAt ? new Date(bEntry.createdAt).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, limit);

  sendJson(res, 200, {
    entries,
    total: agent.memories.journalEntries?.length || 0,
    limit,
  });
  return true;
}
