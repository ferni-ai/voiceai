import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { hardRuleFor, NoteHistory, themesOf } from '../director-escalation.js';
import { Director, setDirector, type Line } from '../director-notes.js';
import { withTurnReminder } from '../turn-request.js';

/** The director's notes on Seth's dev call, 2026-10-11, in order. */
const SETH_NOTES = [
  'Seth is quiet and giving short answers. Let him talk about his own day instead of pushing Seth.',
  "Drop the lecturing about things growing in heads; Seth's short answers suggest he just wants a quiet chat.",
  'He asked "You don\'t like to cook?" but you talked about yourself twice. Give him space to answer.',
  "Seth sounds quiet and focused. Answer his question about what's too much effort directly without over-explaining the chores.",
  'He is very quiet now. Stop explaining your kitchen habits and let the silence sit.',
];

const CALL: Line[] = [
  { speaker: 'user', text: 'What are you up to today, Fern?' },
  { speaker: 'ferni', text: 'Trying to figure out dinner without cooking anything.' },
  { speaker: 'user', text: "You don't like to cook?" },
  {
    speaker: 'ferni',
    text: 'The microwave and a prayer, mostly; the kitchen and I have an understanding.',
  },
];

/** A director whose model writes the given notes, one reply per observe(). */
function scripted(replies: string[]): Director {
  let i = 0;
  return new Director({
    sessionId: `esc-${Math.random()}`,
    userName: 'Seth',
    writer: async () => replies[i++] ?? 'NONE',
  });
}

function request(said: string): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'user', content: 'Hey.' });
  ctx.addMessage({ role: 'assistant', content: 'The microwave and a prayer, mostly.' });
  ctx.addMessage({ role: 'user', content: said });
  return ctx;
}
const lastText = (ctx: llm.ChatContext): string =>
  (ctx.items[ctx.items.length - 1] as { textContent?: string }).textContent ?? '';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('note themes', () => {
  it('sorts the 2026-10-11 notes: talking about himself, lecturing, filling', () => {
    expect(themesOf(SETH_NOTES[0])).toContain('self');
    expect(themesOf(SETH_NOTES[1])).toContain('lecture');
    expect(themesOf(SETH_NOTES[2])).toContain('self');
    expect(themesOf(SETH_NOTES[3])).toContain('lecture');
    expect(themesOf(SETH_NOTES[4])).toEqual(expect.arrayContaining(['self', 'filling']));
    expect(themesOf('Seth mentioned the dog twice; the dog matters to him.')).toEqual([]);
  });

  it('a theme escalates on its second appearance in four replies, not its first', () => {
    const h = new NoteHistory();
    h.record([SETH_NOTES[2]]);
    expect(h.escalated()).toEqual([]);
    h.record([]);
    h.record([SETH_NOTES[4]]);
    expect(h.escalated()).toContain('self');
    // Only while the director keeps raising it: a reply with no such note drops it.
    h.record(['Seth mentioned the dog; it matters to him.']);
    expect(h.escalated()).toEqual([]);
  });

  it('a raise four replies back has aged out', () => {
    const h = new NoteHistory();
    h.record([SETH_NOTES[2]]);
    for (let i = 0; i < 4; i++) h.record([]);
    h.record([SETH_NOTES[4]]);
    expect(h.escalated()).not.toContain('self');
  });

  it('the rule says it is not optional, for this reply', () => {
    expect(hardRuleFor([])).toBe('');
    expect(hardRuleFor(['self'])).toMatch(/not optional for THIS reply: nothing about yourself/);
  });
});

describe('on the reply path (DIRECTOR_NOTES=on)', () => {
  async function replyAfter(notes: string[], escalate: boolean): Promise<string> {
    vi.stubEnv('DIRECTOR_ESCALATE', escalate ? 'on' : 'off');
    const director = scripted(notes);
    const session = { userData: { personaId: 'ferni', services: { sessionId: 'escalate' } } };
    setDirector(session, director);
    for (const _ of notes) await director.observe(CALL);
    return lastText(withTurnReminder(request('Yeah.'), session));
  }

  it('with DIRECTOR_ESCALATE=on, the second "about yourself" note ends the request as a hard rule', async () => {
    const asked = await replyAfter([SETH_NOTES[2], SETH_NOTES[4]], true);
    expect(asked).toContain('Stop explaining your kitchen habits');
    // Last of all: after the turn shape, nearest the reply.
    const rule = hardRuleFor(['self']);
    expect(asked).toContain(rule);
    expect(asked.slice(asked.indexOf(rule) + rule.length).trim()).toBe(')');
  });

  it('a first note stays a note', async () => {
    const asked = await replyAfter([SETH_NOTES[2]], true);
    expect(asked).toContain('Give him space to answer');
    expect(asked).not.toContain('not optional');
  });

  it('off (default), the same repeated notes never become a rule', async () => {
    const asked = await replyAfter([SETH_NOTES[2], SETH_NOTES[4]], false);
    expect(asked).toContain('Stop explaining your kitchen habits');
    expect(asked).not.toContain('not optional');
  });

  it('never rides a crisis reply', async () => {
    vi.stubEnv('DIRECTOR_ESCALATE', 'on');
    const director = scripted([SETH_NOTES[2], SETH_NOTES[4]]);
    const session = { userData: { personaId: 'ferni' } };
    setDirector(session, director);
    await director.observe(CALL);
    await director.observe(CALL);
    expect(director.hardRule()).not.toBe('');
    const asked = lastText(withTurnReminder(request('Yeah.'), session, { shape: false }));
    expect(asked).not.toContain('not optional');
  });

  it('the director is told to write to Ferni as "you" only when on', async () => {
    const systems: string[] = [];
    const make = () =>
      new Director({
        sessionId: 'sys',
        writer: async (system) => {
          systems.push(system);
          return 'NONE';
        },
      });
    vi.stubEnv('DIRECTOR_ESCALATE', 'off');
    await make().observe(CALL);
    vi.stubEnv('DIRECTOR_ESCALATE', 'on');
    await make().observe(CALL);
    expect(systems[0]).not.toContain('never "him" for Ferni');
    expect(systems[1]).toContain('never "him" for Ferni');
  });
});
