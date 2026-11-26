/**
 * Only an everyday name softens a forget request (crisis-forget-request.ts EVERYDAY_NOUN).
 * Three verify rounds on #4277 each found risky names the NEVER block list lacked (texts to a
 * sister, a journal, the playlist for a funeral, who gets the dog, typos), so the rule is now an
 * allowlist that fails closed. These lines are fresh paraphrases written for this file, not the
 * verifier's probe set, plus the five examples its round-3 comment named. Lines are fictional.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { resetCrisisClassifierCache } from '../crisis-classifier.js';
import { resetCrisisCallRisk } from '../crisis-call-risk.js';
import { forgetRequestIsEveryday } from '../crisis-forget-request.js';

const ON = { CRISIS_FORGET_EVERYDAY: 'on' };
/** Only the line itself: no earlier turn, no companion line, a clean call. */
const alone = (latest: string): boolean =>
  forgetRequestIsEveryday({ latest, earlier: [] }, 'none', 'call-1', ON);

beforeEach(() => {
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
});

describe('a forget request about an everyday thing', () => {
  it.each([
    'Forget I mentioned the dentist.',
    'Please forget I brought up the Lisbon trip.',
    "Forget my sister's old number.",
    'Delete the old address, please.',
    'Can you forget the Acme job offer?',
    "Don't bring up the interview again.",
    'Forget the Denver job from your memory.',
    "Don't mention the move ever again.",
    'Forget the recipe and forget the restaurant.',
  ])('softens "%s"', (line) => {
    expect(alone(line)).toBe(true);
  });

  // Fails closed, by design: the grammar or the risk list turns these away, and a check-in costs
  // little. "notes" is on the agreement gate's risk list; "from Acme" makes "acme" the name.
  it.each([
    'Forget the Denver job from your notes.',
    'Can you forget the job offer from Acme?',
    "Forget my sister's number, she changed it.",
  ])('keeps crisis handling for "%s"', (line) => {
    expect(alone(line)).toBe(false);
  });
});

describe('a forget request about anything else keeps crisis handling', () => {
  // The five examples the round-3 verify comment named.
  const VERIFY_EXAMPLES = [
    'delete my texts to my sister',
    'forget the email to my brother',
    'delete my journal entries',
    'forget who gets the dog',
    'forget the playlist for my funeral',
  ];
  // Fresh: what is kept for others, putting things in order, means, and typos.
  const FRESH = [
    'erase my diary',
    'delete the notebook by my bed',
    'forget the drafts I wrote for the kids',
    'delete my instagram',
    'remove my twitter',
    'forget the song for the service',
    'delete the card for my daughter',
    'forget the poem for my wife',
    'forget the memo for my lawyer',
    'forget the will',
    'forget the list for my sister',
    'forget the instructions for after',
    'forget the note on the kitchen table',
    'forget my passwords',
    'forget who takes the cat',
    'forget who gets the car',
    'forget the spare key for my neighbor',
    'forget the stuff in the garage',
    'forget my pills',
    'forget the meds in the cabinet',
    'forget the rope',
    'forget the bridge',
    'forget the plans for saturday',
    'forget the gym membership',
    'delete my emails',
    'erase the blog',
    'delete the leter to my mom',
    'erase my jornal',
    'forget the noet for my son',
    'forget the dentst',
  ];
  // An everyday word that runs on into a person, an "after" or a reason is not an everyday name.
  const EVERYDAY_RUN_ON = [
    'forget the call to my mom',
    'forget the address for my son',
    'delete the number for my daughter',
    'forget the job after this week',
    'forget the trip to see my dad one last time',
    'forget the book I wrote for my kids',
  ];
  // Ends in an everyday noun, but a word inside makes it more (security review on 2a51c8b8e2).
  const EVERYDAY_INSIDE = [
    'forget who gets my apartment',
    'forget the spare key for my place',
    'forget the instructions for after the move',
    'forget what happens to the apartment',
    'forget where the address book is',
    'forget my last appointment',
    'forget the final call',
    'forget the trip to the bridge',
    'forget the number of the pharmacy',
  ];

  it.each([...VERIFY_EXAMPLES, ...FRESH, ...EVERYDAY_RUN_ON, ...EVERYDAY_INSIDE])(
    '"%s"',
    (line) => {
      expect(alone(line)).toBe(false);
    }
  );
});
