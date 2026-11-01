/**
 * The call miner (ferni-call-reviewer) finds calls, turns and crisis or minor
 * moments by matching these log messages in Cloud Logging. A renamed message
 * fails no build and throws no error: the miner just goes blind. This test makes
 * the rename fail CI instead.
 *
 * Each row pins `count`: how many times its emitter puts the marker inside a
 * logger call, a write, or a call to one of the row's `wrappers` (local
 * functions that log their argument, like minor-care.ts's hold()). Renaming or
 * deleting any one of those sites changes the count. Copies in comments and in
 * other code don't count.
 *
 * Some lines are built by a helper and written elsewhere (startup-log.ts builds
 * the job-metadata line, metadata-parser.ts writes it). Their row names the
 * helper and the writing file in `via`: `count` is then how many of the helper's
 * returned strings carry the marker, and the writing file must still pass the
 * helper's result to a write or logger call.
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
  /** Emitting sites in the emitter (or returned strings in `via.helper`). */
  count?: number;
  /** Local functions in the emitter that log their argument. */
  wrappers?: string[];
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
 * Opens a logger call (log.info, diag.tool, the GCE worker's bare log()), a
 * write (process.stderr.write, or an injected write()) or a call to a wrapper.
 */
const callOpener = (wrappers: string[] = []): string =>
  `(\\.(info|warn|error|debug|tool|session|write)|(?<![\\w.])(${['log', 'write', ...wrappers]
    .map(escapeRegExp)
    .join('|')}))\\(`;

const RETURNED_STRING = `\\breturn\\s*\\(?\\s*['"\`]`;

/** Occurrences of the marker whose statement, up to the marker, opens with `opener`. */
function sitesAfter(code: string, marker: string, opener: string): number {
  const open = new RegExp(opener);
  return [...code.matchAll(new RegExp(bounded(marker), 'g'))].filter(({ index }) =>
    open.test(code.slice(code.lastIndexOf(';', index) + 1, index))
  ).length;
}

function emittingSites(source: string, marker: string, wrappers: string[] = []): number {
  return sitesAfter(withoutComments(source), marker, callOpener(wrappers));
}

/** A top-level function's parameter names and its source up to its closing brace. */
function functionNamed(source: string, name: string): { params: string[]; body: string } | null {
  const match = new RegExp(
    `function\\s+${escapeRegExp(name)}\\s*\\(([^)]*)\\)[^{]*\\{[\\s\\S]*?\\n}`
  ).exec(withoutComments(source));
  if (!match) return null;
  const params = match[1]
    .split(',')
    .map((param) => param.split(/[:=?]/)[0].trim())
    .filter(Boolean);
  return { params, body: match[0] };
}

/** True when the wrapper passes one of its parameters as a logger call's message. */
function logsItsArgument(source: string, wrapper: string): boolean {
  const fn = functionNamed(source, wrapper);
  if (!fn) return false;
  return fn.params.some((param) =>
    new RegExp(`${callOpener()}[^;]*[(,]\\s*${escapeRegExp(param)}\\s*\\)`).test(fn.body)
  );
}

/** How many of the helper's returned strings carry the marker; -1 when there is no helper. */
function returnedSites(source: string, helper: string, marker: string): number {
  const fn = functionNamed(source, helper);
  return fn ? sitesAfter(fn.body, marker, RETURNED_STRING) : -1;
}

/** True when the helper's result goes straight into a write or logger call. */
const isHelperWrittenIn = (source: string, helper: string): boolean =>
  new RegExp(`${callOpener()}[^;]*(?<![\\w.])${escapeRegExp(helper)}\\(`).test(
    withoutComments(source)
  );

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

  it('counts a marker in a logger call or write, not in a comment or other code', () => {
    expect(emittingSites("log.info({ sessionId }, 'REPLY_GAP');", 'REPLY_GAP')).toBe(1);
    expect(
      emittingSites('// One REPLY_GAP line per turn\nlog.info({}, "other");', 'REPLY_GAP')
    ).toBe(0);
    expect(emittingSites("const kind = 'REPLY_GAP';", 'REPLY_GAP')).toBe(0);
    // The miner matches TURN_RECEIPT etc. as the whole message, so a longer name is a rename.
    expect(emittingSites("log.info({}, 'REPLY_GAPS');", 'REPLY_GAP')).toBe(0);
    expect(emittingSites('return `REPLY_GAP = ${ms}`;', 'REPLY_GAP')).toBe(0);
    expect(emittingSites("log('REPLY_GAP', { ms });", 'REPLY_GAP')).toBe(1);
    expect(emittingSites("diag.tool('REPLY_GAP', {});", 'REPLY_GAP')).toBe(1);
    const twoSites =
      "log.info({}, 'REPLY_GAP');\nconst e = 'REPLY_GAP';\nlog.warn({}, 'REPLY_GAP');";
    expect(emittingSites(twoSites, 'REPLY_GAP')).toBe(2);
  });

  it('counts a call to a declared wrapper, and checks the wrapper logs its argument', () => {
    const source =
      "function hold(id: string, why: string): void {\n  log.info({ id }, why);\n}\nhold(id, 'REPLY_GAP');";
    expect(emittingSites(source, 'REPLY_GAP')).toBe(0);
    expect(emittingSites(source, 'REPLY_GAP', ['hold'])).toBe(1);
    expect(logsItsArgument(source, 'hold')).toBe(true);
    expect(logsItsArgument(source.replace('}, why)', "}, 'held')"), 'hold')).toBe(false);
    expect(logsItsArgument(source, 'release')).toBe(false);
  });

  it('checks a helper-built line at both ends: the helper returns it, a call writes it', () => {
    const helper =
      'function gapLine(ms) {\n  if (!ms) return `REPLY_GAP: none`;\n  return (\n    `head\\n` +\n    `REPLY_GAP: ${ms}\\n`\n  );\n}';
    expect(returnedSites(helper, 'gapLine', 'REPLY_GAP')).toBe(2);
    expect(returnedSites(helper, 'otherLine', 'REPLY_GAP')).toBe(-1);
    expect(
      returnedSites(
        'function gapLine() {\n  return build({ e: "REPLY_GAP" });\n}',
        'gapLine',
        'REPLY_GAP'
      )
    ).toBe(0);
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
    ({ marker, emitter, count, wrappers = [], via }) => {
      const source = read(emitter);
      const fix = 'update the call miner and log-markers.json together';
      expect(Number.isInteger(count) && count! >= 1, `"${marker}" needs a count >= 1`).toBe(true);
      for (const wrapper of wrappers) {
        expect(
          logsItsArgument(source, wrapper),
          `${wrapper}() in ${emitter} no longer logs its argument; ${fix}`
        ).toBe(true);
      }
      if (!via) {
        expect(
          emittingSites(source, marker, wrappers),
          `${emitter} emits "${marker}" a different number of times; ${fix}`
        ).toBe(count);
        return;
      }
      expect(
        returnedSites(source, via.helper, marker),
        `${via.helper}() in ${emitter} returns "${marker}" a different number of times; ${fix}`
      ).toBe(count);
      expect(
        isHelperWrittenIn(read(via.file), via.helper),
        `${via.file} no longer writes ${via.helper}()'s line; ${fix}`
      ).toBe(true);
    }
  );
});
