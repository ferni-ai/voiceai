/**
 * The behavioral directive every turn gets today.
 *
 * No behavioral builder is registered on the live path, so the directive is
 * the aggregator's default style whatever the caller says or feels. This pins
 * that text, so a change to it (or a builder coming back) shows up here first.
 */
import { describe, expect, it } from 'vitest';
import type { ContextBuilderInput } from '../../core/types.js';
import { buildIntegratedContext } from '../integration.js';

function input(userText: string, emotion: Record<string, unknown>): ContextBuilderInput {
  return {
    userText,
    analysis: { emotion, intent: { primary: 'share', confidence: 0.8 }, topics: { detected: [] }, state: { phase: 'deepening' } },
    services: { sessionId: 'directive-test', sessionStartTime: Date.now(), userProfile: null },
    userData: { turnCount: 4 },
    userProfile: null,
    persona: { id: 'ferni', name: 'Ferni', displayName: 'Ferni' },
  } as unknown as ContextBuilderInput;
}

describe('buildIntegratedContext behavioral directive', () => {
  it.each([
    ['celebrating', "I got the promotion!! I can't believe it", { primary: 'joy', intensity: 0.9, valence: 'positive' }],
    ['in distress', "my dad's back in the hospital", { primary: 'fear', intensity: 0.9, valence: 'negative', distressLevel: 0.8 }],
  ])('is the default style when the caller is %s', async (_label, text, emotion) => {
    const result = await buildIntegratedContext(input(text, emotion));
    expect(result.behavioralDirective).toBe('## Response Style\n\nBe warm.\nValidate and support.');
    expect(result.compactDirective).toBe('[STYLE: warm, supportive]');
    expect(result.metrics.behavioralBuildersRun).toBe(0);
  });
});
