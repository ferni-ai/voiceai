/**
 * Three tool-routing helpers reached for a bare require(), which throws
 * ReferenceError under plain Node ESM (how the agent runs). Run the real
 * modules there, where vitest can't supply require.
 */
import { describe, expect, it } from 'vitest';
import { runPlainEsm } from '../../tests/helpers/plain-esm.js';

describe('tool routing helpers under plain ESM', () => {
  it('detectFTISModels checks the model files instead of throwing', () => {
    const result = runPlainEsm(`
const { detectFTISModels } = await import('./src/tools/semantic-router/advanced/intelligent/hierarchical-classifier.ts');
report(detectFTISModels());
`);
    expect(['available', 'none']).toContain(result);
  });

  it('registerFerniIntents registers the Ferni intents on the classifier', () => {
    const result = runPlainEsm(`
const { registerFerniIntents, FERNI_INTENTS } = await import('./src/tools/semantic-router/advanced/intelligent/ferni-intents.ts');
const { getIntentClassifier } = await import('./src/tools/semantic-router/advanced/intelligent/intent-classifier.ts');
const before = getIntentClassifier().getIntents().length;
registerFerniIntents();
report({ before, after: getIntentClassifier().getIntents().length, expected: FERNI_INTENTS.length });
`) as { before: number; after: number; expected: number };
    expect(result.expected).toBeGreaterThan(0);
    expect(result.after).toBe(result.before + result.expected);
  });

  it('getRecentToolsFromSession returns the tool ids the context carrier recorded', () => {
    const result = runPlainEsm(`
const { getRecentToolsFromSession } = await import('./src/tools/orchestrator/orchestrator-helpers.ts');
const { getContextCarrier } = await import('./src/tools/context-carrier.ts');
const carrier = getContextCarrier();
carrier.startSession('esm-session', 'esm-user');
carrier.recordToolUsage('esm-session', 'getWeather', 'success');
carrier.recordToolUsage('esm-session', 'playMusic', 'success');
report(getRecentToolsFromSession('esm-session'));
`);
    expect(result).toEqual(['getWeather', 'playMusic']);
  });
});
