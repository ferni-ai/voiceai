/**
 * A call Ferni places for a member never says it "may be recorded": nothing
 * on it is recorded. It says, honestly, that what the person shares is passed
 * along to the member, and asks if that's okay (owner, 2026-11-01).
 *
 * Drives the production builders: selectScript + buildCallScript (the script
 * the call's model reads) and generateComplianceScript. Fictional people only.
 */
import { describe, expect, it } from 'vitest';
import { buildCallScript, selectScript } from '../scripts/index.js';
import { generateComplianceScript } from '../compliance.js';
import type { OnBehalfCallRequest } from '../types.js';

const PERSONAL = "Just so you know, I'll pass along what you tell me to Riley Test. Is that okay?";
const DETAILS =
  "Just so you know, I'll pass the details of this call along to Riley Test. Is that okay?";

const CONTACTS = [
  ['personal', { name: 'Priya', phone: '+15555550123', relationship: 'friend' }, PERSONAL],
  ['healthcare', { name: 'Dr. Priya', phone: '+15555550124', relationship: 'doctor' }, DETAILS],
  ['restaurant', { name: 'Priya Bistro', phone: '+15555550125', relationship: 'restaurant' }, DETAILS], // prettier-ignore
  ['business', { name: 'Priya Plumbing', phone: '+15555550126', relationship: 'plumber' }, DETAILS],
] as const;

function scriptFor(contact: (typeof CONTACTS)[number][1]) {
  const { script, type } = selectScript(contact, 'check in about the weekend');
  const text = buildCallScript(script, {
    agentName: 'Ferni',
    userName: 'Riley Test',
    contactName: contact.name,
    purpose: 'check in about the weekend',
    objective: 'general',
  });
  return { type, text };
}

describe('the placed call says what it does with the call, honestly', () => {
  it.each(CONTACTS)('%s: the pass-along line, never "record"', (kind, contact, line) => {
    const { type, text } = scriptFor(contact);
    expect(type).toBe(kind);
    expect(text).not.toMatch(/record/i);
    expect(text).toContain('### Passing it along');
    expect(text).toContain(line);
    expect(text).not.toContain('{userName}');
    // A no is fine: the member's message still goes, and nothing is pushed for.
    expect(text).toContain("If they say no, that's fine: still give them Riley Test's message");
  });

  it.each([true, false])(
    'the compliance script (recordingConsent %s) never says "record"',
    (consent) => {
      const request = { userName: 'Riley Test', recordingConsent: consent } as OnBehalfCallRequest;
      const text = generateComplianceScript(request, { passed: true, issues: [], requiredDisclosures: [], warnings: [] }); // prettier-ignore
      expect(text).not.toMatch(/record/i);
      expect(text).toContain(DETAILS);
    }
  );
});
