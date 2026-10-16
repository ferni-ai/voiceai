import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { repairNoteFor } from '../repair-check.js';
import { withTurnReminder } from '../turn-request.js';
import { unclearCue, unclearNote } from '../unclear-turn.js';

const PROMPT = 'You are Ferni. Talk like a friend: really, right, sure, nothing, yep, good.';

function call(...turns: Array<['user' | 'assistant', string]>): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: PROMPT });
  for (const [role, content] of turns) ctx.addMessage({ role, content });
  return ctx;
}

const session = { userData: { userName: 'Sam' } };
const ON = { REPAIR_MODE: 'on', ASK_WHEN_UNCLEAR: 'on' };
/** What the model is sent after the caller's words: the per-turn reminder. */
const sent = (ctx: llm.ChatContext): string =>
  (withTurnReminder(ctx, session).items.at(-1) as llm.ChatMessage).textContent ?? '';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('unclearCue', () => {
  it('lets a long turn that trails off, or "night night", pass as said', () => {
    expect(unclearCue("It's been a long week and I just keep coming back to the", [])).toBeNull();
    expect(unclearCue('Night night.', [])).toBeNull();
  });

  it('flags a short doubled-word turn with no one doing anything (dev call 2026-10-11)', () => {
    expect(unclearCue('Still still on there.', [])).toEqual({
      kind: 'fragment',
      heard: 'Still still on there.',
      options: [],
    });
    expect(unclearCue("I'm thinking of going for a", [])?.kind).toBe('fragment');
  });

  it('leaves ordinary disfluency alone', () => {
    for (const ok of [
      'So yeah, the the interview went really well actually.',
      'I, I think I am gonna go with the blue one.',
      'No no, fifteen, not fifty.',
      'Yeah yeah, I know.',
      'I called her.',
    ])
      expect(unclearCue(ok, []), ok).toBeNull();
  });

  it('asks who "her" is when two women are on the call, most recent first', () => {
    const turns = [
      'My mom called this morning, she is doing fine.',
      'Oh good.',
      'And Priya texted that her flight got delayed again.',
      'Third time this month?',
    ];
    expect(unclearCue('Can you call her for me?', turns)).toEqual({
      kind: 'reference',
      heard: 'call her',
      options: ['Priya', 'mom'],
    });
  });

  it('takes the one person who fits: "my sister Priya" is one person, a man is not "her"', () => {
    expect(
      unclearCue('Call her back.', ['My sister Priya called while I was in the shower.'])
    ).toBeNull();
    expect(
      unclearCue('Call her.', ['My dad called, and my mom wants me to come over.'])
    ).toBeNull();
    expect(
      unclearCue('Text him that I am late.', ["Jordan's picking me up after work."])
    ).toBeNull();
    expect(
      unclearCue('Text him that I am late.', [
        "Jordan's picking me up after work.",
        'But Kyle wants to grab a drink first.',
      ])?.options
    ).toEqual(['Kyle', 'Jordan']);
  });

  it('reads who "send it to her" goes to', () => {
    const turns = [
      "I finished the portfolio. Dana the recruiter wants it, and Rachel said she'd look it over.",
      "Look at you! That's a big one done.",
    ];
    expect(unclearCue('Send it to her tonight.', turns)?.options).toEqual(['Rachel', 'Dana']);
  });

  it('lets "play that one again" through once Ferni played one', () => {
    expect(unclearCue('Play that one again.', ['Okay, here is Here Comes the Sun.'])).toBeNull();
    expect(unclearCue('Play that one again.', ['[playMusic]'])).toBeNull();
    expect(unclearCue('Play that one again.', ['Fleetwood Mac, some Talking Heads.'])?.heard).toBe(
      'Play that one'
    );
  });

  it('only reads a request to Ferni, not talk about doing something', () => {
    for (const said of [
      'Ha, yeah, I actually did send it.',
      'Well, you should do it.',
      'Okay, if I do tell her, how do I even start?',
      'I was going to call her but I forgot.',
    ])
      expect(unclearCue(said, []), said).toBeNull();
    expect(unclearCue('Okay, take it off the list.', [])?.heard).toBe('take it');
    expect(unclearCue('Could you look that up?', [])?.heard).toBe('look that up');
  });

  it('notes one short question with a guess, never a list', () => {
    const note = unclearNote({ kind: 'reference', heard: 'call her', options: ['Priya', 'mom'] });
    expect(note).toContain('both Priya and mom');
    expect(note).toContain('"Priya, right?"');
    expect(note).toContain('Before you call any tool');
  });
});

describe('repairNoteFor with ASK_WHEN_UNCLEAR', () => {
  const unclear = call(
    ['user', 'My mom called, and Priya texted too.'],
    ['assistant', 'Busy phone today.'],
    ['user', 'Can you call her for me?']
  );

  it('is off unless both flags are on', () => {
    vi.stubEnv('REPAIR_MODE', 'on');
    expect(sent(unclear)).not.toContain('right?"');
    vi.stubEnv('REPAIR_MODE', 'off');
    vi.stubEnv('ASK_WHEN_UNCLEAR', 'on');
    expect(sent(unclear)).not.toContain('right?"');
    vi.stubEnv('REPAIR_MODE', 'on');
    expect(sent(unclear)).toContain('"Priya, right?"');
  });

  it('shares the one repair slot: a lone misheard name keeps its own check', () => {
    const note = repairNoteFor(unclear, session, ON);
    expect(note).toContain('call her');
    expect(note).not.toContain('a name nobody has said');
    const lone = call(['assistant', 'Hey Sam, what are you up to?'], ['user', 'Peter']);
    expect(repairNoteFor(lone, session, ON)).toContain('a name nobody has said');
  });

  it('keeps REPAIR_MODE rules: not after Ferni just checked, not while venting', () => {
    const checked = call(
      ['user', 'My mom called, and Priya texted too.'],
      ['assistant', 'Sorry, did you say Priya?'],
      ['user', 'Can you call her for me?']
    );
    expect(repairNoteFor(checked, session, ON)).toBe('');
    const venting = call(
      ['user', 'My mom and Priya are both mad at me.'],
      ['assistant', 'Oof.'],
      ['user', "I'm so done with everything today, just call her, whatever."]
    );
    expect(repairNoteFor(venting, session, ON)).toBe('');
  });
});
