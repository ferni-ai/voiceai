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
    {
      file: 'src/services/safety/__tests__/crisis-heavy-feelings-backstop.test.ts',
      rows: [
        'names each shape in the rule text, and the rule text names no other',
        'asks for a plain read, flag on, on an example of every shape and every quoted line',
        'asks for a plain read on each shape the risk words miss',
        'asks for a plain read on every must-catch line in the heavy-feelings eval file',
        'adds no plain read on the nightly none lines beyond the risk words',
        'gives the lawyer line and everyday heavy lines a single read',
        'matches main for every line with the heavy flag off',
        'restores crisis after two reads when the eased read says none on a heavy risk shape',
        'reads the lawyer, grief and bone-tired lines once, and the eased none stands',
      ],
    },
  ],
};
