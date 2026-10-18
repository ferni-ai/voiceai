/** Consent on a call needs the disclosure spoken (as heard) and a yes after it; single use, timed. */
import { describe, expect, it } from 'vitest';
import {
  DISCLOSURE_TTL_MS,
  noteConsentTurn,
  requestDisclosure,
  takeAgreedDisclosure,
} from '../voice-consent-ledger.js';

const SAID =
  "Sure. Just so you know, I'll text this number, msg and data rates may apply, and you can reply STOP anytime.";

describe('voice consent ledger', () => {
  it('spoken in full, then yes: one nonce, used once', () => {
    const nonce = requestDisclosure('s1', 0);
    noteConsentTurn('s1', 'user', 'yes', 1); // before Ferni spoke: not an answer
    noteConsentTurn('s1', 'assistant', SAID, 2);
    noteConsentTurn('s1', 'user', 'Sure, please do.', 3);
    expect(takeAgreedDisclosure('s1', 4)).toBe(nonce);
    expect(takeAgreedDisclosure('s1', 5)).toBeNull();
  });

  it('cut off before the end (no STOP heard) is not spoken', () => {
    requestDisclosure('s2', 0);
    noteConsentTurn('s2', 'assistant', "Sure. Just so you know, I'll text this number, msg and", 1);
    noteConsentTurn('s2', 'user', 'yes', 2);
    expect(takeAgreedDisclosure('s2', 3)).toBeNull();
  });

  it('a no, or a yes with a "but wait", is not agreement', () => {
    for (const [id, answer] of [
      ['s3', 'no'],
      ['s4', "yes, actually wait, don't"],
    ]) {
      requestDisclosure(id, 0);
      noteConsentTurn(id, 'assistant', SAID, 1);
      noteConsentTurn(id, 'user', answer, 2);
      expect(takeAgreedDisclosure(id, 3)).toBeNull();
    }
  });

  it('too late, or never asked, is nothing', () => {
    requestDisclosure('s5', 0);
    noteConsentTurn('s5', 'assistant', SAID, 1);
    noteConsentTurn('s5', 'user', 'yes', 2);
    expect(takeAgreedDisclosure('s5', DISCLOSURE_TTL_MS)).toBeNull();
    noteConsentTurn('s6', 'assistant', SAID, 1);
    noteConsentTurn('s6', 'user', 'yes', 2);
    expect(takeAgreedDisclosure('s6', 3)).toBeNull();
  });
});
