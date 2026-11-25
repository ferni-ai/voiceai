/**
 * POST /api/landing/tts is unauthenticated: it speaks any text, in any persona's voice
 * the client names. It must never speak in a consented clone (personas/roster): not
 * as Seth, whatever his flag says, and not as a persona whose voice is set to one.
 * The voice ids here are invented.
 */
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const voice = vi.hoisted(() => ({ calls: [] as Array<{ text: string; personaId?: string }> }));

vi.mock('../../services/voice/voice-call.js', () => ({
  generatePersonaVoice: vi.fn(async (text: string, personaId?: string) => {
    voice.calls.push({ text, personaId });
    return Buffer.from('mp3');
  }),
}));

function post(body: unknown): IncomingMessage {
  return Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), {
    method: 'POST',
    url: '/api/landing/tts',
    headers: { host: 'app.ferni.ai', 'content-type': 'application/json' },
    socket: { remoteAddress: '203.0.113.9' },
  }) as unknown as IncomingMessage;
}

function response(): ServerResponse & { status?: number } {
  const state = { status: undefined as number | undefined, headersSent: false };
  const res = Object.assign(state, {
    setHeader: () => res,
    getHeader: () => undefined,
    writeHead(status: number) {
      state.status = status;
      state.headersSent = true;
      return res;
    },
    end: () => res,
  });
  return res as unknown as ServerResponse & { status?: number };
}

async function speak(personaId: string): Promise<number | undefined> {
  vi.resetModules();
  const { handleLandingIntelligenceRoutes } = await import('../landing-intelligence.routes.js');
  const res = response();
  const text = 'Say anything I like.';
  await handleLandingIntelligenceRoutes(post({ text, personaId }), res, '/api/landing/tts');
  return res.status;
}

beforeEach(() => {
  voice.calls = [];
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/landing/tts never speaks in a consented clone', () => {
  it('refuses Seth with his flag on and his voice set', async () => {
    vi.stubEnv('SETH_TEAMMATE', 'on');
    vi.stubEnv('ROSTER_VOICE_SETH', 'fake-seth-id');
    for (const id of ['seth', 'SETH', ' seth ']) expect(await speak(id), id).toBe(404);
    expect(voice.calls).toEqual([]);
  });

  it('refuses Seth with his flag off', async () => {
    vi.stubEnv('SETH_TEAMMATE', 'off');
    vi.stubEnv('ROSTER_VOICE_SETH', '');
    expect(await speak('seth')).toBe(404);
    expect(voice.calls).toEqual([]);
  });

  it('refuses a persona whose voice is set to a consented clone', async () => {
    vi.stubEnv('LEGEND_VOICE_JOHN_BOGLE', 'fake-legend-id');
    vi.stubEnv('JOHN_BOGLE_VOICE_ID', 'fake-legend-id');
    expect(await speak('john-bogle')).toBe(404);
    expect(voice.calls).toEqual([]);
  });

  it('still speaks as a teammate in their own voice', async () => {
    expect(await speak('maya-santos')).toBe(200);
    expect(voice.calls).toHaveLength(1);
  });
});
