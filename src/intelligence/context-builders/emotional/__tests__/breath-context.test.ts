/**
 * breath-context.ts builds LLM-facing guidance from breath-sounds.json
 * examples like "<break time=\"300ms\"/>[soft breath]<break time=\"200ms\"/>".
 * The bracket is not a Cartesia nonverbal tag (only `[laughter]` is), and
 * echoing it verbatim in the prompt risks the model copying it into its
 * reply, which Cartesia then speaks as the literal words "soft breath".
 */
import { describe, expect, it } from 'vitest';
import { describeExample } from '../breath-context.js';

describe('describeExample', () => {
  it.each([
    ['<break time="300ms"/>[soft breath]<break time="200ms"/>', 'soft'],
    ['<break time="250ms"/>[gentle exhale]<break time="200ms"/>', 'exhale'],
    ['<break time="400ms"/>[breath]<break time="300ms"/>Here\'s the thing.', 'breath]'],
    ['<break time="500ms"/>[still]<break time="400ms"/>', 'still]'],
  ])('strips the bracket cue out of %s', (example) => {
    const described = describeExample(example);
    expect(described).not.toMatch(/\[|\]/);
  });

  it('keeps the real break tags and any trailing spoken words', () => {
    const described = describeExample(
      '<break time="400ms"/>[deep breath]<break time="300ms"/>Here\'s the thing.'
    );
    expect(described).toContain('<break time="400ms"/>');
    expect(described).toContain('<break time="300ms"/>');
    expect(described).toContain("Here's the thing.");
  });

  it('collapses the whitespace left behind by a removed bracket', () => {
    const described = describeExample('<break time="300ms"/>[soft breath]<break time="200ms"/>');
    expect(described).toBe('<break time="300ms"/><break time="200ms"/>');
  });
});
