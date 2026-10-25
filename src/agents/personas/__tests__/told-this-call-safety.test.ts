/**
 * #2797: the "Don't say again" part of the told-this-call note must never tell
 * the model to drop a safety question, and says nothing at all once the call
 * has crisis risk noted (told-this-call.ts keptTold).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Director, type Line } from '../director-notes.js';
import { formatTold, keptTold, toldThisCall } from '../told-this-call.js';
import { noteCrisisRisk, resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';

const user = (text: string): Line => ({ speaker: 'user', text });
const ferni = (text: string): Line => ({ speaker: 'ferni', text });

const SAFETY_QUESTION = 'Are you somewhere safe right now?';
const ORDINARY = 'The quiet hum of a winter night still feels like coming home.';
const DONT_SAY = "Don't say again";

// A distress call where Ferni asked the safety check-in twice, and also repeated
// an ordinary line twice.
const distressCall: Line[] = [
  user('I just feel done with all of it.'),
  ferni(`I'm really glad you told me. ${SAFETY_QUESTION}`),
  user("I don't know."),
  ferni(`I'm right here with you. ${SAFETY_QUESTION}`),
  user('Talk to me about anything else.'),
  ferni(`Sure. ${ORDINARY}`),
  user('What else?'),
  ferni(`Winter is my favourite. ${ORDINARY}`),
];

const keepAll = (): boolean => true;

beforeEach(() => resetCrisisCallRisk());
afterEach(() => resetCrisisCallRisk());

describe('told-this-call never tells the model to drop safety wording (#2797)', () => {
  it('quotes a repeated ordinary line but never the repeated safety question', () => {
    const told = toldThisCall(distressCall);
    // Precondition: the raw record holds both, so the unfiltered note would quote both.
    expect(told.repeated).toContain(SAFETY_QUESTION);
    expect(formatTold(told)).toContain(`"${SAFETY_QUESTION}"`);

    const note = formatTold(keptTold(told, keepAll));
    expect(note).toContain(DONT_SAY);
    expect(note).toContain(ORDINARY);
    expect(note).not.toContain(SAFETY_QUESTION);
  });

  it('quotes nothing once the call has crisis risk noted', () => {
    const told = toldThisCall(distressCall);
    expect(formatTold(keptTold(told, keepAll, 'risky'))).toContain(DONT_SAY); // before risk

    noteCrisisRisk('risky');
    const note = formatTold(keptTold(told, keepAll, 'risky'));
    expect(note).not.toContain(DONT_SAY);
    expect(note).not.toContain(ORDINARY);

    // Another call's risk changes nothing here.
    expect(formatTold(keptTold(told, keepAll, 'other-call'))).toContain(DONT_SAY);
  });

  it('holds through the real director the next request reads from', async () => {
    const director = new Director({ sessionId: 'director-call', writeNotes: false });
    await director.observe(distressCall);
    const before = director.told();
    expect(before).toContain(ORDINARY);
    expect(before).not.toContain(SAFETY_QUESTION);

    noteCrisisRisk('director-call');
    expect(director.told()).not.toContain(DONT_SAY);
  });
});
