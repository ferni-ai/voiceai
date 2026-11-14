/**
 * CRISIS_SELF_HARM_911_LINE adds no false lines: with the flag on, the crisis script differs from
 * main only on rows where main already speaks the full severe 988 script, and only by the line.
 *
 * Rows: every public false-positive source the crisis lead allowed (2026-11-11): the relay
 * fixture, the contextual fixture without its heldout_* rows, the open corpus (risk forms,
 * joined words, the adversarial set, the site phrases, its labelled JSON fixtures, which include
 * the adjudicator and everyday-call fixtures). No held-out, retired or blind set is loaded.
 * Failures name row ids (source:index) and counts, never a row's words.
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { CRISIS_CONTEXTUAL } from '../../../agents/__tests__/fixtures/crisis-contextual.js';
import { CRISIS_RELAY } from '../../../agents/__tests__/fixtures/crisis-relay.js';
import {
  adversarialCorpus,
  crisisPhrases,
  joinedWordCorpus,
  RISK_FORMS,
  RISK_JSON_FIXTURES,
} from '../../wellbeing-tracking/__tests__/crisis-open-corpus.js';
import { detectCrisis } from '../crisis-guard.js';

const FLAG = 'CRISIS_SELF_HARM_911_LINE';
const saved = process.env[FLAG];
const LINE = "If you've already hurt yourself or you're about to, call 911.";
/** The severe script's 988 sentence: the only place the line may follow. */
const SEVERE_988 =
  "If you're in crisis or having thoughts of suicide, please reach out to the 988 Suicide & Crisis Lifeline by calling or texting 988. They have trained counselors available 24/7.";

interface Row {
  id: string;
  text: string;
  earlier?: readonly string[];
}

const fromCases = (
  source: string,
  cases: ReadonlyArray<{ text: string; earlier?: readonly string[] }>
): Row[] => cases.map((c, i) => ({ id: `${source}:${i}`, text: c.text, earlier: c.earlier }));

const fromLines = (source: string, lines: readonly string[]): Row[] =>
  lines.map((text, i) => ({ id: `${source}:${i}`, text }));

function publicRows(): Row[] {
  const json = RISK_JSON_FIXTURES.flatMap((path) => {
    const cases = JSON.parse(readFileSync(path, 'utf8')) as Array<{
      text: string;
      earlier?: string[];
    }>;
    return fromCases(`json:${path.split('/').pop()}`, cases);
  });
  return [
    ...fromCases('relay', CRISIS_RELAY),
    ...fromCases(
      'contextual',
      CRISIS_CONTEXTUAL.filter((c) => !c.kind.startsWith('heldout_'))
    ),
    ...json,
    ...fromLines('forms', RISK_FORMS),
    ...fromLines('joined', joinedWordCorpus()),
    ...fromLines('adversarial', adversarialCorpus()),
    ...fromLines('phrases', crisisPhrases()),
  ];
}

const scriptFor = (row: Row, flag: 'on' | 'off'): string | undefined => {
  process.env[FLAG] = flag;
  return detectCrisis(row.text, undefined, { recentMessages: [...(row.earlier ?? [])] })
    .suggestedResponse;
};

afterEach(() => {
  if (saved === undefined) delete process.env[FLAG];
  else process.env[FLAG] = saved;
});

describe('CRISIS_SELF_HARM_911_LINE on the public false-positive sources', () => {
  it('changes only rows main already answers with the severe 988 script, by the line alone', () => {
    const rows = publicRows();
    const unexpected: string[] = [];
    const notJustTheLine: string[] = [];
    let severe = 0;
    let withLine = 0;
    for (const row of rows) {
      const off = scriptFor(row, 'off');
      const on = scriptFor(row, 'on');
      const severeOff = off?.includes(SEVERE_988) ?? false;
      if (severeOff) severe++;
      if (on?.includes(LINE)) withLine++;
      if (on !== off && !severeOff) unexpected.push(row.id);
      if (
        severeOff &&
        (on?.replace(` ${LINE}`, '') !== off || !on?.includes(`${SEVERE_988} ${LINE}`))
      )
        notJustTheLine.push(row.id);
    }
    expect({ rows: rows.length > 1000, severe: severe > 0 }).toEqual({ rows: true, severe: true });
    expect({ unexpected, notJustTheLine }).toEqual({ unexpected: [], notJustTheLine: [] });
    expect(withLine).toBe(severe);
  }, 120_000);
});
