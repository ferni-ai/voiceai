/** What Ferni said and the caller answered reach the texting-consent ledger from the real recorders. */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../memory/retrieval/index.js', () => ({
  getAndClearInjectedMemories: () => [],
  parseAttributions: vi.fn(),
  applyAttributionFeedback: vi.fn(),
}));

const { recordAgentTurn, recordUserTurn } = await import('../agent-turn-recorder.js');
const { requestDisclosure, takeAgreedDisclosure } =
  await import('../../../services/outreach/voice-consent-ledger.js');

describe('agent-turn-recorder feeds the consent ledger', () => {
  it('a spoken disclosure and the yes after it make the session agreed', () => {
    const nonce = requestDisclosure('call-rec', 'uid-1');
    recordAgentTurn(
      'call-rec',
      null,
      "Sure. Just so you know, I'll text this number, msg and data rates may apply, and you can reply STOP anytime."
    );
    recordUserTurn('call-rec', null, 'yes please');
    expect(takeAgreedDisclosure('call-rec', 'uid-1')).toBe(nonce);
  });
});
