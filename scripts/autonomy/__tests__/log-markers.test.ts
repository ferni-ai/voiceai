/**
 * The call miner (ferni-call-reviewer) finds calls, turns and crisis or minor
 * moments by matching these log messages in Cloud Logging. A renamed message
 * fails no build and throws no error: the miner just goes blind. This test makes
 * the rename fail CI instead. Each marker must still sit inside an emitting call
 * in its emitter file: a logger call, a stderr write, or the return of a helper
 * that builds the logged line. A copy left in a comment does not count. Markers
 * in the `external` group come from the LiveKit SDK, outside this repo, so only
 * their presence in the contract is checked.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

interface LogMarker {
  marker: string;
  emitter: string;
}

interface LogMarkerContract {
  version: number;
  groups: Record<string, LogMarker[]>;
}

const REPO_ROOT = join(__dirname, '..', '..', '..');
const GROUPS = ['session', 'turn', 'minor', 'crisis', 'external'];
const EXTERNAL_EMITTER = 'livekit-sdk';

const contract = JSON.parse(
  readFileSync(join(__dirname, '..', 'log-markers.json'), 'utf8')
) as LogMarkerContract;

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Source with block comments and whole-line comments removed. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/**
 * True when the marker is in a logger call (log.info, diag.tool, the GCE
 * worker's bare log()) or a stderr write, or in a string expression a
 * line-builder returns (startup-log.ts builds the job-metadata line that way).
 * Word-bounded: the miner matches some markers as the whole message.
 */
function isEmittedIn(source: string, marker: string): boolean {
  const bounded = `(?<!\\w)${escapeRegExp(marker)}(?!\\w)`;
  const inCall = new RegExp(
    `(\\.(info|warn|error|debug|tool|session|write)|\\blog)\\([^;]*${bounded}`
  );
  const returnedLine = new RegExp(`\\breturn\\s*\\(?\\s*['"\`][^;]*${bounded}`);
  const code = withoutComments(source);
  return inCall.test(code) || returnedLine.test(code);
}

describe('log-marker contract', () => {
  it('has version 1 and the four groups the miner reads', () => {
    expect(contract.version).toBe(1);
    expect(Object.keys(contract.groups).sort()).toEqual([...GROUPS].sort());
    for (const group of GROUPS) expect(contract.groups[group].length).toBeGreaterThan(0);
  });

  it('matches a marker in a logger call but not in a comment', () => {
    expect(isEmittedIn("log.info({ sessionId }, 'REPLY_GAP');", 'REPLY_GAP')).toBe(true);
    expect(isEmittedIn('// One REPLY_GAP line per turn\nlog.info({}, "other");', 'REPLY_GAP')).toBe(
      false
    );
    expect(isEmittedIn("const kind = 'REPLY_GAP';", 'REPLY_GAP')).toBe(false);
    // The miner matches TURN_RECEIPT etc. as the whole message, so a longer name is a rename.
    expect(isEmittedIn("log.info({}, 'REPLY_GAPS');", 'REPLY_GAP')).toBe(false);
    expect(isEmittedIn('return `REPLY_GAP = ${ms}`;', 'REPLY_GAP')).toBe(true);
    expect(isEmittedIn("return build({ event: 'REPLY_GAP' });", 'REPLY_GAP')).toBe(false);
    expect(isEmittedIn('return (\n  `head\n` +\n  `REPLY_GAP: ${ms}\n`\n);', 'REPLY_GAP')).toBe(
      true
    );
    expect(isEmittedIn("log('REPLY_GAP', { ms });", 'REPLY_GAP')).toBe(true);
    expect(isEmittedIn("diag.tool('REPLY_GAP', {});", 'REPLY_GAP')).toBe(true);
  });

  it('names the LiveKit SDK as the emitter of every external marker, and only those', () => {
    for (const [group, markers] of Object.entries(contract.groups)) {
      for (const { emitter } of markers) {
        expect(emitter === EXTERNAL_EMITTER, `${group}: ${emitter}`).toBe(group === 'external');
      }
    }
  });

  const entries = Object.entries(contract.groups)
    .filter(([group]) => group !== 'external')
    .flatMap(([group, markers]) => markers.map((entry) => ({ group, ...entry })));

  it.each(entries)(
    'every miner marker is still emitted by its emitter: $group "$marker"',
    ({ marker, emitter }) => {
      const path = join(REPO_ROOT, emitter);
      expect(existsSync(path), `${emitter} is missing`).toBe(true);
      expect(
        isEmittedIn(readFileSync(path, 'utf8'), marker),
        `${emitter} no longer emits "${marker}"; update the call miner and log-markers.json together`
      ).toBe(true);
    }
  );
});
