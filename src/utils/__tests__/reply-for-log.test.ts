/**
 * Words in a log line are a length everywhere but dev. A dev process (dev's Firestore
 * database, by its exact name) logs them, cut at a limit that LOG_FULL_RESPONSES lifts. "Dev"
 * is the database, not NODE_ENV: the agent image runs NODE_ENV=production on dev too
 * (docker/Dockerfile.agent). A name that is neither prod's nor dev's is not dev.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  isFullLoggingEnabled,
  repliesForLog,
  replyForLog,
  truncateForLog,
} from '../safe-logger.js';

vi.unmock('../safe-logger.js');

const TEXT = 'Hey Sam, how did the call with your sister go?';
const ROOT = join(__dirname, '..', '..', '..');

const as = (env: Record<string, string>) => {
  vi.unstubAllEnvs();
  for (const key of ['FIRESTORE_DATABASE', 'LOG_FULL_RESPONSES', 'NODE_ENV']) {
    vi.stubEnv(key, env[key] ?? '');
  }
};

afterEach(() => vi.unstubAllEnvs());

describe('replyForLog', () => {
  const long = 'x'.repeat(400);

  it('logs only the length when nothing is set (prod)', () => {
    as({ NODE_ENV: 'production' });
    expect(replyForLog(TEXT)).toBe(`[${TEXT.length} chars]`);
  });

  it('LOG_FULL_RESPONSES does not bring the text back on prod, set or not set', () => {
    for (const FIRESTORE_DATABASE of ['', '(default)']) {
      as({ NODE_ENV: 'production', LOG_FULL_RESPONSES: 'true', FIRESTORE_DATABASE });
      expect(replyForLog(TEXT)).toBe(`[${TEXT.length} chars]`);
      expect(isFullLoggingEnabled()).toBe(false);
      expect(truncateForLog(long, 50)).toBe(`${'x'.repeat(50)}...`);
    }
  });

  // A prod process whose FIRESTORE_DATABASE is wrong must not start logging what callers say.
  it.each([
    ['a single space', ' '],
    ["prod's name with space around it", ' (default)\n'],
    ["prod's name in another case", '(Default)'],
    ["prod's name without its brackets", 'default'],
    ["dev's name in another case", 'Ferni-Dev'],
    ["dev's name misspelt", 'ferni-dve'],
    ["a longer name that starts with dev's", 'ferni-dev-2'],
    ['a name that says prod', 'ferni-prod'],
  ])('logs only the length on %s, with LOG_FULL_RESPONSES set', (_name, FIRESTORE_DATABASE) => {
    as({ NODE_ENV: 'production', LOG_FULL_RESPONSES: 'true', FIRESTORE_DATABASE });
    expect(replyForLog(TEXT)).toBe(`[${TEXT.length} chars]`);
    expect(repliesForLog([TEXT])).toEqual([`[${TEXT.length} chars]`]);
    expect(isFullLoggingEnabled()).toBe(false);
  });

  it("gives the text on dev's name with space around it", () => {
    as({ NODE_ENV: 'production', FIRESTORE_DATABASE: ' ferni-dev\n' });
    expect(replyForLog(TEXT)).toBe(TEXT);
  });

  it('gives the text on dev, cut at the limit, whatever NODE_ENV says', () => {
    for (const NODE_ENV of ['production', 'staging', 'development']) {
      as({ NODE_ENV, FIRESTORE_DATABASE: 'ferni-dev' });
      expect(replyForLog(TEXT)).toBe(TEXT);
      expect(replyForLog(long)).toBe(`${'x'.repeat(300)}...`);
      expect(replyForLog(long, 500)).toBe(long);
    }
  });

  it('LOG_FULL_RESPONSES lifts the cut on dev', () => {
    as({ NODE_ENV: 'production', LOG_FULL_RESPONSES: 'true', FIRESTORE_DATABASE: 'ferni-dev' });
    expect(replyForLog(long)).toBe(long);
    expect(isFullLoggingEnabled()).toBe(true);
  });

  it('says 0 chars for an empty or missing reply', () => {
    as({});
    expect(replyForLog('')).toBe('[0 chars]');
    expect(replyForLog(undefined)).toBe('[0 chars]');
  });
});

describe('repliesForLog', () => {
  it('cuts each match the same way: a length on prod, the text on dev', () => {
    as({ NODE_ENV: 'production', LOG_FULL_RESPONSES: 'true' });
    expect(repliesForLog(['abc', 'de'])).toEqual(['[3 chars]', '[2 chars]']);
    as({ FIRESTORE_DATABASE: 'ferni-dev' });
    expect(repliesForLog(['abc', 'x'.repeat(60)], 50)).toEqual(['abc', `${'x'.repeat(50)}...`]);
  });
});

describe('the reply-text log lines use it', () => {
  const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

  it.each([
    'src/agents/shared/tts-wrapper.ts',
    'src/speech/tts-gateway/gateway-tts-node.ts',
    'src/speech/tts-gateway/gateway.ts',
    'src/speech/tts-gateway/index.ts',
    'src/speech/coordination/speech-coordinator.ts',
  ])('%s logs no reply text through truncateForLog', (rel) => {
    expect(read(rel)).not.toMatch(/truncateForLog\(/);
  });

  it('the leaked tool-call blocks in the SSML processor log through repliesForLog', () => {
    const src = read('src/speech/tts-gateway/ssml/processor.ts');
    expect(src).not.toMatch(/\.map\(\(\w\) => \w\.slice\(/);
    expect(src.match(/repliesForLog\(/g)).toHaveLength(6);
  });

  it("the crash record keeps Ferni's last message as a length", () => {
    expect(read('src/agents/shared/crash-analytics.ts')).toContain(
      'lastAgentMessage: replyForLog(messages?.lastAgentMessage, 200),'
    );
  });

  it('the handoff goodbye and greeting, and the Gemini event dumps, carry no raw text', () => {
    const adapter = read('src/agents/shared/handoff/coordinator-adapter.ts');
    expect(adapter).toContain('goodbye: replyForLog(finalGoodbye),');
    expect(adapter).toContain('greeting: replyForLog(finalGreeting),');
    const gemini = read('src/agents/model-provider/gemini-live.ts');
    expect(gemini).toContain('const truncated = replyForLog(eventStr, 2000);');
    expect(read('src/agents/multi-agent/agent-setup.ts')).toContain('${replyForLog(evt.delta)}');
  });

  it('E2E_LLM_OUTPUT and E2E_TTS_OUTPUT carry replyForLog, not the buffer', () => {
    const src = read('src/agents/shared/tts-wrapper.ts');
    expect(src).toContain('rawOutput: replyForLog(rawLLMBuffer, 500),');
    expect(src).toContain('ttsText: replyForLog(ttsOutputBuffer),');
    expect(src).not.toMatch(/rawOutput: (?!replyForLog)/);
    expect(src).not.toMatch(/ttsText: (?!replyForLog)/);
  });
});

/**
 * Calls to replyForLog/repliesForLog, per file (syntax tree: a comment or string that mentions
 * one does not count). A file below its floor has lost a wrap, i.e. a raw field is back in a
 * log call: log-text-ratchet only sees slices, not a bare `{ text }`. Raise a floor when a site
 * is added; lower one only when the site is deleted.
 */
