/**
 * The director sees Ferni's tool calls and never tells him he lacks a
 * capability (director-tool-state.ts, director-notes.ts).
 *
 * The exact turn from the dev call of 2026-10-12 (session-AJ_FhDLDpE3gTFu):
 * Seth asked "Hey, can you play some music?", Peter said "Sure." and called
 * playMusic; 1.5 s later, with the tool still running, the director wrote
 * "He asked for music, but you don't have a player. Tell him what you can
 * actually do instead." and Peter's next reply followed it.
 */
import { voice, type llm } from '@livekit/agents';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import { Director, DIRECTOR_SYSTEM, parseNotes, type Line } from '../director-notes.js';
import { ToolLog, watchToolsForDirector } from '../director-tool-state.js';

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

const TURN: Line[] = [
  { speaker: 'user', text: 'Hey, can you play some music?' },
  { speaker: 'ferni', text: 'Sure.' },
];
const DEV_NOTE =
  "He asked for music, but you don't have a player. Tell him what you can actually do instead.";

/** A director whose model is the dev call's: it records what it was asked and writes DEV_NOTE. */
function devCallDirector() {
  const asked: { system: string; prompt: string }[] = [];
  const director = new Director({
    sessionId: 's1',
    userName: 'Seth',
    writer: async (system, prompt) => {
      asked.push({ system, prompt });
      return DEV_NOTE;
    },
  });
  return { director, asked };
}

describe('the dev call turn', () => {
  it('the director sees playMusic running and its "no player" note is dropped', async () => {
    const { director, asked } = devCallDirector();
    director.tools.started('fake_call_0', 'playMusic');
    await director.observe(TURN);
    expect(asked[0].prompt).toContain(
      "Ferni's tool calls (most recent last):\n- playMusic: running"
    );
    expect(asked[0].system).toContain('never say he can');
    expect(director.current()).toEqual([]);
  });

  it('once the tool is done, the director sees what it started', async () => {
    const { director, asked } = devCallDirector();
    director.tools.started('fake_call_0', 'playMusic');
    director.tools.finished(
      'fake_call_0',
      'playMusic',
      JSON.stringify('Starting "Late Night" by Antonius B & Krynoze.'),
      false
    );
    await director.observe(TURN);
    expect(asked[0].prompt).toContain(
      '- playMusic: done (Starting "Late Night" by Antonius B & Krynoze.)'
    );
  });

  it('DIRECTOR_TOOL_STATE=off: the director as before, note and all', async () => {
    process.env.DIRECTOR_TOOL_STATE = 'off';
    const { director, asked } = devCallDirector();
    director.tools.started('fake_call_0', 'playMusic');
    await director.observe(TURN);
    expect(asked[0].system).toBe(DIRECTOR_SYSTEM);
    expect(asked[0].prompt).not.toContain('tool calls');
    expect(director.current()).toEqual([DEV_NOTE]);
  });
});

describe('capability denials', () => {
  it.each([
    DEV_NOTE,
    "Seth wants music; he can't play it on this call, so suggest a playlist.",
    "You don't have a way to set timers, so offer to remind him another way.",
  ])('drops %j', (note) => {
    expect(parseNotes(note, TURN)).toEqual([]);
  });

  it('keeps notes that only sound alike', () => {
    const keep = "He can't fix the music thing for Seth; just listen and keep it short.";
    expect(parseNotes(keep, TURN)).toEqual([keep]);
  });
});

describe('watchToolsForDirector', () => {
  it('records each call as the SDK starts it and its result when it lands', () => {
    const session = new EventEmitter();
    const log = new ToolLog();
    const stop = watchToolsForDirector(session as never, log);
    const callbacks: Array<(item: llm.ChatItem) => void> = [];
    const handle = {
      _addItemAddedCallback: (cb: (item: llm.ChatItem) => void) => callbacks.push(cb),
      _removeItemAddedCallback: () => {},
      addDoneCallback: () => {},
    };
    session.emit(voice.AgentSessionEventTypes.SpeechCreated, { speechHandle: handle });
    const item = (it: object) => callbacks.forEach((cb) => cb(it as llm.ChatItem));
    item({ type: 'function_call', callId: 'c1', name: 'playMusic' });
    expect(log.lines()).toEqual(['playMusic: running']);
    item({ type: 'function_call_output', callId: 'c1', name: '', output: '"x"', isError: true });
    expect(log.lines()).toEqual(['playMusic: failed (x)']);
    stop();
    expect(session.listenerCount(voice.AgentSessionEventTypes.SpeechCreated)).toBe(0);
  });

  it('keeps the last six calls from the last five minutes', () => {
    let now = 0;
    const log = new ToolLog(() => now);
    for (let i = 0; i < 8; i++) log.started(`c${i}`, `tool${i}`);
    expect(log.lines()).toHaveLength(6);
    expect(log.lines()[0]).toBe('tool2: running');
    now = 5 * 60_000 + 1;
    expect(log.lines()).toEqual([]);
  });
});
