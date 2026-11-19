/**
 * Guard: the installed LiveKit SDK (and the plugins we install) log personal text only
 * under keys that log-pii-key-redaction.ts turns into lengths. Scans every .js and .cjs
 * file of each package's dist. A later SDK version that logs text under another key
 * (or a pii key the predicate misses) turns this red: that is a finding to review, not
 * a key to add here.
 *
 * Lines our own pnpm patches add are left out: their text keys are those patches' job.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';

import { log } from '@livekit/agents';
import { beforeAll, describe, expect, it } from 'vitest';

import { initializeSdkLogger } from '../../agents/gce/sdk-logger-options.js';

const PACKAGES = [
  '@livekit/agents',
  '@livekit/agents-plugin-google',
  '@livekit/agents-plugin-cartesia',
  '@livekit/agents-plugin-openai',
  '@livekit/agents-plugin-silero',
];
const require = createRequire(import.meta.url);
const repoRoot = join(dirname(require.resolve('../../../package.json')));

/** A logger call or child: logger.info(, this.#logger.warn(, log().child( ... */
const LOGGER_CALL =
  /(?:\blogger|\blog\(\)|#logger|_logger)\s*\.\s*(trace|debug|info|warn|error|fatal|child)\s*\(/g;
/** Key names that hold what someone said or a model wrote. */
const TEXT_KEY =
  /transcript|utterance|user_?input|spoken|said|(?:^|_)text|text$|content$|^message$|arguments|^args$|^output$|^input$|response$|prompt|instructions|chat_?ctx|reply|words$/i;
/** ...unless the name says it is a count, a flag, a kind, a time or an id. */
const NOT_TEXT =
  /^(?:num|min|max|is|has)[A-Z_]|(?:count|type|ms|tokens?|confidence|delay|id|len(?:gth)?|chars|size|done)$/i;
/** Keys read one by one and found not to hold anyone's words. */
const REVIEWED: Record<string, string> = {
  cachedContent: 'agents-plugin-google llm: the resource name of a Gemini context cache',
};
/** A string that could be a log key with a pii part (env names and enums are all caps). */
const PII_LIKE = /^lk[._]|[._]pii|pii[._]/i;

const PROBE = 'probe words for the guard';
const probed = new Map<string, boolean>();

/**
 * Whether the real SDK logger, started as on a prod process, logs a value under `key`
 * as its length. The redaction's own predicate, asked the way production asks it.
 */
function isPiiLogKey(key: string): boolean {
  const k = key.replace(/\$\{[^}]*\}/g, 'x'); // a template key: `lk.pii.${name}`
  const known = probed.get(k);
  if (known !== undefined) return known;
  const realWrite = process.stdout.write;
  let out = '';
  process.stdout.write = ((chunk: string | Uint8Array) => {
    out += String(chunk);
    return true;
  }) as typeof process.stdout.write;
  try {
    log().info({ [k]: PROBE }, 'guard probe');
  } finally {
    process.stdout.write = realWrite;
  }
  const covered = !out.includes(PROBE) && out.includes(`[${PROBE.length} chars]`);
  probed.set(k, covered);
  return covered;
}

function packageDist(name: string): string {
  let dir = dirname(require.resolve(name));
  while (!existsSync(join(dir, 'package.json'))) dir = dirname(dir);
  return join(dir, 'dist');
}

function distFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...distFiles(p));
    else if (/\.c?js$/.test(e.name)) out.push(p);
  }
  return out;
}

function patchAddedLines(): Set<string> {
  const dir = join(repoRoot, 'patches');
  const added = new Set<string>();
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.patch'))) {
    for (const line of readFileSync(join(dir, f), 'utf8').split('\n')) {
      if (line.startsWith('+') && !line.startsWith('+++')) added.add(line.slice(1).trim());
    }
  }
  return added;
}

/** The object literal right after a call's "(", balanced on braces; '' when there is none. */
function objectArg(src: string, from: number): { text: string; start: number } {
  let i = from;
  while (/\s/.test(src[i] ?? '')) i++;
  if (src[i] !== '{') return { text: '', start: i };
  let depth = 0;
  for (let k = i; k < src.length && k < i + 4000; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}' && --depth === 0) return { text: src.slice(i, k + 1), start: i };
  }
  return { text: '', start: i };
}

/** Keys of an object literal at any depth: quoted, bare, shorthand, and [computed]. */
interface LiteralKey {
  key: string;
  at: number;
  computed: boolean;
}

