/**
 * Every reader, over every line: the fixture risk corpus (crisis-corpus.ts),
 * all 205 joined-word lines, and the round-2 verify's 28,781 adversarial lines,
 * against every site phrase (103) and every human-referral trigger. With
 * SAFETY_WHOLE_WORD_SITES off or shadow each reader equals the substring (or
 * regex) check; on, no reader reads less than it. A 'soft' tier still counts.
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  patternHit,
  phraseHit,
  saysPhrase,
  saysRiskPhrase,
  testRiskWords,
  testWholeWords,
} from '../../../utils/safety-whole-word.js';
import { adversarialCorpus, crisisPhrases, riskCorpus } from './crisis-corpus.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

const joined = JSON.parse(
  readFileSync('src/services/wellbeing-tracking/__tests__/crisis-joined-words.json', 'utf8')
) as string[];
const LINES = [...new Set([...riskCorpus(), ...joined, ...adversarialCorpus()])];
const PHRASES = crisisPhrases();
// Every trigger in human-referral.ts, read from the source so the list cannot drift.
const PATTERNS = [
  ...readFileSync('src/services/principal-alignment/human-referral.ts', 'utf8').matchAll(
    /pattern:\s*\/((?:\\\/|[^/\n])+)\/([a-z]*),/g
  ),
].map(([, body, flags]) => new RegExp(body, flags));

type Mode = 'off' | 'shadow' | 'on';

/** Every [reader, phrase or pattern, line] where the reader differs from the substring check. */
function differences(mode: Mode): string[] {
  vi.stubEnv('SAFETY_WHOLE_WORD_SITES', mode);
  const out: string[] = [];
  for (const line of LINES) {
    const lower = line.toLowerCase();
    for (const p of PHRASES) {
      const main = lower.includes(p);
      const readings = [
        saysPhrase(line, p),
        saysRiskPhrase(line, p),
        mode === 'on' ? phraseHit(line, p) !== null : phraseHit(line, p) === (main ? 'hit' : null),
      ];
      const bad =
        mode === 'on'
          ? main && readings.includes(false)
          : readings.some((r, i) => (i < 2 ? r !== main : !r));
      if (bad) out.push(`${p} | ${line}`);
    }
    for (const re of PATTERNS) {
      const main = re.test(line);
      const readings = [testWholeWords(re, line), testRiskWords(re, line)];
      const tier = patternHit(re, line);
      const bad =
        mode === 'on'
          ? main && (readings.includes(false) || tier === null)
          : readings.some((r) => r !== main) || tier !== (main ? 'hit' : null);
      if (bad) out.push(`${re.source} | ${line}`);
    }
  }
  return out;
}

describe(`every reader over ${LINES.length} lines`, () => {
  it('has the corpora it claims', () => {
    expect(joined).toHaveLength(205);
    expect(adversarialCorpus()).toHaveLength(28781);
    expect(PHRASES).toHaveLength(103);
    expect(PATTERNS.length).toBeGreaterThanOrEqual(20);
  });
  it.each<Mode>(['off', 'shadow'])(
    '%s: every reader equals the substring check',
    (mode) => {
      expect(differences(mode)).toEqual([]);
    },
    600_000
  );
  it('on: no reader reads less than the substring check', () => {
    expect(differences('on')).toEqual([]);
  }, 600_000);
});
