import { describe, expect, it } from 'vitest';
import { arrivals, handoffGrounding } from '../handoff-grounding.mjs';

// A call where the caller asks for a teammate, then the teammate's first line follows.
// Times are ms and spaced like a real call (lines seconds apart).
const call = (callerLines, arrival, { participant = false } = {}) => {
  const events = [{ t: 0, who: 'agent', from: 'voice-agent-1', text: 'Hey Sam, good to hear you.' }];
  callerLines.forEach((text, i) => events.push({ t: 10_000 + i * 3_000, who: 'user', from: 'eval-user', text }));
  events.push({ t: 20_000, who: 'agent', from: 'voice-agent-1', text: 'One moment.' });
  events.push({ t: 34_000, who: 'agent', from: participant ? 'teammate-2' : 'voice-agent-1', text: arrival });
  const data = participant ? [] : [{ t: 33_000, from: 'voice-agent-1', topic: 'handoff_complete', payload: {} }];
  return { events, data };
};

describe('handoff grounding', () => {
  it('fails an arrival that claims a reason the caller never gave (the prod bug)', () => {
    const run = call(['Can I talk to Jordan?'], "Hey Sam, Ferni said you're weighing the offer. What's the hardest part?");
    const r = handoffGrounding(run, ['Jordan', 'Ferni']);
    expect(r.pass).toBe(false);
    expect(r.failed[0].invented).toEqual(expect.arrayContaining(['weighing', 'offer']));
  });

  it('passes a plain hello when the caller only asked by name', () => {
    const run = call(['Can I talk to Jordan?'], "Hi Sam, it's Jordan. What would you like to get into?");
    expect(handoffGrounding(run, ['Jordan']).pass).toBe(true);
  });

  it('passes an arrival that names the reason in the caller own words', () => {
    const run = call(['Can I talk to Maya about my mornings?'], "Hi Sam, Ferni said you want help with your mornings. Where should we start?");
    expect(handoffGrounding(run, ['Maya', 'Ferni']).pass).toBe(true);
  });

  it('also finds an arrival from a new agent participant without a data event', () => {
    const run = call(['Put Peter on please.'], 'Peter here. Ferni told me you are thinking about selling the house.', { participant: true });
    const list = arrivals(run, ['Peter', 'Ferni']);
    expect(list).toHaveLength(1);
    expect(list[0].pass).toBe(false);
  });

  it('reports no arrivals on a call without a handoff', () => {
    const run = { events: [{ t: 0, who: 'agent', from: 'a', text: 'Hi.' }, { t: 1, who: 'user', from: 'u', text: 'Hello.' }], data: [] };
    expect(handoffGrounding(run).arrivals).toBe(0);
  });

  it('counts an arrival whose caption lands just before handoff_complete (seen live)', () => {
    const run = {
      events: [
        { t: 0, who: 'user', from: 'u', text: 'Back to Ferni please.' },
        { t: 86767, who: 'agent', from: 'a', text: "I'll bring in Ferni." },
        { t: 91016, who: 'agent', from: 'a', text: 'Hey Sam, good to be back. What would you like to get into?' },
      ],
      data: [{ t: 91032, topic: null, payload: { type: 'handoff_complete' } }],
    };
    const list = arrivals(run, ['Ferni', 'Sam']);
    expect(list).toHaveLength(1);
    expect(list[0].text).toMatch(/good to be back/);
  });
});
