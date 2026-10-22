// caller-realism.mjs: the line transform, the persona/scenario data, and the human-clip manifest.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { callerDirective, clipFor, formatFor, loadPersonas, realizeLine } from '../caller-realism.mjs';

const quiet = { filler: 0, restart: 0, pause: 0, pauseMs: [400, 1500], trailOff: 0, rate: [1, 1], minWords: 6 };
const LINE = 'So I was thinking we could go to the lake this weekend if the weather holds.';
const slnc = (t) => [...t.matchAll(/\[\[slnc (\d+)\]\]/g)].map((m) => Number(m[1]));

describe('realizeLine', () => {
  it('leaves the line alone when the persona adds nothing', () => {
    expect(realizeLine(LINE, quiet, 's')).toEqual({ text: LINE, pauses: [], speed: 1 });
  });

  it('always pauses twice at pause=1, in range, mid-sentence, and says so in pauses', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const { text, pauses } = realizeLine(LINE, { ...quiet, pause: 1 }, seed);
      expect(pauses).toHaveLength(2);
      expect(slnc(text)).toEqual(pauses);
      for (const ms of pauses) expect(ms >= 400 && ms <= 1500).toBe(true);
      // never right after a sentence end, never as the first or last thing said
      expect(text).not.toMatch(/[.!?] \[\[slnc/);
      expect(text).toMatch(/^So I\b/);
      expect(text).toMatch(/weather holds\.$/);
      expect(text.replace(/ ?\[\[slnc \d+\]\]/g, '')).toBe(LINE);
    }
  });

  it('never pauses right after a sentence end inside the line', () => {
    const line = 'Hey. So. I was thinking we could go. To the lake. This weekend, if it holds.';
    for (let seed = 0; seed < 40; seed++) {
      const { text, pauses } = realizeLine(line, { ...quiet, pause: 1 }, seed);
      expect(pauses.length).toBeGreaterThan(0);
      expect(text).not.toMatch(/[.!?] \[\[slnc/);
    }
  });

  it('is the same line for the same seed and differs across seeds', () => {
    const p = loadPersonas().personas['trailing-thinker'];
    expect(realizeLine(LINE, p, 'x:3:trailing-thinker')).toEqual(realizeLine(LINE, p, 'x:3:trailing-thinker'));
    const texts = new Set(['1', '2', '3', '4', '5', '6'].map((s) => realizeLine(LINE, p, s).text));
    expect(texts.size).toBeGreaterThan(3);
  });

  it('restarts with the words before the pause and fills with um/uh/like', () => {
    const { text } = realizeLine('I was going to ask you about the trip next month.', { ...quiet, pause: 1, restart: 1, filler: 1 }, 'r');
    const m = text.match(/(\S+) (\S+) \[\[slnc \d+\]\] (um|uh|like), (\S+) (\S+)/);
    expect(m).not.toBeNull();
    expect([m[4], m[5]]).toEqual([m[1], m[2]].map((w) => w.replace(/[,;:]$/, '')));
  });

  it('keeps short lines and their own pauses, only setting the rate', () => {
    const p = { ...quiet, pause: 1, filler: 1, rate: [0.8, 0.8] };
    expect(realizeLine('Yeah. [[slnc 900]] It is fine.', p, 's')).toEqual({ text: 'Yeah. [[slnc 900]] It is fine.', pauses: [], speed: 0.8 });
  });

  it('trails off only a line ending in a plain period', () => {
    const p = { ...quiet, trailOff: 1 };
    expect(realizeLine(LINE, p, 's').text).toBe(LINE.replace(/\.$/, '...'));
    expect(realizeLine('Could we go to the lake this weekend maybe?', p, 's').text).toBe('Could we go to the lake this weekend maybe?');
  });
});

describe('formatFor', () => {
  const real = { text: 'I was [[slnc 900]] um, thinking.', speed: 0.9 };
  it('gives say a rate in words per minute', () => {
    expect(formatFor('say', real)).toBe('[[rate 158]] I was [[slnc 900]] um, thinking.');
  });
  it('gives each Cartesia part its own speed, since caller-tts renders parts separately', () => {
    expect(formatFor('cartesia', real)).toBe('<speed ratio="0.90"/>I was [[slnc 900]] <speed ratio="0.90"/>um, thinking.');
  });
});

describe('scenario data', () => {
  const { personas, voice } = loadPersonas();
  const dir = new URL('../scenarios/', import.meta.url);

  it('reads the #@caller line', () => {
    expect(callerDirective('# about\n#@caller walk-away\nHey.')).toBe('walk-away');
    expect(callerDirective('#@persona maya-santos\nHey.')).toBe('');
  });

  it('every persona has the fields realizeLine reads, in range', () => {
    expect(voice).toMatch(/^[0-9a-f-]{36}$/);
    for (const [id, p] of Object.entries(personas)) {
      for (const k of ['filler', 'restart', 'pause', 'trailOff']) expect(p[k] >= 0 && p[k] <= 1, `${id}.${k}`).toBe(true);
      expect(p.pauseMs[0] >= 400 && p.pauseMs[1] <= 1500 && p.pauseMs[0] < p.pauseMs[1], `${id}.pauseMs`).toBe(true);
      expect(p.rate[0] > 0.5 && p.rate[1] < 1.5, `${id}.rate`).toBe(true);
    }
  });

  it('every scenario naming a caller names a persona that exists, and the 3 low-cooperation ones do', () => {
    const named = readdirSync(dir)
      .filter((f) => f.endsWith('.txt'))
      .map((f) => [f, callerDirective(readFileSync(new URL(f, dir), 'utf8'))])
      .filter(([, c]) => c);
    for (const [f, c] of named) expect(personas[c], f).toBeDefined();
    expect(named.map(([, c]) => c).sort()).toEqual(expect.arrayContaining(['flat-deflector', 'trailing-thinker', 'walk-away']));
  });
});

describe('clipFor', () => {
  const dir = mkdtempSync(join(tmpdir(), 'clips-'));
  mkdirSync(join(dir, 'takes'));
  writeFileSync(join(dir, 'takes', 't2.wav'), 'RIFF');
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ 'long-day': { 2: 'takes/t2.wav', 3: 'takes/gone.wav', 4: '../escape.wav' } }));

  it('maps scenario + turn to the take, and nothing else', () => {
    expect(clipFor(dir, 'long-day', 2)).toBe(join(realpathSync(dir), 'takes', 't2.wav'));
    expect(clipFor(dir, 'long-day', 1)).toBe('');
    expect(clipFor(dir, 'story', 2)).toBe('');
    expect(clipFor('', 'long-day', 2)).toBe('');
  });

  it('refuses a missing file, a path outside the dir, and a dir with no manifest', () => {
    expect(() => clipFor(dir, 'long-day', 3)).toThrow(/not on disk/);
    expect(() => clipFor(dir, 'long-day', 4)).toThrow(/outside/);
    expect(() => clipFor(join(dir, 'takes'), 'long-day', 2)).toThrow(/manifest/);
  });

  it('follows symlinks before deciding, needs a regular file, and allows "..odd" names', () => {
    const outside = mkdtempSync(join(tmpdir(), 'outside-'));
    writeFileSync(join(outside, 'secret.wav'), 'RIFF');
    symlinkSync(join(outside, 'secret.wav'), join(dir, 'link.wav'));
    symlinkSync(outside, join(dir, 'sub'));
    writeFileSync(join(dir, '..odd.wav'), 'RIFF');
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ s: { 1: 'link.wav', 2: 'sub/secret.wav', 3: '..odd.wav', 4: '.', 5: 'takes' } }));
    expect(() => clipFor(dir, 's', 1)).toThrow(/outside/);
    expect(() => clipFor(dir, 's', 2)).toThrow(/outside/);
    expect(clipFor(dir, 's', 3)).toBe(join(realpathSync(dir), '..odd.wav'));
    expect(() => clipFor(dir, 's', 4)).toThrow(/not a file/);
    expect(() => clipFor(dir, 's', 5)).toThrow(/not a file/);
  });
});

describe('run.sh --realistic', () => {
  const plan = (scenario) =>
    JSON.parse(
      execFileSync('zsh', [fileURLToPath(new URL('../run.sh', import.meta.url)), '--realistic', 'dev', scenario, 'x'], {
        env: { ...process.env, EVAL_DRY_RUN: '1', CALLER_REALISM: '' },
        encoding: 'utf8',
      })
    );
  it("uses the scenario's own #@caller persona, else everyday", () => {
    expect(plan('realistic-walk-away').realism).toBe('walk-away');
    expect(plan('long-day').realism).toBe('everyday');
  });
});
