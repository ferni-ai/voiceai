/**
 * The crisis symbols a loop PR is screened with are derived from the source, exactly: a
 * new export can't be missed, and a removed one can't linger. Reads the full source tree,
 * so it runs in the unit suite, not the CI check.
 */
import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { describe, expect, it, vi } from 'vitest';
import { classify, loadPolicy } from '../autonomy-lanes.js';
import {
  baseForEvent,
  baseSymbols,
  builtInNames,
  crisisSymbols,
  droppedFromScreen,
  lostFromHistory,
  ownDeclarations,
  symbolsInRepo,
  symbolsPath,
  type CrisisSymbols,
} from '../crisis-symbols.js';

const ROOT = join(__dirname, '../../..');
const PERSONA = 'src/personas/bundles/x/content.ts';
const committed = JSON.parse(readFileSync(symbolsPath(), 'utf8')) as CrisisSymbols;
// Derived once, at collection: it parses every source file (about 2 s).
const derived = crisisSymbols(ROOT, committed.previouslyScreened);

describe('crisis symbols', () => {
  it("crisisSymbols matches the crisis modules' exports", () => {
    expect(derived.exported).toContain('scoreCrisisLanguage');
    expect(derived.exported).not.toContain('default');
    // On failure: node --experimental-strip-types scripts/ci/crisis-symbols.ts --write
    expect(committed).toEqual(derived);
    expect(loadPolicy().lanes.crisis.symbols).toEqual(derived.screened);
  });

  it('only crisis modules under src/ are scanned, not crisis-path tooling', () => {
    // scripts/ci/crisis-symbols.ts and scripts/voice-eval/release-check.mjs are crisis
    // paths for review, not crisis behaviour.
    for (const name of ['builtInNames', 'crisisSymbols', 'checkRelease', 'REPO']) {
      expect(derived.exported).not.toContain(name);
    }
  });

  it('generic export shared with non-crisis modules is not screened', () => {
    const policy = loadPolicy();
    // The screens alone: every path allowed, so default-deny doesn't decide it.
    const screens = { ...policy, loopAllowed: { paths: ['**'], screenContent: [] } };
    for (const name of ['domain', 'definitions', 'getToolDefinitions', 'plain']) {
      expect(derived.exported).toContain(name);
      expect(derived.screened).not.toContain(name);
      const line = `+  const x = ${name}(y);`;
      expect(classify([PERSONA], [line], 'ferni-loop[bot]', screens)).toEqual([]);
    }
  });

  it('export named like a built-in method is not screened', () => {
    // crisis-modifiers.ts exports normalize(); every other use is str.normalize('NFKC').
    expect(builtInNames()).toContain('normalize');
    expect(derived.exported).toContain('normalize');
    expect(derived.screened).not.toContain('normalize');
    const line = "+  const key = name.normalize('NFKC');";
    const policy = loadPolicy();
    const screens = { ...policy, loopAllowed: { paths: ['**'], screenContent: [] } };
    expect(classify([PERSONA], [line], 'ferni-loop[bot]', screens)).toEqual([]);
  });

  it('a crisis symbol cannot drop out of the screen without a policy entry', () => {
    const { unscreened } = loadPolicy().lanes.crisis;
    expect(droppedFromScreen(committed, unscreened)).toEqual([]);
    // The snapshot only grows: a regeneration keeps every name screened before.
    expect(committed.previouslyScreened).toEqual(expect.arrayContaining(committed.screened));
    expect(crisisSymbols(ROOT, ['zzzOnceScreened']).previouslyScreened).toContain(
      'zzzOnceScreened'
    );
    // A namesake declared elsewhere would drop scoreCrisisLanguage from the screen:
    const unscreenedNow = {
      ...derived,
      screened: derived.screened.filter((n) => n !== 'scoreCrisisLanguage'),
    };
    expect(droppedFromScreen(unscreenedNow, unscreened)).toEqual(['scoreCrisisLanguage']);
    expect(droppedFromScreen(unscreenedNow, ['scoreCrisisLanguage'])).toEqual([]);
    // A name no longer exported at all has left with its crisis module edit.
    const gone = {
      ...unscreenedNow,
      exported: unscreenedNow.exported.filter((n) => n !== 'scoreCrisisLanguage'),
    };
    expect(droppedFromScreen(gone, unscreened)).toEqual([]);
    // This test parses the whole source tree a second time (about 2 s idle); the 20 s
    // default timed out on a loaded CI shard, so it gets headroom without asserting less.
  }, 120_000);

  it('a merge of the symbols file keeps every name screened at the merge base', () => {
    // The rows above derive the snapshot from itself, so a hand-resolved conflict that
    // drops a name no longer exported passes them all. The merge base's list can't be.
    // A pull request reads HEAD^1, the queue reads merge_group.base_sha; a push or a nightly
    // run (main itself, depth 1) prints a SKIPPED line and stays green.
    const { symbols: base, failure } = baseForEvent(ROOT);
    if (failure) expect(base, failure).toBeDefined();
    // On a lost name: node --experimental-strip-types scripts/ci/crisis-symbols.ts --write
    if (base) expect(lostFromHistory(committed, base)).toEqual([]);
    const [first, ...rest] = committed.previouslyScreened;
    expect(lostFromHistory({ ...committed, previouslyScreened: rest }, committed)).toEqual([first]);
  });

  describe('the merge base on each CI event', () => {
    const none = () => undefined;
    // Written out, not NO_BASE: the red line's advice is what a reader acts on.
    const ADVICE = 'no merge base in this checkout: fetch origin/main or check out depth 2';
    const payload = (body: unknown): string => {
      const file = join(mkdtempSync(join(tmpdir(), 'merge-group-')), 'event.json');
      writeFileSync(file, JSON.stringify(body));
      return file;
    };
    const queue = (body: unknown) => ({
      GITHUB_EVENT_NAME: 'merge_group',
      GITHUB_EVENT_PATH: payload(body),
    });
    /** The live row's red path: the message it prints when there is no base. */
    const redMessage = (read: { failure?: string; symbols?: unknown }): string => {
      try {
        if (read.failure) expect(read.symbols, read.failure).toBeDefined();
      } catch (e) {
        return (e as Error).message;
      }
      return '';
    };

    it("merge_group reads the queue's base_sha and catches a dropped name", () => {
      const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
      const read = baseForEvent(ROOT, queue({ merge_group: { base_sha: head.trim() } }), none);
      expect(read.failure).toBeUndefined();
      expect(read.symbols?.previouslyScreened).toEqual(committed.previouslyScreened);
      const [first, ...rest] = committed.previouslyScreened;
      const dropped = { ...committed, previouslyScreened: rest };
      expect(lostFromHistory(dropped, read.symbols as CrisisSymbols)).toEqual([first]);
    });

    it('merge_group fetches a base_sha the depth-1 checkout lacks', () => {
      // CI's queue checkout has only its own commit: the base must come from origin.
      const repo = (): string => mkdtempSync(join(tmpdir(), 'symbols-repo-'));
      const run = (cwd: string, ...args: string[]): string =>
        execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...args], {
          cwd,
          encoding: 'utf8',
          stdio: 'pipe',
        }).trim();
      const upstream = repo();
      run(upstream, 'init', '-q');
      const file = join(upstream, symbolsInRepo());
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify({ ...committed, previouslyScreened: ['alphaName'] }));
      run(upstream, 'add', '-A');
      run(upstream, 'commit', '-q', '--no-gpg-sign', '-m', 'base');
      const sha = run(upstream, 'rev-parse', 'HEAD');
      const checkout = repo();
      run(checkout, 'init', '-q');
      run(checkout, 'remote', 'add', 'origin', `file://${upstream}`);
      const read = baseForEvent(checkout, queue({ merge_group: { base_sha: sha } }), none);
      expect(read.failure).toBeUndefined();
      expect(read.symbols?.previouslyScreened).toEqual(['alphaName']);
    });

    it('merge_group with no base_sha is red, naming the event', () => {
      const read = baseForEvent(ROOT, queue({ merge_group: {} }), baseSymbols);
      expect(read.symbols).toBeUndefined();
      expect(redMessage(read)).toContain(`${ADVICE} (merge_group base_sha missing)`);
    });

    it('a pull request with no base is red, naming the event', () => {
      const read = baseForEvent(ROOT, { GITHUB_EVENT_NAME: 'pull_request' }, none);
      expect(redMessage(read)).toContain(`${ADVICE} (pull_request)`);
    });

    it('push and the nightly run say they skipped, and stay green', () => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      try {
        for (const event of ['push', 'schedule']) {
          expect(baseForEvent(ROOT, { GITHUB_EVENT_NAME: event }, none)).toEqual({});
          expect(log).toHaveBeenCalledWith(`SKIPPED: no merge base on ${event}`);
        }
      } finally {
        log.mockRestore();
      }
    });
  });

  it('only real declarations elsewhere make a crisis name ambiguous', () => {
    const file = 'src/agents/processors/turn-processor/index.ts';
    const text = [
      "export { addSafetyNote } from './safety-note.js';",
      "export * from './turn-crisis.js';",
      "import { detectCrisis as detect } from '../../../services/safety/index.js';",
      'export function detectCrisis(t: string) { return detect(t); }',
      "import { helper } from './helper.js';",
      'export { helper };',
      'const own = 1;',
      'export { own as ownName };',
      'export function plainFn() {}',
    ].join('\n');
    expect(ownDeclarations(file, text).sort()).toEqual(['ownName', 'plainFn']);
  });

  it('crisis-critical names stay screened, colliding ones through alwaysScreen', () => {
    const { alwaysScreen } = loadPolicy().lanes.crisis;
    for (const name of [
      'recordCrisisEvent',
      'detectCrisis',
      'addSafetyNote',
      'scoreCrisisLanguage',
      'noteCrisisRisk',
    ]) {
      expect(derived.screened).toContain(name);
    }
    // Reviewed: crisis-critical names that collide, or might, with exports elsewhere.
    for (const name of alwaysScreen) {
      expect(derived.exported).toContain(name);
      expect(derived.screened).toContain(name);
    }
  });
});
