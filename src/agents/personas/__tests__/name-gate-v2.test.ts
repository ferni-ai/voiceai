import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ReadableStream } from 'node:stream/web';
import { describe, expect, it, vi } from 'vitest';

import { buildGoodbyeContext } from '../../../intelligence/context-builders/goodbye.js';
import {
  composeGreeting,
  type GreetingContext,
} from '../../../personas/compositional-greetings.js';
import { firstCallNote } from '../first-call-rapport.js';
import {
  NAME_EVERY,
  NAME_PLACEMENT_RULE,
  nameGateText,
  withNameGate,
  type HistoryItem,
} from '../name-gate.js';
import { gateScriptedSay } from '../scripted-name-gate.js';

const V2 = { NAME_FALLING_INTONATION: 'on', NAME_GATE_V2: 'on' };
const V1 = { NAME_FALLING_INTONATION: 'on' };

const msg = (role: string, textContent: string): HistoryItem => ({
  type: 'message',
  role,
  textContent,
});
const FIRST: HistoryItem[] = [msg('user', 'Hello?')];
const MID: HistoryItem[] = [
  msg('assistant', 'Hey Sam. Afternoon.'),
  msg('user', 'Thing.'),
  msg('assistant', 'Reply.'),
  msg('user', 'Yeah.'),
];
const BYE: HistoryItem[] = [
  msg('assistant', 'Hey Sam. Afternoon.'),
  msg('user', 'Okay, I gotta go. Talk soon.'),
];

/** The reply as the gate lets it out, streamed a word at a time like the LLM (or whole). */
async function gate(
  text: string,
  history: readonly HistoryItem[],
  env: Record<string, string>,
  whole = false
): Promise<string> {
  const words = whole ? [text] : (text.match(/\S+\s*/g) ?? []);
  const input = new ReadableStream<string>({
    start(c) {
      for (const w of words) c.enqueue(w);
      c.close();
    },
  });
  let out = '';
  for await (const ch of withNameGate(input, {
    name: 'Sam',
    history,
    env,
  }) as AsyncIterable<string>)
    out += ch;
  return out;
}

describe('NAME_GATE_V2: every name shape in the 2026-10-24 prosody report', () => {
  // [shape, reply, history, flag-off result, flag-on result]
  const table: Array<[string, string, HistoryItem[], string, string]> = [
    [
      'question-final name, first reply (rose 14.8 st as "What about you, | Seth?")',
      "What's going on, Sam?",
      FIRST,
      "What's going on, Sam?",
      "What's going on?",
    ],
    [
      'question-final name at a goodbye',
      'Did I miss something you told me, Sam?',
      BYE,
      'Did I miss something you told me, Sam?',
      'Did I miss something you told me?',
    ],
    [
      'question name dropped, the statement keeps the one name',
      "What about you, Sam? It's really good to hear your voice, Sam.",
      FIRST,
      "What about you, Sam? It's really good to hear your voice.",
      "What about you? It's really good to hear your voice, Sam.",
    ],
    [
      'name-first question',
      "Sam, what's going on?",
      FIRST,
      "Sam. What's going on?",
      "What's going on?",
    ],
    [
      'name-first statement: left to the falling rewrite',
      'Sam, good to hear your voice.',
      FIRST,
      'Sam. Good to hear your voice.',
      'Sam. Good to hear your voice.',
    ],
    [
      'hello then question: "Hey Sam." falls on its own (1.97 st)',
      "Hey Sam, how's it going?",
      FIRST,
      "Hey Sam. How's it going?",
      "Hey Sam. How's it going?",
    ],
    [
      '"Oh hey Sam" rises whatever follows (7.7 st)',
      "Oh hey Sam, how's it going?",
      FIRST,
      "Oh hey Sam, how's it going?",
      "Oh hey, how's it going?",
    ],
    [
      '"Oh hey Sam" in a statement goes too (8.2 st with a full stop)',
      'Oh hey Sam, good to hear you.',
      FIRST,
      'Oh hey Sam, good to hear you.',
      'Oh hey, good to hear you.',
    ],
    [
      '", Sam, and" mid-call (the CLAUSE_START gap, 4.4 st)',
      'That sounds like a lot, Sam, and you handled it well.',
      MID,
      'That sounds like a lot, Sam, and you handled it well.',
      'That sounds like a lot, and you handled it well.',
    ],
    [
      '", Sam, and" mid-call, short clause',
      'I hear you, Sam, and that sounds hard.',
      MID,
      'I hear you, Sam, and that sounds hard.',
      'I hear you, and that sounds hard.',
    ],
    [
      '", Sam, and" after a weekday is still the caller',
      'Good luck on Monday, Sam, and tell me how it goes.',
      MID,
      'Good luck on Monday, Sam, and tell me how it goes.',
      'Good luck on Monday, and tell me how it goes.',
    ],
    [
      '", Sam, have" closing a goodbye stays, and falls',
      'See you later, Sam, have a good one.',
      MID,
      'See you later, Sam, have a good one.',
      'See you later, Sam. Have a good one.',
    ],
    [
      'third party: "tell Sam"',
      'Tell Sam I said hi.',
      MID,
      'Tell Sam I said hi.',
      'Tell Sam I said hi.',
    ],
    [
      'third party: "tell Sam, and"',
      'Did you tell Sam, and what did he say?',
      MID,
      'Did you tell Sam, and what did he say?',
      'Did you tell Sam, and what did he say?',
    ],
    [
      'third party: a list',
      'I talked to Alex, Sam, and Jo.',
      MID,
      'I talked to Alex, Sam, and Jo.',
      'I talked to Alex, Sam, and Jo.',
    ],
    [
      'third party: an appositive',
      'My brother, Sam, and I went.',
      MID,
      'My brother, Sam, and I went.',
      'My brother, Sam, and I went.',
    ],
  ];

  for (const [shape, reply, history, off, on] of table) {
    it(shape, async () => {
      expect(await gate(reply, history, V1, true)).toBe(off);
      expect(await gate(reply, history, V2, true)).toBe(on);
      // A scripted line gets the same decision.
      expect(nameGateText(reply, { name: 'Sam', history, env: V2 })).toBe(on);
      // Streamed a word at a time: the name is kept or dropped the same way.
      const named = (t: string) => (t.match(/\bSam\b/g) ?? []).length;
      expect(named(await gate(reply, history, V2))).toBe(named(on));
    });
  }

  it('streamed, a first clause that went out keeps its comma when the name after it goes', async () => {
    // As on main mid-call ("shaping up,?"): first audio never waits on the name (#1413).
    // processor.ts strips the lone "?" piece, so Cartesia hears "What about you," then the rest.
    expect(await gate('What about you, Sam? Good to hear you.', FIRST, V2)).toBe(
      'What about you, ? Good to hear you.'
    );
  });

  it('waits for a name-first sentence to show whether it asks, then never re-says text', async () => {
    const pieces = ['Sam', ', what', "'s going", ' on', '? Good', ' to hear you.'];
    const input = new ReadableStream<string>({
      start(c) {
        for (const p of pieces) c.enqueue(p);
        c.close();
      },
    });
    let out = '';
    for await (const ch of withNameGate(input, {
      name: 'Sam',
      history: FIRST,
      env: V2,
    }) as AsyncIterable<string>)
      out += ch;
    expect(out).toBe("What's going on? Good to hear you.");
  });
});

