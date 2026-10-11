/**
 * Every clip the reaction paths can ask for exists in every persona's voice.
 * A missing clip plays nothing, so on a teammate the contextual backchannels,
 * the laugh-along and the "Hmm" opening went silent (they were Ferni-only).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@livekit/agents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@livekit/agents')>();
  class FakeBackgroundAudioPlayer {
    async start(): Promise<void> {}
    play() {
      return { done: () => true, stop: () => {} };
    }
    async close(): Promise<void> {}
  }
  return {
    ...actual,
    voice: { ...actual.voice, BackgroundAudioPlayer: FakeBackgroundAudioPlayer },
  };
});

const { REACTIONS } = await import('../backchannel-context.js');
const { LAUGH_CLIP, pickBackchannel } = await import('../backchannel-policy.js');
const { earlyOpeningClip, turnOpeningClip } = await import('../turn-opening-sound.js');
const { startBackchannelClips } = await import('../clip-player.js');
const cache = await import('../../shared/conversational-audio-cache.js');
const { backchannelsFor, CLIP_PERSONAS } = await import('../../shared/reaction-clips.js');
const { getVoiceIdForPersona } = await import('../../../config/voice-ids.js');

/** Everything the backchannel, laugh and turn-opening paths can request. */
function requestable(): Set<string> {
  const out = new Set<string>([LAUGH_CLIP, ...Object.values(REACTIONS).flat()]);
  for (const emotional of [false, true]) {
    for (const last of [null, 'Mm', 'Mhm', 'Mm-hmm', 'Yeah']) {
      for (let r = 0; r < 1; r += 0.05) out.add(pickBackchannel(emotional, last, () => r));
    }
  }
  const moment = { playedLastTurn: false, sinceLastClipMs: 1e9 };
  for (const transcript of ['what do you think?', 'so that happened']) {
    out.add(turnOpeningClip({ ...moment, transcript }, () => 0) as string);
  }
  const early = [
    'my dad passed away last week',
    'I got the job today finally',
    'work has been so exhausting lately',
    'what would you do in my shoes here?',
    'and then we drove home after',
  ];
  for (const t of early) {
    const first = earlyOpeningClip(t, null);
    if (first) out.add(first);
    const second = earlyOpeningClip(t, first);
    if (second) out.add(second);
  }
  return out;
}

describe('reaction clip coverage', () => {
  it('collects the phrases the paths actually request', () => {
    const asked = requestable();
    for (const p of ['Hmm', 'Mm', '[laughter]', 'Oh no', 'Whoa', 'Ha', 'Aw', 'Mm-hmm', 'Oof']) {
      expect(asked).toContain(p);
    }
  });

  it.each([...CLIP_PERSONAS])('%s renders every requestable clip', (persona) => {
    const clips = new Set(backchannelsFor(persona));
    expect([...requestable()].filter((p) => !clips.has(p))).toEqual([]);
  });

  it('keeps per-persona extras on top of the shared list', () => {
    expect(backchannelsFor('alex-chen')).toContain('Got it');
    expect(backchannelsFor('nayan-patel')).toEqual(
      expect.arrayContaining(['Yeah', 'Mhm', 'Right', 'Oh', 'Indeed'])
    );
  });
});

describe('a teammate on the call', () => {
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit) => new Response(new Int16Array(2400).fill(800).buffer)
  );

  beforeEach(async () => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('CARTESIA_API_KEY', 'test-key');
    vi.stubEnv('SKIP_CONVERSATIONAL_PREWARM', 'true');
    vi.stubEnv('BACKCHANNEL_CLIPS', 'on');
    vi.stubEnv('REACTION_SIDETRACK', 'off');
    cache.clearConversationalCache();
    await cache.prewarmConversationalAudio(); // boot, skipped: lookups allowed, cache empty
    fetchMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    cache.clearConversationalCache();
  });

  it.each(['alex-chen', 'nayan-patel', 'peter-lynch', 'john-bogle', 'joel-dickson'])(
    '%s gets its reaction clips in its own voice on first use',
    async (persona) => {
      // First lookup misses and starts rendering the persona's reactions.
      expect(cache.getCachedAudioForPersona('Oh no', persona)).toBeNull();
      expect(await cache.warmPersonaReactions(persona)).toBe(backchannelsFor(persona).length);
      const voiceId = getVoiceIdForPersona(persona);
      const bodies = fetchMock.mock.calls.map((c) => JSON.parse(String(c[1]?.body)));
      expect(bodies.every((b) => b.voice.id === voiceId)).toBe(true);

      const clips = await startBackchannelClips(
        {} as never,
        {} as never,
        () => persona,
        cache.getCachedAudioForPersona
      );
      for (const text of ['Oh no', LAUGH_CLIP, 'Hmm', 'Mhm']) {
        expect(clips?.playClip(text)).toBe(true);
      }
      expect(clips?.playClip('Not a rendered clip')).toBe(false);
      await clips?.close();
    }
  );

  it('renders a persona once, not on every lookup', async () => {
    cache.getCachedAudioForPersona('Mm', 'maya-santos');
    await cache.warmPersonaReactions('maya-santos');
    const calls = fetchMock.mock.calls.length;
    cache.getCachedAudioForPersona('Ha', 'maya-santos');
    await cache.warmPersonaReactions('maya-santos');
    expect(fetchMock.mock.calls.length).toBe(calls);
  });
});
