/**
 * What crisis-classifier.ts passes on from crisis-classifier-gemini.ts through its `export *`
 * line. The star is there because tooling imports both names from the crisis-classifier.js
 * path, and a named re-export of the default model constant would count as a new
 * production-unused export under the dead-code ratchet. A star passes on whatever the new file
 * exports, so this pins that set: adding an export to crisis-classifier-gemini.ts must be a
 * deliberate edit of the first row, never something that arrives through the star unseen.
 */
import { describe, expect, it } from 'vitest';

describe('crisis-classifier-gemini.ts exports, passed on by crisis-classifier.ts', () => {
  it('exports exactly the generate function and its default model', async () => {
    const gemini = await import('../crisis-classifier-gemini.js');
    expect(Object.keys(gemini).sort()).toEqual([
      'DEFAULT_CRISIS_CLASSIFIER_MODEL',
      'createGeminiCrisisGenerate',
    ]);
  });

  it('crisis-classifier.ts still exposes both, as the same bindings', async () => {
    const gemini = await import('../crisis-classifier-gemini.js');
    const classifier = await import('../crisis-classifier.js');
    expect(classifier.createGeminiCrisisGenerate).toBe(gemini.createGeminiCrisisGenerate);
    expect(classifier.DEFAULT_CRISIS_CLASSIFIER_MODEL).toEqual(
      gemini.DEFAULT_CRISIS_CLASSIFIER_MODEL
    );
  });
});
