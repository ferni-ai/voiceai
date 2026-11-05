/**
 * Regression on the reply set the #3355 rules were first written against
 * (fixtures/pass-along-replies.tsv). Not the score: held-out phrasings in
 * pass-along-declined.test.ts are. No yes may read as a no; the nos it no
 * longer catches are listed, and are delivered exactly as main delivers them.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { passAlongDeclined } from '../pass-along-declined.js';
import { buildCallScript } from '../../../tools/domains/telephony/scripts/index.js';
import { personalScript } from '../../../tools/domains/telephony/scripts/personal.js';

const script = buildCallScript(personalScript, {
  agentName: 'Ferni',
  userName: 'Riley Test',
  contactName: 'Priya',
  purpose: 'check in',
  objective: 'check_in',
});
const ASK = "Just so you know, I'll pass along what you tell me to Riley Test. Is that okay?";
const declined = (reply: string) =>
  passAlongDeclined(script, [
    { role: 'agent', content: ASK },
    { role: 'recipient', content: reply },
  ]);
const rows = readFileSync(new URL('fixtures/pass-along-replies.tsv', import.meta.url), 'utf8')
  .split('\n')
  .filter((l) => l && !l.startsWith('#'))
  .map((l) => l.split('\t') as ['YES' | 'NO', string]);

describe('the fixture reply set (fixtures/pass-along-replies.tsv)', () => {
  it('reads all 44 replies', () => expect(rows).toHaveLength(44));

  it('no yes reads as a no (0 of 22)', () => {
    expect(rows.filter(([l, r]) => l === 'YES' && declined(r))).toEqual([]);
  });

  it('every no is caught except the one that is not unambiguous', () => {
    expect(rows.filter(([l, r]) => l === 'NO' && !declined(r)).map(([, r]) => r)).toEqual([
      "I don't want him to know.",
    ]);
  });
});
