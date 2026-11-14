/**
 * The lk.pii redaction is installed in the worker and the job child (sdk-logger-options.ts).
 * The SDK can also start its own inference process (InferenceProcExecutor), which builds a
 * logger of its own that this redaction never reaches. Only the SDK's AgentServer
 * (cli.runApp) and runConsole start it; this codebase runs inference runners in the job
 * process instead (agents/core/inference-executor.ts). This guard fails if source starts
 * using one of those entry points, so the gap is seen before it ships.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', '..', '..');
const ENTRY = /\b(?:AgentServer|runConsole|InferenceProcExecutor|runApp)\b|\bcli\s*\.\s*run/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory())
      return e.name === '__tests__' || e.name === 'node_modules' ? [] : sourceFiles(p);
    return /\.(?:ts|tsx|mts|cts)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

describe('the SDK inference process', () => {
  it('is never started: no source file uses AgentServer, cli.runApp, runConsole or InferenceProcExecutor', () => {
    const files = sourceFiles(SRC);
    expect(files.length).toBeGreaterThan(400); // the scan reached the source tree
    const uses = files
      .filter((f) => ENTRY.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f));
    expect(uses).toEqual([]);
  });

  it('the pattern catches each entry point (positive control)', () => {
    for (const line of [
      'const server = new AgentServer(opts);',
      'cli.runApp(new WorkerOptions({ agent }));',
      'await runConsole({ agent });',
      'new InferenceProcExecutor({ runners })',
    ]) {
      expect(ENTRY.test(line)).toBe(true);
    }
    expect(ENTRY.test('runConsoleless(); const agentServers = 1;')).toBe(false);
  });
});
