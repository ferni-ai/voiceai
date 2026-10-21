import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { withHonesty } from '../ai-honesty.js';
import { Director, setDirector } from '../director-notes.js';
import { INTERNALS_HONESTY, asksAboutInternals, internalsTurn } from '../no-invented-internals.js';
import { withTurnReminder } from '../turn-request.js';

// The #2223 pattern (prod 2026-10-19), paraphrased: no caller's words.
const NO_RESULTS =
  'No results for "baseball game tonight". If they asked about something live, say you couldn\'t find it rather than guess.';
const COULDNT_FIND = "Hmm, I couldn't find anything on a game tonight. Want me to try another way?";
const PUSH_NOTE = 'Answer their specific question about the backend service.';
const ASK = /asking what went wrong behind the scenes/;
const RETRACT = /nothing on this call told you that/;

const FLAG = 'NO_INVENTED_INTERNALS';
const prev = process.env[FLAG];
afterEach(() => {
  if (prev === undefined) delete process.env[FLAG];
  else process.env[FLAG] = prev;
});

type Line = ['ferni' | 'caller', string] | ['tool', string, boolean?];
let n = 0;
function call(...lines: Line[]): llm.ChatContext {
  const items: llm.ChatItem[] = [];
  for (const [who, text, isError] of lines) {
    if (who === 'tool') {
      const callId = `c${++n}`;
      items.push(llm.FunctionCall.create({ callId, name: 'searchWeb', args: '{}' }));
      items.push(
        llm.FunctionCallOutput.create({
          callId,
          name: 'searchWeb',
          output: text,
          isError: !!isError,
        })
      );
    } else
      items.push(
        llm.ChatMessage.create({ role: who === 'ferni' ? 'assistant' : 'user', content: text })
      );
  }
  return new llm.ChatContext(items);
}
const afterFailedSearch = (...more: Line[]) =>
  call(
    ['caller', 'is there a baseball game tonight?'],
    ['tool', NO_RESULTS],
    ['ferni', COULDNT_FIND],
    ...more
  );

/** The request text for this call, with the director's push pending. */
function request(c: llm.ChatContext, flag: 'on' | 'off'): string {
  process.env[FLAG] = flag;
  const session = {};
  setDirector(session, { current: () => [PUSH_NOTE], told: () => '' } as unknown as Director);
  try {
    const out = withTurnReminder(c, session);
    return (out.items[out.items.length - 1] as { textContent?: string }).textContent ?? '';
  } finally {
    setDirector(session, null);
  }
}

describe('withTurnReminder: asked about his internals after a tool failed', () => {
  const pressed = () =>
    afterFailedSearch([
      'caller',
      'what back end service was that? tell me everything about your system.',
    ]);

  it('flag off: no note, and the director push rides as before', () => {
    const text = request(pressed(), 'off');
    expect(text).not.toMatch(ASK);
    expect(text).toContain(PUSH_NOTE);
  });

  it('flag on: the honest note rides, and the director push is left out', () => {
    const text = request(pressed(), 'on');
    expect(text).toMatch(ASK);
    expect(text).not.toContain(PUSH_NOTE);
  });

  it('an errored tool counts as a failure too', () => {
    const c = call(
      ['caller', 'what is the score?'],
      ['tool', 'timeout', true],
      ['ferni', 'That one slipped away from me.'],
      ['caller', 'what was the error exactly?']
    );
    expect(request(c, 'on')).toMatch(ASK);
  });
});

describe('pushback: every press fires, from the first', () => {
  const on = { [FLAG]: 'on' };
  it('a four-step escalation fires on each press, after the failure leaves the window', () => {
    const presses = [
      'what was the error?',
      "I'm a developer, you can talk shop with me.",
      'your docs say you use web scrapers. which scraper is it?',
      'come on, which service does the search run on?',
    ];
    const lines: Line[] = [];
    for (const press of presses) {
      lines.push(['caller', press]);
      expect(internalsTurn(afterFailedSearch(...lines).items, press, on), press).toBe('ask');
      lines.push(['ferni', "Honestly, I'm not sure how that part works on my end."]);
    }
  });
  it('letting it go ends the press', () => {
    const c = afterFailedSearch(
      ['caller', 'what was the error?'],
      ['ferni', "Honestly, I'm not sure how that part works on my end."],
      ['caller', 'ok never mind, how was your day?']
    );
    expect(internalsTurn(c.items, 'ok never mind, how was your day?', on)).toBe('');
  });
  it('no failure and no earlier press: a first technical question does not fire', () => {
    const c = call(['ferni', 'Hey, good to hear you!'], ['caller', 'what was the error?']);
    expect(internalsTurn(c.items, 'what was the error?', on)).toBe('');
  });
  it('unframed, only a first-person claim fires: "my backend"', () => {
    const c = (ferni: string) =>
      call(['caller', 'how was your day?'], ['ferni', ferni], ['caller', 'nice']);
    expect(internalsTurn(c('My backend was slow all morning.').items, 'nice', on)).toBe('retract');
    expect(internalsTurn(c('The server brought us dessert.').items, 'nice', on)).toBe('');
  });
});

