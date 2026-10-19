import { describe, expect, it } from 'vitest';
import { heardSettled, heardTicked, heardTurn } from '@/ui/captions/heard-turn.js';
import type { CaptionEntry } from '@/ui/captions/live-captions.js';

const user = (text: string, final: boolean): CaptionEntry => ({ speaker: 'user', text, final });
const agent = (text: string, final: boolean): CaptionEntry => ({ speaker: 'agent', text, final });

describe('heard turn', () => {
  it('has no caller line before the caller has spoken', () => {
    expect(heardTurn([])).toEqual({ user: null, agentTookTurn: false });
    expect(heardSettled(heardTurn([agent('Hello', true)]))).toBe(false);
  });

  it('keeps the caller line interim until its transcript is final', () => {
    const turn = heardTurn([user('My sister Ana', false)]);
    expect(turn.user?.final).toBe(false);
    expect(heardSettled(turn)).toBe(false);
  });

  it('settles the caller line on the final transcript, before Ferni answers', () => {
    const turn = heardTurn([user('My sister Ana starts Monday.', true)]);
    expect(heardSettled(turn)).toBe(true);
    expect(turn.agentTookTurn).toBe(false);
    expect(heardTicked(turn)).toBe(false);
  });

  it('pops the check once Ferni takes a settled line', () => {
    const turn = heardTurn([user('My sister Ana starts Monday.', true), agent('Nervous', false)]);
    expect(turn.agentTookTurn).toBe(true);
    expect(heardTicked(turn)).toBe(true);
  });

  it('does not pop the check on an unsettled line, even if Ferni has started', () => {
    const turn = heardTurn([user('My sister Ana', false), agent('Nervous', false)]);
    expect(heardTicked(turn)).toBe(false);
  });

  it('reads the latest caller line when there were several turns', () => {
    const turn = heardTurn([user('First.', true), agent('Reply.', true), user('Second', false)]);
    expect(turn.user?.text).toBe('Second');
    expect(turn.agentTookTurn).toBe(false);
  });
});
