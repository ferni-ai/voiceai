/**
 * The production wiring for director nonverbals (PR #806): tts-wrapper (L4)
 * hands the gateway node an onNonverbal that writes to this call's quirk log,
 * keyed by the same session id the quirk note reads. The director itself (L1)
 * never imports the log; director-quirks.test.ts covers what it reports.
 */
import { ReadableStream, type ReadableStream as NodeReadableStream } from 'node:stream/web';
import type { voice } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { quirkEvents } from '../../../services/session/quirk-log.js';
import type { GatewayTTSNodeConfig } from '../../../speech/tts-gateway/index.js';

const seen: GatewayTTSNodeConfig[] = [];

vi.mock('../../../speech/tts-gateway/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../speech/tts-gateway/index.js')>()),
  isTTSGatewayEnabled: () => true,
  createGatewayTTSNode: (config: GatewayTTSNodeConfig) => {
    seen.push(config);
    return async (text: NodeReadableStream<string>) => {
      for await (const _ of text) {
        /* drain */
      }
      return null;
    };
  },
}));

afterEach(() => {
  delete process.env.QUIRK_AWARENESS;
  seen.length = 0;
});

async function speak(sessionId: string | undefined): Promise<GatewayTTSNodeConfig> {
  const { wrappedTtsNode } = await import('../tts-wrapper.js');
  await wrappedTtsNode(
    {} as voice.Agent,
    new ReadableStream<string>({
      start(c) {
        c.enqueue("I'm just teasing you, you know that.");
        c.close();
      },
    }),
    {} as voice.ModelSettings,
    { sessionContext: { sessionId, personaId: 'ferni', turnNumber: 4 } }
  );
  expect(seen).toHaveLength(1);
  return seen[0];
}

describe('tts-wrapper: director nonverbals reach the quirk log', () => {
  it('a laugh the director reports is recorded under the call session id', async () => {
    process.env.QUIRK_AWARENESS = 'on';
    const config = await speak('wrapper-quirk-1');
    config.onNonverbal?.({ kind: 'laugh', source: 'director', personaId: 'ferni', where: 'after' });
    expect(quirkEvents('wrapper-quirk-1')).toEqual([
      expect.objectContaining({ kind: 'laugh', source: 'director', where: 'after' }),
    ]);
  });

  it('without a session id nothing is recorded (no shared "unknown" log)', async () => {
    process.env.QUIRK_AWARENESS = 'on';
    const config = await speak(undefined);
    config.onNonverbal?.({ kind: 'laugh', source: 'director' });
    expect(quirkEvents('unknown')).toEqual([]);
  });

  it('with QUIRK_AWARENESS off the callback records nothing', async () => {
    const config = await speak('wrapper-quirk-2');
    config.onNonverbal?.({ kind: 'breath', source: 'director' });
    expect(quirkEvents('wrapper-quirk-2')).toEqual([]);
  });
});
