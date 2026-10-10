import { describe, expect, it } from 'vitest';
import { callSessionId } from '../call-session.js';

describe('callSessionId', () => {
  it("uses the live call's session from the run context", () => {
    const run = { ctx: { userData: { services: { sessionId: 'call-123' } } } };
    expect(callSessionId(run, { sessionId: 'built-with' })).toBe('call-123');
  });

  it('falls back to the tool context when the run carries none', () => {
    expect(callSessionId({ ctx: { userData: {} } }, { sessionId: 'built-with' })).toBe(
      'built-with'
    );
    expect(callSessionId(undefined, {})).toBeUndefined();
  });
});
