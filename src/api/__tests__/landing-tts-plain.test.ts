/**
 * POST /api/landing/tts plays the website's voice samples. It ran each line through
 * an old SSML humanizer the live calls never use: its tags were stripped before
 * Cartesia, but its words stayed, so samples began "Well..." or "Ah," and Ferni on
 * ferni.ai did not sound like Ferni in the app. Now the line goes to the voice as
 * written, the way a call speaks a reply.
 */
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const voice = vi.hoisted(() => ({ calls: [] as Array<{ text: string; personaId?: string }> }));

vi.mock('../../services/voice/voice-call.js', () => ({
  generatePersonaVoice: vi.fn(async (text: string, personaId?: string) => {
    voice.calls.push({ text, personaId });
    return Buffer.from('mp3');
  }),
}));

import { handleLandingIntelligenceRoutes } from '../landing-intelligence.routes.js';

function post(body: unknown): IncomingMessage {
  return Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), {
    method: 'POST',
    url: '/api/landing/tts',
    headers: { host: 'app.ferni.ai', 'content-type': 'application/json' },
    socket: { remoteAddress: '203.0.113.7' },
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

beforeEach(() => {
  voice.calls = [];
});

describe('POST /api/landing/tts speaks the line as written', () => {
  // These lines picked up "Well..." / "Ah," from the humanizer (2026-10-18).
  it.each([
    ['ferni', "That fear makes sense. Career changes are big. Let's sit with that together."],
    ['maya-santos', "Here's the plan: make it embarrassingly small. What habit are we working on?"],
  ])('%s: the exact words reach the voice, nothing added', async (personaId, text) => {
    const res = response();
    expect(
      await handleLandingIntelligenceRoutes(post({ text, personaId }), res, '/api/landing/tts')
    ).toBe(true);
    expect(res.status).toBe(200);
    expect(voice.calls).toEqual([{ text, personaId }]);
  });

  it('still refuses an empty or over-long line without calling the voice', async () => {
    for (const text of ['', 'x'.repeat(501)]) {
      const res = response();
      await handleLandingIntelligenceRoutes(post({ text }), res, '/api/landing/tts');
      expect(res.status).toBe(400);
    }
    expect(voice.calls).toEqual([]);
  });
});
