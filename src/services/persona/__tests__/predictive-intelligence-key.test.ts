/**
 * #2636: the bundle loader stores each persona's predictive-intelligence.json under the key
 * 'predictive-intelligence', but loadPredictiveIntelligence asked for 'predictive_intelligence',
 * so it always got null and buildPredictiveContext always returned []. One key, used by both.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContextBuilderInput } from '../../../intelligence/context-builders/index.js';
import { buildPredictiveContext } from '../../../intelligence/context-builders/intelligence/predictive-context.js';
import { loadPredictiveIntelligence } from '../persona-content-loader.js';

const input = (personaId: string, sessionId: string, userText: string) =>
  ({
    userText,
    persona: { identity: { id: personaId } },
    services: { sessionId },
    userData: { turnCount: 3 },
  }) as unknown as ContextBuilderInput;

beforeEach(() => {
  // A weekday noon: no temporal (Sunday or late-night) pattern outranks the one under test.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 18, 12, 0, 0));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('predictive intelligence content loads (#2636)', () => {
  it("a persona's own predictive-intelligence content loads", async () => {
    const ferni = await loadPredictiveIntelligence('ferni');
    expect(ferni?.concern_detection?.warning_signs).toBeDefined();
    const maya = await loadPredictiveIntelligence('maya-santos');
    expect(maya).not.toBeNull();
    expect(maya).not.toBe(ferni);
  });

  it("a persona without a bundle falls back to Ferni's content", async () => {
    const ferni = await loadPredictiveIntelligence('ferni');
    expect(ferni).not.toBeNull();
    expect(await loadPredictiveIntelligence('no-such-persona')).toBe(ferni);
  });

  it('the builder returns its pattern guidance once the content loads', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // the pattern's probability draw always passes
    const injections = await buildPredictiveContext(
      input('ferni', 'riley-test-2636', "I'm too busy to deal with that")
    );
    expect(injections.length).toBeGreaterThanOrEqual(1);
    expect(injections[0].content).toContain('PATTERN: Behavioral pattern detected.');
  });

  it('the control: a line with no pattern or follow-up signal still returns nothing', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const injections = await buildPredictiveContext(
      input('ferni', 'riley-test-2636-b', 'the weather was nice on my walk')
    );
    expect(injections).toEqual([]);
  });
});
