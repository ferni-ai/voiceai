/**
 * The logger redacts a consented clone's voice id only once the roster has registered the
 * ids (clone-voice-log-redaction.ts, imported by the roster's index.ts). So every deployed
 * process, and the per-call child, imports the roster at boot: here, an entry passes when
 * one of its side-effect imports (`import 'x'` or `await import('x')`), or one of theirs,
 * is the roster's index.ts. A new image whose entry doesn't fails here.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

import { deployedEntries } from '../../../tests/helpers/deployed-entries.js';

const ROOT = join(__dirname, '..', '..', '..', '..');
const ROSTER = 'src/personas/roster/index.ts';

/** Deployed, but not a file this census can read. */
const NOT_READ: Record<string, string> = {
  'token-server.js': 'the landing token server: plain JavaScript outside src/, no voices',
};

const sourceOf = (entry: string): string =>
  entry.startsWith('dist/') ? entry.replace(/^dist\//, 'src/').replace(/\.js$/, '.ts') : entry;

const codeOf = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** The repo files a source file runs for their side effects, by relative path. */
function sideEffectImports(file: string): string[] {
  const code = codeOf(readFileSync(join(ROOT, file), 'utf8'));
  const specs = [
    ...code.matchAll(/^\s*import\s*['"](\.[^'"]+)['"]/gm),
    ...code.matchAll(/await\s+import\(\s*['"](\.[^'"]+)['"]\s*\)/g),
  ].map((m) => m[1]);
  return specs
    .map((s) => relative(ROOT, join(ROOT, dirname(file), s)).replace(/\.js$/, '.ts'))
    .filter((f) => existsSync(join(ROOT, f)));
}

/** Whether `file`, or what it imports for side effects (3 hops), loads the roster. */
function loadsRoster(file: string, hops = 3): boolean {
  const imports = sideEffectImports(file);
  if (imports.includes(ROSTER)) return true;
  return hops > 0 && imports.some((f) => loadsRoster(f, hops - 1));
}

describe("every deployed process loads the roster, so its logs never carry a clone's voice id", () => {
  const entries = [...new Set(deployedEntries())].filter((e) => !(e in NOT_READ));

  it('finds the deployed entries', () => {
    expect(entries).toEqual(expect.arrayContaining(['dist/agent.js', 'dist/servers/api/index.js']));
  });

  it.each([...entries.map(sourceOf), 'src/agents/gce/job-child.ts'])('%s', (file) => {
    expect(loadsRoster(file)).toBe(true);
  });

  it('every entry left unread is still deployed', () => {
    for (const entry of Object.keys(NOT_READ)) expect(deployedEntries()).toContain(entry);
  });

  it("the roster's index registers the clone ids with the logger", () => {
    expect(sideEffectImports(ROSTER)).toContain('src/personas/roster/clone-voice-log-redaction.ts');
    const code = codeOf(
      readFileSync(join(ROOT, 'src/personas/roster/clone-voice-log-redaction.ts'), 'utf8')
    );
    expect(code).toMatch(/^registerRedactedLogValues\(\(\) => configuredLegendVoiceIds\(\)\);$/m);
  });

  it('follows instrument.ts, reached by await import from agent.ts', () => {
    expect(loadsRoster('src/instrument.ts')).toBe(true);
    expect(sideEffectImports('src/agent.ts')).toContain('src/instrument.ts');
  });
});
