/**
 * Closing the clip player at hang-up must not reject. On the 2026-10-03 call
 * its close() rejected twice and reached the global unhandled-rejection
 * handler: "This operation was aborted" (the room disconnected first, aborting
 * the track unpublish) and "room failure: track not found" (the room had
 * already dropped the track).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const logger = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
const playerClose = vi.hoisted(() => vi.fn<() => Promise<void>>());

vi.mock('../../../utils/safe-logger.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createLogger: () => logger,
}));
vi.mock('@livekit/agents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@livekit/agents')>();
  class FakeBackgroundAudioPlayer {
    async start(): Promise<void> {}
    play() {
      return { done: () => true, stop: () => {} };
    }
    close(): Promise<void> {
      return playerClose();
    }
  }
  return {
    ...actual,
    voice: { ...actual.voice, BackgroundAudioPlayer: FakeBackgroundAudioPlayer },
  };
});

const { startBackchannelClips } = await import('../clip-player.js');

async function closeAfter(error: Error): Promise<void> {
  playerClose.mockRejectedValueOnce(error);
  const clips = await startBackchannelClips(
    {} as never,
    {} as never,
    () => 'ferni',
    () => null
  );
  if (!clips) throw new Error('clip player did not start');
  await clips.close();
}

function abortError(): Error {
  const error = new Error('This operation was aborted');
  error.name = 'AbortError';
  return error;
}

describe('clip player close', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolves when the room disconnected first and aborted the unpublish', async () => {
    await expect(closeAfter(abortError())).resolves.toBeUndefined();
    expect(logger.debug).toHaveBeenCalledWith(
      { error: 'AbortError: This operation was aborted' },
      'clip player closed after the room went away'
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('resolves when the room already dropped the track', async () => {
    await expect(closeAfter(new Error('room failure: track not found'))).resolves.toBeUndefined();
    expect(logger.debug).toHaveBeenCalledWith(
      { error: 'Error: room failure: track not found' },
      'clip player closed after the room went away'
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('warns on any other close failure instead of rejecting', async () => {
    await expect(closeAfter(new Error('mixer exploded'))).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      { error: 'Error: mixer exploded' },
      'clip player close failed'
    );
  });
});
