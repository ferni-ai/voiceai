/**
 * Calls are not recorded: every AgentSession.start in the voice agent passes an
 * explicit `record`, so LiveKit's project-level Agent Observability setting
 * can't turn on audio and transcript upload behind the privacy policy's back.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sessionRecording } from '../session-recording.js';

describe('sessionRecording', () => {
  it('is off by default', () => {
    expect(sessionRecording({})).toBe(false);
    expect(sessionRecording({ NODE_ENV: 'development' })).toBe(false);
  });

  it('LK_SESSION_RECORDING turns it on outside production', () => {
    expect(sessionRecording({ LK_SESSION_RECORDING: 'on', NODE_ENV: 'development' })).toBe(true);
  });

  it('is never on in production', () => {
    expect(sessionRecording({ LK_SESSION_RECORDING: 'on', NODE_ENV: 'production' })).toBe(false);
  });
});

const AGENTS = join(__dirname, '..', '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.d.ts')
      ? [path]
      : [];
  });
}

/** The argument text of each `<...session>.start({ ... })` call, comments skipped. */
function sessionStartCalls(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const calls: string[] = [];
  const re = /\b\w*[sS]ession\.start\(\s*\{/g;
  for (let m = re.exec(code); m; m = re.exec(code)) {
    let depth = 1;
    let i = m.index + m[0].length;
    while (depth > 0 && i < code.length) {
      if (code[i] === '{') depth++;
      else if (code[i] === '}') depth--;
      i++;
    }
    calls.push(code.slice(m.index, i));
  }
  return calls;
}

describe('every AgentSession.start in the voice agent', () => {
  const sites = sourceFiles(AGENTS).flatMap((file) =>
    sessionStartCalls(readFileSync(file, 'utf8')).map((call) => ({
      file: relative(AGENTS, file),
      call,
    }))
  );

  it('finds the call sites', () => {
    const files = sites.map((s) => s.file);
    expect(files).toContain(join('multi-agent', 'persona-agent-factory.ts'));
    expect(files).toContain(join('voice-agent-entry', 'handler-setup.ts'));
  });

  it('passes record, from sessionRecording() or false, never true', () => {
    const bad = sites.filter(
      ({ call }) =>
        !/\brecord:\s*[^,}]*(sessionRecording\(\)|false)/.test(call) ||
        /\brecord:\s*true\b/.test(call)
    );
    expect(bad.map((s) => s.file)).toEqual([]);
  });

  it('flags a start that leaves record to the project setting', () => {
    expect(sessionStartCalls('await session.start({ agent, room });')).toHaveLength(1);
    const call = sessionStartCalls('await session.start({ agent, room });')[0];
    expect(/\brecord:/.test(call)).toBe(false);
  });
});
