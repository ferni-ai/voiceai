/**
 * The unknown-caller guidance must not teach a transcript. On dev 2026-10-17 its
 * Caller:/You: example led Ferni to write the caller's answer himself (caller-voice-guard.ts).
 */
import { describe, expect, it } from 'vitest';

import { buildUnknownCallerGuidance } from '../inbound-call-context.js';

describe('buildUnknownCallerGuidance', () => {
  it('carries no speaker-labelled lines the model could copy', () => {
    expect(buildUnknownCallerGuidance()).not.toMatch(/^\s*(?:Caller|You|User|Ferni)\s*:/m);
  });

  it('still tells Ferni to wait after a question and to register a referral', () => {
    const guidance = buildUnknownCallerGuidance();
    expect(guidance).toContain('Never write the caller');
    expect(guidance).toContain('register_family_caller');
  });
});
