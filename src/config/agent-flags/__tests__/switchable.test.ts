/**
 * Which agent flags the dev switchboard may flip, to which values, and what the agent
 * resolves each one to (docs/plans/2026-11-16-dev-flag-switchboard.md, "Which flags").
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as FLAG_FILES from '../../flags/index.generated.js';
import { flagModeOf } from '../../env-flag.js';
import type { FlagName } from '../../flag-manifest.js';
import { agentFlags, resolvedValue } from '../domain/switchable.js';
import { attuneLedgerOn } from '../../../agents/personas/turn-attunement.js';
import { preemptStableMode } from '../../../agents/multi-agent/preempt-stable-context.js';
import { sessionOwnVoiceEnabled } from '../../../agents/shared/spoken-voice.js';
import { callTelemetryMode } from '../../../api/call-telemetry/call-telemetry-store.js';
import { resolveClassifierOnlyCheckin } from '../../../services/safety/crisis-classifier-only.js';
import { resolveEasingMode } from '../../../services/safety/crisis-classifier-only-live.js';
import { resolveCrisisSecondRead } from '../../../services/safety/crisis-classifier-v3.js';
import { resolveGradedResponseMode } from '../../../services/safety/crisis-graded-shadow.js';
import { resolveMeansInHandMode } from '../../../services/safety/crisis-means-in-hand.js';
import { resolveWhoMode } from '../../../services/safety/crisis-who.js';
import {
  resolveEarlyWarningSttForms,
  resolveEarlyWarningWordBoundary,
} from '../../../utils/phrase-match.js';
import { resolveSafetyWholeWordSites } from '../../../utils/safety-whole-word.js';
import { isGmailSendAsUserEnabledFor } from '../../gmail-send-flag.js';

const FILE_NAMES = new Set(Object.keys(FLAG_FILES));
// The flag files whose default is a number (the spec counted 6; CALL_MEMORY_TRACE is
// kind config but defaults to off, so it is an on/off switch like any other).
const NUMERIC_CONFIG_FLAGS = [
  'BARGE_IN_SOFT_PAUSE_CONFIRM_MS',
  'BARGE_IN_SOFT_PAUSE_STT_GRACE_MS',
  'LATENCY_ARM_PERCENT',
  'WORKER_RECYCLE_MAX_CALLS',
  'WORKER_RECYCLE_RSS_MB',
];

function byName(name: string) {
  const flag = agentFlags().find((f) => f.name === name);
  if (!flag) throw new Error(`${name} missing from agentFlags()`);
  return flag;
}

describe('agentFlags', () => {
  it('lists every per-file flag and nothing else, sorted by name', () => {
    const names = agentFlags().map((f) => f.name);
    expect(names).toHaveLength(FILE_NAMES.size);
    expect(names.filter((n) => !FILE_NAMES.has(n))).toEqual([]);
    expect(names).toEqual([...names].sort());
  });

  it('carries each flag file default, owner and kind', () => {
    expect(byName('ABUSE_DISCLOSURE_PATTERNS')).toMatchObject({
      default: 'off',
      owner: 'intelligence',
      kind: 'experiment',
    });
  });

  it('shows the numeric config flags read-only', () => {
    for (const name of NUMERIC_CONFIG_FLAGS) {
      expect(byName(name)).toMatchObject({ switchable: false, modes: [] });
    }
    expect(agentFlags().filter((f) => !f.switchable)).toHaveLength(NUMERIC_CONFIG_FLAGS.length);
  });

  it('switches a config-kind flag whose default is off', () => {
    expect(byName('CALL_MEMORY_TRACE')).toMatchObject({ kind: 'config', switchable: true });
  });

  it('gives an on/off experiment the modes off and on', () => {
    expect(byName('ABUSE_DISCLOSURE_PATTERNS')).toMatchObject({
      switchable: true,
      modes: ['off', 'on'],
    });
  });

  it('gives a flagModeOf flag the shadow mode as well', () => {
    expect(byName('SOUND_CONDUCTOR').modes).toEqual(['off', 'shadow', 'on']);
  });

  it("gives a flag read directly its reader's own words", () => {
    expect(byName('CRISIS_MEANS_IN_HAND').modes).toEqual(['off', 'shadow', 'live']);
    expect(byName('ATTUNE_LEDGER').modes).toEqual(['off', 'on']);
    expect(byName('CALL_TELEMETRY').modes).toEqual(['off', 'on', 'reports']);
    expect(byName('FAST_LANE_SHADOW').modes).toEqual(['off', 'decision', 'sample']);
  });

  it('is computed once and cannot be changed by a caller', () => {
    expect(agentFlags()).toBe(agentFlags());
    expect(Object.isFrozen(agentFlags())).toBe(true);
    expect(Object.isFrozen(agentFlags()[0])).toBe(true);
  });
});

const SRC = join(__dirname, '..', '..', '..');
const FLAG_FILES_DIR = join(SRC, 'config', 'flags');
const SEALED = /fixtures|heldout|held-out|blind|sealed|corpus/;

/**
 * A source file with env[CONST] rewritten as env.NAME wherever the file declares
 * const CONST = 'NAME', so the scans below see reads through a named key too
 * (gmail-send-flag.ts reads process.env[GMAIL_SEND_AS_USER_ENV]).
 */
