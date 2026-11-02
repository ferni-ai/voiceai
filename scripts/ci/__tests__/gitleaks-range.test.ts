/**
 * gitleaks-range.sh, run as a subprocess against a stubbed gitleaks. The real binary
 * isn't in the unit environment; CI runs it for real in the Security Scan job. These
 * pin the script's contract: no scan counts unless gitleaks first reports the planted
 * key, and a finding in the range fails.
 */
import { spawnSync } from 'child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = resolve(__dirname, '../gitleaks-range.sh');
const BASE = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const HEAD = 'ffeeddccbbaa99887766554433221100ffeeddcc';

// The stub logs each call, copies what the canary repo holds, and exits with
// CANARY_RC for the canary scan and RANGE_RC for the range scan.
const STUB = `#!/usr/bin/env bash
target="\${!#}"
if printf '%s\\n' "$@" | grep -q -- '^--log-opts='; then
  echo "range $*" >> "$STUB_LOG"
  exit "$RANGE_RC"
fi
echo "canary $*" >> "$STUB_LOG"
cp "$target/settings.ini" "$STUB_DIR/canary-settings.ini"
[ -f "$target/.gitleaks.toml" ] && cp "$target/.gitleaks.toml" "$STUB_DIR/canary-config.toml"
exit "$CANARY_RC"
`;

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gitleaks-range-'));
  writeFileSync(join(dir, 'gitleaks'), STUB);
  chmodSync(join(dir, 'gitleaks'), 0o755);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function run(canaryRc: number, rangeRc = 0) {
  const r = spawnSync('bash', [SCRIPT, BASE, HEAD], {
    cwd: dir,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${dir}:${process.env.PATH}`,
      STUB_LOG: join(dir, 'calls.log'),
      STUB_DIR: dir,
      CANARY_RC: String(canaryRc),
      RANGE_RC: String(rangeRc),
    },
  });
  let calls: string[] = [];
  try {
    calls = readFileSync(join(dir, 'calls.log'), 'utf8').trim().split('\n');
  } catch {
    // no calls logged
  }
  return { status: r.status, out: r.stdout + r.stderr, calls };
}

describe('gitleaks-range.sh', () => {
  it('scans base..head after gitleaks reports the planted key, and passes a clean range', () => {
    const r = run(1, 0);
    expect(r.status).toBe(0);
    expect(r.calls.map((c) => c.split(' ')[0])).toEqual(['canary', 'range']);
    expect(r.calls[1]).toContain(`--log-opts=${BASE}..${HEAD}`);
    expect(r.calls[1]).toContain('--exit-code 1');
  });

  it('fails when the range has a finding', () => {
    const r = run(1, 1);
    expect(r.status).not.toBe(0);
  });

  it('fails without scanning when gitleaks misses the planted key', () => {
    const r = run(0);
    expect(r.status).toBe(1);
    expect(r.out).toContain('did not report a planted fake key (exit 0)');
    expect(r.calls).toEqual([expect.stringMatching(/^canary /)]);
  });

  it('fails without scanning when gitleaks errors on the canary', () => {
    const r = run(2);
    expect(r.status).toBe(1);
    expect(r.out).toContain('(exit 2)');
    expect(r.calls).toHaveLength(1);
  });

  it('plants a fresh, rule-shaped AWS key id each run', () => {
    run(1);
    const first = readFileSync(join(dir, 'canary-settings.ini'), 'utf8');
    run(1);
    const second = readFileSync(join(dir, 'canary-settings.ini'), 'utf8');
    expect(first).toMatch(/^aws_access_key_id = AKIA[A-Z2-7]{16}\n$/);
    expect(second).toMatch(/^aws_access_key_id = AKIA[A-Z2-7]{16}\n$/);
    expect(second).not.toBe(first);
  });

  it("puts the repo's .gitleaks.toml in front of the canary too", () => {
    writeFileSync(join(dir, '.gitleaks.toml'), '[allowlist]\npaths = [".*"]\n');
    run(1);
    expect(readFileSync(join(dir, 'canary-config.toml'), 'utf8')).toContain('[allowlist]');
  });
});
