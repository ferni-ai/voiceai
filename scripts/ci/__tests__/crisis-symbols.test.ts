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
  type BaseRead,
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
    expect(droppedFromScreen(unscreenedNow, [...unscreened, 'scoreCrisisLanguage'])).toEqual([]);
    // A name no longer exported at all has left with its crisis module edit.
    const gone = {
      ...unscreenedNow,
      exported: unscreenedNow.exported.filter((n) => n !== 'scoreCrisisLanguage'),
    };
    expect(droppedFromScreen(gone, unscreened)).toEqual([]);
    // This test parses the whole source tree a second time (about 2 s idle); the 20 s
    // default timed out on a loaded CI shard, so it gets headroom without asserting less.
  }, 120_000);

  /**
   * The live row's check, run on this checkout below and on each red path after it: red,
   * with the reason, when the event has no base; else no name screened at the base is lost.
   */
  const keepsHistory = (read: BaseRead): void => {
    if (read.failure) expect(read.symbols, read.failure).toBeDefined();
    // On a lost name: node --experimental-strip-types scripts/ci/crisis-symbols.ts --write
    if (read.symbols) expect(lostFromHistory(committed, read.symbols)).toEqual([]);
  };

  it('a merge of the symbols file keeps every name screened at the merge base', () => {
    // The rows above derive the snapshot from itself, so a hand-resolved conflict that
    // drops a name no longer exported passes them all. The merge base's list can't be.
    // A pull request reads HEAD^1, the queue reads merge_group.base_sha; a push or a nightly
    // run (main itself, depth 1) prints a SKIPPED line and stays green.
    keepsHistory(baseForEvent(ROOT));
    const [first, ...rest] = committed.previouslyScreened;
    expect(lostFromHistory({ ...committed, previouslyScreened: rest }, committed)).toEqual([first]);
  });

  describe('the merge base on each CI event', () => {
    const none = () => undefined;
    const payload = (body: unknown): string => {
      const file = join(mkdtempSync(join(tmpdir(), 'merge-group-')), 'event.json');
      writeFileSync(file, JSON.stringify(body));
      return file;
    };
    const queue = (body: unknown) => ({
      GITHUB_EVENT_NAME: 'merge_group',
      GITHUB_EVENT_PATH: payload(body),
    });
    const repo = (): string => mkdtempSync(join(tmpdir(), 'symbols-repo-'));
    const run = (cwd: string, ...args: string[]): string =>
      execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...args], {
        cwd,
        encoding: 'utf8',
        stdio: 'pipe',
      }).trim();
    /** Commit a symbols file whose history is `names`; returns the commit. */
    const commitSymbols = (cwd: string, names: string[]): string => {
      const file = join(cwd, symbolsInRepo());
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify({ ...committed, previouslyScreened: names }));
      run(cwd, 'add', '-A');
      run(cwd, 'commit', '-q', '--no-gpg-sign', '-m', `symbols: ${names.join(' ') || 'none'}`);
      return run(cwd, 'rev-parse', 'HEAD');
    };
    /** The red message the live row prints for this read. */
    const red = (read: BaseRead): string => {
      expect(() => keepsHistory(read)).toThrow();
      try {
        keepsHistory(read);
      } catch (e) {
        return (e as Error).message;
      }
      return '';
    };

    it("merge_group reads the queue's base_sha and catches a dropped name", () => {
      const head = run(ROOT, 'rev-parse', 'HEAD');
      const read = baseForEvent(ROOT, queue({ merge_group: { base_sha: head } }), none);
      expect(read.failure).toBeUndefined();
      expect(read.symbols?.previouslyScreened).toEqual(committed.previouslyScreened);
      keepsHistory(read);
      const lost = { ...committed, previouslyScreened: [...committed.previouslyScreened, 'zeta'] };
      expect(red({ symbols: lost })).toContain('zeta');
    });

    it('merge_group fetches a base_sha the depth-1 checkout lacks', () => {
      // CI's queue checkout has only its own commit: the base must come from origin.
      const upstream = repo();
      run(upstream, 'init', '-q');
      const sha = commitSymbols(upstream, ['alphaName']);
      const checkout = repo();
      run(checkout, 'init', '-q');
      run(checkout, 'remote', 'add', 'origin', `file://${upstream}`);
      const read = baseForEvent(checkout, queue({ merge_group: { base_sha: sha } }), none);
      expect(read.failure).toBeUndefined();
      expect(read.symbols?.previouslyScreened).toEqual(['alphaName']);
    });

    it('merge_group is red when the fetch fails, naming the sha and the fetch', () => {
      const checkout = repo();
      run(checkout, 'init', '-q');
      run(checkout, 'remote', 'add', 'origin', `file://${join(repo(), 'no-such-repo')}`);
      const sha = 'a'.repeat(40);
      const read = baseForEvent(checkout, queue({ merge_group: { base_sha: sha } }), baseSymbols);
      expect(read.symbols).toBeUndefined();
      expect(red(read)).toContain(`merge_group: git fetch --depth=1 origin ${sha} failed (`);
      expect(red(read)).toContain("the queue's base commit is not reachable from origin");
      expect(red(read)).toContain(
        "(re-queue the PR, or check the workflow's token and fetch step)"
      );
      expect(red(read)).not.toContain('check out depth 2');
      // The same line when origin/main and HEAD^1 are both here: the queue reads only base_sha.
      run(checkout, 'remote', 'set-url', 'origin', `file://${join(repo(), 'still-none')}`);
      commitSymbols(checkout, ['alphaName']);
      commitSymbols(checkout, []);
      run(checkout, 'update-ref', 'refs/remotes/origin/main', 'HEAD^1');
      const trap = baseForEvent(checkout, queue({ merge_group: { base_sha: sha } }), baseSymbols);
      expect(red(trap)).toContain(`merge_group: git fetch --depth=1 origin ${sha} failed (`);
      expect(red(trap)).not.toContain('origin/main');
    });

    it('merge_group is red when the base commit has no symbols file, naming the file', () => {
      const upstream = repo();
      run(upstream, 'init', '-q');
      writeFileSync(join(upstream, 'README.md'), 'no symbols here\n');
      run(upstream, 'add', '-A');
      run(upstream, 'commit', '-q', '--no-gpg-sign', '-m', 'no symbols');
      const sha = run(upstream, 'rev-parse', 'HEAD');
      const checkout = repo();
      run(checkout, 'init', '-q');
      run(checkout, 'remote', 'add', 'origin', `file://${upstream}`);
      const read = baseForEvent(checkout, queue({ merge_group: { base_sha: sha } }), none);
      expect(red(read)).toContain(
        `merge_group: no ${symbolsInRepo()} at merge_group.base_sha ${sha}`
      );
    });

    it('merge_group with no base_sha in the event is red, saying so', () => {
      const read = baseForEvent(ROOT, queue({ merge_group: {} }), baseSymbols);
      expect(read.symbols).toBeUndefined();
      expect(red(read)).toContain('merge_group: the event payload at GITHUB_EVENT_PATH ');
      expect(red(read)).toContain(' carries no merge_group.base_sha (got nothing)');
      expect(red(read)).not.toContain('check out depth 2');
      // A branch name is not a commit: the base must be the sha GitHub sent.
      const named = baseForEvent(ROOT, queue({ merge_group: { base_sha: 'main' } }), baseSymbols);
      expect(red(named)).toContain('carries no merge_group.base_sha (got "main")');
    });

    it('merge_group with no readable event payload is red, naming the path', () => {
      const env = {
        GITHUB_EVENT_NAME: 'merge_group',
        GITHUB_EVENT_PATH: join(repo(), 'none.json'),
      };
      const read = baseForEvent(ROOT, env, baseSymbols);
      expect(red(read)).toContain(
        `could not read the event payload at GITHUB_EVENT_PATH ${env.GITHUB_EVENT_PATH}`
      );
    });

    it('a pull request with no base is red, naming the event', () => {
      const read = baseForEvent(ROOT, { GITHUB_EVENT_NAME: 'pull_request' }, none);
      expect(red(read)).toContain(
        'no merge base in this checkout: fetch origin/main or check out depth 2 (pull_request)'
      );
    });

    it('push and the nightly run say they skipped, and stay green', () => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      try {
        for (const event of ['push', 'schedule']) {
          expect(baseForEvent(ROOT, { GITHUB_EVENT_NAME: event }, none)).toEqual({});
          expect(log).toHaveBeenCalledWith(
            `SKIPPED: no merge base on ${event}: the crisis-symbols merge-base check did not run`
          );
        }
      } finally {
        log.mockRestore();
      }
    });

    it("push's real checkout (depth 1, origin/main at HEAD) skips, not self-compares", () => {
      // actions/checkout on a push to main or the nightly run, as their logs show it: fetch
      // --depth=1 into refs/remotes/origin/main, then checkout -B main. origin/main IS HEAD,
      // so the merge base is HEAD and comparing would read the file against itself and pass.
      const upstream = repo();
      run(upstream, 'init', '-q', '-b', 'main');
      commitSymbols(upstream, ['alphaName']);
      const checkout = repo();
      run(checkout, 'init', '-q');
      run(checkout, 'remote', 'add', 'origin', `file://${upstream}`);
      run(
        checkout,
        'fetch',
        '-q',
        '--depth=1',
        'origin',
        '+refs/heads/main:refs/remotes/origin/main'
      );
      run(checkout, 'checkout', '-q', '-B', 'main', 'refs/remotes/origin/main');
      expect(baseSymbols(checkout)?.sha).toBe(run(checkout, 'rev-parse', 'HEAD'));
      const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      try {
        for (const event of ['push', 'schedule']) {
          const read = baseForEvent(checkout, { GITHUB_EVENT_NAME: event });
          expect(read).toEqual({});
          keepsHistory(read);
          const notRun = 'the crisis-symbols merge-base check did not run';
          expect(log).toHaveBeenCalledWith(
            `SKIPPED: no merge base on ${event} (origin/main is this commit): ${notRun}`
          );
        }
      } finally {
        log.mockRestore();
      }
    });

    it('a base before HEAD is still read (the HEAD check only skips HEAD itself)', () => {
      const checkout = repo();
      run(checkout, 'init', '-q');
      const base = commitSymbols(checkout, ['alphaName']);
      run(checkout, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
      // Two commits on top, so HEAD^1 (betaName) is not the merge base with origin/main.
      commitSymbols(checkout, ['betaName']);
      commitSymbols(checkout, []);
      const read = baseForEvent(checkout, { GITHUB_EVENT_NAME: 'pull_request' });
      expect(baseSymbols(checkout)?.sha).toBe(base);
      expect(read.symbols?.previouslyScreened).toEqual(['alphaName']);
    });

    it("a pull request's merge commit at depth 2 reads its first parent, main", () => {
      const checkout = repo();
      run(checkout, 'init', '-q', '-b', 'main');
      const main = commitSymbols(checkout, ['alphaName']);
      run(checkout, 'checkout', '-q', '-b', 'feature');
      commitSymbols(checkout, ['betaName']);
      run(checkout, 'checkout', '-q', 'main');
      run(checkout, 'merge', '-q', '--no-ff', '--no-gpg-sign', '-m', 'merge', 'feature');
      // No origin/main ref, as on a pull_request checkout: HEAD^1 is the base, not HEAD^2.
      expect(baseSymbols(checkout)).toEqual({
        sha: main,
        symbols: expect.objectContaining({ previouslyScreened: ['alphaName'] }),
      });
    });

    it('a checkout with no base at all reads no base, not an empty list', () => {
      const checkout = repo();
      run(checkout, 'init', '-q');
      commitSymbols(checkout, ['alphaName']);
      expect(baseSymbols(checkout)).toBeUndefined();
      expect(red(baseForEvent(checkout, { GITHUB_EVENT_NAME: 'pull_request' }))).toContain(
        'no merge base in this checkout'
      );
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
