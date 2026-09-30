import { beforeEach, describe, expect, it, vi } from 'vitest';

const stored = {
  samples: [
    {
      timestamp: '2026-09-01T10:00:00.000Z',
      characteristics: { pitchMean: 140 },
      detectedEmotion: 'neutral',
    },
  ],
};
const set = vi.fn();
const load = vi.fn(async () => stored);

vi.mock('../../persistence/index.js', () => ({
  createPersistenceStore: () => ({ load, set, flush: vi.fn(async () => undefined) }),
}));

const { recordVoiceSample, loadVoiceBaseline, shutdownVoiceProsody } =
  await import('../voice-prosody-learning.js');

const sample = { pitchMean: 150 } as Parameters<typeof recordVoiceSample>[1];

describe('voice prosody persistence', () => {
  beforeEach(async () => {
    await shutdownVoiceProsody();
    set.mockClear();
    load.mockClear();
  });

  it('adds to the stored history instead of overwriting it with this call', async () => {
    recordVoiceSample('user-1', sample);
    await vi.waitFor(() => expect(set).toHaveBeenCalled());
    const saved = set.mock.calls.at(-1)?.[1] as { samples: unknown[] };
    expect(saved.samples).toHaveLength(2);
  });

  it('loads a caller once, however many ask at the same time', async () => {
    await Promise.all([loadVoiceBaseline('user-2'), loadVoiceBaseline('user-2')]);
    recordVoiceSample('user-2', sample);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
