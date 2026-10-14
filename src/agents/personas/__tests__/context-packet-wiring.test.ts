/**
 * CONTEXT_PACKET on the live request path (turn-request.ts withTurnReminder,
 * which gatedReply calls from FerniAgent.llmNode). The packet carries the
 * turn's notes exactly as the plain reminder does, in the same order: each
 * note's ordering rule (style before the goodbye, the self-share after the
 * shape, the invite after the self-share, the hard rule last of all) holds
 * with the flag on. Only recall moves: its picks become labelled memories.
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => null }));

import { createMemoryRecall } from '../../multi-agent/memory-recall-hook.js';
import { MEMORY_RULE, SECTION_BUDGETS } from '../context-packet/context-packet.js';
import {
  rememberForPacket,
  sendRecall,
  SOURCE_NOTE,
  turnPacket,
  type RecallPick,
} from '../context-packet/turn-packet.js';
import { startCallGame } from '../../../services/games/call-game-state.js';
import { setDeliberator, type Deliberator } from '../deliberation.js';
import { setDirector, type Director } from '../director-notes.js';
import { forgetRoom } from '../room-guests.js';
import { withTurnReminder } from '../turn-request.js';

const lastText = (ctx: llm.ChatContext): string =>
  (ctx.items.at(-1) as llm.ChatMessage).textContent ?? '';

const HARD_RULE = 'This reply: no questions at all.';

/** Earlier caller turns of a longer call: working something out (COMMITMENT_INVITE needs a few). */
const LONG_CALL = [
  "I can't decide whether to take the new job.",
  "I'm not sure if I should tell my boss yet.",
  'I keep putting it off.',
  "I'm worried about the commute.",
  "I'm trying to figure out the money side.",
  'That makes sense, actually.',
  'The money side is the hard part.',
  "It's a lot to weigh.",
  "I'm wondering if Friday works.",
];
function call(
  words = 'Wait, how do you know I was up late?',
  earlier: readonly string[] = ['I was up so late last night.'],
  sessionId = 'packet-call'
): { chat: llm.ChatContext; session: { userData: unknown } } {
  forgetRoom(sessionId); // ROOM_GUESTS keeps the room by session id
  const chat = llm.ChatContext.empty();
  for (const said of earlier) {
    chat.addMessage({ role: 'user', content: said });
    chat.addMessage({ role: 'assistant', content: 'Again? That deck.' });
  }
  chat.addMessage({ role: 'user', content: words });
  // A new caller's first call, with a session id (ROOM_GUESTS, NAME_CORRECTION key on it).
  const session = {
    userData: {
      userName: 'Sam',
      personaId: 'ferni',
      userId: 'u1',
      isReturningUser: false,
      services: { sessionId },
    },
  };
  const director = {
    current: () => ['Stop explaining your math; just react.', 'They sound wiped out.'],
    told: () => "You've told a story about yourself already. Keep this reply on them.",
    hardRule: () => HARD_RULE,
  };
  setDirector(session, director as unknown as Director);
  setDeliberator(session, {
    noteFor: () => 'A thought: they keep circling the same choice.',
  } as unknown as Deliberator);
  startCallGame(session, { type: 'trivia' });
  return { chat, session };
}

/** The plain reminder's notes: what follows the caller's words, inside the one "(...)". */
function plainReminder(sent: string, words: string): string {
  expect(sent.startsWith(`${words}\n\n\n(`)).toBe(true);
  return sent.slice(words.length + 4, -1);
}

const block = (text: string, heading: string): string[] =>
  text
    .split('\n\n')
    .find((b) => b.startsWith(heading))
    ?.split('\n')
    .slice(1) ?? [];

/** The packet's This turn notes, bullets removed, the honesty note set apart. */
function packetNotes(sent: string): { notes: string[]; honesty: boolean } {
  // This turn is the packet's last section: the reminder's ")" closes it.
  expect(sent.endsWith(')')).toBe(true);
  const lines = block(sent.slice(0, -1), '## This turn').map((l) => l.replace(/^- /, ''));
  const honesty = lines[0] === SOURCE_NOTE;
  return { notes: honesty ? lines.slice(1) : lines, honesty };
}

beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0.42);
  vi.stubEnv('GAME_STATE', 'on');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const ALL_ON = {
  TEAM_BY_NEED: 'on',
  FERNI_STATE: 'on',
  PERSONA_BEATS: 'on',
  FIRST_CALL_RAPPORT: 'on',
  ROOM_GUESTS: 'on',
  NAME_CORRECTION: 'on',
  HONEST_FRIEND: 'on',
  HAPPY_EXITS: 'on',
  COMMITMENT_INVITE: 'on',
  DIRECTOR_ESCALATE: 'on',
  DIRECTOR_ANSWER_TURN_GUARD: 'on',
};

const COMBOS: Array<[string, Record<string, string>]> = [
  ['defaults', {}],
  ['no style reminder', { TURN_STYLE_REMINDER: 'off' }],
  ['team by need', { TEAM_BY_NEED: 'on' }],
  [
    'state, beats and first call',
    { FERNI_STATE: 'on', PERSONA_BEATS: 'on', FIRST_CALL_RAPPORT: 'on' },
  ],
  ['room, names, honest friend', { ROOM_GUESTS: 'on', NAME_CORRECTION: 'on', HONEST_FRIEND: 'on' }],
  [
    'exits, invite, hard rule',
    { HAPPY_EXITS: 'on', COMMITMENT_INVITE: 'on', DIRECTOR_ESCALATE: 'on' },
  ],
  ['everything on', ALL_ON],
];

const SAYINGS: Array<[string, (readonly string[])?]> = [
  ['Wait, how do you know I was up late?'],
  ['Please call me Samuel, not Sam.'],
  ['My sister Jo is here with me. How have you been?'],
  ["Could Naya help? Honestly you're all I've got, I'd rather talk to you than my sister."],
  ['I need a hard talk with my boss about the move.'],
  ['Okay, I should run. Talk soon!'],
  ['That makes sense, I think.', LONG_CALL],
];

