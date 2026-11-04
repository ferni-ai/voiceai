// #2740: the scripted caller's audio must go out in real time, and a call where it didn't must say
// so instead of reporting timing numbers. MicClock / LineSender are the mic pump's pacing
// (converse.mjs needs a live room, so the last tests check that it uses them); callerAudioOf is the
// guard every timing reader goes through.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LineSender,
  MAX_SEND_RATIO,
  MicClock,
  SEND_LEAD_MS,
  SEND_QUEUE_MS,
  TIMING_INVALID,
  callerAudioOf,
} from '../converse-timing.mjs';

const HERE = new URL('..', import.meta.url).pathname;
const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

/** Drive the pump's pacing on a fake clock: the process wakes every `wakeMs` (once, `stallMs`
 *  instead, at `stallAt`), and a `lineMs` line starts at 1 s. Mirrors converse.mjs's pump loop. */
function sendLine({ wakeMs, lineMs, stallAt = Infinity, stallMs = 0 }) {
  let t = 0;
  let stalled = false;
  const clock = new MicClock(() => t);
  const line = new LineSender(new Int16Array(lineMs * 48));
  let speaking = null;
  const sizes = [];
  while (!line.done && t < 600000) {
    if (t >= 1000 && line.start === null) speaking = line;
    const n = clock.due();
    if (n > 0) {
      sizes.push(n);
      speaking?.fill(new Int16Array(n), clock);
      clock.queued(n);
      if (speaking?.allQueued) {
        speaking.accepted(t);
        speaking = null;
      }
    }
    if (!stalled && t >= stallAt) {
      stalled = true;
      t += stallMs;
    } else t += wakeMs;
  }
  return { line, clock, sizes, audio: callerAudioOf([[line.start, line.end, lineMs]]) };
}

describe('the caller is sent in real time', () => {
  it('sends a line in its own length when the process wakes every 10 ms', () => {
    const { line, clock, audio } = sendLine({ wakeMs: 10, lineMs: 5000 });
    expect(line.end - line.start).toBe(5000);
    expect(clock.lateMs).toBe(0);
    expect(audio).toMatchObject({ ratios: [1], maxRatio: 1, valid: true });
  });

  it('still sends it in real time when background timers wake the process only every 100-150 ms', () => {
    // The 2026-10-23..28 red-team calls: launchd ProcessType=Background, timers coalesced. The old
    // pump sent one 10 ms frame per captureFrame into a 40 ms queue: 1.6 to 4.5x, with gaps.
    for (const wakeMs of [100, 150]) {
      const { line, clock, sizes, audio } = sendLine({ wakeMs, lineMs: 7000 });
      expect(line.end - line.start).toBe(7000);
      expect(clock.lateMs).toBe(0);
      expect(audio.valid).toBe(true);
      // A late wake sends a bigger frame: whole 10 ms frames, never past the queue.
      expect(sizes.every((n) => n % 480 === 0 && n <= SEND_QUEUE_MS * 48)).toBe(true);
      expect(Math.max(...sizes)).toBeGreaterThan(480);
    }
  });

  it('a stall longer than the lead goes out as a gap, the line runs long, and the guard flags it', () => {
    const { line, clock, audio } = sendLine({
      wakeMs: 10,
      lineMs: 5000,
      stallAt: 3000,
      stallMs: 2000,
    });
    expect(clock.lateMs).toBeCloseTo(2000 - SEND_LEAD_MS, 0);
    expect(line.end - line.start).toBeCloseTo(5000 + 2000 - SEND_LEAD_MS, 0);
    expect(audio.valid).toBe(false);
    expect(audio.maxRatio).toBeGreaterThan(MAX_SEND_RATIO);
  });

  it('a line ends no earlier than its last frame was accepted', () => {
    const line = new LineSender(new Int16Array(480));
    let t = 0;
    const clock = new MicClock(() => t);
    line.fill(new Int16Array(clock.due()), clock);
    line.accepted(5000); // captureFrame blocked: the room took it at 5 s
    expect(line.end).toBe(5000);
  });
});

