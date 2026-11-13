/**
 * Words in a log line are a length on prod. A dev process (a Firestore database other than
 * prod's) logs them, cut at a limit that LOG_FULL_RESPONSES lifts. "Dev" is the database,
 * not NODE_ENV: the agent image runs NODE_ENV=production on dev too (docker/Dockerfile.agent).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
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
      '? replyForLog(messages.lastAgentMessage, 200)'
    );
  });

  it('the handoff goodbye and greeting, and the Gemini event dumps, carry no raw text', () => {
    const adapter = read('src/agents/shared/handoff/coordinator-adapter.ts');
    expect(adapter).toContain('goodbye: replyForLog(finalGoodbye),');
    expect(adapter).toContain('greeting: replyForLog(finalGreeting),');
    const gemini = read('src/agents/model-provider/gemini-live.ts');
    expect(gemini).toContain(': replyForLog(eventStr, 2000);');
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
