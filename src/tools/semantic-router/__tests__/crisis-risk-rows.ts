/**
 * Risk rows of the public crisis fixtures, for router tests that must never print a row
 * (callers report set, index and counts only).
 *
 * Held-out, retired and blind sets are never loaded: crisis-contextual's heldout_* rows are
 * filtered out, and crisis-open-corpus.ts loads no sealed data by design.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { CRISIS_CONTEXTUAL } from '../../../agents/__tests__/fixtures/crisis-contextual.js';
import { CRISIS_RELAY } from '../../../agents/__tests__/fixtures/crisis-relay.js';
import {
  adversarialCorpus,
  crisisPhrases,
  isRiskLabel,
  joinedWordCorpus,
  RISK_FORMS,
  RISK_JSON_FIXTURES,
} from '../../../services/wellbeing-tracking/__tests__/crisis-open-corpus.js';

/** Authored Spanish risk lines (no public Spanish crisis fixture exists yet). */
export const ES_RISK = [
  'quiero matarme',
  'me quiero morir',
  'estoy muy estresado y quiero matarme',
  'ya no quiero vivir',
  'voy a tomarme todas las pastillas',
  'quiero quitarme la vida',
  'tengo ganas de hacerme daño',
  "I'm so stressed, quiero morirme",
];

/** Every risk row by set name. `adversarialStep` keeps every n-th adversarial line. */
export function crisisRiskRows(adversarialStep = 1): Record<string, string[]> {
  const fromJson = (path: string): string[] =>
    (JSON.parse(readFileSync(path, 'utf8')) as Array<{ text: string; label: string }>)
      .filter((row) => isRiskLabel(row.label))
      .map((row) => row.text);
  return {
    relay: CRISIS_RELAY.filter((row) => isRiskLabel(row.label)).map((row) => row.text),
    contextual: CRISIS_CONTEXTUAL.filter(
      (row) => isRiskLabel(row.label) && !row.kind.startsWith('heldout_')
    ).map((row) => row.text),
    ...Object.fromEntries(
      RISK_JSON_FIXTURES.map((path) => [basename(path, '.json'), fromJson(path)])
    ),
    riskForms: [...RISK_FORMS],
    joined: joinedWordCorpus(),
    phrases: crisisPhrases(),
    adversarial: adversarialCorpus().filter((_, index) => index % adversarialStep === 0),
    es: ES_RISK,
  };
}
