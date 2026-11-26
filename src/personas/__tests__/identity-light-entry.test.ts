/**
 * personas/identity/index.ts is the light entry (#4154): importing it for persona ids and
 * display names must load neither the audio stack nor a session registry. Each mock records
 * that its module was loaded; the control row shows the full personas index does load them,
 * so a quiet light row means the entry really skips them.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loaded = vi.hoisted(() => new Set<string>());

vi.mock('../../audio/music-player.js', async (importOriginal) => {
  loaded.add('audio/music-player');
  return importOriginal();
});
vi.mock('../../utils/session-registry.js', async (importOriginal) => {
  loaded.add('utils/session-registry');
  return importOriginal();
});
vi.mock('@livekit/agents', async (importOriginal) => {
  loaded.add('@livekit/agents');
  return importOriginal();
});

beforeEach(() => {
  vi.resetModules();
  loaded.clear();
});

describe('personas light identity entry', () => {
  it('loads no audio, no session registry and no LiveKit agents', async () => {
    const identity = await import('../identity/index.js');
    expect(identity.livePersonaId(identity.CANONICAL_IDS.COACH)).toBe(identity.CANONICAL_IDS.COACH);
    expect(identity.DISPLAY_NAMES[identity.CANONICAL_IDS.COACH]).toBe('Ferni');
    expect([...loaded]).toEqual([]);
  });

  it('control: the full personas index does load the audio stack and a session registry', async () => {
    await import('../index.js');
    expect(loaded.has('audio/music-player')).toBe(true);
    expect(loaded.has('utils/session-registry')).toBe(true);
  }, 60_000);

  it('the personas index publishes the same ids and names, from the light entry', async () => {
    const identity = await import('../identity/index.js');
    const personas = await import('../index.js');
    for (const name of Object.keys(identity)) {
      expect(personas[name as keyof typeof personas], name).toBe(
        identity[name as keyof typeof identity]
      );
    }
  }, 60_000);
});
