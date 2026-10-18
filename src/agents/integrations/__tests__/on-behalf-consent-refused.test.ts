/** An on-behalf call never takes texting consent for the owner (voice-consent-ledger.ts). */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../intelligence/context-builders/external/outbound-call-context.js', () => ({
  getOutboundCallContext: (sessionId: string) =>
    sessionId === 'ob-call' ? { callId: 'c1', recipientName: 'Sam' } : undefined,
}));

const { initializeOnBehalfCapture, cleanupOnBehalfCapture } =
  await import('../on-behalf-transcript-capture.js');
const ledger = await import('../../../services/outreach/voice-consent-ledger.js');

describe('on-behalf capture refuses texting consent', () => {
  it('while the call runs, no disclosure is asked; after it ends, the session is free again', () => {
    expect(initializeOnBehalfCapture('ob-call')).toBe(true);
    expect(ledger.requestDisclosure('ob-call', 'owner-uid')).toBeNull();
    cleanupOnBehalfCapture('ob-call');
    expect(ledger.requestDisclosure('ob-call', 'owner-uid')).not.toBeNull();
  });
});
