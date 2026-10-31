// run-nightly.sh against stubs: a fake repo root, a fake HOME (claim.py, board), and stub
// lk / gcloud / gh / npx / pnpm and run.sh that only log. Nothing here reaches dev, prod or
// GitHub. macOS only, like the launchd job it backs (pgrep -P, BSD tools).
import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const NIGHTLY = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVAL = join(NIGHTLY, '..');
const exe = (f, body) => (writeFileSync(f, `#!/bin/bash\n${body}\n`), chmodSync(f, 0o755));
const python3 = spawnSync('/bin/sh', ['-c', 'command -v python3'], {
  encoding: 'utf8',
}).stdout.trim();

/** A fake root + HOME; every stub appends one line to EVENTS, in order. */
function sandbox(lanes, { claimErr = '', runSh = '', cleanupCount = 0 } = {}) {
  const t = mkdtempSync(join(tmpdir(), 'nightly-run-'));
  const ev = join(t, 'events.log');
  const n = join(t, 'root/scripts/voice-eval/nightly');
  mkdirSync(join(n, 'lanes'), { recursive: true });
  for (const f of [
    'run-nightly.sh',
    'deploy-retry.sh',
    'scorecard.mjs',
    'capabilities.json',
    'analyze.py',
    'superhuman.mjs',
    'superhuman-bar.json',
    'false-done.mjs',
    'recall-score.mjs',
    'recall-world.mjs',
    'tool-grounding.mjs',
  ])
    cpSync(join(NIGHTLY, f), join(n, f));
  for (const f of ['recall-facts.mjs', 'eval-database.mjs'])
    cpSync(join(EVAL, f), join(n, '..', f));
  lanes.forEach((body, i) => writeFileSync(join(n, 'lanes', `${'ab'[i]}.txt`), body));
  exe(
    join(n, '../run.sh'),
    `echo "run.sh start $*" >> ${ev}\n${runSh}\necho "run.sh end $*" >> ${ev}`
  );
  mkdirSync(join(t, 'home/.claude/coordination'), { recursive: true });
  // claim.py: logs, and on acquire fails with FAKE_CLAIM_ERR on stderr when it is set
  writeFileSync(
    join(t, 'home/.claude/coordination/claim.py'),
    `import os, sys\nopen(${JSON.stringify(ev)}, 'a').write('claim ' + ' '.join(sys.argv[1:]) + '\\n')\n` +
      `e = os.environ.get('FAKE_CLAIM_ERR')\nif sys.argv[1] == 'acquire' and e:\n    sys.exit(e)\n`
  );
  mkdirSync(join(t, 'bin'));
  exe(join(t, 'bin/lk'), `echo "lk $*" >> ${ev}\necho '{"rooms":[]}'`);
  exe(join(t, 'bin/gcloud'), `echo "gcloud $*" >> ${ev}\necho '[]'`);
  exe(
    join(t, 'bin/npx'),
    `echo "npx $*" >> ${ev}\necho "Dry run. To delete these ${cleanupCount}:"`
  );
  for (const b of ['gh', 'pnpm']) exe(join(t, 'bin', b), `echo "${b} $*" >> ${ev}`);
  const env = {
    HOME: join(t, 'home'),
    PATH: `${join(t, 'bin')}:${dirname(process.execPath)}:${dirname(python3)}:/usr/bin:/bin:/usr/sbin:/sbin`,
    FAKE_CLAIM_ERR: claimErr,
    NIGHTLY_OUT: join(t, 'out', '2026-10-22'),
    NIGHTLY_DEPLOY: '0',
    NIGHTLY_ISSUE: '7',
    NIGHTLY_LANE_B_DELAY_S: '0', // the stagger has its own tests below
  };
  const events = () => (existsSync(ev) ? readFileSync(ev, 'utf8').trim().split('\n') : []);
  const out = (f) => readFileSync(join(env.NIGHTLY_OUT, f), 'utf8');
  return { t, env, events, out, script: join(n, 'run-nightly.sh') };
}
const run = (sb, env = {}) => spawn('/bin/bash', [sb.script], { env: { ...sb.env, ...env } });
const exited = (p) => new Promise((r) => p.on('exit', (code) => r(code)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(process.platform !== 'darwin')('run-nightly.sh (stubbed)', () => {
  it('on SIGTERM mid-lane, stops every run.sh before it releases the claim', async () => {
    const line = 'EVAL_TZ=Asia/Tokyo | timer | s1 | | timer\n';
    const sb = sandbox([line.repeat(5), line.repeat(5)], { runSh: 'sleep 3' });
    const p = run(sb);
    while (sb.events().filter((e) => e.startsWith('run.sh start')).length < 2) await sleep(100);
    p.kill('SIGTERM');
    expect(await exited(p)).toBe(2);
    await sleep(4000); // anything still alive would log "run.sh end" or start another call here
    const ev = sb.events();
    const release = ev.findIndex((e) => e.startsWith('claim release'));
    expect(release).toBeGreaterThan(0);
    expect(ev.slice(release).filter((e) => e.startsWith('run.sh'))).toEqual([]);
    expect(ev.filter((e) => e.startsWith('run.sh start'))).toHaveLength(2);
    expect(sb.out('REPORT.md')).toMatch(/HARNESS ERROR: interrupted by a signal/);
  }, 30_000);

  it('kills a call that runs past NIGHTLY_CALL_MAX_S and moves on to the next line', async () => {
    const line = 'EVAL_TZ=Asia/Tokyo | timer | s1 | | timer\n';
    const sb = sandbox([line.repeat(2), ''], { runSh: 'sleep 30' });
    const t0 = Date.now();
    await exited(run(sb, { NIGHTLY_CALL_MAX_S: '2' }));
    expect(Date.now() - t0).toBeLessThan(20_000); // two hung calls cost ~4 s, not 60
    expect(sb.events().filter((e) => e.startsWith('run.sh start'))).toHaveLength(2);
    expect(sb.events().filter((e) => e.startsWith('run.sh end'))).toEqual([]);
    expect(sb.out('laneA.log').match(/TIMEOUT timer s1 after 2s/g)).toHaveLength(2);
  }, 30_000);

  it('a timed-out call whose child ignores TERM is still killed', async () => {
    const line = 'EVAL_TZ=Asia/Tokyo | timer | s1 | | timer\n';
    // the child ignores TERM; run.sh itself dies on TERM, so only the KILL step stops the child
    const sb = sandbox([line, ''], { runSh: "(trap '' TERM; exec sleep 47) & wait" });
    await exited(run(sb, { NIGHTLY_CALL_MAX_S: '2' }));
    await sleep(500);
    const left = spawnSync('pgrep', ['-f', 'sleep 47']).stdout.toString().trim();
    if (left) spawnSync('pkill', ['-f', 'sleep 47']);
    expect(left).toBe('');
  }, 30_000);

  it('a call that finishes in time is not touched by its watchdog', async () => {
    const line = 'EVAL_TZ=Asia/Tokyo | timer | s1 | | timer\n';
    const sb = sandbox([line, ''], { runSh: 'sleep 1' });
    await exited(run(sb, { NIGHTLY_CALL_MAX_S: '3' }));
    await sleep(3000); // past the cap: a leaked watchdog would log TIMEOUT now
    expect(sb.events().filter((e) => e.startsWith('run.sh end'))).toHaveLength(1);
    expect(sb.out('laneA.log')).not.toMatch(/TIMEOUT/);
  }, 30_000);

  it('reads logs up to a real window end, scores, and leads the board with SAFETY FAIL', async () => {
    // run.sh leaves a scored crisis-relay call in which Ferni said 988
    const write = `o=$(dirname "$0")/out; mkdir -p "$o"; b="$o/$2-$3"
echo '{"meta":{"scenario":"'$2'"},"events":[]}' > "$b.json"
echo '{"replyTexts":["you can call 988"],"talkOver":{}}' > "$b.score.json"`;
    const sb = sandbox(['EVAL_TZ=Asia/Tokyo | crisis-relay | s1 | | crisis-false-alarm\n', ''], {
      runSh: write,
    });
    expect(await exited(run(sb))).toBe(1);
    const read = sb
      .events()
      .find((e) => e.startsWith('gcloud logging read') && e.includes('timestamp<='));
    const [, t0, t1] = read.match(/timestamp>="([^"]+)" AND timestamp<="([^"]+)"/);
    expect(Date.parse(t1) - Date.parse(t0)).toBeGreaterThan(120_000); // T0 1 min back, T1 2 min ahead
    const board = readFileSync(join(sb.env.HOME, '.claude/coordination/board.md'), 'utf8');
    expect(board).toMatch(/nightly \d{4}-\d{2}-\d{2}: SAFETY FAIL: crisis-false-alarm; .*exit 1/);
    expect(sb.out('COMMENT.md')).toMatch(/^\*\*SAFETY FAIL: crisis-false-alarm/);
    expect(sb.events().some((e) => e.startsWith('gh issue comment 7'))).toBe(true);
  }, 30_000);

  it('a scorecard harness error still writes REPORT.md and COMMENT.md and says so on the board', async () => {
    const sb = sandbox(['EVAL_TZ=Asia/Tokyo | timer | s1 | | timer\n', '']);
    expect(await exited(run(sb))).toBe(2);
    expect(sb.out('REPORT.md')).toMatch(/HARNESS ERROR: scorecard exit 2/);
    expect(sb.out('COMMENT.md')).toMatch(/HARNESS ERROR/);
    expect(JSON.parse(sb.out('scorecard.json')).status).toBe('harness-error');
    expect(readFileSync(join(sb.env.HOME, '.claude/coordination/board.md'), 'utf8')).toMatch(
      /harness-error: /
    );
    const gh = sb.events().find((e) => e.startsWith('gh issue comment'));
    expect(existsSync(gh.split('--body-file ')[1])).toBe(true);
  }, 30_000);

  it('skips (exit 3) only when the claim is held; a claim.py crash is a harness error', async () => {
    const held = sandbox(['', ''], { claimErr: 'HELD by lead (abc) for ~5 more min: x' });
    expect(await exited(run(held))).toBe(3);
    expect(JSON.parse(held.out('scorecard.json')).status).toBe('skipped');
    const crash = sandbox(['', ''], { claimErr: 'Traceback: boom' });
    expect(await exited(run(crash))).toBe(2);
    expect(JSON.parse(crash.out('scorecard.json')).status).toBe('harness-error');
    expect(crash.events().filter((e) => e.startsWith('run.sh'))).toEqual([]);
  }, 30_000);

  it('after a SIGKILL of the runner, the renewer and the lanes stop on their own', async () => {
    const line = 'EVAL_TZ=Asia/Tokyo | timer | s1 | | timer\n';
    const sb = sandbox([line.repeat(20), line.repeat(20)], { runSh: 'sleep 1' });
    const p = run(sb, { NIGHTLY_RENEW_POLL_S: '1', NIGHTLY_RENEW_EVERY: '1' }); // renew every 1 s poll
    const count = (prefix) => sb.events().filter((e) => e.startsWith(prefix)).length;
    while (count('claim acquire') < 3) await sleep(100); // the claim plus 2 renewals: it renews
    p.kill('SIGKILL'); // no trap runs: nothing releases the claim
    await exited(p);
    await sleep(1500); // let a renewal or a call already under way finish
    const [acquires, starts] = [count('claim acquire'), count('run.sh start')];
    await sleep(2500); // 2 more polls
    expect(count('claim acquire')).toBe(acquires);
    expect(count('run.sh start')).toBe(starts);
    expect(count('claim release')).toBe(0);
    const left = spawnSync('pgrep', ['-f', sb.t]).stdout.toString().trim();
    expect(left).toBe(''); // renewer and lane subshells are gone, not orphaned
  }, 30_000);

  it('starts lane B NIGHTLY_LANE_B_DELAY_S after lane A, and at once with 0', async () => {
    const lane = (sc) => `EVAL_TZ=Asia/Tokyo | ${sc} | s1 | | ${sc}\n`.repeat(6);
    const order = async (delay) => {
      const sb = sandbox([lane('timer'), lane('lookups')], { runSh: 'sleep 1' });
      await exited(run(sb, { NIGHTLY_LANE_B_DELAY_S: delay }));
      const starts = sb.events().filter((e) => e.startsWith('run.sh start'));
      return {
        a: starts.filter((e) => e.includes('timer')).length,
        firstB: starts.findIndex((e) => e.includes('lookups')),
      };
    };
    // 1 s calls: lane A has started 3 calls by ~2 s and 5 by ~4 s.
    const late = await order('4');
    expect(late.firstB).toBeGreaterThanOrEqual(3);
    const now = await order('0');
    expect(now.firstB).toBeLessThan(2);
  }, 60_000);

  it('a SIGKILLed runner leaves no lane B waiting out its delay', async () => {
    const line = 'EVAL_TZ=Asia/Tokyo | timer | s1 | | timer\n';
    const sb = sandbox([line.repeat(20), line], { runSh: 'sleep 1' });
    const p = run(sb, { NIGHTLY_LANE_B_DELAY_S: '30', NIGHTLY_RENEW_POLL_S: '1' });
    while (!sb.events().some((e) => e.startsWith('run.sh start'))) await sleep(100);
    p.kill('SIGKILL');
    await exited(p);
    await sleep(4000); // lane B and the renewer check the runner every 1 s; lane A ends its call
    const left = spawnSync('pgrep', ['-f', sb.t]).stdout.toString().trim();
    if (left) spawnSync('pkill', ['-f', sb.t]);
    expect(left).toBe('');
    expect(sb.events().filter((e) => e.startsWith('run.sh start'))).toHaveLength(1);
  }, 30_000);

  it('staggers lanes by 20 s unless told otherwise', () => {
    const src = readFileSync(join(NIGHTLY, 'run-nightly.sh'), 'utf8');
    expect(src).toMatch(/^LANE_B_DELAY_S=\$\{NIGHTLY_LANE_B_DELAY_S:-20\}$/m);
  });

  it('cleanup erases the counted users in ferni-dev, and only dry-runs if dev is (default)', async () => {
    const cleanups = (sb) => sb.events().filter((e) => e.includes('cleanup-users.ts'));
    const dev = sandbox(['', ''], { cleanupCount: 3 });
    await exited(run(dev));
    expect(cleanups(dev)).toHaveLength(2);
    expect(cleanups(dev)[0]).toMatch(/--env dev --min-age-hours 1$/);
    expect(cleanups(dev)[1]).toMatch(/--env dev --min-age-hours 1 --execute --confirm 3$/);
    const rollback = sandbox(['', ''], { cleanupCount: 3 });
    await exited(run(rollback, { EVAL_DEV_DATABASE: '(default)' }));
    expect(cleanups(rollback)).toHaveLength(1);
    expect(cleanups(rollback)[0]).not.toMatch(/--execute/);
    expect(rollback.out('nightly.log')).toMatch(
      /cleanup: dev resolves to '\(default\)'.*3 would go/
    );
  }, 30_000);

  it('claims as session nightly-sweep whoever runs it', () => {
    const r = spawnSync('/bin/bash', [
      '-c',
      `grep -c '^export CLAUDE_CODE_SESSION_ID=nightly-sweep ' ${join(NIGHTLY, 'run-nightly.sh')}`,
    ]);
    expect(String(r.stdout).trim()).toBe('1');
  });
});
