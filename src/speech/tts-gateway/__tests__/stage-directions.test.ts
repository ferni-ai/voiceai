/**
 * Asterisk stage directions are never spoken, on the default path too.
 *
 * Before this fix "*smiles* That is great." reached Cartesia verbatim with the
 * Speech Director off (probed through createGatewayTTSNode, stream-a round 2),
 * so the voice said "smiles". The always-on SSML processor now drops them with
 * the same stripper the Director's normalize pass uses. Emphasis, arithmetic
 * and censored words are left exactly as they were on the default path.
 *
 * Review H1: a mid-sentence action word used to be removed ENTIRELY wherever
 * it sat ("It *looks* great on you." -> "It great on you.", the verb gone).
 * It must now only lose its asterisks and keep the word, same as any other
 * part of the sentence; only a genuinely STAND-ALONE action (both ends of
 * the span at a sentence boundary) is removed outright.
 */
import { describe, expect, it } from 'vitest';

import { createSSMLProcessor } from '../ssml/processor.js';
import { rewriteAsteriskSpans } from '../stage-directions.js';

const clean = (text: string): string => createSSMLProcessor().parse(text).cleanText;

describe('SSML processor: asterisk stage directions (default path)', () => {
  it('drops stand-alone actions wherever they sit', () => {
    expect(clean('*smiles* That is great. *laughs* Okay. *takes a breath* Now.')).toBe(
      'That is great. Okay. Now.'
    );
    expect(clean('*sighs* Okay, here we go.')).toBe('Okay, here we go.');
    expect(clean('*a long pause* So.')).toBe('So.');
    expect(clean('Okay. *laughs* Sure.')).toBe('Okay. Sure.');
    expect(clean('*a long pause*')).toBe('');
  });

  it('drops a direction next to a prosody tag and keeps the tag as prosody', () => {
    const result = createSSMLProcessor().parse('<emotion value="calm"/>*nods* Right.');
    expect(result.cleanText).toBe('Right.');
    expect(result.prosody.emotion).toBe('calm');
  });

  // ---- H1: an action word that's part of the sentence keeps its word ----
  it('keeps the word when the action verb is the sentence itself, not a stand-alone aside', () => {
    expect(clean('It *looks* great on you.')).toBe('It looks great on you.');
    expect(clean('That *takes* real courage.')).toBe('That takes real courage.');
    expect(clean('Honestly that *clears* things up.')).toBe('Honestly that clears things up.');
    expect(clean('She *smiles* a lot.')).toBe('She smiles a lot.');
    // Same bug shape, a case the old code happened to get right by accident
    // (preceded by a word, not punctuation): still correct under the new rule.
    expect(clean("that's funny *chuckles* anyway")).toBe("that's funny chuckles anyway");
  });

  it('leaves emphasis, markdown bold and arithmetic as they were', () => {
    expect(clean('That was *great*.')).toBe('That was *great*.');
    expect(clean('I *really* mean it.')).toBe('I *really* mean it.');
    expect(clean('**Important** thing')).toBe('**Important** thing');
    expect(clean('5*3 is 15, and 2 * 4 is 8.')).toBe('5*3 is 15, and 2 * 4 is 8.');
    expect(clean('f*** that')).toBe('f*** that');
    expect(clean('Press *69 now')).toBe('Press *69 now');
    expect(clean('* first item')).toBe('* first item');
  });

  it('a lone bullet star, censor and arithmetic stay exactly as written', () => {
    expect(clean('rated 4*')).toBe('rated 4*');
  });
});

describe('rewriteAsteriskSpans (shared with the Director normalize pass)', () => {
  it('unwraps plain emphasis only when asked, and counts its rewrites', () => {
    expect(rewriteAsteriskSpans('a *really* big deal', true)).toEqual({
      text: 'a really big deal',
      count: 1,
    });
    expect(rewriteAsteriskSpans('a *really* big deal', false)).toEqual({
      text: 'a *really* big deal',
      count: 0,
    });
    expect(rewriteAsteriskSpans('5*3 and f***', false)).toEqual({ text: '5*3 and f***', count: 0 });
  });

  it('unwraps a mid-sentence action word regardless of the flag', () => {
    expect(rewriteAsteriskSpans('a *really* big *smiles* deal', true)).toEqual({
      text: 'a really big smiles deal',
      count: 2,
    });
    // unwrapEmphasis=false (the default SSML path): emphasis is left alone,
    // but the action word still loses its asterisks (review H1).
    expect(rewriteAsteriskSpans('a *really* big *smiles* deal', false)).toEqual({
      text: 'a *really* big smiles deal',
      count: 1,
    });
  });

  it('removes a stand-alone action entirely, regardless of the flag', () => {
    expect(rewriteAsteriskSpans('*smiles* Deal.', true)).toEqual({ text: ' Deal.', count: 1 });
    expect(rewriteAsteriskSpans('*smiles* Deal.', false)).toEqual({ text: ' Deal.', count: 1 });
  });

  it('chains a run of stand-alone actions back to back: each one removed in turn', () => {
    // Spacing is left to the caller's tidy-up (module doc): the two leads
    // (one empty, one a space) plus the original space before "Hello."
    // leave a double space here, same as any other removed span.
    expect(rewriteAsteriskSpans('*sighs* *smiles* Hello.', false)).toEqual({
      text: '  Hello.',
      count: 2,
    });
  });

  // ---- M1: a non-action word at a sentence start is never deleted ----
  it('never deletes a non-action word, lowercase and at a sentence start or not', () => {
    expect(rewriteAsteriskSpans('Okay. *you* did it!', true)).toEqual({
      text: 'Okay. you did it!',
      count: 1,
    });
    expect(rewriteAsteriskSpans('Okay. *you* did it!', false)).toEqual({
      text: 'Okay. *you* did it!',
      count: 0,
    });
  });
});
