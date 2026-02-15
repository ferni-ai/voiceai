/**
 * Kyutai STT Client unit tests.
 *
 * Uses mock moshi-server for STT WebSocket protocol.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMockMoshiServer } from '../../__tests__/mocks/mock-moshi-server.js';
import type { MockMoshiServerResult } from '../../__tests__/mocks/mock-moshi-server.js';
import { KyutaiSTTClient } from '../kyutai-stt.js';

describe('KyutaiSTTClient', () => {
  let mock: MockMoshiServerResult;
  let client: KyutaiSTTClient;

  beforeAll(async () => {
    mock = await startMockMoshiServer({
      sttInterim: true,
      sttText: 'mock transcript',
    });
  });

  afterAll(async () => {
    await mock.close();
  });

  it('connects to STT server WebSocket', async () => {
    client = new KyutaiSTTClient({ sttUrl: mock.sttUrl });
    await client.connect();
    expect(client.isConnected()).toBe(true);
    client.close();
  });

  it('sends binary audio chunks via sendAudio()', async () => {
    client = new KyutaiSTTClient({ sttUrl: mock.sttUrl });
    await client.connect();
    const buf = Buffer.alloc(640);
    expect(() => client.sendAudio(buf)).not.toThrow();
    expect(() => client.sendAudio(buf.buffer)).not.toThrow();
    client.close();
  });

  it('receives and parses interim transcript events', async () => {
    client = new KyutaiSTTClient({ sttUrl: mock.sttUrl });
    const transcripts: Array<{ text: string; isFinal: boolean }> = [];
    client.onTranscript((ev) => transcripts.push({ text: ev.text, isFinal: ev.isFinal }));
    await client.connect();
    client.sendAudio(Buffer.alloc(640));
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 10));
      if (transcripts.some((t) => !t.isFinal)) break;
    }
    expect(transcripts.length).toBeGreaterThanOrEqual(1);
    expect(transcripts.some((t) => !t.isFinal)).toBe(true);
    client.close();
  });

  it('receives and parses final transcript events', async () => {
    client = new KyutaiSTTClient({ sttUrl: mock.sttUrl });
    const transcripts: Array<{ text: string; isFinal: boolean }> = [];
    client.onTranscript((ev) => transcripts.push({ text: ev.text, isFinal: ev.isFinal }));
    await client.connect();
    client.sendAudio(Buffer.alloc(640));
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 10));
      if (transcripts.find((t) => t.isFinal && t.text === 'mock transcript')) break;
    }
    const finalEv = transcripts.find((t) => t.isFinal && t.text === 'mock transcript');
    expect(finalEv).toBeDefined();
    client.close();
  });

  it('handles VAD events (speaking start/stop)', async () => {
    client = new KyutaiSTTClient({ sttUrl: mock.sttUrl });
    const vadEvents: Array<{ isSpeaking: boolean }> = [];
    client.onVAD((ev) => vadEvents.push({ isSpeaking: ev.isSpeaking }));
    await client.connect();
    client.sendAudio(Buffer.alloc(640));
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 10));
      if (vadEvents.some((v) => v.isSpeaking === false)) break;
    }
    expect(vadEvents.some((v) => v.isSpeaking === false)).toBe(true);
    client.close();
  });

  it('sendAudio does nothing when not connected', () => {
    client = new KyutaiSTTClient({ sttUrl: mock.sttUrl });
    expect(() => client.sendAudio(Buffer.alloc(64))).not.toThrow();
    expect(client.isConnected()).toBe(false);
  });

  it('respects close() cleanup', async () => {
    client = new KyutaiSTTClient({ sttUrl: mock.sttUrl });
    await client.connect();
    client.close();
    expect(client.isConnected()).toBe(false);
    expect(() => client.sendAudio(Buffer.alloc(64))).not.toThrow();
  });

  it('handles server unreachable gracefully', async () => {
    client = new KyutaiSTTClient({
      sttUrl: 'ws://127.0.0.1:31999/api/asr-streaming',
    });
    await expect(client.connect()).rejects.toThrow();
  });
});
