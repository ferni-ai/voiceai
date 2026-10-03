/**
 * Asterisk stage directions are never spoken, on the default path too.
 *
 * Before this fix "*smiles* That is great." reached Cartesia verbatim with the
 * Speech Director off (probed through createGatewayTTSNode, stream-a round 2),
 * so the voice said "smiles". The always-on SSML processor now drops them with
 * the same stripper the Director's normalize pass uses. Emphasis, arithmetic
 * and censored words are left exactly as they were on the default path.
 */
import { describe, expect, it } from 'vitest';

import { createSSMLProcessor } from '../ssml/processor.js';
import { rewriteAsteriskSpans } from '../stage-directions.js';

const clean = (text: string): string => createSSMLProcessor().parse(text).cleanText;

describe('SSML processor: asterisk stage directions (default path)', () => {
  it('drops action directions wherever they sit', () => {
    expect(clean('*smiles* That is great. *laughs* Okay. *takes a breath* Now.')).toBe(
      'That is great. Okay. Now.'
    );
    expect(clean("that's funny *chuckles* anyway")).toBe("that's funny anyway");
    expect(clean('*sighs* Okay, here we go.')).toBe('Okay, here we go.');
    expect(clean('*a long pause* So.')).toBe('So.');
  });

  it('drops a direction next to a prosody tag and keeps the tag as prosody', () => {
    const result = createSSMLProcessor().parse('<emotion value="calm"/>*nods* Right.');
    expect(result.cleanText).toBe('Right.');
    expect(result.prosody.emotion).toBe('calm');
  });

  it('leaves emphasis, arithmetic and censored words as they were', () => {
    expect(clean('That was *great*.')).toBe('That was *great*.');
    expect(clean('5*3 is 15, and 2 * 4 is 8.')).toBe('5*3 is 15, and 2 * 4 is 8.');
    expect(clean('f*** that')).toBe('f*** that');
  });
});

describe('rewriteAsteriskSpans (shared with the Director normalize pass)', () => {
  it('can unwrap emphasis or leave it, and counts its rewrites', () => {
    expect(rewriteAsteriskSpans('a *really* big *smiles* deal', true)).toEqual({
      text: 'a really big  deal',
      count: 2,
    });
    expect(rewriteAsteriskSpans('a *really* big *smiles* deal', false)).toEqual({
      text: 'a *really* big  deal',
      count: 1,
    });
    expect(rewriteAsteriskSpans('5*3 and f***', false)).toEqual({ text: '5*3 and f***', count: 0 });
  });
});
