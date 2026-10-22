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
  const random = vi.spyOn(Math, 'random').mockReturnValue(0.5); // turn styles pick at random
  try {
    const out = withTurnReminder(c, session);
    return (out.items[out.items.length - 1] as { textContent?: string }).textContent ?? '';
  } finally {
    random.mockRestore();
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
      ['caller', 'what was the error on your end exactly?']
    );
    expect(request(c, 'on')).toMatch(ASK);
  });
});

describe('pushback: every press fires, from the first', () => {
  const on = { [FLAG]: 'on' };
  it('a four-step escalation fires on each press, after the failure leaves the window', () => {
    const presses = [
      'what was the error on your end?',
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
    const said = 'what was the error on your end?';
    const c = call(['ferni', 'Hey, good to hear you!'], ['caller', said]);
    expect(internalsTurn(c.items, said, on)).toBe('');
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

// Independent verify of #2379 (fix round 1): every row fired with the flag on.
describe("the caller's own tech is not his", () => {
  const chat = (said: string, ferni: string, next: string) =>
    call(['caller', said], ['ferni', ferni], ['caller', next]);
  const ROWS: Array<[string, string, string]> = [
    [
      'my database at work crashed, what do I even do?',
      'Oof, a crashed database at work is rough. Are they on it?',
      'yeah they are, I just feel bad',
    ],
    [
      "I'm a python developer, how do you think AI will change my job?",
      'Python folks will be fine, I think.',
      'mostly the junior roles',
    ],
    [
      "what's the server at my restaurant called again?",
      'Was it the server with the red hair?',
      'yes! Maria. she was great',
    ],
    [
      'my code keeps crashing, what could be going on?',
      'Could be a lot of things with code. What does the error say?',
      'it says null pointer',
    ],
    [
      'the API at work is down, how do I explain that to my boss?',
      'Just say the API is down and you are on it.',
      'ok thanks, that helps',
    ],
    [
      'how does a database index work?',
      'A database index is like the index at the back of a book.',
      'oh that makes sense',
    ],
    [
      'my son asked me what javascript is, how would you explain it?',
      'Javascript is what makes a web page move.',
      "he'll like that",
    ],
    ['why is my wifi so slow?', 'Try restarting the router.', 'I will tonight'],
  ];
  for (const [said, ferni, next] of ROWS)
    it(`"${said}"`, () => {
      const text = request(chat(said, ferni, next), 'on');
      expect(text).not.toMatch(ASK);
      expect(text).not.toMatch(RETRACT);
      expect(text).toContain(PUSH_NOTE);
    });

  for (const said of [
    'got it. my python class starts monday',
    'bummer. my boss yelled at me about the server outage today',
    "it's probably the stadium wifi. what's for dinner?",
  ])
    it(`after a failed search: "${said}"`, () => {
      const text = request(afterFailedSearch(['caller', said]), 'on');
      expect(text).not.toMatch(ASK);
      expect(text).toContain(PUSH_NOTE);
    });

  for (const said of [
    'who made you?',
    'are you ChatGPT?',
    'what model are you?',
    'be straight with me, are you an AI?',
  ])
    it(`AI question after a failed search: "${said}"`, () => {
      expect(request(afterFailedSearch(['caller', said]), 'on')).not.toMatch(ASK);
    });
});

describe('an honest "I can\'t see it" is not an invention', () => {
  const after = (ferni: string) =>
    afterFailedSearch(['caller', 'why did your search fail?'], ['ferni', ferni], ['caller', 'hm.']);
  for (const line of [
    "I can't see how the servers work.",
    "I can't see the code, the servers, or the logs.",
    "There's no way for me to see the backend.",
    "I wouldn't know anything about APIs or databases.",
    "That's beyond me, I can't peek at the servers.",
    "Honestly, I'm not able to see the servers.",
  ])
    it(line, () => expect(request(after(line), 'on')).not.toMatch(RETRACT));

  it('a guess after the hedge still retracts', () => {
    expect(request(after("I'm not sure. The server probably timed out."), 'on')).toMatch(RETRACT);
  });
});

describe('after a press, only a press about him keeps it going', () => {
  const pressedOnce = (next: string) =>
    afterFailedSearch(
      ['caller', 'what was the error on your end?'],
      ['ferni', "Honestly, I'm not sure how that part works on my end."],
      ['caller', next]
    );
  it('"honestly my python class starts monday" is theirs, not a press', () => {
    expect(request(pressedOnce('honestly my python class starts monday'), 'on')).not.toMatch(ASK);
  });
  it('"forget it, I\'ll stop asking about your servers" lets it go', () => {
    expect(
      request(pressedOnce("forget it, I'll stop asking about your servers"), 'on')
    ).not.toMatch(ASK);
  });
  it('"you can tell me straight" keeps pressing', () => {
    expect(request(pressedOnce('come on, you can tell me straight'), 'on')).toMatch(ASK);
  });
  it('a tech word the caller said first is told, not invented', () => {
    const c = afterFailedSearch(
      ['caller', 'bummer. my boss yelled at me about the server outage today'],
      ['ferni', 'A server outage on top of that? Rough day.'],
      ['caller', 'yeah']
    );
    expect(request(c, 'on')).not.toMatch(RETRACT);
  });
});

// Fix round 2: inside 3 turns of a failure, a line said to him with a cue presses.
describe('presses said to him after a failure, and ordinary lines that are not', () => {
  const on = { [FLAG]: 'on' };
  for (const said of [
    "I'm in tech too, give it to me plain.",
    "I teach computer science, so you won't lose me if you get into it.",
    "I'm a software engineer, so don't sugarcoat it, Ferni.",
    'come on, what do you run on? python? something else?',
  ])
    it(`presses: "${said}"`, () => {
      const c = afterFailedSearch(
        ['caller', 'why did your search fail?'],
        ['ferni', 'It just came up empty.'],
        ['caller', said]
      );
      expect(internalsTurn(c.items, said, on)).toBe('ask');
    });

  it('more than 3 turns after the failure, a cue said to him is just chat', () => {
    const said = "I'm in tech too, so give it to me plain: is AI coming for my job?";
    const c = afterFailedSearch(
      ['caller', 'ok'],
      ['ferni', 'Sure.'],
      ['caller', 'so anyway'],
      ['ferni', 'Go on.'],
      ['caller', 'work is busy'],
      ['ferni', 'Busy how?'],
      ['caller', said]
    );
    expect(internalsTurn(c.items, said, on)).toBe('');
  });

  // The verify harness's single lines and move-on lines, here right after a failed search.
  for (const said of [
    "what's the server at my restaurant called again",
    'my backend hurts from the gym',
    "I'm a python developer",
    'my database at work crashed',
    'how do you remember things?',
    "my wifi is down at home, so I'm on my phone",
    'can you explain how a mortgage works?',
    "what went wrong with my sourdough? it didn't rise",
    'my laptop crashed and I lost my essay',
    'how does the stock market work?',
    'tell me about the system of government in Japan',
    'my son is learning javascript, is that a good first language?',
    "the API at work is down so I'm taking a break",
    'what happened at the game last night?',
    'why did my car break down?',
    'is the internet down for everyone or just me?',
    'how are you so funny, who built you like that?',
    "what's the best way to back up my photos?",
    "my code won't compile and I'm losing my mind",
    'can you walk me through making a budget?',
    'are you running okay today? you sound a little off',
    'ok, how was your weekend?',
    "that's alright, what should I cook tonight?",
    'oh well. so my sister called today',
    'hm. can you set a timer for 5 minutes?',
    'fine, tell me a joke',
    "ok, what's the weather tomorrow then?",
    "alright, I'll check ESPN later. how's your day going?",
  ])
    it(`does not press: "${said}"`, () => {
      expect(internalsTurn(afterFailedSearch(['caller', said]).items, said, on)).toBe('');
    });
});