const WRAPPED_CALLS: Record<string, number> = {
  'src/agents/integrations/live-backchanneling-integration.ts': 1,
  'src/agents/integrations/slow-turn-sound.ts': 1,
  'src/agents/integrations/tool-ack-clip.ts': 1,
  'src/agents/integrations/turn-opening-sound.ts': 2,
  'src/agents/model-provider/gemini-live.ts': 1,
  'src/agents/multi-agent/agent-setup.ts': 4,
  'src/agents/multi-agent/orchestrator.ts': 6,
  'src/agents/shared/crash-analytics.ts': 1,
  'src/agents/shared/greeting-audio-cache.ts': 2,
  'src/agents/shared/handoff/coordinator-adapter.ts': 2,
  'src/agents/shared/performance/cache-aware-tts.ts': 3,
  'src/agents/shared/sanitizer/index.ts': 2,
  'src/agents/shared/tts-wrapper.ts': 12,
  'src/agents/shared/voiced-take-render.ts': 2,
  'src/agents/voice-agent/data-channel-handler.ts': 4,
  'src/agents/voice-agent/transcript-handler.ts': 2,
  'src/audio/dj-speech-engine.ts': 1,
  'src/audio/music-humanization.ts': 1,
  'src/intelligence/triggers/anticipatory-trigger-engine.ts': 1,
  'src/personas/bundles/ferni/llm-expression-generator.ts': 1,
  'src/services/evalops/response-evaluator.ts': 1,
  'src/services/performance/speculative-tts.ts': 1,
  'src/speech/coordination/coordinated-tool-executor.ts': 1,
  'src/speech/coordination/speech-coordinator.ts': 3,
  'src/speech/direction/director.ts': 4,
  'src/speech/tts-gateway/gateway-tts-node.ts': 13,
  'src/speech/tts-gateway/gateway.ts': 8,
  'src/speech/tts-gateway/index.ts': 7,
  'src/speech/tts-gateway/ssml/processor.ts': 6,
  'src/tools/domains/communication/outreach/message-crafting.ts': 1,
};

const wrappedCalls = (file: string, text: string): number => {
  let n = 0;
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ['replyForLog', 'repliesForLog'].includes(node.expression.text)
    )
      n++;
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true));
  return n;
};

describe('no reply-text log line loses its wrap', () => {
  const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

  it.each(Object.entries(WRAPPED_CALLS))('%s keeps at least %i wrapped calls', (rel, floor) => {
    expect(wrappedCalls(rel, read(rel))).toBeGreaterThanOrEqual(floor);
  });

  it('does not count a comment or a string that mentions replyForLog(', () => {
    const src = '// replyForLog(x)\nconst s = "replyForLog(y)"; /* repliesForLog(z) */';
    expect(wrappedCalls('x.ts', src)).toBe(0);
    expect(wrappedCalls('x.ts', `${src}\nlog({ a: replyForLog(b) });`)).toBe(1);
  });
});
