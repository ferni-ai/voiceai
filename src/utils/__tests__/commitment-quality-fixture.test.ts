/**
 * Regression fixture from the #1896 verifier (2026-10-18, rounds 1 and 2), for
 * the conservative gate: it drops only lines that are confidently junk, never a
 * plan. Every real line is kept on write; a line shown on its own is skipped
 * when its object is a bare pronoun nothing before it explains; pure goodbyes
 * and pleasantries are rejected.
 */
import { describe, expect, it } from 'vitest';
import { commitmentLine, judgeCommitment, needsContext } from '../commitment-quality.js';

/** Real plans the verifier wrote, and its probes: all kept on write. */
const REAL = [
  "I'm gonna call my sister tonight",
  'gotta pay the electric bill Friday',
  "I'll email Dan about the contract",
  'need to book a dentist appointment',
  'going to run 3 miles tomorrow',
  "I'll text her back after lunch",
  'pick up the kids at 3',
  'finish my taxes',
  "I'll think about the job offer",
  'talk to my boss about a raise',
  'see you at the game Saturday',
  'catch up with Mike next week',
  'take care of the paperwork',
  'follow up with the doctor',
  "I'll sleep on it",
  'meet you there',
  "I'll call mom on Sunday",
  'I need to schedule my mammogram',
  "I'm going to start walking every morning",
  "I promise I'll drink more water",
  "I'll pick up groceries on the way home",
  'gonna clean the garage this weekend',
  'I have to renew my passport',
  "I'll send the invoice to Karen by Monday",
  'I need to talk to Jake about his grades',
  "I'm going to apologize to Sarah",
  "I'll go to the gym after work",
  "I'll take my meds before bed",
  'I want to read twenty pages tonight',
  "I'll check on grandma Thursday",
  "I need to get the car's oil changed",
  "I'm gonna fix the leaky faucet",
  "I'll write the toast for Ben's wedding",
  "I'll call the insurance company tomorrow morning",
  'I have to submit the report by Friday',
  "I'll look into refinancing the mortgage",
  'I need to cancel my gym membership',
  "I'll walk the dog when I get home",
  'gotta get a birthday present for Emma',
  "I'll ask my manager for Friday off",
  "I'm going to update my resume this week",
  "I'll call you back in ten minutes",
  "I'll let you know how the interview goes",
  'I need to move money into savings',
  "I'll pay Tom back the fifty bucks",
  "I'm going to sign up for that pottery class",
  "I'll bring the potluck dish on Saturday",
  'I need to see a therapist',
  "I'll go to bed earlier tonight",
  "I'll stop drinking soda",
  "I'm going to meditate for ten minutes",
  "I'll visit dad in the hospital",
  "I'll check in with Priya about the project",
  "I'll take the trash out",
  'I need to return the library books',
  "I'll make a doctor's appointment",
  "I'm gonna try the new recipe tonight",
  "I'll do the dishes",
  "I'll do my homework after dinner",
  "I'll practice guitar",
  "I'll file the expense report",
  "I'll go for a run",
  "I'll study for the exam",
  'I need to buy a new phone charger',
  "I'll get back to you on that",
  "I'll think it over",
  "I'll be at the airport by 6",
  "I'll wash the car",
  "I'll meet Lisa for coffee at 10",
  'Call sister tonight',
  'Pay electric bill Friday',
  'Email Dan about contract',
  'Text Mindy back',
  'Book dentist appointment',
  'Run 3 miles tomorrow',
  'Finish taxes',
  "I'll handle it",
  "I'll fix it tomorrow",
  "I'll stretch before bed",
  "I'll journal tonight",
  "I'll water the plants",
  "I'll pray about it",
  "I'll vote on Tuesday",
  "I'm heading to the pharmacy after this",
  "I'll call my landlord about the heat",
  "I'm going to quit smoking",
  "I'll drop the package at the post office",
  "I've decided to take the job",
  "I'll get my flu shot this week",
  "I'll Venmo you for dinner",
  "I'll ping Raj on Slack",
  'I need to set up a budget',
  "I'll talk to him about it tonight",
  "I'll go see the doctor",
  "I'll swing by your place later",
  "I'm gonna go to sleep early",
  "I'll be home by 7",
  "I'll be at the dentist at 2",
  "I'll be there Saturday for Emma's party",
  "I'll be on time for work tomorrow",
  "I'll be nicer to my brother",
  "I'll be at Jake's recital Thursday",
  "I'm going to be at the hospital with dad all day",
  "I'll consider the job offer",
  "I'll decide on the job offer by Friday",
  "I'll think about moving to Denver",
  'I need to figure out the daycare situation',
  "I'll figure out what to get mom",
  "I'll see a doctor about my back",
  "I'll see the dermatologist Tuesday",
  "I'm going to see my therapist Wednesday",
  "I'll try yoga next week",
  "I'll go to the farmers market",
  "I'll run to the store",
  "I'll do the laundry",
  "I'll get my blood work done",
  "I'll get a haircut",
  "I'll have the talk with my son",
  "I'll make it to the reunion",
  "I'll help my neighbor move Saturday",
  "I'll keep an eye on my blood pressure",
  "I'll stay off my phone tonight",
  "I'll go easy on the drinks at the party",
];

