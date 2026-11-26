/**
 * Crisis-lane flags that change only the classifier model's prompt: rules that may move a
 * model read toward "none". The six readers never see the model, and the reply grid stubs its
 * answer (crisis-reply-never-lower.test.ts), so neither can show such a flag. This home is open
 * only to a flag whose named rows show, with the real classifier path and a stubbed model, that
 * a turn whose words hold a risk word is also read without the rules and the more severe read
 * wins (crisis-easing-rules.ts needsPlainRead), that a failed plain read never lets "none" stand
 * alone, and that the flag off leaves every prompt byte for byte as it was. What the model
 * does with the rules is measured by the live classifier eval
 * (scripts/crisis-eval/classifier-eval.ts) and pasted in the PR: no turn the corpora must catch
 * may be missed with the flag on.
 *
 * The census (crisis-all-flags-never-lower.test.ts) checks that each named file exists and
 * holds each title as an it() or test() call, as for MEMORY_ONLY. What a row asserts is a
 * reviewer's check.
 */

import type { MemoryOnlyRow } from './crisis-flag-homes.js';

export const PROMPT_RULES_SHOWN_ON: Readonly<Record<string, readonly MemoryOnlyRow[]>> = {
  CRISIS_CLASSIFIER_HEAVY_FEELINGS: [
    {
      file: 'src/services/safety/__tests__/crisis-heavy-feelings.test.ts',
      rows: [
        'leaves every prompt unchanged with the flag off',
        'keeps risk words in the caller own words as risk and never lowers imminent',
        'asks for a plain read on risk words with the heavy flag alone, and not with it off',
        'restores crisis when the rules read none on words from the risk list',
        'keeps a crisis read when the plain read fails, and never lets none stand alone',
        'drops both easing rule sets from the plain read',
      ],
    },
  ],
};
