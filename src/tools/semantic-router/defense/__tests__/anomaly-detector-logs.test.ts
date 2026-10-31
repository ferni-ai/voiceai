/**
 * Anomaly detection embeds the user's words. Its logs and its returned reason carry
 * the error's class and status or the input's length, never the input or an error
 * message that quotes it.
 */
import { describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => [] as unknown[][]);
const SENTINEL = 'my sister Dolores has stage-three lupus';

vi.mock('../../../../utils/safe-logger.js', () => {
  const capture = (...args: unknown[]) => void logged.push(args);
  const logger = { debug: capture, info: capture, warn: capture, error: capture };
  return { createLogger: () => logger, getLogger: () => logger };
});

/** Cluster examples embed to [1, 0]; the user's words either fail or land far away. */
const mode = vi.hoisted(() => ({ userInput: 'fail' as 'fail' | 'far' }));
vi.mock('../../embedding-providers.js', () => ({
  cosineSimilarity: (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1],
  getEmbedding: async (text: string) => {
    if (!text.includes('Dolores')) return [1, 0];
    if (mode.userInput === 'far') return [0, 1];
    const error = new Error(`400 could not embed "${text}"`);
    error.name = 'ProviderEchoError';
    throw Object.assign(error, { status: 502 });
  },
}));

import { detectAnomaly } from '../anomaly-detector.js';

describe('detectAnomaly logs', () => {
  it('a failed embedding logs the class and status, and returns the class as the reason', async () => {
    mode.userInput = 'fail';
    const result = await detectAnomaly(SENTINEL);
    expect(JSON.stringify([logged, result])).not.toContain(SENTINEL);
    expect(logged).toContainEqual([
      { error: 'ProviderEchoError', status: 502 },
      'Anomaly detection failed',
    ]);
    expect(result.reason).toBe('Detection error: ProviderEchoError');
  });

  it('an anomalous input is logged by length, not text', async () => {
    mode.userInput = 'far';
    const result = await detectAnomaly(SENTINEL);
    expect(result.isAnomaly).toBe(true);
    expect(JSON.stringify(logged)).not.toContain(SENTINEL);
    expect(logged).toContainEqual([
      expect.objectContaining({ inputLength: SENTINEL.length }),
      'Anomalous input detected',
    ]);
  });
});
