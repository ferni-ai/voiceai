/**
 * A call Ferni places for a member never says it "may be recorded": nothing on
 * it is recorded. A personal call says what it passes along and asks if that's
 * okay; business, restaurant and healthcare calls tell, never ask (owner,
 * 2026-11-02). Drives selectScript + buildCallScript (the script the call's
 * model reads), generateComplianceScript and checkCallCompliance. Fictional.
 */
import { describe, expect, it } from 'vitest';
import { buildCallScript, PASS_ALONG_ASK_HEADING, selectScript } from '../scripts/index.js';
import {
  checkCallCompliance,
  generateComplianceScript,
  getCallTypeRequirements,
} from '../compliance.js';
import type { CallType, OnBehalfCallRequest } from '../types.js';

const ASKS = "Just so you know, I'll pass along what you tell me to Riley Test. Is that okay?";
const TELLS = "Just so you know, I'll pass the details of this call along to Riley Test.";

const CONTACTS = [
  ['personal', { name: 'Priya', phone: '+15555550123', relationship: 'friend' }],
  ['healthcare', { name: 'Dr. Priya', phone: '+15555550124', relationship: 'doctor' }],
  ['restaurant', { name: 'Priya Bistro', phone: '+15555550125', relationship: 'restaurant' }],
  ['business', { name: 'Priya Plumbing', phone: '+15555550126', relationship: 'plumber' }],
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
  it.each(CONTACTS)('%s: the pass-along line, never "record"', (kind, contact) => {
    const { type, text } = scriptFor(contact);
    expect(type).toBe(kind);
    expect(text).not.toMatch(/record/i);
    expect(text).not.toContain('{userName}');
    if (kind === 'personal') {
      expect(text).toContain(`${PASS_ALONG_ASK_HEADING}\n${ASKS}`);
      // A no is fine: the member's message still goes, and nothing is pushed for.
      expect(text).toContain("If they say no, that's fine: still give them Riley Test's message");
    } else {
      expect(text).toContain(`### Passing it along\n${TELLS}\nSay it as a heads-up`);
      expect(text).not.toContain(PASS_ALONG_ASK_HEADING);
      expect(text).not.toMatch(/is that okay\?|if they say no/i);
    }
  });

  it.each([
    ['personal', true, ASKS],
    ['business', true, TELLS],
    ['business', false, TELLS],
  ] as const)(
    'compliance script, %s (recordingConsent %s): no "record"',
    (callType, consent, line) => {
      const request = { userName: 'Riley Test', recordingConsent: consent, callType } as OnBehalfCallRequest; // prettier-ignore
      const text = generateComplianceScript(request, { passed: true, issues: [], requiredDisclosures: [], warnings: [] }); // prettier-ignore
      expect(text).not.toMatch(/record/i);
      expect(text).toContain(line);
    }
  );

  it.each([
    ['personal', /ask if that is okay\.$/],
    ['business', /don't ask if that is okay\.$/],
  ] as const)('the %s disclosure says nothing is recorded', (callType, ask) => {
    const request = { userName: 'Riley Test', recordingConsent: true, callType: callType as CallType, resolvedContact: { name: 'Priya', phone: '+15555550123' } } as OnBehalfCallRequest; // prettier-ignore
    const said = checkCallCompliance(request).requiredDisclosures.filter((d) => /recorded/.test(d));
    expect(said).toHaveLength(1);
    expect(said[0]).toMatch(/^Nothing on this call is recorded\./);
    expect(said[0]).toMatch(ask);
    expect(JSON.stringify(getCallTypeRequirements(callType as CallType))).not.toMatch(/record/i);
  });
});
