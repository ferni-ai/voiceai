/**
 * Voice Journal: requests are authenticated, and a save never claims what it didn't do.
 *
 * Audit 2026-10-13 (legacy-e2e journal.md, section 1):
 * - /api/journal/transcribe, /prompt and /prompts were bare fetches with no token,
 *   so the auth door answered 401 on prod and transcription never worked;
 * - the audio is never uploaded, yet a failed transcription saved
 *   "[Voice recording - N seconds]" as the entry and toasted "Audio saved!".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/firebase-auth.service.js', () => ({
  getAuthToken: vi.fn(async () => 'jwt.test.token'),
  getFirebaseUid: vi.fn(() => 'uid-1'),
  initAuth: vi.fn(async () => undefined),
}));

const { addMemory, listMemories } = vi.hoisted(() => ({
  addMemory: vi.fn(async () => ({ id: 'm1' })),
  listMemories: vi.fn(async () => []),
}));
vi.mock('../../src/services/custom-agent.service.js', () => ({ addMemory, listMemories }));

const toast = vi.hoisted(() => ({
  info: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));
vi.mock('../../src/ui/whisper.ui.js', () => ({ toast }));

const { saveJournalEntry } = await import('../../src/ui/voice-journal/save.js');
const { fetchPrompt, prefetchPrompts } = await import('../../src/ui/voice-journal/prompts.js');
const { setCurrentAgent, setCurrentPrompt, setRecordingDuration } = await import(
  '../../src/ui/voice-journal/state.js'
);
const { t } = await import('../../src/i18n/index.js');

type Reply = { status: number; body: unknown };
let replies: Record<string, Reply> = {};
const fetchMock = vi.fn(async (url: string) => {
  const reply = replies[url] ?? { status: 404, body: {} };
  return new Response(JSON.stringify(reply.body), {
    status: reply.status,
    headers: { 'Content-Type': 'application/json' },
  });
});

function authHeaderFor(url: string): string | undefined {
  const call = fetchMock.mock.calls.find(([u]) => u === url) as
    | [string, RequestInit | undefined]
    | undefined;
  return (call?.[1]?.headers as Record<string, string> | undefined)?.['Authorization'];
}

const recording = new Blob(['fake audio'], { type: 'audio/webm' });
const prompt = { id: 'p1', category: 'reflection', prompt: 'What went well today?' };

/** Every toast text shown, of any kind. */
function toastsShown(): string[] {
  return Object.values(toast).flatMap((fn) => fn.mock.calls.map((c) => String(c[0])));
}

beforeEach(() => {
  replies = { '/api/journal/prompt': { status: 200, body: { prompt } } };
  fetchMock.mockClear();
  addMemory.mockClear();
  Object.values(toast).forEach((fn) => fn.mockClear());
  vi.stubGlobal('fetch', fetchMock);
  setCurrentAgent({ id: 'twin-1', type: 'twin', name: 'Sam' } as never);
  setCurrentPrompt(null);
  setRecordingDuration(42);
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('Voice Journal requests carry the sign-in token', () => {
  it('sends Authorization on transcribe', async () => {
    replies['/api/journal/transcribe'] = {
      status: 200,
      body: { success: true, transcript: 'Walked by the lake.' },
    };
    await saveJournalEntry(recording);
    expect(authHeaderFor('/api/journal/transcribe')).toBe('Bearer jwt.test.token');
  });

  it('sends Authorization on the prompt request', async () => {
    await fetchPrompt();
    expect(authHeaderFor('/api/journal/prompt')).toBe('Bearer jwt.test.token');
  });

  it('sends Authorization on the prompt prefetch', async () => {
    await prefetchPrompts();
    expect(authHeaderFor('/api/journal/prompts')).toBe('Bearer jwt.test.token');
  });
});

describe('saving a recording', () => {
  it('saves the words and says the entry was saved', async () => {
    setCurrentPrompt(prompt as never);
    replies['/api/journal/transcribe'] = {
      status: 200,
      body: { success: true, transcript: 'Walked by the lake.' },
    };

    await saveJournalEntry(recording);

    expect(addMemory).toHaveBeenCalledTimes(1);
    expect(addMemory).toHaveBeenCalledWith(
      'twin-1',
      expect.objectContaining({
        type: 'journalEntry',
        content: 'Prompt: "What went well today?"\n\nWalked by the lake.',
      })
    );
    expect(toast.success).toHaveBeenCalledWith(t('toasts.entrySaved'));
  });

  it.each([
    ['the server has no speech-to-text', 200, { success: false, transcript: '[Transcription unavailable]' }],
    ['the auth door refuses', 401, { error: 'Unauthorized' }],
    ['the words come back empty', 200, { success: true, transcript: '   ' }],
  ])('saves nothing and says so plainly when %s', async (_label, status, body) => {
    replies['/api/journal/transcribe'] = { status, body };

    await saveJournalEntry(recording);

    expect(addMemory).not.toHaveBeenCalled();
    expect(toast.warning).toHaveBeenCalledWith(t('toasts.transcriptionUnavailable'));
    expect(toast.success).not.toHaveBeenCalled();
    const shown = toastsShown().join(' | ');
    expect(shown).not.toMatch(/audio saved|saving audio|voice recording -/i);
    expect(t('toasts.transcriptionUnavailable')).toMatch(/nothing was saved/);
  });
});