describe('CONTEXT_PACKET: the same notes in the same order, on and off', () => {
  for (const [name, env] of COMBOS) {
    for (const [shaped, options] of [
      ['shaped', {}],
      ['crisis (no shape)', { shape: false }],
    ] as const) {
      it(`${name}, ${shaped}`, () => {
        for (const [words, earlier] of SAYINGS) {
          for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
          vi.stubEnv('CONTEXT_PACKET', 'off');
          const off = call(words, earlier);
          const plain = plainReminder(
            lastText(withTurnReminder(off.chat, off.session, options)),
            words
          );

          vi.stubEnv('CONTEXT_PACKET', 'on');
          const on = call(words, earlier);
          const sent = lastText(withTurnReminder(on.chat, on.session, options));
          const { notes, honesty } = packetNotes(sent);

          // Every note, word for word and in order: the plain reminder joins them with spaces.
          expect(notes.join(' ')).toBe(plain);
          expect(notes.length).toBeGreaterThan(3);
          expect(honesty).toBe(/how do you know/i.test(words));
          // Nothing else of the turn leaks into another section.
          expect(block(sent, '## Right now').join(' ')).not.toContain('Game on');
          expect(sent).not.toContain("## Who's on the team");
          vi.unstubAllEnvs();
          vi.stubEnv('GAME_STATE', 'on');
        }
      });
    }
  }

  it('exercises every note of the plain reminder, each in its place', () => {
    // One pattern per entry of withTurnReminder's list, in its order.
    const NOTES: Array<[string, RegExp]> = [
      ['told', /^You've told a story/],
      ['team status', /^(None of your teammates|Nayan is on your team but not available)/],
      ['heard teammate', /speech-to-text for Nayan/],
      ['director', /^\[Director:/],
      ['thought', /^A thought:/],
      ['game', /^Game on:/],
      ['ferni state', /^\[You're doing well today/],
      ['persona beats', /^Anything you say about your own life/],
      ['first call', /^(This is your first call with them: you're getting|They're heading off)/],
      ['room guests', /isn't alone: Jo is in the room/],
      ['name correction', /^They told you their name is Samuel/],
      ['team by need', /^Teammates you can bring in/],
      ['honest friend', /^They lean on you in place of people/],
      ['style', /^Start with the substance/],
      ['happy exit', /^If they are wrapping up the call/],
      [
        'self-share',
        /^\[(If something of your own fits|They asked about you|Keep this reply on them|They're telling you something of theirs)/,
      ],
      ['commitment invite', /^THIS REPLY, over any length/],
      ['hard rule', new RegExp(`^${HARD_RULE}$`)],
    ];
    const seen = new Set<string>();
    // TEAM_BY_NEED's roster replaces the team status line, so defaults too.
    for (const [words, earlier, env] of SAYINGS.flatMap(([w, e]) =>
      [ALL_ON, {}].map((env) => [w, e, env] as const)
    )) {
      vi.unstubAllEnvs();
      for (const [k, v] of Object.entries({ ...env, GAME_STATE: 'on', CONTEXT_PACKET: 'on' }))
        vi.stubEnv(k, v);
      const { chat, session } = call(words, earlier);
      const { notes } = packetNotes(lastText(withTurnReminder(chat, session)));
      const at = notes.map((n) => NOTES.findIndex(([, re]) => re.test(n)));
      expect(at, notes.join('\n')).not.toContain(-1); // every note is one of the list
      expect([...at].sort((x, y) => x - y)).toEqual(at); // in the list's order
      for (const i of at) seen.add(NOTES[i][0]);
    }
    expect([...seen].sort()).toEqual(NOTES.map(([name]) => name).sort());
  });

  it('keeps the ordering rules: told first, the style before the hard rule, the hard rule last', () => {
    for (const [k, v] of Object.entries(ALL_ON)) vi.stubEnv(k, v);
    vi.stubEnv('CONTEXT_PACKET', 'on');
    const words = 'Okay, I should run. Talk soon!';
    const { chat, session } = call(words);
    const { notes } = packetNotes(lastText(withTurnReminder(chat, session)));
    expect(notes[0]).toMatch(/^You've told a story/);
    expect(notes.at(-1)).toBe(HARD_RULE);
    const style = notes.findIndex((n) => /Start with the substance|Keep it short/.test(n));
    expect(style).toBeGreaterThan(notes.findIndex((n) => n.startsWith('[Director:')));
    expect(style).toBeLessThan(notes.length - 1);
  });

  it('drops no note, even past This turn budget', () => {
    vi.stubEnv('CONTEXT_PACKET', 'on');
    const long = 'x'.repeat(SECTION_BUDGETS.this_turn * 4);
    const { text, accounting } = turnPacket(
      {},
      { words: 'hi', notes: ['first', long, 'last'], now: Date.now() }
    );
    expect(block(text, '## This turn')).toEqual(['- first', `- ${long}`, '- last']);
    expect(accounting.dropped).toEqual([]);
  });
});

describe('CONTEXT_PACKET on: recall rides the packet, labelled', () => {
  async function recalled(session: object): Promise<RecallPick | null> {
    const recall = createMemoryRecall({
      userId: 'u1',
      userName: 'Sam',
      store: {
        facts: async () => [
          {
            entityName: 'Sam',
            key: 'up_late',
            value: 'finishing the investor deck',
            confidence: 0.9,
            extractedAt: '2026-10-10T23:40:00Z',
          },
        ],
        summaries: async () => [],
      },
      ledgerStore: { save: async () => undefined, recent: async () => [] },
      lifeUpdates: { env: {} },
      checkIns: async () => [],
      semantic: false,
      summaries: false,
    });
    await recall.ready;
    const note = recall.noteFor('how do you know I was up late finishing the deck');
    expect(note).toContain('investor deck');
    const pick = recall.lastPick();
    expect(pick?.facts.map((f) => f.value)).toEqual(['finishing the investor deck']);
    if (pick) rememberForPacket(session, pick);
    return pick;
  }

  it('the memory carries its source; the honesty note leads This turn; director notes stay', async () => {
    const { chat, session } = call();
    await recalled(session);
    vi.stubEnv('CONTEXT_PACKET', 'on');
    const sent = lastText(withTurnReminder(chat, session));

    expect(
      sent.startsWith('Wait, how do you know I was up late?\n\n\n([Context for this reply')
    ).toBe(true);
    expect(block(sent, '## What I remember')).toEqual([
      MEMORY_RULE,
      '- (you said on Oct 10) Sam up late: finishing the investor deck',
    ]);
    const { notes, honesty } = packetNotes(sent);
    expect(honesty).toBe(true);
    expect(notes).toContain(
      '[Director: Stop explaining your math; just react. / They sound wiped out.]'
    );
  });

  it('is off unless set: the same session sends the old request', async () => {
    const { chat, session } = call();
    await recalled(session);
    const sent = lastText(withTurnReminder(chat, session));
    expect(sent).not.toContain('## What I remember');
    expect(sent).toContain('[Director: Stop explaining your math');
  });

  it('sendRecall: off adds the whole note; on keeps the pick and adds only the rest', async () => {
    const added: string[] = [];
    const agent = {
      chatCtx: {
        copy: () => ({ addMessage: (m: { content: string }) => added.push(m.content) }),
      },
      updateChatCtx: async () => undefined,
    };
    const recall = {
      lastPick: (): RecallPick => ({
        facts: [{ entity: 'Sam', key: 'dog', value: 'Biscuit', confidence: 0.9 }],
        followUps: [],
        told: [],
        since: [],
        checkIns: [],
        rest: 'OPENER LINE',
      }),
    };
    const session = {};
    sendRecall(agent, session, recall as never, 'WHOLE NOTE');
    expect(added).toEqual(['WHOLE NOTE']);

    vi.stubEnv('CONTEXT_PACKET', 'on');
    sendRecall(agent, session, recall as never, 'WHOLE NOTE');
    expect(added).toEqual(['WHOLE NOTE', 'OPENER LINE']);
    expect(turnPacket(session, { words: 'hi', notes: [], now: Date.now() }).text).toContain(
      'Sam dog: Biscuit'
    );
  });
});

describe('turnPacket', () => {
  const parts = { words: 'hi', notes: [], now: Date.parse('2026-10-11T18:00:00Z') };
  const pick = (over: Partial<RecallPick>): RecallPick => ({
    facts: [],
    followUps: [],
    told: [],
    since: [],
    checkIns: [],
    ...over,
  });
  const fact = (value: string) => ({ entity: 'Sam', key: 'note', value, confidence: 0.9 });
  const memories = (session: object, personaId = 'ferni'): string[] =>
    turnPacket(session, { ...parts, personaId })
      .text.split('\n')
      .filter((l) => l.startsWith('- ('));

  it('puts the newest pick first, each pick in its own (relevance) order', () => {
    const session = {};
    rememberForPacket(session, pick({ facts: [fact('old one')] }));
    rememberForPacket(session, pick({ facts: [fact('best match'), fact('second match')] }));
    expect(memories(session)).toEqual([
      '- (you said) Sam note: best match',
      '- (you said) Sam note: second match',
      '- (you said) Sam note: old one',
    ]);
  });

  it('marks a replaced fact as how things were, like the recall note', () => {
    const session = {};
    rememberForPacket(
      session,
      pick({ facts: [{ ...fact('baker at Rise and Grind'), supersededAt: '2026-10-09' }] })
    );
    expect(memories(session)).toEqual([
      '- (you said) Sam note: baker at Rise and Grind [no longer true: how things were before]',
    ]);
  });

  it("tells Ferni's news only while Ferni is speaking", () => {
    const session = {};
    rememberForPacket(
      session,
      pick({ since: [{ personaId: 'ferni', update: 'the basil died', createdAt: '' }] })
    );
    expect(memories(session, 'ferni')).toHaveLength(1);
    expect(memories(session, 'maya-santos')).toEqual([]);
  });
});
