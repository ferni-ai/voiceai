/**
 * A journal entry is the person's words, never a stand-in.
 *
 * Twin audit 2026-10-13: voice journal entries were saved as the literal text
 * "[Transcription unavailable]" (or "[Voice recording - N seconds]") with a 201.
 * POST /memories now refuses them, and the dormant audio route saves nothing
 * and uploads nothing when there is no transcript.
 */
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getCustomAgent, addMemoryToAgent, uploadVoiceJournalEntry, transcribeAudioBuffer } =
  vi.hoisted(() => ({
    getCustomAgent: vi.fn(async () => ({ id: 'twin-1', type: 'twin' }) as unknown),
    addMemoryToAgent: vi.fn(async () => ({ id: 'twin-1' }) as unknown),
    uploadVoiceJournalEntry: vi.fn(async () => null),
    transcribeAudioBuffer: vi.fn(async () => '[Transcription unavailable]'),
  }));
vi.mock('../../../services/custom-agent/custom-agent-persistence-service.js', () => ({
  getCustomAgent,
  addMemoryToAgent,
  removeMemoryFromAgent: vi.fn(),
}));
vi.mock('../../../services/custom-agent/gcs-storage-service.js', () => ({
  uploadVoiceJournalEntry,
}));
vi.mock('../../../services/custom-agent/memory-capture-service.js', () => ({
  transcribeAudioBuffer,
  extractMetadata: vi.fn(async () => ({ themes: [], emotions: [], keyPhrases: [] })),
}));

const { handleAddMemory } = await import('../memory-routes.js');
const { handleCreateJournalEntry } = await import('../journal-routes.js');
const { isJournalPlaceholder } =
  await import('../../../services/custom-agent/journal-placeholder.js');

function post(body: unknown) {
  const req = new EventEmitter() as IncomingMessage;
  req.method = 'POST';
  let status = 0;
  let raw = '';
  const res = {
    writeHead: vi.fn((code: number) => (status = code)),
    setHeader: vi.fn(),
    end: vi.fn((data?: string) => (raw = data ?? '')),
  } as unknown as ServerResponse;
  setTimeout(() => {
    req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  }, 0);
  return { req, res, result: () => ({ status, body: raw ? JSON.parse(raw) : null }) };
}

beforeEach(() => {
  addMemoryToAgent.mockClear();
  uploadVoiceJournalEntry.mockClear();
  transcribeAudioBuffer.mockReset();
  transcribeAudioBuffer.mockResolvedValue('[Transcription unavailable]');
});

describe('isJournalPlaceholder', () => {
  it.each([
    '[Transcription unavailable]',
    '[Voice recording - 42 seconds]',
    'Prompt: "What went well today?"\n\n[Voice recording - 7 seconds]',
    'Prompt: "What went well today?"\n\n',
    '   ',
  ])('treats %j as a placeholder', (text) => {
    expect(isJournalPlaceholder(text)).toBe(true);
  });

  it.each([
    'Walked by the lake.',
    'Prompt: "What went well today?"\n\nWalked by the lake.',
    '[Transcription unavailable] is what the app said, and I laughed.',
  ])('keeps real words %j', (text) => {
    expect(isJournalPlaceholder(text)).toBe(false);
  });
});

describe('POST /api/custom-agents/:id/memories', () => {
  it.each(['[Transcription unavailable]', 'Prompt: "Hi"\n\n[Voice recording - 9 seconds]'])(
    'refuses a journal entry of %j and stores nothing',
    async (content) => {
      const { req, res, result } = post({ type: 'journalEntry', content });
      await handleAddMemory(req, res, 'uid-1', 'twin-1');
      expect(result().status).toBe(422);
      expect(addMemoryToAgent).not.toHaveBeenCalled();
    }
  );

  it('still stores a journal entry with words', async () => {
    const { req, res, result } = post({ type: 'journalEntry', content: 'Walked by the lake.' });
    await handleAddMemory(req, res, 'uid-1', 'twin-1');
    expect(result().status).toBe(201);
    expect(addMemoryToAgent).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/custom-agents/:id/journal/entry', () => {
  const audio = Buffer.from('fake audio').toString('base64');

  it('saves and uploads nothing when there is no transcript', async () => {
    const { req, res, result } = post({ audio });
    await handleCreateJournalEntry(req, res, 'uid-1', 'twin-1');
    expect(result().status).toBe(422);
    expect(addMemoryToAgent).not.toHaveBeenCalled();
    expect(uploadVoiceJournalEntry).not.toHaveBeenCalled();
  });

  it('saves the words when there is a transcript', async () => {
    transcribeAudioBuffer.mockResolvedValue('Walked by the lake.');
    const { req, res, result } = post({ audio });
    await handleCreateJournalEntry(req, res, 'uid-1', 'twin-1');
    expect(result().status).toBe(201);
    expect(addMemoryToAgent).toHaveBeenCalledWith(
      'uid-1',
      'twin-1',
      'journalEntries',
      expect.objectContaining({ content: 'Walked by the lake.' })
    );
  });
});
