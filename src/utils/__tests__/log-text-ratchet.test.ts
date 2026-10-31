/**
 * #2689 ratchet: no log call slices conversation text into its record. A
 * `.slice(0, n)` / `.substring(0, n)` / `.substr(0, n)` of a turn, transcript,
 * message, reply, query or other spoken text inside a logger or console call is
 * the leak (`preview: turn.content.slice(0, 40)`): log `.length` instead.
 * Ids (`userId.slice(0, 8)`) and error text are not caller words and stay allowed.
 *
 * It reads logger calls with call-log-surface-guard's reader (log-guard.ts), over
 * every production file. ALLOWED lists reviewed sites: text that is not anyone's
 * words, and the calls that guard holds as pending Seth's call. A new site fails,
 * and so does an allowed count that drops (lower it here).
 */
import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import { describe, expect, it } from 'vitest';
import { CALL, closing } from '../../agents/voice-agent-entry/__tests__/log-guard.js';

const ROOT = join(__dirname, '..', '..', '..');
const SKIP_DIR = /^(__tests__|__mocks__|node_modules|tests|cli)$/;
const SKIP_FILE = /\.(test|spec)\.ts$|\.d\.ts$/;

/** A leading slice of an expression: `turn.content.slice(0,`, `text?.substring(0,`. */
const LEADING_SLICE = /([A-Za-z_$][\w$]*)\??\.(?:slice|substring|substr)\(\s*0\s*,/g;
/** Names that hold what someone said or what Ferni says back. */
const TEXT_NAME =
  /content|text|transcript|utterance|message|reply|response|said|speech|spoken|greeting|goodbye|opener|query|question|answer|summary|phrase|chunk|thought|input|advice|normalized|trimmed|cleaned/i;
const NOT_WORDS = /^(?:err|error)/i;

/** Reviewed sites, file → count: text that is not anyone's words, or a call held as pending. */
const ALLOWED: Record<string, number> = {
  // LLM-written marketing copy that failed to parse; no caller data reaches it.
  'src/tools/domains/marketing/content-generator.ts': 1,
  // An array of context-builder timings (contextInjections), not text.
  'src/services/performance/performance-metrics.ts': 1,
  // Held as pending Seth's call in call-log-surface-guard.test.ts EXEMPT (#2656): the call
  // reviewer reads what the caller said (E2E_USER_INPUT) and Ferni's words (E2E_TTS_OUTPUT).
  'src/agents/integrations/better-than-human-integration.ts': 1,
  'src/agents/multi-agent/agent-setup.ts': 3,
  'src/agents/multi-agent/orchestrator.ts': 6,
  'src/agents/shared/tts-wrapper.ts': 4,
  'src/agents/voice-agent/transcript-handler.ts': 4,
};

/** The argument text of each logger call in `source` (the reader call-log-surface-guard uses). */
export function logCallArgs(source: string): Array<{ at: number; args: string }> {
  const calls: Array<{ at: number; args: string }> = [];
  for (const m of source.matchAll(CALL)) {
    const open = (m.index ?? 0) + m[0].length - 1;
    calls.push({ at: open + 1, args: source.slice(open + 1, closing(source, open)) });
  }
  return calls;
}

/** Line numbers of log calls in `source` that slice conversation text. */
export function textSlicesInLogs(source: string): number[] {
  const lines: number[] = [];
  for (const { at, args } of logCallArgs(source)) {
    for (const m of args.matchAll(LEADING_SLICE)) {
      const name = m[1] ?? '';
      if (!TEXT_NAME.test(name) || NOT_WORDS.test(name)) continue;
      lines.push(source.slice(0, at + (m.index ?? 0)).split('\n').length);
    }
  }
  return lines;
}

function productionFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIR.test(entry.name)) productionFiles(join(dir, entry.name), out);
    } else if (entry.name.endsWith('.ts') && !SKIP_FILE.test(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

describe('textSlicesInLogs', () => {
  it.each([
    "log.debug({ role, preview: turn.content.slice(0, 40) }, 'Turn persisted');",
    "getLogger().debug({ contentPreview: content.slice(0, 50) }, 'Turn added');",
    'logger.info({ transcript: userTranscript?.substring(0, 30) });',
    'this.log.warn(`Heard "${text.slice(0, 50)}..."`);',
    "console.log('said', message.substr(0, 20));",
    "log.info({ q: ctx.query.slice(0, 50), n: 1 }, 'search');",
  ])('flags %s', (code) => {
    expect(textSlicesInLogs(code)).toEqual([1]);
  });

  it.each([
    "log.debug({ role, contentLen: turn.content.length }, 'Turn persisted');",
    "log.info({ userId: userId.slice(0, 8), key: key.slice(0, 8) }, 'hit');",
    "log.warn({ error: errorText.slice(0, 200) }, 'vendor error');",
    'const preview = content.slice(0, 40); doSomething(preview);',
    "log.info({ topics: topics.slice(0, 3) }, 'topics');",
  ])('leaves %s alone', (code) => {
    expect(textSlicesInLogs(code)).toEqual([]);
  });
});

describe('log calls in src/ slice no conversation text (#2689)', () => {
  it('has no site outside the reviewed list, and every listed site still exists', () => {
    const found: Record<string, number> = {};
    const where: string[] = [];
    for (const file of productionFiles(join(ROOT, 'src'))) {
      const lines = textSlicesInLogs(readFileSync(file, 'utf8'));
      if (lines.length === 0) continue;
      const rel = relative(ROOT, file);
      found[rel] = lines.length;
      if (lines.length !== ALLOWED[rel]) where.push(...lines.map((n) => `${rel}:${n}`));
    }
    // A listed file whose sites are all gone: prune it from ALLOWED.
    for (const rel of Object.keys(ALLOWED))
      if (!found[rel]) where.push(`${rel}: prune from ALLOWED`);
    expect(where).toEqual([]);
  });
});
