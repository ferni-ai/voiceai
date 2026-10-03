/**
 * Scripted LLM replies for the live speech E2E harness.
 *
 * `reply` is exactly what the LLM would stream into the TTS node. `spoken` is
 * what a person should hear, as a template: `{a|b}` lists acceptable
 * readings (WER takes the best one). `checks` are extra flags on the raw
 * transcript; they are reported, and gate nothing on their own (WER does).
 *
 * @module scripts/audio-eval/speech-e2e-scenarios
 */

import { normalizeTranscript, spelledOut } from './speech-e2e-lib.js';

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
}

export interface ScenarioCheck {
  /** The problem, reported as a flag when `ok` is false. */
  name: string;
  /** True when the transcript is fine. */
  ok: (transcript: string, words: TranscriptWord[]) => boolean;
}

export interface Scenario {
  id: string;
  what: string;
  reply: string;
  spoken: string;
  checks?: ScenarioCheck[];
  /** Checks on the exact text pushed to Cartesia; `name` describes the problem, flagged when `ok` is false. */
  pushedChecks?: Array<{ name: string; ok: (pushed: string) => boolean }>;
}

const norm = (t: string): string => ` ${normalizeTranscript(t).join(' ')} `;
const hears = (re: RegExp) => (t: string) => re.test(norm(t));

export const SCENARIOS: Scenario[] = [
  {
    id: 'banter-joke',
    what: 'light banter with a joke',
    reply:
      'Ha, okay, fair point. Why did the scarecrow win an award? Because he was outstanding in his field.',
    spoken:
      '{ha|ha ha|} okay fair point why did the scarecrow win an award because he was outstanding in his field',
  },
  {
    id: 'grief-sigh',
    what: 'heavy reply opening with *sighs*',
    reply:
      "*sighs* I'm so sorry about your dad. That's a heavy thing to carry, and you don't have to carry it alone.",
    spoken:
      'im so sorry about your dad thats a heavy thing to carry and you dont have to carry it alone',
  },
  {
    id: 'smiles-mid',
    what: 'stage direction *smiles* mid-text',
    reply:
      "That's wonderful news. *smiles* You really earned that promotion, and I hope you celebrate tonight.",
    spoken:
      'thats wonderful news you really earned that promotion and i hope you celebrate tonight',
  },
  {
    id: 'numbers',
    what: 'money, decade, date, time, negative, 401k, FDIC, ticker',
    reply:
      "It's $19.99 a month, and it's been popular since the 1990s. Your review is on 10/3 at 7pm, and it'll be -5 degrees. Keep the 401k in an FDIC insured bank, not in AAPL.",
    spoken:
      'its {nineteen ninety nine|nineteen dollars and ninety nine cents|nineteen dollars ninety nine} a month and its been popular since the nineteen nineties ' +
      'your review is on {october third|ten three|ten slash three|ten third|the tenth of march|october three} at {seven pm|seven} ' +
      'and itll be {minus five|negative five} degrees keep the {four oh one k|four hundred one k|four hundred and one k} ' +
      'in an fdic insured bank not in {aapl|apple}',
    checks: [
      { name: '$19.99 misread', ok: hears(/ nineteen (dollars (and )?)?ninety nine /) },
      { name: '1990s misread', ok: hears(/ nineteen nineties /) },
      {
        name: '10/3 misread',
        ok: hears(/ (october (third|three)|ten (slash )?(three|third)|tenth of march) /),
      },
      { name: '7pm misread', ok: hears(/ seven pm /) },
      { name: '-5 misread', ok: hears(/ (minus|negative) five /) },
      { name: '401k misread', ok: hears(/ four (zero|hundred( and)?) one k /) },
      { name: 'FDIC misread', ok: hears(/ fdic /) },
      { name: 'AAPL misread', ok: hears(/ (aapl|apple) /) },
    ],
  },
  {
    id: 'caps-emphasis',
    what: 'ALL-CAPS emphasis ("REALLY")',
    reply: "That is REALLY good. I mean it, that's a great plan.",
    spoken: 'that is really good i mean it thats a great plan',
    checks: [
      { name: 'REALLY spelled out', ok: (t) => !spelledOut(t, 'really') },
      { name: 'no "really" heard', ok: hears(/ really /) },
    ],
  },
  {
    id: 'spell-code',
    what: 'confirmation code in <spell>',
    reply: 'Your confirmation code is <spell>AB12CD</spell>. Write that down somewhere safe.',
    pushedChecks: [
      {
        name: '<spell> stripped before Cartesia',
        ok: (p) => /<spell>\s*AB12CD\s*<\/spell>/i.test(p),
      },
    ],
    spoken: 'your confirmation code is a b one two c d write that down somewhere safe',
    checks: [
      {
        name: 'AB12CD not spelled out',
        ok: (t, words) => {
          if (!hears(/ ab one two cd /)(t)) return false;
          // Whisper writes a spelled code as one token ("AB12CD"); a spelled
          // reading of six characters takes well over a second, "ab twelve cd" doesn't.
          const token = words.find((w) => /ab.?12.?cd/i.test(w.word.replace(/[\s,.-]/g, '')));
          return !token || token.end - token.start >= 0.9;
        },
      },
    ],
  },
  {
    id: 'long-first-sentence',
    what: 'first sentence of 25 words',
    reply:
      "When you think about everything you've been juggling this week between work, your sister, and the move, it makes sense that you feel tired. Let's slow down.",
    spoken:
      'when you think about everything youve been juggling this week between work your sister and the move it makes sense that you feel tired lets slow down',
  },
  {
    id: 'hmm-opener',
    what: 'short "Hmm..." opener',
    reply: "Hmm... I'm not totally sure. Let me think about that for a second.",
    spoken: '{hmm|} im not totally sure let me think about that for a second',
  },
  {
    id: 'mid-ellipsis',
    what: 'mid-sentence ellipsis',
    reply: 'I was going to say... maybe we start with the small stuff first, and see how it feels.',
    spoken: 'i was going to say maybe we start with the small stuff first and see how it feels',
  },
  {
    id: 'markdown-leak',
    what: 'markdown leakage',
    reply: '**Bold** idea: - one - two. Pick whichever feels easier.',
    spoken: 'bold idea one two pick whichever feels easier',
    checks: [
      {
        name: '"asterisk"/"dash" spoken',
        ok: (t) => !/\b(asterisks?|dash(es)?|hyphen)\b/i.test(t),
      },
    ],
    pushedChecks: [{ name: 'markdown sent to Cartesia', ok: (p) => !/\*\*|(^|\s)-\s/.test(p) }],
  },
];
