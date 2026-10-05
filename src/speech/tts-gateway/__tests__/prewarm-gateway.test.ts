/**
 * The greeting started on a cold Cartesia socket: the node opened it only when
 * the greeting's text arrived, so the handshake (~320 ms) landed in the first
 * audio (greeting send-to-audio 290-1012 ms vs ~180 ms warm, dev 2026-10-04).
 * Sessions now warm it at start.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const prewarm = vi.fn();
vi.mock('../providers/index.js', () => ({ getTTSProvider: () => ({ prewarm }) }));

const { prewarmTTSGateway } = await import('../index.js');

describe('prewarmTTSGateway', () => {
  afterEach(() => {
    prewarm.mockClear();
    vi.unstubAllEnvs();
  });

  it('opens the provider connection when the gateway is on', () => {
    vi.stubEnv('USE_TTS_GATEWAY', 'true');
    prewarmTTSGateway();
    expect(prewarm).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the gateway is off', () => {
    vi.stubEnv('USE_TTS_GATEWAY', 'false');
    prewarmTTSGateway();
    expect(prewarm).not.toHaveBeenCalled();
  });
});