describe('NAME_GATE_V2 off: byte-identical to main', () => {
  const dir = join(__dirname, 'fixtures');
  const corpus = readFileSync(join(dir, 'name-gate-corpus.txt'), 'utf8')
    .split('\n')
    .filter(Boolean);
  const main = JSON.parse(readFileSync(join(dir, 'name-gate-main.json'), 'utf8')) as {
    modes: string[];
    histories: Record<string, HistoryItem[]>;
    outs: Array<Array<string | null>>;
  };

  it('matches origin/main on every corpus reply, history and falling setting', async () => {
    expect(corpus).toHaveLength(main.outs.length);
    for (const [i, text] of corpus.entries()) {
      for (const [m, mode] of main.modes.entries()) {
        const [history, falling] = mode.split('/');
        for (const v2 of [undefined, 'off']) {
          const env: Record<string, string> = { NAME_FALLING_INTONATION: falling };
          if (v2) env.NAME_GATE_V2 = v2;
          const got = await gate(text, main.histories[history], env);
          expect(got, `${mode}: ${text}`).toBe(main.outs[i][m] ?? text);
        }
      }
    }
  });
});

describe('NAME_GATE_V2 never says the name more often', () => {
  it('names per reply over a fixture call are at most the flag-off count', async () => {
    // 120 replies; the model reaches for the name in many shapes, and the caller says bye twice.
    const shapes = [
      'That is rough, Sam.',
      "What's going on, Sam?",
      'I hear you, Sam, and that sounds hard.',
      'Sam, really? Again?',
      'Hey Sam, good to hear you.',
      'Okay. That makes sense.',
      "Oh hey Sam, how's it going?",
      'What about you, Sam? It is good to hear your voice, Sam.',
    ];
    const run = async (env: Record<string, string>): Promise<number> => {
      const history: HistoryItem[] = [];
      let named = 0;
      for (let i = 0; i < 120; i++) {
        history.push(msg('user', i === 50 || i === 100 ? 'Okay, I gotta go. Bye!' : `Thing ${i}.`));
        const out = await gate(shapes[i % shapes.length], history, env);
        if (/\bSam\b/.test(out)) named++;
        history.push(msg('assistant', out));
      }
      return named;
    };
    const off = await run(V1);
    const on = await run(V2);
    expect(off).toBeGreaterThan(0);
    expect(on).toBeLessThanOrEqual(off);
    // The slots stay hello, goodbye and once per NAME_EVERY replies: never more than these.
    expect(on).toBeLessThanOrEqual(1 + 2 + Math.floor(120 / NAME_EVERY));
  });
});

