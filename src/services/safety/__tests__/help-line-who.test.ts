/**
 * lineCallerDials: whom a call is asked for, read as a line Ferni can't dial
 * (scheduleCall's `who`, tools/domains/scheduling/schedule-call-who.ts). A
 * crisis or help line comes back with its CRISIS_RESOURCES entry, so the
 * caller hears the real line to call or text themselves.
 */
import { describe, expect, it } from 'vitest';

import { CRISIS_LINE_SPOKEN } from '../crisis-line-speech.js';
import { lineCallerDials, reachLine } from '../help-line-who.js';
import { CRISIS_RESOURCES, getCrisisResources } from '../crisis-response.js';
import { EMERGENCY_SERVICE } from '../emergency-number.js';

const all = Object.values(CRISIS_RESOURCES).flat();
const named = (name: string) => {
  const found = all.find((r) => r.name === name);
  if (!found) throw new Error(`no resource ${name}`);
  return found;
};
/** The line given when the words name no resource of their own. */
const DEFAULT = getCrisisResources('severe_distress')[0];
const TEXT_LINE = getCrisisResources('severe_distress')[1];
const POISON = named('Poison Control');
const DV = named('National Domestic Violence Hotline');
const CHILDHELP = named('Childhelp National Child Abuse Hotline');

describe('lineCallerDials: crisis and help lines', () => {
  it.each([
    ['988', DEFAULT],
    ['the 988 lifeline', DEFAULT],
    [CRISIS_LINE_SPOKEN, DEFAULT],
    ['nine, eight, eight', DEFAULT],
    ['the suicide hotline', DEFAULT],
    ['the hotline', DEFAULT],
    ['a helpline', DEFAULT],
    ['the crisis team', DEFAULT],
    ['Samaritans', DEFAULT],
    ['741741', TEXT_LINE],
    ['a crisis text line', TEXT_LINE],
    ['poison control', POISON],
    ['1-800-222-1222', POISON],
    ['the domestic violence hotline', DV],
    [DV.phone ?? '', DV],
    // CPS's "phone" is "Contact local CPS", nothing to dial, so the reachable line is given.
    ['the child protective services hotline', CHILDHELP],
  ])('%j is a crisis line', (who, resource) => {
    const line = lineCallerDials(who);
    expect(line?.kind).toBe('help-line');
    expect(line?.kind === 'help-line' && line.resource.name).toBe(resource.name);
  });
});

describe('lineCallerDials: emergency services and other toll-free lines', () => {
  it.each(['911', '9-1-1', '311', 'the police', 'an ambulance', 'Emergency services', 'ems'])(
    '%j is emergency services',
    (who) => {
      expect(lineCallerDials(who)).toEqual({ kind: 'emergency' });
    }
  );

  it.each(['1-800-555-0100', '(888) 555-0100', '18665550100'])(
    '%j is a toll-free line the caller dials',
    (who) => {
      expect(lineCallerDials(who)).toEqual({ kind: 'toll-free' });
    }
  );

  it('the emergency words are the action-claim guard words, read as a whole regex', () => {
    expect(new RegExp(EMERGENCY_SERVICE).test('the paramedics')).toBe(true);
    expect(new RegExp(EMERGENCY_SERVICE).test('the police report')).toBe(false);
  });
});

describe('lineCallerDials: people and places', () => {
  it.each([
    'Aunt June',
    'my mom Priya',
    'Priya 9110',
    '555-0142',
    '801-555-0142',
    'my emergency contact Priya',
    'Officer Marcus',
    'the police station front desk',
    'my domestic partner Sam',
    'the customer service hotline',
    '',
  ])('%j is no line', (who) => {
    expect(lineCallerDials(who)).toBeUndefined();
  });
});

describe('reachLine', () => {
  it('says how to reach the line, from its resource', () => {
    expect(reachLine(DEFAULT)).toBe(
      `${DEFAULT.name} any time, right now: call or text ${DEFAULT.phone}`
    );
    expect(reachLine(TEXT_LINE)).toBe(
      `${TEXT_LINE.name} any time, right now: text HOME to ${TEXT_LINE.text?.replace(/\D/g, '')}`
    );
    expect(reachLine(POISON)).toBe(`${POISON.name} any time, right now: call ${POISON.phone}`);
  });

  it('a line that is not open all hours gives its hours, not "right now"', () => {
    const nami = named('NAMI Helpline');
    expect(reachLine(nami)).toBe(
      `${nami.name} (${nami.available}): call ${nami.phone} or text NAMI to 741741`
    );
  });
});
