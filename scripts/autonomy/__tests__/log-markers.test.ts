/**
 * The call miner (ferni-call-reviewer) finds calls, turns and crisis or minor
 * moments by matching these log messages in Cloud Logging. A renamed message
 * fails no build and throws no error: the miner just goes blind. This test makes
 * the rename fail CI instead. Each marker must still sit inside a logger call or
 * stderr write in its emitter file; a copy left in a comment does not count.
 *
 * Some lines are built by a helper and written elsewhere (startup-log.ts builds
 * the job-metadata line, metadata-parser.ts writes it). Their entry names the
 * helper and the writing file in `via`: the helper must return the marker, and
 * the writing file must still pass the helper's result to a write or logger call.
 *
 * Markers in the `external` group come from the LiveKit SDK, outside this repo,
 * so only their presence in the contract is checked.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

interface LogMarker {
  marker: string;
  emitter: string;
  /** For a line a helper builds: the file that writes it and the helper's name. */
  via?: { file: string; helper: string };
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

/** Word-bounded: the miner matches some markers as the whole message. */
const bounded = (marker: string): string => `(?<!\\w)${escapeRegExp(marker)}(?!\\w)`;

/**
 * A logger call (log.info, diag.tool, the GCE worker's bare log()) or a write
 * (process.stderr.write, or an injected write()) whose arguments match `pattern`.
 */
const inWriteOrLogCall = (pattern: string): RegExp =>
  new RegExp(`(\\.(info|warn|error|debug|tool|session|write)|\\b(log|write))\\([^;]*${pattern}`);

function isEmittedIn(source: string, marker: string): boolean {
  return inWriteOrLogCall(bounded(marker)).test(withoutComments(source));
}

/** True when `helper`'s body returns a string expression containing the marker. */
function isReturnedBy(source: string, helper: string, marker: string): boolean {
  const body = new RegExp(`function\\s+${escapeRegExp(helper)}\\s*\\([\\s\\S]*?\\n}`).exec(
    withoutComments(source)
  );
  if (!body) return false;
  return new RegExp(`\\breturn\\s*\\(?\\s*['"\`][^;]*${bounded(marker)}`).test(body[0]);
}

/** True when the helper's result goes straight into a write or logger call. */
const isHelperWrittenIn = (source: string, helper: string): boolean =>
  inWriteOrLogCall(`(?<![\\w.])${escapeRegExp(helper)}\\(`).test(withoutComments(source));

const read = (file: string): string => {
  const path = join(REPO_ROOT, file);
  expect(existsSync(path), `${file} is missing`).toBe(true);
  return readFileSync(path, 'utf8');
};

describe('log-marker contract', () => {
  it('has version 1 and the groups the miner reads', () => {
    expect(contract.version).toBe(1);
    expect(Object.keys(contract.groups).sort()).toEqual([...GROUPS].sort());
    for (const group of GROUPS) expect(contract.groups[group].length).toBeGreaterThan(0);
  });

  it('matches a marker in a logger call or write, but not in a comment or a bare string', () => {
    expect(isEmittedIn("log.info({ sessionId }, 'REPLY_GAP');", 'REPLY_GAP')).toBe(true);
    expect(isEmittedIn('// One REPLY_GAP line per turn\nlog.info({}, "other");', 'REPLY_GAP')).toBe(
      false
    );
    expect(isEmittedIn("const kind = 'REPLY_GAP';", 'REPLY_GAP')).toBe(false);
    // The miner matches TURN_RECEIPT etc. as the whole message, so a longer name is a rename.
    expect(isEmittedIn("log.info({}, 'REPLY_GAPS');", 'REPLY_GAP')).toBe(false);
    expect(isEmittedIn('return `REPLY_GAP = ${ms}`;', 'REPLY_GAP')).toBe(false);
    expect(isEmittedIn("log('REPLY_GAP', { ms });", 'REPLY_GAP')).toBe(true);
    expect(isEmittedIn("diag.tool('REPLY_GAP', {});", 'REPLY_GAP')).toBe(true);
  });

  it('checks a helper-built line at both ends: the helper returns it, a call writes it', () => {
    const helper =
      'function gapLine(ms) {\n  return (\n    `head\\n` +\n    `REPLY_GAP: ${ms}\\n`\n  );\n}';
    expect(isReturnedBy(helper, 'gapLine', 'REPLY_GAP')).toBe(true);
    expect(isReturnedBy(helper, 'otherLine', 'REPLY_GAP')).toBe(false);
    expect(
      isReturnedBy(
        'function gapLine() {\n  return build({ e: "REPLY_GAP" });\n}',
        'gapLine',
        'REPLY_GAP'
      )
    ).toBe(false);
    expect(isHelperWrittenIn('process.stderr.write(gapLine(ms));', 'gapLine')).toBe(true);
    expect(isHelperWrittenIn("add('x', (e) => write(gapLine(e)));", 'gapLine')).toBe(true);
    expect(
      isHelperWrittenIn("import { gapLine } from './gap.js';\nconst s = gapLine(1);", 'gapLine')
    ).toBe(false);
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
    ({ marker, emitter, via }) => {
      const source = read(emitter);
      const fix = 'update the call miner and log-markers.json together';
      if (!via) {
        expect(isEmittedIn(source, marker), `${emitter} no longer emits "${marker}"; ${fix}`).toBe(
          true
        );
        return;
      }
      expect(
        isReturnedBy(source, via.helper, marker),
        `${via.helper}() in ${emitter} no longer returns "${marker}"; ${fix}`
      ).toBe(true);
      expect(
        isHelperWrittenIn(read(via.file), via.helper),
        `${via.file} no longer writes ${via.helper}()'s line; ${fix}`
      ).toBe(true);
    }
  );
});
