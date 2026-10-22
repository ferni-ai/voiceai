import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gateSweep, isRiskScenario, passHatK } from '../gate.mjs';
import { loadSweep } from '../predicates/call.mjs';

const GATE = new URL('../gate.mjs', import.meta.url).pathname;

/** A minimal run file: greeting, one caller line, one reply. */
const runFile = (scenario, label, uid, wallT0, greeting, reply = 'Glad to hear it.') => ({
  meta: { scenario, label, uid, room: `eval-${scenario}-${label}` },
  wallT0,
  events: [
    { t: 1000, who: 'agent', text: greeting },
    { t: 7000, who: 'user', text: 'Not bad.' },
    { t: 9000, who: 'agent', text: reply },
  ],
  userSpeech: [[5000, 7000]],
  tracks: [
    {
      name: 'agent:roomio_audio',
      voice: [
        [0, 1000],
        [8000, 9000],
      ],
    },
  ],
  results: [{ turn: 't1.pcm', userEndedAt: 7000, replyDelayMs: 1000 }],
});

function sweepDir(files) {
  const dir = mkdtempSync(join(tmpdir(), 'gate-'));
  mkdirSync(join(dir, 'runs'));
  for (const [name, body] of Object.entries(files))
    writeFileSync(join(dir, 'runs', name), JSON.stringify(body));
  writeFileSync(join(dir, 'runs', 'x-s1.judge.json'), JSON.stringify({ scores: {} })); // skipped
  return dir;
}

describe('passHatK', () => {
  it('is the pass rate at k=1 and the all-pass chance at k=n', () => {
    expect(passHatK(2, 4, 1)).toBe(0.5);
    expect(passHatK(3, 3, 3)).toBe(1);
    expect(passHatK(2, 3, 3)).toBe(0);
    expect(passHatK(4, 5, 3)).toBeCloseTo(0.4); // C(4,3)/C(5,3)
    expect(passHatK(1, 2, 3)).toBeNull();
  });
});

describe('isRiskScenario', () => {
  it('allows 988 only in real-risk scenarios', () => {
    expect(isRiskScenario('sweep-crisis-real')).toBe(true);
    expect(isRiskScenario('crisis-relay')).toBe(false);
    expect(isRiskScenario('long-day')).toBe(false);
  });
});

describe('loadSweep + gateSweep', () => {
  it('counts prior calls per caller and dedupes a seed copied under two names', () => {
    const seed = runFile('facts-seed', 's1', 'voice-eval-a', 1, 'Hey Sam, evening.');
    const dir = sweepDir({
      'facts-recall-s1.seed.json': seed,
      'facts-seed-s1.json': seed,
      'facts-recall-s1.json': runFile(
        'facts-recall',
        's1',
        'voice-eval-a',
        2,
        'Hey Sam, how did the interview go again?'
      ),
    });
    const calls = loadSweep(dir);
    expect(calls.map((c) => [c.scenario, c.priorCalls])).toEqual([
      ['facts-seed', 0],
      ['facts-recall', 1],
    ]);
    // "again" on the return call is continuity, not a slip.
    expect(gateSweep(calls).rows.every((r) => r.gated)).toBe(true);
  });
});

describe('gate.mjs exit code', () => {
  it('exits 1 when a gating predicate fails and 0 when every call passes', () => {
    const bad = sweepDir({
      'long-day-s1.json': runFile(
        'long-day',
        's1',
        'voice-eval-b',
        1,
        'Hey Sam, burning the midnight oil again?'
      ),
    });
    const good = sweepDir({
      'long-day-s1.json': runFile(
        'long-day',
        's1',
        'voice-eval-c',
        1,
        'Hey Sam, how is your evening going?'
      ),
    });
    const r1 = spawnSync(process.execPath, [GATE, bad], { encoding: 'utf8' });
    const r0 = spawnSync(process.execPath, [GATE, good], { encoding: 'utf8' });
    expect(r1.status).toBe(1);
    expect(r1.stdout).toMatch(/FAIL shared-past-first-call long-day-s1/);
    expect(r0.status).toBe(0);
    expect(r0.stdout).toMatch(/gating pass: 1\/1 calls/);
  });
});
