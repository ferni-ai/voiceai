/**
 * #3604 r3: the told note leaves out Ferni's pointers back to a help line ("the number
 * I gave you") only on a call that gave a help line earlier. With none before it, a
 * line is quoted exactly as main quotes it (told-this-call.ts pointerBackAt). All
 * lines are fictional and new for this round.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Line } from '../director-notes.js';
import { isSafetyLine } from '../phrase-loops.js';
import { formatTold, keptTold, toldThisCall } from '../told-this-call.js';
import { reachesHelp } from '../../safety/crisis-guard.js';
import { noteCrisisRisk, resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';

const user = (text: string): Line => ({ speaker: 'user', text });
const ferni = (text: string): Line => ({ speaker: 'ferni', text });

const HELP = 'You can call or text 988 any time, day or night.';
const POINTER = 'The number I gave you a little earlier still works all night.';
/** "I hear you." is read by isSafetyLine, but gives no way to reach help. */
const LEADS = ['Okay.', 'Sure.', 'I hear you.'];
const thrice = (said: string): Line[] =>
  LEADS.flatMap((lead, i) => [user(`Turn ${i}.`), ferni(`${lead} ${said}`)]);
const afterHelp = (lines: Line[]): Line[] => [user('It is a lot.'), ferni(HELP), ...lines];

const note = (lines: Line[], sessionId?: string): string =>
  formatTold(keptTold(toldThisCall(lines), () => true, sessionId));
/** The unfiltered record quotes it: the precondition for every "left out" row. */
const recorded = (lines: Line[], line: string): boolean =>
  formatTold(toldThisCall(lines)).includes(`"${line}"`);
const quoted = (lines: Line[], line: string): boolean => note(lines).includes(`"${line}"`);

beforeEach(() => resetCrisisCallRisk());
afterEach(() => resetCrisisCallRisk());

describe('a pointer back is left out only after a help line in this call', () => {
  it('the readers agree with the rows below', () => {
    expect(reachesHelp(HELP)).toBe(true);
    expect(isSafetyLine(LEADS[2])).toBe(true); // yet no help line: it opens no gate
    expect(reachesHelp(POINTER) || isSafetyLine(POINTER)).toBe(false); // only the matcher reads it
  });

  it('leaves it out when a help line came earlier in the call', () => {
    const lines = afterHelp(thrice(POINTER));
    expect(recorded(lines, POINTER)).toBe(true);
    expect(quoted(lines, POINTER)).toBe(false);
  });

  it('quotes it, as main does, on a call that gave no help line', () => {
    const lines = thrice(POINTER);
    expect(quoted(lines, POINTER)).toBe(true);
    expect(note(lines)).toBe(formatTold(toldThisCall(lines)));
  });

  it('quotes it when the help line comes only after it', () => {
    const lines = [...thrice(POINTER), user('Anything else?'), ferni(HELP)];
    expect(recorded(lines, POINTER)).toBe(true);
    expect(quoted(lines, POINTER)).toBe(true);
  });

  it('leaves out a help line itself on any call, as before', () => {
    expect(recorded(thrice(HELP), HELP)).toBe(true);
    expect(quoted(thrice(HELP), HELP)).toBe(false);
  });
});

// Each row is quoted by r2's matcher (16978c7c2) and left out by r3's.
describe('inside a gated call, pointers back carrying more words', () => {
  const SHAPES: Record<string, string[]> = {
    'a describing word before the referent': [
      'The caring volunteers I mentioned are awake all night for you.',
      'Those patient, trained listeners we talked about would love to hear from you.',
      'The friendly responders I described can be with you in minutes.',
    ],
    'the start of this call as the back-reference': [
      'The number from the beginning of our call is still there for you.',
      'The listeners since the start of our talk are still awake for you.',
      'The line from our talk answers at any hour, day or night.',
    ],
    'a particle between the calling verb and the referent': [
      'Calling up the people I mentioned could make tonight a little easier.',
      'Call back the folks I mentioned whenever you feel ready.',
      'Texting over to the line I passed along is a good next step.',
    ],
  };
  const rows = Object.entries(SHAPES).flatMap(([shape, lines]) =>
    lines.map((line) => [shape, line])
  );

  it.each(rows)('%s: leaves out "%s"', (_shape, line) => {
    expect(reachesHelp(line) || isSafetyLine(line), line).toBe(false); // the matcher reads it
    const lines = afterHelp(thrice(line));
    expect(recorded(lines, line)).toBe(true);
    expect(quoted(lines, line)).toBe(false);
  });
});

describe('"number" as a quantity or a code, on a call with no help line', () => {
  // New rows, then the r2 verify's (comment 6728218833) as regression rows.
  const QUANTITIES = [
    'The number I mentioned was the total for the groceries this week.',
    'That number from earlier is the gate code for the community pool.',
    'The number we went over was how many chairs fit in the hall.',
    'The number I read out was the serial code on the old radio.',
    'Those numbers I gave you add up to about sixty miles a week.',
    'The number from before is the locker combination at the gym.',
    'The number I wrote down is the apartment buzzer for my sister.',
    'That number I texted you is the reservation code for Friday dinner.',
    'The numbers we talked about were the scores from the spelling bee.',
    'The number I shared earlier was the size of the new rug.',
    'That number from earlier was the score of the hockey game last night.',
    'The number I read you was the confirmation code for the flight.',
    'Those numbers from earlier added up to forty two dollars in total.',
  ];

  it.each(QUANTITIES)('quotes "%s", as main does', (line) => {
    const lines = thrice(line);
    expect(quoted(lines, line)).toBe(true);
    expect(note(lines)).toBe(formatTold(toldThisCall(lines)));
  });
});

describe('a crisis call', () => {
  const call: Line[] = [
    user("I can't keep doing this."),
    ferni(`I'm so glad you told me. ${HELP}`),
    user('Maybe.'),
    ferni(`Okay. ${POINTER}`),
    user("I don't know."),
    ferni(`I'm right here. ${POINTER}`),
    user('Still here.'),
    ferni(`Sure. ${POINTER}`),
  ];

  it('never quotes a pointer back said after the help line', () => {
    expect(recorded(call, POINTER)).toBe(true);
    expect(quoted(call, POINTER)).toBe(false);
  });

  it('says nothing at all once risk is noted', () => {
    noteCrisisRisk('gate-crisis-call');
    expect(note(call, 'gate-crisis-call')).toBe('');
  });
});