function literalKeys(obj: string): LiteralKey[] {
  const keys: LiteralKey[] = [];
  const KEY = /(?:^|[{,])\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z_$][\w$]*)|\[([^\]]+)\])\s*(?=[:,}])/g;
  for (const m of obj.matchAll(KEY)) {
    keys.push({ key: m[1] ?? m[2] ?? m[3] ?? m[4], at: m.index, computed: m[4] !== undefined });
  }
  return keys;
}

interface Scan {
  piiKeys: Map<string, Set<string>>;
  findings: string[];
  calls: number;
  files: number;
  patchSkipped: number;
}

function scan(): Scan {
  const added = patchAddedLines();
  const s: Scan = { piiKeys: new Map(), findings: [], calls: 0, files: 0, patchSkipped: 0 };
  for (const pkg of PACKAGES) {
    const dist = packageDist(pkg);
    for (const file of distFiles(dist)) {
      s.files++;
      if (/\.test\.c?js$/.test(file)) continue; // the SDK's own tests: keys there are test data
      const src = readFileSync(file, 'utf8');
      const where = (at: number) =>
        `${pkg}/${relative(dist, file)}:${src.slice(0, at).split('\n').length}`;
      const lineAt = (at: number) =>
        src.slice(src.lastIndexOf('\n', at) + 1, src.indexOf('\n', at)).trim();
      for (const m of src.matchAll(/["'`]((?:[\w$.{}-])*pii(?:[\w$.{}-])*)["'`]/gi)) {
        if (isPiiLogKey(m[1])) {
          const files = s.piiKeys.get(m[1]) ?? new Set<string>();
          files.add(`${pkg}/${relative(dist, file)}`);
          s.piiKeys.set(m[1], files);
        } else if (PII_LIKE.test(m[1]) && !/^[A-Z0-9_]+$/.test(m[1])) {
          s.findings.push(`${where(m.index)} pii-like key the redaction does not match: "${m[1]}"`);
        }
      }
      for (const call of src.matchAll(LOGGER_CALL)) {
        s.calls++;
        const obj = objectArg(src, call.index + call[0].length);
        for (const { key, at, computed } of literalKeys(obj.text)) {
          const pos = obj.start + at;
          if (added.has(lineAt(pos))) {
            s.patchSkipped++;
            continue;
          }
          const level = call[1];
          if (computed) s.findings.push(`${where(pos)} ${level}: computed key [${key}]`);
          else if (isPiiLogKey(key)) continue;
          else if (/pii/i.test(key))
            s.findings.push(`${where(pos)} ${level}: pii-like key "${key}" not matched`);
          else if (key.startsWith('gen_ai.'))
            s.findings.push(`${where(pos)} ${level}: gen_ai key "${key}"`);
          else if (TEXT_KEY.test(key) && !NOT_TEXT.test(key) && !(key in REVIEWED)) {
            s.findings.push(`${where(pos)} ${level}: text under "${key}", not a pii key`);
          }
        }
      }
    }
  }
  return s;
}

describe('the installed SDK logs personal text only under keys the redaction covers', () => {
  let result: Scan;
  beforeAll(() => {
    initializeSdkLogger({ NODE_ENV: 'production' }); // no FIRESTORE_DATABASE: prod
    result = scan();
  });

  it('scans both twins of every file and finds the pii keys', () => {
    const keys = [...result.piiKeys.keys()].sort();
    // printed for the reviewer: every pii key in the installed dist, outside its tests
    process.stdout.write(
      `${result.files} files, ${result.calls} logger calls, ${result.patchSkipped} keys on patch lines\n` +
        `${keys.map((k) => `  ${k}  (${result.piiKeys.get(k)?.size} files)`).join('\n')}\n`
    );
    expect(result.calls).toBeGreaterThan(500);
    expect(keys).toContain('lk.pii.user_input');
    expect(keys).toContain('lk.pii.message');
    const agentFiles = [...(result.piiKeys.get('lk.pii.user_input') ?? [])];
    expect(agentFiles.some((f) => f.endsWith('agent_activity.js'))).toBe(true);
    expect(agentFiles.some((f) => f.endsWith('agent_activity.cjs'))).toBe(true);
  });

  it('finds no logger key with text the redaction would not cover', () => {
    expect(result.findings).toEqual([]);
  });
});