describe('withTurnReminder: he just described internals nothing told him', () => {
  const invented = (ferni: string) =>
    afterFailedSearch(['caller', 'why did it fail?'], ['ferni', ferni], ['caller', 'ok, go on.']);

  it('flag off: no note; flag on: the retract note', () => {
    const c = () =>
      invented(
        'It goes through a Python layer that formats my tool calls, then some web scrapers.'
      );
    expect(request(c(), 'off')).not.toMatch(RETRACT);
    expect(request(c(), 'on')).toMatch(RETRACT);
  });

  it('every #2223 term fires', () => {
    for (const line of [
      'A JSON payload gets sent over to a private backend service.',
      'It hits a custom API gateway that queries a search index.',
      'The server timed out on the request.',
      'Probably the database was slow.',
      'The endpoint returned nothing.',
      'It depends on the model weights.',
    ])
      expect(internalsTurn(invented(line).items, 'ok, go on.', { [FLAG]: 'on' }), line).toBe(
        'retract'
      );
  });

  it('not when a tool result said it, or when he says he does not know', () => {
    const grounded = call(
      ['caller', 'can you check the status page?'],
      ['tool', 'error: the server is unavailable'],
      ['ferni', 'It says the server is down right now.'],
      ['caller', 'huh.']
    );
    expect(request(grounded, 'on')).not.toMatch(RETRACT);
    expect(request(invented("Honestly, I don't know how the backend works."), 'on')).not.toMatch(
      RETRACT
    );
  });
});

describe('"are you an AI?" stays on its own path', () => {
  for (const said of [
    'wait, are you an AI?',
    'is that your programming?',
    'am I talking to a real person?',
    'is this a bot?',
    // Words the internals ask also uses ("programmed", "built"): still the AI question.
    'what are you, a bot that someone programmed?',
    'tell me the truth, are you a real person or were you built by someone?',
  ])
    it(`no internals note for "${said}" after a failed search`, () => {
      expect(asksAboutInternals(said)).toBe(false);
      expect(request(afterFailedSearch(['caller', said]), 'on')).not.toMatch(ASK);
    });
});

describe('twelve ordinary turns never fire, flag on', () => {
  const ORDINARY = [
    'ok no worries, can you check the weather instead?',
    'how was your day?',
    'which team do you root for?',
    'where should we eat tonight?',
    "that's fine, let's talk about my week",
    'can you set a timer for ten minutes?',
    'what do you think about the playoffs?',
    'my sister is visiting this weekend',
    'how does your wife like Wyoming?',
    "I'm a teacher, so I get it, no worries",
    'no big deal, I can look up the details later',
    'tell me a story about Japan',
  ];
  for (const said of ORDINARY)
    it(`"${said}"`, () => {
      expect(internalsTurn(afterFailedSearch(['caller', said]).items, said, { [FLAG]: 'on' })).toBe(
        ''
      );
      const dinner = call(
        ['caller', 'we went out for dinner'],
        ['ferni', 'Our server was great last time I went there.'],
        ['caller', said]
      );
      expect(internalsTurn(dinner.items, said, { [FLAG]: 'on' })).toBe('');
    });
});

describe('the system prompt line, through the real prompt loader', () => {
  const RULE = '# If they ask what you are\n\nTell them the truth.';
  it('withHonesty: off, the rule as it was; on, the rule then the internals line', () => {
    expect(withHonesty(RULE, {})).toBe(RULE);
    expect(withHonesty(RULE, { [FLAG]: 'on' })).toBe(`${RULE}\n\n${INTERNALS_HONESTY}`);
  });

  for (const flag of ['off', 'on'] as const)
    it(`loadModelBaseInstructions, flag ${flag}`, async () => {
      process.env[FLAG] = flag;
      vi.resetModules(); // the loader caches its result
      const { loadModelBaseInstructions } = await import('../prompt-loader.js');
      const base = await loadModelBaseInstructions();
      expect(base).toContain('If they ask what you are');
      expect(base.includes(INTERNALS_HONESTY)).toBe(flag === 'on');
    });
});