describe('NAME_GATE_V2: scripted session.say() lines', () => {
  const session = (history: HistoryItem[]) => {
    const said: unknown[] = [];
    const s = {
      say: (text: unknown) => said.push(text),
      userData: { userName: 'sam lee' },
      history: { items: history },
    };
    return { s, said };
  };

  it('gates a scripted line by the call so far', () => {
    const hello = session([]);
    gateScriptedSay(hello.s as never, V2);
    hello.s.say("Hi Sam, it's Ferni. How's it going?");
    expect(hello.said).toEqual(["Hi Sam. It's Ferni. How's it going?"]);

    const later = session(MID);
    gateScriptedSay(later.s as never, V2);
    later.s.say("What's going on, Sam?");
    later.s.say('Hey Sam, it is Maya.');
    expect(later.said).toEqual(["What's going on?", 'It is Maya.']);
  });

  it('leaves session.say alone with the flag off', () => {
    const { s } = session(MID);
    const say = s.say;
    gateScriptedSay(s as never, V1);
    expect(s.say).toBe(say);
    expect(nameGateText("What's going on, Sam?", { name: 'Sam', history: MID, env: V1 })).toBe(
      "What's going on, Sam?"
    );
  });
});

describe('NAME_GATE_V2: prompt line and greeting atoms', () => {
  const firstCall = { userData: { userId: 'u1', isReturningUser: false } };
  const ctx = { items: [] } as never;

  it('asks for a statement-final name only with the flag on', () => {
    const on = firstCallNote(ctx, firstCall, 'Okay, I gotta go.', {
      FIRST_CALL_RAPPORT: 'on',
      NAME_GATE_V2: 'on',
    });
    const off = firstCallNote(ctx, firstCall, 'Okay, I gotta go.', { FIRST_CALL_RAPPORT: 'on' });
    expect(on).toContain(NAME_PLACEMENT_RULE);
    expect(off).not.toContain(NAME_PLACEMENT_RULE);
  });

  it('adds the line to the goodbye guidance only with the flag on', () => {
    const input = {
      userText: 'Goodbye, talk to you later!',
      analysis: {
        intent: {
          primary: 'conversation',
          confidence: 0.8,
          isQuestion: false,
          suggestedApproach: [],
        },
        emotion: { primary: 'neutral', valence: 0.5, arousal: 0.5, confidence: 0.7, secondary: [] },
        topics: { detected: [], keywords: [] },
        state: { phase: 'exploring', engagement: 0.7, rapport: 0.6 },
      },
      userData: { turnCount: 10, wasInterrupted: false, userWentSilent: false },
      persona: { id: 'ferni', name: 'Ferni', role: 'life-coach', voice: {}, cognitive: {} },
    } as never;
    const goodbye = () => buildGoodbyeContext(input).find((i) => i.source === 'goodbye')?.content;
    try {
      vi.stubEnv('NAME_GATE_V2', 'on');
      expect(goodbye()).toContain(`Say goodbye by name if you know it. ${NAME_PLACEMENT_RULE}`);
      vi.stubEnv('NAME_GATE_V2', 'off');
      expect(goodbye()).toContain('Say goodbye by name if you know it\n');
      expect(goodbye()).not.toContain(NAME_PLACEMENT_RULE);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('turns a name atom into "Hey Sam." with no hello before it', () => {
    const greeting: GreetingContext = {
      personaName: 'Maya',
      userName: 'Sam',
      isReturningUser: true,
      relationshipStage: 'friend',
      timeOfDay: 'afternoon',
      isWeekend: false,
      dayOfWeek: 'Monday',
    };
    const one = (text: string) => [{ text, weight: 1 }];
    const atoms = [
      one('Hey!'),
      one('{name}, hi!'),
      one('Good to hear from you.'),
      one(''),
      one(''),
    ];
    const previous = process.env.NAME_GATE_V2;
    try {
      process.env.NAME_GATE_V2 = 'on';
      const on = composeGreeting(greeting, atoms as never);
      expect(on).toContain('Hey Sam.');
      expect(on).not.toMatch(/Sam,|Sam!|Hey!/);
      delete process.env.NAME_GATE_V2;
      const off = composeGreeting(greeting, atoms as never);
      expect(off).toContain('Sam, hi!');
    } finally {
      if (previous === undefined) delete process.env.NAME_GATE_V2;
      else process.env.NAME_GATE_V2 = previous;
    }
  });
});
