// The Gemini model that judges evals. Flash unless a run asks for Pro.
//
// Pro was ~24% of Gemini spend from 2026-10-10 to 10-25 (~$400), all of it
// judges and audits, never live calls, and mostly output tokens (thinking
// counts as output). Seth chose Flash as the default. Pro stays where results
// are compared with Pro history: the nightly sets JUDGE_MODEL=pro, and
// voice-eval/judge.mjs passes fallback 'pro': on 15 nightly calls Flash agreed
// with Pro on 87% of score >= 3 verdicts (Pro with itself 91-93%) but put
// humanLikelihood at 0.33 against Pro's 0.06 (2026-10-25), and its verdicts are
// compared with saved Pro ones. release-check.mjs calls no model.
//
//   JUDGE_MODEL unset             -> `fallback` ("flash" unless the caller says "pro")
//   JUDGE_MODEL "flash"           -> JUDGE_FLASH
//   JUDGE_MODEL "pro"             -> JUDGE_PRO
//   anything else                 -> used as the model id, as before
//
// JUDGE_FLASH matches the Flash default in src/config/gemini-config.ts.

export const JUDGE_FLASH = 'gemini-3.5-flash';
export const JUDGE_PRO = 'gemini-3.1-pro-preview';

/** The judge model id for this run. `fallback` is used when JUDGE_MODEL is unset. */
export function judgeModel(env = process.env, fallback = 'flash') {
  const want = (env.JUDGE_MODEL ?? '').trim() || fallback;
  if (want === 'flash') return JUDGE_FLASH;
  if (want === 'pro') return JUDGE_PRO;
  return want;
}