function readSource(file: string): string {
  const text = readFileSync(file, 'utf8');
  const names = new Map<string, string>();
  for (const m of text.matchAll(/\bconst\s+([A-Za-z_]\w*)\s*=\s*['"`]([A-Z][A-Z0-9_]*)['"`]/g)) {
    if (m[1] && m[2]) names.set(m[1], m[2]);
  }
  return text.replace(/\benv\[\s*([A-Za-z_]\w*)\s*\]/g, (read, key: string) => {
    const name = names.get(key);
    return name ? `env.${name}` : read;
  });
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (SEALED.test(path) || path === FLAG_FILES_DIR) continue;
    if (statSync(path).isDirectory()) {
      if (entry !== '__tests__' && entry !== 'node_modules') sourceFiles(path, out);
    } else if (/\.ts$/.test(entry) && !/\.(test|spec|d)\.ts$/.test(entry)) {
      out.push(path);
    }
  }
  return out;
}

describe('flags read with flagModeOf', () => {
  it('get the shadow mode and resolve exactly as flagModeOf reads them', () => {
    const read = new Set<string>();
    for (const file of sourceFiles(SRC)) {
      for (const m of readFileSync(file, 'utf8').matchAll(/flagModeOf\(\s*'([A-Z][A-Z0-9_]+)'/g)) {
        if (m[1] && FILE_NAMES.has(m[1])) read.add(m[1]);
      }
    }
    // the scan must find the known readers, or it proves nothing
    expect(read).toContain('SOUND_CONDUCTOR');
    const values = [undefined, '', 'on', ' TRUE ', 'live', 'shadow', 'SHADOW', 'off', '0', 'junk'];
    const wrong = [...read].filter(
      (name) =>
        !byName(name).modes.includes('shadow') ||
        values.some((v) => resolvedValue(name, v) !== flagModeOf(name as FlagName, { [name]: v }))
    );
    expect(wrong).toEqual([]);
  });

  it('gives every per-file flag whose default is shadow a shadow mode', () => {
    const shadowDefaults = agentFlags().filter((f) => f.default === 'shadow');
    expect(shadowDefaults.length).toBeGreaterThan(0);
    expect(shadowDefaults.filter((f) => !f.modes.includes('shadow'))).toEqual([]);
  });
});

describe('flags read straight from env', () => {
  /** Per-file flags some source file reads straight from env: env.NAME, process.env.NAME, env['NAME']. */
  function readDirectly(): Set<string> {
    const read = new Set<string>();
    const pattern = /\benv(?:\.([A-Z][A-Z0-9_]*)\b|\[\s*['"`]([A-Z][A-Z0-9_]*)['"`]\s*\])/g;
    for (const file of sourceFiles(SRC)) {
      for (const m of readSource(file).matchAll(pattern)) {
        const name = m[1] ?? m[2];
        if (name && FILE_NAMES.has(name)) read.add(name);
      }
    }
    return read;
  }

  it("resolve with their reader's own words, not flagOn's vocabulary", () => {
    const read = readDirectly();
    // the scan must find known readers, or it proves nothing
    expect(read).toContain('ATTUNE_LEDGER');
    expect(read).toContain('CRISIS_MEANS_IN_HAND');
    expect(read).toContain('GMAIL_SEND_AS_USER'); // read through a named key
    // No direct reader acts on true or false (only flagOn and flagModeOf do), so each must
    // leave such a flag at its default; a flag resolved through flagOn would turn on or off.
    const viaFlagOn = [...read]
      .map(byName)
      .filter((f) => f.switchable)
      .filter((f) => ['true', 'false'].some((v) => resolvedValue(f.name, v) !== f.default))
      .map((f) => f.name);
    expect(viaFlagOn).toEqual([]);
  });
});

describe('modes', () => {
  it("include each switchable flag's default, so a reset is a value the reader knows", () => {
    const missing = agentFlags().filter(
      (f) => f.switchable && !(f.modes as readonly string[]).includes(f.default)
    );
    expect(missing.map((f) => f.name)).toEqual([]);
  });
});

describe('strict readers', () => {
  /** Per-file flags compared as read (env.NAME === 'word', no trim), with the word compared. */
  function readStrictly(): Map<string, string> {
    const read = new Map<string, string>();
    const pattern =
      /\benv(?:\.([A-Z][A-Z0-9_]*)\b|\[\s*['"`]([A-Z][A-Z0-9_]*)['"`]\s*\])\s*[!=]==?\s*['"`]([^'"`]*)['"`]/g;
    for (const file of sourceFiles(SRC)) {
      for (const m of readSource(file).matchAll(pattern)) {
        const name = m[1] ?? m[2];
        if (name && m[3] && FILE_NAMES.has(name)) read.set(name, m[3]);
      }
    }
    return read;
  }

  it('reports every flag compared without trim as off for its word padded and upper-cased', () => {
    const read = readStrictly();
    // the scan must find the known strict readers, or it proves nothing
    expect([...read.keys()]).toEqual(
      expect.arrayContaining(['ATTUNE_LEDGER', 'SESSION_OWN_VOICE', 'GMAIL_SEND_AS_USER'])
    );
    const normalised = [...read]
      .filter(([name]) => byName(name).switchable)
      .filter(([name, word]) => resolvedValue(name, ` ${word.toUpperCase()} `) === word)
      .map(([name]) => name);
    expect(normalised).toEqual([]);
  });
});

describe('resolvedValue', () => {
  it('reports CRISIS_MEANS_IN_HAND as its reader resolves it', () => {
    expect(resolvedValue('CRISIS_MEANS_IN_HAND', 'on')).toBe('shadow');
    expect(resolvedValue('CRISIS_MEANS_IN_HAND', 'live')).toBe('live');
    expect(resolvedValue('CRISIS_MEANS_IN_HAND', ' LIVE ')).toBe('live');
    expect(resolvedValue('CRISIS_MEANS_IN_HAND', 'off')).toBe('off');
    expect(resolvedValue('CRISIS_MEANS_IN_HAND', undefined)).toBe('shadow');
  });

  it('reports FAST_LANE_SHADOW as its reader resolves it (any case; anything else is off)', () => {
    expect(resolvedValue('FAST_LANE_SHADOW', ' Decision ')).toBe('decision');
    expect(resolvedValue('FAST_LANE_SHADOW', 'SAMPLE')).toBe('sample');
    expect(resolvedValue('FAST_LANE_SHADOW', 'on')).toBe('off');
    expect(resolvedValue('FAST_LANE_SHADOW', 'true')).toBe('off');
    expect(resolvedValue('FAST_LANE_SHADOW', undefined)).toBe('off');
  });

  it("reports a flag whose reader accepts only 'on' as off for any other word", () => {
    expect(resolvedValue('ATTUNE_LEDGER', 'true')).toBe('off');
    expect(resolvedValue('ATTUNE_LEDGER', 'on')).toBe('on');
    expect(resolvedValue('ATTUNE_LEDGER', undefined)).toBe('off');
  });

  it('reports a strict reader as off for a word it does not match exactly', () => {
    expect(resolvedValue('ATTUNE_LEDGER', 'ON')).toBe('off');
    expect(resolvedValue('SESSION_OWN_VOICE', ' on')).toBe('off');
  });

  it('trims and lower-cases for a reader that does', () => {
    expect(resolvedValue('EARLY_WARNING_WORD_BOUNDARY', ' ON')).toBe('on');
  });

  it("reports CRISIS_GRADED_RESPONSE's live as the shadow it runs as", () => {
    expect(resolvedValue('CRISIS_GRADED_RESPONSE', 'live')).toBe('shadow');
    expect(resolvedValue('CRISIS_GRADED_RESPONSE', '__proto__')).toBe('off');
    expect(resolvedValue('CRISIS_GRADED_RESPONSE', 'toString')).toBe('off');
  });

  it('reads a flagModeOf flag as flagModeOf does', () => {
    expect(resolvedValue('SOUND_CONDUCTOR', 'shadow')).toBe('shadow');
    expect(resolvedValue('SOUND_CONDUCTOR', 'TRUE')).toBe('on');
    expect(resolvedValue('SOUND_CONDUCTOR', undefined)).toBe('off');
  });

  it('reads any other switchable flag as flagOn does', () => {
    expect(resolvedValue('ABUSE_DISCLOSURE_PATTERNS', 'true')).toBe('on');
    expect(resolvedValue('ABUSE_DISCLOSURE_PATTERNS', 'shadow')).toBe('off');
    expect(resolvedValue('ABUSE_DISCLOSURE_PATTERNS', undefined)).toBe('off');
  });

  it('reports a numeric config flag as set, or its default when unset', () => {
    expect(resolvedValue('LATENCY_ARM_PERCENT', ' 25 ')).toBe('25');
    expect(resolvedValue('LATENCY_ARM_PERCENT', undefined)).toBe('0');
    expect(resolvedValue('LATENCY_ARM_PERCENT', '')).toBe('0');
  });

  it('reports nothing for a name that is not a per-file flag, so a secret never echoes', () => {
    expect(resolvedValue('LIVEKIT_API_SECRET', 'sekrit')).toBe('');
    expect(resolvedValue('NOT_A_FLAG', ' x ')).toBe('');
    expect(resolvedValue('NOT_A_FLAG', undefined)).toBe('');
  });
});

describe('resolvedValue against the real readers', () => {
  type Env = Record<string, string | undefined>;
  /** A boolean reader is on for true and off for false. */
  const onOff = (on: boolean) => (on ? 'on' : 'off');

  /**
   * Each flag's own reader, called with the env, its result put in the snapshot's words.
   * Mappings: a boolean is on/off. CRISIS_CLASSIFIER_ONLY_CHECKIN has two readers: the
   * shadow module (shadow | off) and the easing module (live | held | off); held decides
   * and logs but changes no reply, which is what shadow means, so held reports as shadow.
   * GMAIL_SEND_AS_USER reads process.env only, with no user, and needs the Google OAuth
   * client set (fictional values here) to be on at all.
   */
  const READERS: ReadonlyArray<[string, (env: Env) => string | Promise<string>]> = [
    [
      'CRISIS_CLASSIFIER_ONLY_CHECKIN',
      (env) => {
        const easing = resolveEasingMode(env);
        if (easing === 'live') return 'live';
        return easing === 'held' ? 'shadow' : resolveClassifierOnlyCheckin(env);
      },
    ],
    ['CRISIS_MEANS_IN_HAND', resolveMeansInHandMode],
    ['SESSION_OWN_VOICE', (env) => onOff(sessionOwnVoiceEnabled(env))],
    [
      'GMAIL_SEND_AS_USER',
      async (env) => {
        vi.stubEnv('GOOGLE_CALENDAR_CLIENT_ID', 'fake-client-id-0001');
        vi.stubEnv('GOOGLE_CALENDAR_CLIENT_SECRET', 'fake-client-secret-0001');
        vi.stubEnv('GMAIL_SEND_AS_USER', env.GMAIL_SEND_AS_USER);
        return onOff(await isGmailSendAsUserEnabledFor(null));
      },
    ],
    ['ATTUNE_LEDGER', (env) => onOff(attuneLedgerOn(env))],
    ['CALL_TELEMETRY', callTelemetryMode],
    ['CRISIS_CLASSIFIER_SECOND_READ', resolveCrisisSecondRead],
    ['CRISIS_GRADED_RESPONSE', resolveGradedResponseMode],
    ['EARLY_WARNING_STT_FORMS', resolveEarlyWarningSttForms],
    ['EARLY_WARNING_WORD_BOUNDARY', (env) => onOff(resolveEarlyWarningWordBoundary(env))],
    ['PREEMPT_STABLE_CONTEXT', preemptStableMode],
    ['SAFETY_WHOLE_WORD_SITES', resolveSafetyWholeWordSites],
    ['THIRD_PARTY_SELF_HARM', resolveWhoMode],
  ];
  const RAWS = [undefined, '', 'on', 'ON', ' on', 'off', 'shadow', 'live', 'true', 'garbage'];
  const WORDS = ['reports', 'defer', ' LIVE ', 'SHADOW', 'false'];

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(READERS)('%s resolves to what its reader acts on', async (name, reader) => {
    const mismatches: string[] = [];
    for (const raw of [...RAWS, ...WORDS, ...byName(name).modes]) {
      const acted = await reader({ [name]: raw });
      const reported = resolvedValue(name, raw);
      if (reported !== acted) mismatches.push(`${JSON.stringify(raw)}: ${reported} != ${acted}`);
    }
    expect(mismatches).toEqual([]);
  });
});