/** Run-on lines whose earlier words say who or what: kept and shown whole. */
const RUN_ONS = [
  "my sister's birthday is friday so I'll call her then",
  "the car's making that noise again so I'll take it in tomorrow",
  "Mark needs help painting his deck sunday and I said I'll do it",
  "I owe Tom fifty bucks, I'll pay him back Friday",
  "the dentist called and I'm going to call them back tomorrow",
  "I haven't called my dad in weeks, I'm gonna do that tonight",
  "rent's due friday, I'll pay it thursday",
  "I told Mark I'd help him paint his deck sunday so I'll do that",
];

/** Kept on write, but skipped where a line is shown on its own: "her", "it", "that" alone. */
const NEEDS_CONTEXT = [
  "I'll text her back after lunch",
  "I'll sleep on it",
  "I'll get back to you on that",
  "I'll think it over",
  "I'll handle it",
  "I'll fix it tomorrow",
  "I'll pray about it",
  "I'll talk to him about it tonight",
  "I'll do it",
  'call her tomorrow',
];

/**
 * Goodbyes and pleasantries: all rejected. "I'll call it a night" was in both of
 * the verifier's lists; it is a goodbye, so it is here.
 */
const JUNK = [
  'bye',
  'talk soon',
  'be right back',
  'ok sounds good',
  "I'll be fine",
  'catch you later',
  "we'll see",
  "I'll talk to you later",
  'see you tomorrow',
  'take care',
  'alright, talk to you soon, bye',
  'I gotta go',
  "I'll let you go",
  'good night',
  'thanks so much',
  "I'll see",
  "I'll try",
  'sounds like a plan',
  'peace out',
  "I'm gonna head out",
  "I'll be okay",
  'I think so',
  'I hope so',
  "I'll catch you next time",
  "I'll be right back",
  "yeah I'll see you around",
  'later',
  'love you, bye',
  "I'll think about it",
  "I'll be there",
  'ok bye',
  "I'm gonna go",
  'talk to you tomorrow, take care',
  "I'll survive",
  'I guess',
  'sure',
  'no worries',
  "I'll call it a night",
  "I'll keep that in mind",
  "I'm good, thanks",
  'cool cool',
  'sounds good to me',
  'perfect, thank you',
  "I'm good",
  "I'm fine, thanks",
  'nice nice',
  'lol ok',
  'all good',
  "I'll keep it in mind",
  'for sure',
  'right on',
  'gotcha',
  "I'm tired, goodnight",
  'no thanks',
  'I appreciate it',
  'have a good one',
  "I'm doing ok",
  "I'm good thanks",
  "I'm fine thanks",
  "I'll call it a night",
];

const shown = (s: string): string | null => {
  const line = commitmentLine(s);
  return line && !needsContext(line) ? line.text : null;
};

describe('verifier fixture: conservative gate', () => {
  it.each([...REAL, ...RUN_ONS, ...NEEDS_CONTEXT])('keeps %j on write', (s) => {
    expect(judgeCommitment(s)).toMatchObject({ ok: true });
  });

  it.each(RUN_ONS)('shows %j whole', (s) => {
    expect(commitmentLine(s)).toMatchObject({ whole: true });
    expect(shown(s)).not.toBeNull();
  });

  it.each(NEEDS_CONTEXT)('does not show %j on its own', (s) => {
    expect(shown(s)).toBeNull();
  });

  it.each(JUNK)('rejects junk %j', (s) => {
    expect(judgeCommitment(s).ok).toBe(false);
  });

  it.each([
    ["I'll text her back after lunch", 'Mindy', "I'll text Mindy back after lunch"],
    ["I'll talk to him about it tonight", 'Dan', "I'll talk to Dan about it tonight"],
    ['call her tomorrow', 'sister', 'call sister tomorrow'],
    ['call her tomorrow', 'mom', 'call mom tomorrow'],
    ['Remind them about the rent', 'roommates', 'Remind roommates about the rent'],
    ["I'll tell 'em on Monday", 'Bob', "I'll tell Bob on Monday"],
  ])('names the person in %j given %j', (s, person, named) => {
    expect(judgeCommitment(s, { person })).toEqual({ ok: true, statement: named });
  });
});
