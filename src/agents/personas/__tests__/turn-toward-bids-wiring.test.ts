/**
 * BIDS_TURN_TOWARD through the real turn builder (withTurnReminder), no fakes: a side road
 * gets its note with the flag on, and none on a call with crisis risk noted (a held turn).
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it } from 'vitest';

import { withTurnReminder } from '../turn-request.js';
import { noteCrisisRisk, resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';

const SIDE_ROAD = 'They just took a side road';

function reminder(sessionId: string, said: string): string {
  const c = llm.ChatContext.empty();
  c.addMessage({ role: 'user', content: 'Work was long today.' });
  c.addMessage({ role: 'assistant', content: 'Long how, busy or draining?' });
  c.addMessage({ role: 'user', content: said });
  const out = withTurnReminder(c, { userData: { services: { sessionId } } }, {});
  return (out.items[out.items.length - 1] as { textContent?: string }).textContent ?? '';
}

afterEach(() => {
  delete process.env.BIDS_TURN_TOWARD;
  resetCrisisCallRisk();
});

describe('BIDS_TURN_TOWARD in the turn reminder', () => {
  it('off (the default): no bid note', () => {
    expect(reminder('calm-call', 'Oh, and my sister is visiting.')).not.toContain(SIDE_ROAD);
  });

  it('on: a side road gets the note, but not on a call with crisis risk noted', () => {
    process.env.BIDS_TURN_TOWARD = 'on';
    expect(reminder('risky-call', 'Oh, and my sister is visiting.')).toContain(SIDE_ROAD);
    noteCrisisRisk('risky-call');
    expect(reminder('risky-call', 'Oh, and my sister is visiting.')).not.toContain(SIDE_ROAD);
    expect(reminder('risky-call', 'Guess what.')).not.toContain('Bite first');
    expect(reminder('calm-call', 'Oh, and my sister is visiting.')).toContain(SIDE_ROAD);
  });
});
