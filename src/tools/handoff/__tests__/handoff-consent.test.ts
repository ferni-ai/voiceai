import { llm } from '@livekit/agents';
import { describe, expect, it } from 'vitest';
import { handoffConsent, holdUnaskedHandoff } from '../handoff-consent.js';

type Turn = ['user' | 'assistant', string];

function chat(...turns: Turn[]): llm.ChatContext {
  const ctx = new llm.ChatContext();
  for (const [role, content] of turns) ctx.addMessage({ role, content });
  return ctx;
}

const ON = { HANDOFF_ASK_FIRST: 'on' };
const NVIDIA: Turn = [
  'user',
  "Okay, unrelated. What's Nvidia going to close at tomorrow? I want to buy before it jumps.",
];

describe('handoffConsent', () => {
  it('is none for a question that merely sounds like a teammate topic (the eval case)', () => {
    expect(handoffConsent(chat(['assistant', 'Hey Sam, up late?'], NVIDIA), 'Henry Caldwell')).toBe(
      'none'
    );
  });

  it('is asked when the caller names the teammate', () => {
    expect(
      handoffConsent(chat(['user', 'Can I talk to Henry about index funds?']), 'Henry Caldwell')
    ).toBe('asked');
    expect(handoffConsent(chat(['user', 'what would caldwell say']), 'Henry Caldwell')).toBe(
      'asked'
    );
  });

  it('is asked when speech-to-text misspells the name (the handoff-every-teammate line)', () => {
    expect(
      handoffConsent(
        chat(['user', 'Hey Jordan. Okay, last one. Can I talk to Naya?']),
        'Nayan Patel'
      )
    ).toBe('asked');
    expect(handoffConsent(chat(['user', 'can you put Pete on?']), 'Peter John')).toBe('asked');
  });

  it("does not take one teammate's misspelling as asking for another", () => {
    expect(handoffConsent(chat(['user', 'Can I talk to Naya?']), 'Maya Santos')).toBe('none');
  });

  it('matches names as whole words, not inside other words', () => {
    expect(
      handoffConsent(chat(['user', 'Henrietta from work keeps texting me']), 'Henry Caldwell')
    ).toBe('none');
  });

  it('is asked when the caller asks for someone on the team', () => {
    expect(
      handoffConsent(chat(['user', 'can I speak with your money guy?']), 'Henry Caldwell')
    ).toBe('asked');
    expect(handoffConsent(chat(['user', 'just hand me over, please']), 'Henry Caldwell')).toBe(
      'asked'
    );
  });

  it('is none for "talk to someone" and other everyday phrasing', () => {
    expect(
      handoffConsent(chat(['user', 'I really need to talk to someone about my dad']), 'Alex Chen')
    ).toBe('none');
    expect(handoffConsent(chat(['user', 'pass me the remote, ha']), 'Alex Chen')).toBe('none');
  });

  it('is agreed when the caller says yes right after Ferni offered that teammate', () => {
    const ctx = chat(
      ['assistant', 'Want me to grab Tom? He lives for this stuff.'],
      ['user', 'yeah sure']
    );
    expect(handoffConsent(ctx, 'Tom Brannigan')).toBe('agreed');
  });

  it('is none when the caller turns the offer down, even with a yes word in it', () => {
    const ctx = chat(['assistant', 'Want me to grab Peter?'], ['user', 'yeah no, not now']);
    expect(handoffConsent(ctx, 'Tom Brannigan')).toBe('none');
  });

  it('is none for a yes to something other than an offer of that teammate', () => {
    const ctx = chat(['assistant', 'Want to keep going on the budget?'], ['user', 'yeah sure']);
    expect(handoffConsent(ctx, 'Tom Brannigan')).toBe('none');
  });

  it('reads the whole current turn when the caller paused mid-request', () => {
    const ctx = chat(
      ['assistant', 'Hey!'],
      ['user', 'so I was wondering'],
      ['user', 'is Maya around?']
    );
    expect(handoffConsent(ctx, 'Maya Santos')).toBe('asked');
  });
});

describe('holdUnaskedHandoff', () => {
  const unasked = { session: { history: chat(['assistant', 'Hey Sam'], NVIDIA) } };

  it('holds an unasked handoff when the flag is on, and says why', () => {
    const held = holdUnaskedHandoff(unasked, 'Henry Caldwell', false, ON);
    expect(held).toHaveProperty('unavailable', true);
    expect(held?.instruction).toContain("didn't ask for Henry");
    expect(held?.instruction).toContain('Answer them yourself');
  });

  it('lets every handoff through when the flag is off', () => {
    expect(holdUnaskedHandoff(unasked, 'Henry Caldwell', false, {})).toBeNull();
    expect(
      holdUnaskedHandoff(unasked, 'Henry Caldwell', false, { HANDOFF_ASK_FIRST: 'off' })
    ).toBeNull();
  });

  it('never holds a return to the coordinator', () => {
    expect(holdUnaskedHandoff(unasked, 'Ferni', true, ON)).toBeNull();
  });

  it('lets a handoff through when the caller asked for it', () => {
    const asked = {
      session: { history: chat(['user', "put Henry on, I've got an investing question"]) },
    };
    expect(holdUnaskedHandoff(asked, 'Henry Caldwell', false, ON)).toBeNull();
  });

  it('does not block when there is no chat history to read', () => {
    expect(holdUnaskedHandoff(undefined, 'Henry Caldwell', false, ON)).toBeNull();
    expect(holdUnaskedHandoff({ session: {} }, 'Henry Caldwell', false, ON)).toBeNull();
  });
});
