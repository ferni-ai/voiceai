/**
 * #2689 ratchet: no log call carries conversation text. Two shapes are a leak:
 * - a slice of text: `.slice(...)` / `.substring(...)` / `.substr(...)` of a turn,
 *   transcript, message, reply, query or other spoken text, from any start
 *   (`text.slice(-30)` too) and through a wrapper (`String(reflection).slice(0, 50)`);
 * - a content field logged whole: a key named text, content, utterance, transcript,
 *   speech, starter or reflection (or ending in one: userText, ttsText) whose value
 *   is not a length, count or yes/no (log-guard's SHAPE).
 * Log `.length` instead. Ids (`userId.slice(0, 8)`) and error text stay allowed.
 *
 * It reads logger calls with call-log-surface-guard's reader (log-guard.ts), over
 * every production file, and counts each leaking call once. ALLOWED lists the
 * reviewed calls per file. A new one fails, and so does a count that drops (lower
 * it here).
 */
import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import { describe, expect, it } from 'vitest';
import {
  CALL,
  closing,
  logged,
  SHAPE,
} from '../../agents/voice-agent-entry/__tests__/log-guard.js';

const ROOT = join(__dirname, '..', '..', '..');
const SKIP_DIR = /^(__tests__|__mocks__|node_modules|tests|cli)$/;
const SKIP_FILE = /\.(test|spec)\.ts$|\.d\.ts$/;

