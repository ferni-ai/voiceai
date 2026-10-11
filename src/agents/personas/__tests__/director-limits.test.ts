/**
 * LISTEN_FIRST=on: the director's "drop it" notes and Ferni's own repeated
 * topics become rules on the next replies (director-limits.ts).
 *
 * Modelled on a prod call (2026-10-11), paraphrased: the director asked about
 * ten times for the mail to go, and Ferni brought it back six times. The
 * script runs a real Director (its model swapped for scripted notes) and the
 * persona's real request path, gatedReply, with a fake model that records
 * each request.
 */
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { gatedReply } from '../crisis-gate.js';
import { Director, setDirector, type Line } from '../director-notes.js';
import { LIMIT_REPLIES, limitsFromNotes, repeatedOwnTopics } from '../director-limits.js';

/** [caller, Ferni's reply, the director's note after that reply]. */
const CALL: Array<[string, string, string]> = [
  ['Just hanging out.', 'There is a pile of mail on my counter staring at me.', 'NONE'],
  [
    'You did?',
    'I moved the mail to the kitchen table.',
    'Drop the mail topic now; his replies are short.',
  ],
  ['What is that?', 'Coffee sits right on the electric bill.', 'NONE'],
  ["That's cute.", 'A coaster, basically.', 'NONE'],
  ['Yep.', 'Quiet morning here.', 'NONE'],
  ['That is true.', 'The kettle takes forever.', 'NONE'],
  ['Really?', 'Forever.', 'NONE'],
];

function contextAt(turn: number): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  for (let i = 0; i <= turn; i++) {
    ctx.addMessage({ role: 'user', content: CALL[i][0] });
    if (i < turn) ctx.addMessage({ role: 'assistant', content: CALL[i][1] });
  }
  return ctx;
}

function linesUpTo(turn: number): Line[] {
  return CALL.slice(0, turn + 1).flatMap(([u, f]) => [
    { speaker: 'user' as const, text: u },
    { speaker: 'ferni' as const, text: f },
  ]);
}

const streamOf = (text: string): ReadableStream<unknown> =>
  new ReadableStream<unknown>({
    start(controller) {
      controller.enqueue(text);
      controller.close();
    },
  });

/**
 * Plays the call: each reply through gatedReply, then the director observes
 * it. `slowAfter`: from that reply on the director's model never answers in
 * time, so the next request goes out with no note from it.
 */
async function play(opts: { slowAfter?: number } = {}): Promise<string[]> {
  let call = 0;
  const director = new Director({
    sessionId: 'listen-first-limits',
    userName: 'Sam',
    budgetMs: 20,
    writer: async () => {
      const n = call++;
      if (opts.slowAfter !== undefined && n >= opts.slowAfter)
        return new Promise<string>(() => {
          // never answers: the director's budget runs out first
        });
      return CALL[n][2];
    },
  });
  const session = {};
  setDirector(session, director);
  const sent: string[] = [];
  try {
    for (let turn = 0; turn < CALL.length; turn++) {
      const model = vi.fn(async (ctx: llm.ChatContext) => {
        sent.push((ctx.items[ctx.items.length - 1] as llm.ChatMessage).textContent ?? '');
        return streamOf('ok');
      });
      // eslint-disable-next-line no-await-in-loop -- turns in order, like the call
      await gatedReply(
        contextAt(turn),
        session as never,
        model as never,
        { wrap: (s) => s },
        {
          env: { CRISIS_GUARD_MODE: 'off' },
        }
      );
      // eslint-disable-next-line no-await-in-loop -- the note lands (or times out) before the next turn
      await director.observe(linesUpTo(turn));
    }
  } finally {
    setDirector(session, null);
  }
  return sent;
}

const prevFlag = process.env.LISTEN_FIRST;
const prevNotes = process.env.DIRECTOR_NOTES;
beforeEach(() => {
  process.env.DIRECTOR_NOTES = 'on';
});
afterEach(() => {
  for (const [k, v] of [
    ['LISTEN_FIRST', prevFlag],
    ['DIRECTOR_NOTES', prevNotes],
  ] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('limitsFromNotes', () => {
  it('keeps what to drop, stop or avoid, verb and all', () => {
    expect(limitsFromNotes(['Drop the mail topic now; his replies are short.'])).toEqual([
      'drop the mail topic',
    ]);
    expect(limitsFromNotes(['Stop talking about your mail and focus back on him.'])).toEqual([
      'stop talking about your mail',
    ]);
    expect(
      limitsFromNotes(["He's quiet. Avoid asking more questions or trying to fix the quietness."])
    ).toEqual(['avoid asking more questions or trying to fix the quietness']);
    expect(limitsFromNotes(['Let him lead the next topic.', 'Match his low energy.'])).toEqual([]);
  });
});

describe('repeatedOwnTopics', () => {
  it('finds what Ferni keeps raising that the caller never said', () => {
    expect(repeatedOwnTopics(linesUpTo(1), 'Sam')).toEqual(['mail']);
    expect(repeatedOwnTopics(linesUpTo(0), 'Sam')).toEqual([]);
  });

  it('lets the caller bring it back', () => {
    const lines = [...linesUpTo(1), { speaker: 'user' as const, text: 'So what is in the mails?' }];
    expect(repeatedOwnTopics(lines, 'Sam')).toEqual([]);
  });

  it("never counts the caller's own name", () => {
    const lines: Line[] = [
      { speaker: 'ferni', text: 'Morning, Sam, the river looks great.' },
      { speaker: 'user', text: 'Hey.' },
      { speaker: 'ferni', text: 'Sam, you would love the river today.' },
    ];
    expect(repeatedOwnTopics(lines, 'Sam')).toEqual(['river']);
  });
});

describe('LISTEN_FIRST through the reply path', () => {
  it('off: the note is a one-reply hint and no rule is set', async () => {
    delete process.env.LISTEN_FIRST;
    const sent = await play();
    expect(sent[2]).toContain('[Director: Drop the mail topic now');
    expect(sent.some((r) => r.includes('Rules for this reply'))).toBe(false);
    expect(sent[3]).not.toMatch(/drop the mail topic/i);
  });

  it(`on: "drop the mail" holds for ${LIMIT_REPLIES} replies, then lapses`, async () => {
    process.env.LISTEN_FIRST = 'on';
    const sent = await play();
    expect(sent[1]).not.toContain('drop the mail topic');
    for (let i = 2; i < 2 + LIMIT_REPLIES; i++)
      expect(sent[i], `reply ${i}`).toContain(
        'Rules for this reply, not suggestions: drop the mail topic'
      );
    expect(sent[2 + LIMIT_REPLIES]).not.toContain('drop the mail topic');
  });

  it('on: the rule is there even before the next note lands', async () => {
    process.env.LISTEN_FIRST = 'on';
    const sent = await play({ slowAfter: 2 });
    // After reply 2 the director has nothing in time, so no note rides on reply 3: the rule still does.
    expect(sent[3]).toContain('drop the mail topic');
    expect(sent[3]).not.toContain('[Director:');
  });

  it('on: mail, raised twice by Ferni alone, is off limits for the rest of the call', async () => {
    process.env.LISTEN_FIRST = 'on';
    const sent = await play();
    expect(sent[1]).not.toContain('brought up mail');
    for (const r of sent.slice(2)) expect(r).toContain("You've brought up mail more than once");
  });
});
