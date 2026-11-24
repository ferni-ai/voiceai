/**
 * Habit talk that calls for Maya, while MAYA_HABIT_TRIGGERS is on (#1431).
 *
 * Maya is the habits coach for every part of life (her bundle's team.role_description),
 * but the words that brought her up on a call (team-by-need-note.ts) were "habit",
 * "routine", workouts and budgets. A caller who says "I keep forgetting to stretch" is
 * talking about a habit without the word. These phrases add that, and only as a fallback:
 * when the caller's words also fit another teammate ("I meditate every morning" is
 * Nayan's), that teammate keeps them.
 *
 * Every phrase needs a habit next to it: "keep forgetting to" alone is also "I keep
 * forgetting to eat since she died", and "every morning" is also "every morning I wake up
 * and wish I hadn't". So the list is small and explicit, and it fails closed: a turn with
 * any word of grief, death, crisis, hopelessness, medication, eating, drinking, drugs or
 * gambling is never habit talk, and (flag on) never brings up Maya at all, even on her own
 * words. Missing a habit costs a suggestion; offering a habits coach to a grieving caller
 * costs the call.
 *
 * @module tools/handoff/maya-habit-need
 */

import { flagOn, type Env } from '../../config/env-flag.js';

export const MAYA_ID = 'maya-santos';

/** Things a person does as a habit, as "to ___" ("keep forgetting to stretch"). */
const DO =
  '(stretch|floss|journal|meditate|work out|exercise|read|walk|run|jog|practice|study|go to the gym|go to bed early|drink (more )?water|take my vitamins)';
/** The same, as "___ing" or nouns ("my journaling streak", "keep skipping my walks"). */
const DOING =
  '(stretch(es|ing)?|floss(ing)?|journal(ing)?|meditation|workouts?|reading|walks?|walking|runs?|running|jogging|practice|practicing|study(ing)?|the gym|gym|vitamins|duolingo|steps)';
/** When, right after a habit verb ("read each night", "stretch every morning"). */
const WHEN = '(every|each) (single )?(morning|evening|night|day)';

/** Habit talk without the word "habit". Matched against lower-cased caller words. */
export const MAYA_HABIT_WORDS = new RegExp(
  [
    `\\b(keep|kept|keeps) (on )?forgetting to ${DO}\\b`,
    `\\b(keep|kept|keeps) (on )?skipping (my |the )?${DOING}\\b`,
    `\\bmy ${DOING} streak\\b`,
    `\\b${DO} ${WHEN}\\b`,
    `\\b${DOING} ${WHEN}\\b`,
    `\\b(keep|kept|keeps) (on )?hitting (the )?snooze\\b`,
  ].join('|')
);

/**
 * Words that rule out any habit reading: grief and loss, crisis and hopelessness,
 * medication, eating, drinking, drugs and gambling. Whole words; the list errs wide.
 */
export const NOT_HABIT_TALK = new RegExp(
  [
    // grief, death, loss, a breakup
    '\\b(die[ds]?|dying|dead|death|passed( away)?|funeral|grave|griev\\w*|grief|mourn\\w*|widow\\w*|hospice|cancer|miss(ing)? (him|her|them)|lost (him|her|them|my (mom|dad|mother|father|wife|husband|son|daughter|brother|sister|friend|partner|baby|best friend))|(she|he|they) used to|left me|broke up|divorce\\w*)\\b',
    // crisis, hopelessness, crying
    "\\b(suicid\\w*|kill myself|end it|hurt myself|cut(ting)? myself|self[- ]harm\\w*|hopeless\\w*|worthless|can'?t go on|wish i (hadn'?t|wasn'?t|didn'?t|was|were|could)|don'?t (care|want to)|no point|what'?s the point|cry(ing)?|cried|cries|tears)\\b",
    // medication, eating
    '\\b(meds?|medications?|medicine|pills?|prescriptions?|antidepressants?|insulin|eat(ing)?|ate|meals?|food|starv\\w*|binge\\w*|purg\\w*)\\b',
    // drinking (not water), drugs, smoking
    '\\b(drinking(?! (more )?water)|drinks|drunk|alcohol\\w*|booze|beers?|wine|vodka|whiske?y|liquor|hangover|hungover|sober\\w*|relaps\\w*|wagon|weed|high|stoned|drugs?|cocaine|opioids?|smok\\w*|vap(e|es|ing)|addict\\w*|using again)\\b',
    // gambling
    '\\b(gambl\\w*|poker|bet|bets|betting|casino|slots?|blackjack|roulette|sportsbook|lottery|wager\\w*|losing streak|winning streak)\\b',
  ].join('|')
);

/** True when MAYA_HABIT_TRIGGERS is on and the turn has a word that rules out habit talk. */
export function mayaHeldBack(callerWords: string, env: Env = process.env): boolean {
  return flagOn('MAYA_HABIT_TRIGGERS', env) && NOT_HABIT_TALK.test(callerWords);
}

/**
 * True when MAYA_HABIT_TRIGGERS is on and the caller's words are habit talk with nothing
 * in them that rules it out.
 *
 * @param callerWords - what the caller said, lower-cased
 */
export function isMayaHabitTalk(callerWords: string, env: Env = process.env): boolean {
  return (
    flagOn('MAYA_HABIT_TRIGGERS', env) &&
    MAYA_HABIT_WORDS.test(callerWords) &&
    !NOT_HABIT_TALK.test(callerWords)
  );
}