/** A slice of a name, from any start, bare or wrapped: `t.slice(-30)`, `String(t).slice(0, 9)`. */
const SLICE = /([A-Za-z_$][\w$]*)\s*\)?\??\.(?:slice|substring|substr)\(/g;
/** Names that hold what someone said or what Ferni says back. */
const TEXT_NAME =
  /content|text|transcript|utterance|message|reply|response|said|speech|spoken|greeting|goodbye|opener|query|question|answer|summary|phrase|chunk|thought|input|advice|normalized|trimmed|cleaned|starter|reflection|observation|complaint|intention|guidance|statement|banter|callerline|callback|insight|sentence|belief|resolution|memory|lower/i;
const NOT_WORDS = /^(?:err|error)|(?:Id|Ids|Url|Key|Hash|Token)$/;
/** A field that holds the words themselves. */
const WHOLE_KEY =
  /^(?:text|content|utterance|transcript|speech|starter|reflection)$|(?:Text|Content|Utterance|Transcript|Speech|Starter|Reflection)$/;

/** Reviewed calls per file. Each group says why its calls may stay. */
const PENDING_2656: Record<string, number> = {
  // Held as pending Seth's call in call-log-surface-guard.test.ts EXEMPT (#2656): what the
  // caller said. Ferni's own words are out: replyForLog logs their length, never the text.
  'src/agents/integrations/better-than-human-integration.ts': 1, // resonance transcript (#2663)
  'src/agents/voice-agent/transcript-handler.ts': 1, // E2E_USER_INPUT
};
const NOT_ANYONES_WORDS: Record<string, number> = {
  'src/tools/domains/marketing/content-generator.ts': 1, // LLM marketing copy that failed to parse
  'src/services/performance/performance-metrics.ts': 1, // contextInjections: builder timings
  'src/services/experiments/hypothesis-generator.ts': 1, // marketing variant copy
  'src/services/landing-intelligence/variant-generator.ts': 1, // marketing CTA copy
  'src/config/gemini-config.ts': 1, // a fixed test prompt
  'src/speech/tts-gateway/providers/cartesia.ts': 1, // HTTP statusText
  'src/agents/shared/e2e-latency-tracker.ts': 1, // timeSinceUserSpeech: ms
  'src/agents/shared/performance/reply-audio-stage.ts': 1, // speech: a sample rate
  'src/agents/voice-agent/turn-handler.ts': 1, // hasGrowthReflection: a boolean
  'src/audio/music-transition-analytics.ts': 1, // timeToSpeech: ms
};
const ALLOWED: Record<string, number> = {
  ...PENDING_2656,
  ...NOT_ANYONES_WORDS,
};

function slicesText(call: string): boolean {
  return [...call.matchAll(SLICE)].some(
    (m) => TEXT_NAME.test(m[1] ?? '') && !NOT_WORDS.test(m[1] ?? '')
  );
}

function logsTextWhole(call: string): boolean {
  return logged(call).some(
    (v) =>
      (v.kind === 'field' || v.kind === 'interpolation') &&
      !!v.key &&
      WHOLE_KEY.test(v.key) &&
      !/^err/i.test(v.key) &&
      !SHAPE.test(v.value.trim())
  );
}

/** Line numbers of the logger calls in `source` that carry conversation text, one per call. */
export function textLeaksInLogs(source: string): number[] {
  const lines: number[] = [];
  for (const m of source.matchAll(CALL)) {
    const open = (m.index ?? 0) + m[0].length - 1;
    const call = source.slice(open, closing(source, open) + 1);
    if (slicesText(call) || logsTextWhole(call)) {
      lines.push(source.slice(0, open).split('\n').length);
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

describe('textLeaksInLogs', () => {
  it.each([
    // leading slices
    "log.debug({ role, preview: turn.content.slice(0, 40) }, 'Turn persisted');",
    "getLogger().debug({ contentPreview: content.slice(0, 50) }, 'Turn added');",
    'logger.info({ said: userTranscript?.substring(0, 30) });',
    'this.log.warn(`Heard "${text.slice(0, 50)}..."`);',
    "console.log('said', message.substr(0, 20));",
    "log.info({ q: ctx.query.slice(0, 50), n: 1 }, 'search');",
    // negative and later starts (llm-backchannel recentUserSpeech.slice(-50))
    "log.debug({ recent: context.recentUserSpeech.slice(-50) }, 'backchannel');",
    "log.info({ tail: userText.slice(-30) }, 'tail');",
    // wrapped receivers (trust-builders String(reflection).slice)
    "log.info({ r: String(reflection).slice(0, 50) }, 'reflected');",
    "log.info({ u: String(userText).slice(0, 30) }, 'wrapped');",
    // substring of a lowered utterance (contact-onboarding)
    "log.debug({ t: lower.substring(0, 50) }, 'onboarding');",
    // a content field logged whole
    "log.debug('rejected', { transcript: trimmed });",
    "logger.error({ error: String(error), text }, 'slash');",
    "log.info({ suggestedStarter: insight.suggestedConversationStarter }, 'starter');",
    "log.info({ reflection }, 'r');",
    "log.info({ utterance: u, speech: s }, 'u');",
    "log.info({ ttsText: truncateForLog(buffer, 300) }, 'tts');",
    'log.info({ content: `${memory.content}!` }, "interp");',
  ])('flags %s', (code) => {
    expect(textLeaksInLogs(code)).toEqual([1]);
  });

  it.each([
    "log.debug({ role, contentLen: turn.content.length }, 'Turn persisted');",
    "log.info({ userId: userId.slice(0, 8), key: key.slice(0, 8) }, 'hit');",
    "log.warn({ error: errorText.slice(0, 200) }, 'vendor error');",
    'const preview = content.slice(0, 40); doSomething(preview);',
    "log.info({ topics: topics.slice(0, 3) }, 'topics');",
    "log.info({ context, contentType: 'json', textLen: text.length }, 'shape');",
    "log.info({ hasText: !text, transcriptLen: t?.length ?? 0 }, 'shape');",
  ])('leaves %s alone', (code) => {
    expect(textLeaksInLogs(code)).toEqual([]);
  });
});

describe('log calls in src/ carry no conversation text (#2689)', () => {
  it('has no call outside the reviewed lists, and every listed count is exact', () => {
    const found: Record<string, number> = {};
    const where: string[] = [];
    for (const file of productionFiles(join(ROOT, 'src'))) {
      const lines = textLeaksInLogs(readFileSync(file, 'utf8'));
      if (lines.length === 0) continue;
      const rel = relative(ROOT, file);
      found[rel] = lines.length;
      if (lines.length !== ALLOWED[rel]) where.push(...lines.map((n) => `${rel}:${n}`));
    }
    for (const rel of Object.keys(ALLOWED)) {
      if (!found[rel]) where.push(`${rel}: prune from ALLOWED`);
    }
    expect(where).toEqual([]);
  });

  it('holds exactly the 2 caller-text calls call-log-surface-guard keeps pending (#2656)', () => {
    expect(Object.values(PENDING_2656).reduce((a, b) => a + b, 0)).toBe(2);
  });
});
