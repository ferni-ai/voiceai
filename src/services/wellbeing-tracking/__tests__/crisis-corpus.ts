/**
 * Every real-risk line in the repo's crisis fixtures (label block or crisis,
 * or shouldDetect), plus STT spellings and inflected forms of the listed
 * phrases, plus 205 typed lines with a missing space before or inside a risk
 * phrase ("imsuicidal", "I want toend it all"; crisis-joined-words.json, from
 * the eval verify of the #2491 split). The SAFETY_WHOLE_WORD_SITES corpus checks run each site off and on
 * over these lines: a line a site reads as risk with the flag off must still
 * read as risk with it on.
 */
import { readFileSync } from 'node:fs';
import { CRISIS_CONTEXTUAL } from '../../../agents/__tests__/fixtures/crisis-contextual.js';
import { CRISIS_HELDOUT_RETIRED } from '../../../agents/__tests__/fixtures/crisis-heldout-retired.js';
import { CRISIS_RELAY } from '../../../agents/__tests__/fixtures/crisis-relay.js';
import { CRISIS_TEST_BLIND } from '../../../agents/__tests__/fixtures/crisis-test-blind.js';
import { CRISIS_TEST_CASES } from '../../superhuman/validation/crisis-test-cases.js';
import {
  isRiskLabel,
  joinedWordCorpus,
  RISK_FORMS,
  RISK_JSON_FIXTURES,
} from './crisis-open-corpus.js';

export {
  adversarialCorpus,
  crisisPhrases,
  isRiskLabel,
  JOINED_EVERYDAY,
  joinedWordCorpus,
  RISK_FORMS,
  RISK_JSON_FIXTURES,
} from './crisis-open-corpus.js';

/** Every real-risk line, de-duplicated. */
export function riskCorpus(): string[] {
  const lines: string[] = [
    ...[...CRISIS_HELDOUT_RETIRED, ...CRISIS_TEST_BLIND, ...CRISIS_RELAY, ...CRISIS_CONTEXTUAL]
      .filter((c) => isRiskLabel(c.label))
      .map((c) => c.text),
    ...CRISIS_TEST_CASES.filter((c) => c.expectedResult.shouldDetect).map((c) => c.input),
    ...RISK_JSON_FIXTURES.flatMap((path) =>
      (JSON.parse(readFileSync(path, 'utf8')) as Array<{ text: string; label: string }>)
        .filter((c) => isRiskLabel(c.label))
        .map((c) => c.text)
    ),
    ...RISK_FORMS,
    ...joinedWordCorpus(),
  ];
  return [...new Set(lines.filter((l) => typeof l === 'string' && l.length > 0))];
}