describe('callerAudioOf: the timing guard', () => {
  it('flags the issue #2740 call: an 8.9 s line sent over 48.5 s', () => {
    const audio = callerAudioOf([
      [1000, 5000, 4000, 9000],
      [29329, 77779, 8900, 9000],
    ]);
    expect(audio).toMatchObject({ ratios: [1, 5.44], maxRatio: 5.44, limit: 1.2, valid: false });
  });

  it(`passes ${MAX_SEND_RATIO}x and flags anything over it`, () => {
    expect(callerAudioOf([[0, 1200, 1000]]).valid).toBe(true);
    expect(callerAudioOf([[0, 1210, 1000]]).valid).toBe(false);
  });

  it("doesn't time lines under 200 ms or older lines with no audio length", () => {
    expect(callerAudioOf([[0, 450, 150]])).toMatchObject({
      ratios: [null],
      maxRatio: null,
      valid: true,
    });
    expect(callerAudioOf([[0, 90000]])).toMatchObject({ ratios: [null], valid: true });
    expect(callerAudioOf([])).toMatchObject({ maxRatio: null, valid: true });
  });
});

describe('timing readers show "timing invalid", not a number', () => {
  const dir = mkdtempSync(join(tmpdir(), 'caller-audio-'));
  // A minimal converse.mjs run file; `stretch` scales the caller's 4 s line.
  const runFile = (name, stretch, { recorded = false } = {}) => {
    const speech = [[1000, 1000 + 4000 * stretch, 4000, 9000]];
    const run = {
      meta: { scenario: 'caller-audio-fixture', label: name },
      wallT0: 0,
      results: [
        { turn: '1.pcm', userEndedAt: speech[0][1], replyDelayMs: 900 },
        { turn: '2.pcm', mode: 'interrupt', agentTalking: true, stopped: true, stopLatencyMs: 400 },
      ],
      events: [],
      userSpeech: speech,
      tracks: [],
      ...(recorded ? { callerAudio: callerAudioOf(speech) } : {}),
    };
    const f = join(dir, `${name}.json`);
    writeFileSync(f, JSON.stringify(run));
    return f;
  };
  const score = (...files) =>
    JSON.parse(
      execFileSync('node', [join(HERE, 'score.mjs'), ...files], {
        encoding: 'utf8',
        env: { ...process.env, HUMAN_TARGETS: join(dir, 'none.json') },
        stdio: ['ignore', 'pipe', 'ignore'],
      })
    );

  it('score.mjs: a stretched call reads timing invalid in every timing field', () => {
    const s = score(runFile('stretched', 3, { recorded: true }));
    for (const k of [
      'replyDelayMs',
      'perceivedDelayMs',
      'talkOver',
      'backchannels',
      'interruptions',
      'presence',
    ])
      expect(s[k]).toBe(TIMING_INVALID);
    expect(s.callerAudio).toEqual({
      runs: 1,
      timingInvalid: [{ file: 'stretched.json', maxRatio: 3 }],
    });
  });

  it('score.mjs: an older run file with no callerAudio is checked from userSpeech', () => {
    expect(score(runFile('old-stretched', 2.5)).replyDelayMs).toBe(TIMING_INVALID);
  });

  it('score.mjs: a pool times only the real-time calls and names the rest', () => {
    const s = score(runFile('fine', 1), runFile('slow', 3));
    expect(s.replyDelayMs).toEqual({ p50: 900, p90: 900, n: 1 });
    expect(s.talkOver.interrupts).toBe(1);
    expect(s.callerAudio.timingInvalid.map((x) => x.file)).toEqual(['slow.json']);
  });

  it('judge.mjs --summary: the report header names the calls whose timing is invalid', () => {
    const out = execFileSync(
      'node',
      [join(HERE, 'judge.mjs'), '--summary', runFile('j-fine', 1), runFile('j-slow', 4)],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }
    );
    expect(out).toMatch(
      /caller audio: timing invalid in 1\/2 call\(s\), scores confounded: j-slow$/m
    );
  });
});

describe('converse.mjs uses the real-time pump and the guard', () => {
  const c = src('../converse.mjs');
  it('paces the mic on the clock and stamps lines by when they play', () => {
    expect(c).toContain('new AudioSource(48000, 1, SEND_QUEUE_MS)');
    expect(c).toContain('const n = micClock.due();');
    expect(c).toContain('userSpeech.push(callerLine(line.start, line.end, buf))');
  });
  it('records callerAudio and blanks reply delays on an invalid call', () => {
    expect(c).toContain('const callerAudio = { ...callerAudioOf(userSpeech)');
    expect(c).toContain('r.replyDelayMs = TIMING_INVALID;');
    expect(c).toMatch(/JSON\.stringify\(\{[^}]*userSpeech, callerAudio,/);
  });
});
