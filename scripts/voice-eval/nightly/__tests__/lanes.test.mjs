// The lane files and capabilities.json must agree: every lane line's capability lists its
// scenario (else the scorecard never sees the run), every listed scenario is run by some lane
// (else it reports "no run" every night), and every scenario and seed file exists.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const NIGHTLY = join(HERE, '..');
const SCENARIOS = join(NIGHTLY, '..', 'scenarios');
const caps = JSON.parse(readFileSync(join(NIGHTLY, 'capabilities.json'), 'utf8')).capabilities;
const lines = ['a', 'b'].flatMap((l) =>
  readFileSync(join(NIGHTLY, 'lanes', `${l}.txt`), 'utf8')
    .split('\n')
    .filter((x) => x.trim() && !x.startsWith('#'))
    .map((x) => x.split('|').map((f) => f.trim()))
    .filter(([, sc]) => sc !== 'SLEEP')
);

describe('nightly lanes', () => {
  it('run the 10-21 set: 15 + 32 calls', () => {
    expect(lines).toHaveLength(47);
  });

  it.each(lines.map(([env, sc, label, uid, cap]) => [sc, label, cap, env, uid]))(
    '%s %s is tagged with a capability that lists it',
    (sc, label, cap, env, uid) => {
      expect(caps[cap]?.scenarios ?? []).toContain(sc);
      expect(existsSync(join(SCENARIOS, `${sc}.txt`))).toBe(true);
      const seed = env.match(/EVAL_SEED=(\S+)/)?.[1];
      if (seed) expect(existsSync(join(SCENARIOS, `${seed}.txt`))).toBe(true);
      expect(label).toMatch(/^[a-z0-9]+$/); // run.sh names files <scenario>-<TAG><label>
      expect(uid === '' || uid === '@memlive').toBe(true); // no fixed user ids in the repo
    }
  );

  it('cover every scenario capabilities.json lists', () => {
    const run = new Set(lines.map(([, sc]) => sc));
    const listed = Object.values(caps).flatMap((c) => c.scenarios);
    expect(listed.filter((s) => !run.has(s))).toEqual([]);
  });
});
