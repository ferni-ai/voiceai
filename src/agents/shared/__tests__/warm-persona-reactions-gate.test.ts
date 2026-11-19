/**
 * warmPersonaReactions renders nothing for a persona with no voice: with Seth's
 * gate closed his voice is '', and a render with an empty voice id would go to
 * Cartesia anyway. A persona with a voice still warms. The voice ids are invented.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function warmWith(personaId: string): Promise<{ rendered: number; voices: string[] }> {
  vi.stubEnv('CARTESIA_API_KEY', 'fake-key');
  const voices: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: { body: string }) => {
      voices.push((JSON.parse(init.body) as { voice: { id: string } }).voice.id);
      return new Response(null, { status: 500 });
    })
  );
  vi.resetModules();
  const { warmPersonaReactions } = await import('../conversational-audio-cache.js');
  return { rendered: await warmPersonaReactions(personaId), voices };
}

describe('warmPersonaReactions', () => {
  it('renders nothing for Seth while his gate is closed', async () => {
    vi.stubEnv('SETH_TEAMMATE', 'off');
    vi.stubEnv('ROSTER_VOICE_SETH', '');
    const { rendered, voices } = await warmWith('seth');
    expect(rendered).toBe(0);
    expect(voices).toEqual([]);
  });

  it('still warms a persona that has a voice', async () => {
    const { voices } = await warmWith('maya-santos');
    expect(voices.length).toBeGreaterThan(0);
    expect(voices.every((v) => v !== '')).toBe(true);
  });
});
