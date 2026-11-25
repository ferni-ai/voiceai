/**
 * The barge-in fast path's log lines (BARGE_IN_FASTPATH, live-call-behaviors.ts) carry counts and
 * enums only, never what the caller said: text logs are lengths only, for everyone.
 *
 * The real fast path and soft pause; only the cut, the pause and the logs are stubbed. The line
 * the caller says is invented.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBargeInFastPath, SUSTAINED_SPEECH_MS } from '../barge-in-fastpath.js';
import { SOFT_PAUSE_CONFIRM_MS, softPauseFromEnv } from '../barge-in-soft-pause.js';

const asSaid = (transcript: string): string => transcript;
const FERNI_SAYS = 'so for her birthday I was thinking a trail day by the lake';
const SAID = 'Wait, hold on, my cousin Marisol moved to Duluth last spring';

/** A call with the soft pause on or off; every log line either side writes. */
function call(softPauseFlag: 'on' | 'off') {
  const lines: Array<Record<string, unknown>> = [];
  const softPause = softPauseFromEnv(
    { BARGE_IN_SOFT_PAUSE: softPauseFlag },
    { pause: () => true, resume: () => undefined, log: (fields) => lines.push(fields) }
  );
  const fp = createBargeInFastPath({
    interrupt: () => true,
    log: (fields) => lines.push(fields),
    softPause,
    unlabel: asSaid,
  });
  fp.onAgentState({ newState: 'speaking' });
  fp.onSpokenText(FERNI_SAYS);
  return { fp, lines };
}

/** Every value a count, a flag or a short enum, and no word of what was said. */
function expectWordsFree(lines: Array<Record<string, unknown>>): void {
  expect(lines.length).toBeGreaterThan(0);
  for (const fields of lines) {
    for (const [key, value] of Object.entries(fields)) {
      if (typeof value === 'string') expect(value, key).toMatch(/^[a-z-]{1,24}$/);
      else expect(['number', 'boolean'], key).toContain(typeof value);
    }
  }
  const logged = JSON.stringify(lines).toLowerCase();
  const said = SAID.toLowerCase().split(/\W+/);
  for (const word of said.filter((w) => w.length > 3)) expect(logged).not.toContain(word);
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('BARGE_IN_FASTPATH logs are words-free', () => {
  it("a transcript barge-in logs its word count and length, never the caller's words", () => {
    const c = call('off');
    c.fp.onTranscript({ transcript: SAID, isFinal: false });
    expect(c.lines).toEqual([{ reason: 'transcript', words: 11, chars: SAID.length }]);
    expectWordsFree(c.lines);
  });

  it('a barge-in just after a soft-pause resume, and the pause it follows, log no words', () => {
    const c = call('on');
    c.fp.onUserState({ newState: 'speaking' });
    vi.advanceTimersByTime(SUSTAINED_SPEECH_MS);
    c.fp.onTranscript({ transcript: 'yeah', isFinal: false }); // a backchannel: no cut
    c.fp.onUserState({ newState: 'listening' });
    vi.advanceTimersByTime(SOFT_PAUSE_CONFIRM_MS); // resumed
    c.fp.onTranscript({ transcript: SAID, isFinal: false });
    expect(c.lines.map((l) => l.outcome ?? l.reason)).toEqual(['resumed', 'transcript']);
    expect(c.lines[1]).toMatchObject({ words: 11, chars: SAID.length, minWords: 2 });
    expectWordsFree(c.lines);
  });

  it('a soft pause confirmed by words logs the count, never the words', () => {
    const c = call('on');
    c.fp.onUserState({ newState: 'speaking' });
    vi.advanceTimersByTime(SUSTAINED_SPEECH_MS);
    c.fp.onTranscript({ transcript: SAID, isFinal: false });
    expect(c.lines).toEqual([
      { outcome: 'interrupted', why: 'words', words: 11, pausedMs: expect.any(Number) },
    ]);
    expectWordsFree(c.lines);
  });
});
