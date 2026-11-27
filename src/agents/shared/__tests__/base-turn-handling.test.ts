/**
 * The base turn handling replaces `voiceOptions` and the top-level `preemptiveGeneration`, which
 * @livekit/agents 1.9.3 migrates with a deprecation warning on every session. The SDK must resolve
 * the same session config from it, and no session may go back to the deprecated names.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { log, voice } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseTurnHandling } from '../base-turn-handling.js';
import { endpointingDelays } from '../turn-patience.js';

type Options = ConstructorParameters<typeof voice.AgentSession>[0];

/** What the real SDK makes of the options (migrateLegacyOptions + defaults). */
const resolved = (opts: Options) => new voice.AgentSession(opts).sessionOptions.turnHandling;

/** The options as they were: `voiceOptions` carrying the delays, interruption values and the flag. */
const legacy = (env: Record<string, string>): Options => ({
  voiceOptions: {
    allowInterruptions: true,
    ...endpointingDelays(env),
    minInterruptionWords: 1,
    minInterruptionDuration: 150,
    preemptiveGeneration: true,
  },
});

describe('baseTurnHandling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['defaults', {}],
    [
      'custom endpointing delays',
      { CASCADE_MIN_ENDPOINTING_MS: '450', CASCADE_MAX_ENDPOINTING_MS: '3000' },
    ],
  ])('%s: the SDK resolves the same turn handling as voiceOptions did', (_name, env) => {
    expect(resolved({ turnHandling: baseTurnHandling(env) })).toEqual(resolved(legacy(env)));
  });

  it('follows the endpointing delays of turn-patience.ts', () => {
    const env = { CASCADE_MIN_ENDPOINTING_MS: '450' };

    expect(baseTurnHandling(env).endpointing.minDelay).toBe(450);
    expect(resolved({ turnHandling: baseTurnHandling(env) }).endpointing.minDelay).toBe(450);
  });

  it('draws no SDK deprecation warning, where the old shape drew two', () => {
    const warn = vi.spyOn(log(), 'warn');

    resolved({ turnHandling: baseTurnHandling({}) });
    expect(warn).not.toHaveBeenCalled();

    resolved(legacy({}));
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

/** Source files of src/agents, tests excluded. */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sources(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name) ? [path] : [];
  });
}

describe('no session uses the deprecated option names', () => {
  const code = (file: string): string =>
    readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join('\n');
  const agentsDir = join(import.meta.dirname, '..', '..');

  it('every file that builds an AgentSession takes its turn handling from baseTurnHandling', () => {
    const builders = sources(agentsDir).filter((file) =>
      /new voice\.AgentSession\b/.test(code(file))
    );

    expect(builders.map((file) => file.split('/').slice(-2).join('/')).sort()).toEqual([
      'multi-agent/call-session.ts',
      'voice-agent-entry/session-creator.ts',
    ]);
    expect(
      builders.filter((file) => !/(=|turnHandling:)\s*baseTurnHandling\(/.test(code(file)))
    ).toEqual([]);
  });

  it.each([
    ['voiceOptions', /\bvoiceOptions\b\s*[:,}]/],
    ['preemptiveGeneration: <boolean>', /\bpreemptiveGeneration:\s*(true|false)\b/],
  ])('%s is not passed to a session in src/agents', (_name, pattern) => {
    const offenders = sources(agentsDir).filter((file) => pattern.test(code(file)));

    expect(offenders).toEqual([]);
  });
});
