import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildGraph,
  check,
  compare,
  enforcement,
  newViolations,
  ORCHESTRATION_ENFORCED_FROM,
  orchestrationHint,
  placementOf,
  scoreboard,
  toBaseline,
  type Violation,
} from '../architecture-gate.js';
import { LAYER_MAP } from '../architecture-layers.js';

/** A tiny layered repo: one dir per layer, two L3 contexts. */
const MAP: Record<string, string> = {
  'src/app': 'L5',
  'src/pipeline': 'L4',
  'src/memory': 'L3:memory',
  'src/affect': 'L3:affect',
  'src/kernel': 'L2',
  'src/adapters': 'L1',
  'src/misc': 'unassigned',
};

let root: string;
function repo(files: Record<string, string>): string {
  root = mkdtempSync(join(tmpdir(), 'arch-gate-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}
const violations = (files: Record<string, string>): Violation[] => check(buildGraph(repo(files)), MAP);
const rules = (vs: Violation[]): string[] => vs.map((v) => `${v.rule} ${v.from} -> ${v.to}`).sort();

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

describe('architecture gate: what the graph sees', () => {
  it('catches an upward static import, with its line', () => {
    const vs = violations({
      'src/memory/store.ts': "export const a = 1;\nimport { run } from '../pipeline/turn.js';\n",
      'src/pipeline/turn.ts': 'export const run = 1;\n',
    });
    expect(rules(vs)).toEqual(['upward src/memory/store.ts -> src/pipeline/turn.ts']);
    expect(vs[0]!.line).toBe(2);
  });

  it('catches a multi-line import the old line regex missed', () => {
    const vs = violations({
      'src/kernel/user.ts': "import {\n  run,\n  stop,\n} from '../app/main.js';\n",
      'src/app/main.ts': 'export const run = 1, stop = 2;\n',
    });
    expect(rules(vs)).toEqual(['upward src/kernel/user.ts -> src/app/main.ts']);
  });

  it('catches await import() and require() inside functions', () => {
    const vs = violations({
      'src/memory/a.ts': "export async function f() { return await import('../pipeline/turn.js'); }\n",
      'src/affect/b.ts': "export function g() { return require('../app/main'); }\n",
      'src/pipeline/turn.ts': 'export {};\n',
      'src/app/main.ts': 'export {};\n',
    });
    expect(rules(vs)).toEqual([
      'upward src/affect/b.ts -> src/app/main.ts',
      'upward src/memory/a.ts -> src/pipeline/turn.ts',
    ]);
  });

  it('holds type-only imports to the same rules under type-* keys, and allows them into L2', () => {
    const vs = violations({
      'src/memory/a.ts': [
        "import type { T } from '../pipeline/turn.js';",
        "import { type U } from '../adapters/db.js';",
        "import type { K } from '../kernel/user.js';",
        "export type V = import('../affect/internal.js').X;",
      ].join('\n'),
      'src/pipeline/turn.ts': 'export type T = 1;\n',
      'src/adapters/db.ts': 'export type U = 1;\n',
      'src/kernel/user.ts': 'export type K = 1;\n',
      'src/affect/internal.ts': 'export type X = 1;\n',
    });
    expect(rules(vs)).toEqual([
      'type-context-internal src/memory/a.ts -> src/affect/internal.ts',
      'type-core-to-platform src/memory/a.ts -> src/adapters/db.ts',
      'type-upward src/memory/a.ts -> src/pipeline/turn.ts',
    ]);
  });

  it('catches L2 and L3 importing an L1 adapter at runtime', () => {
    const vs = violations({
      'src/memory/a.ts': "import { db } from '../adapters/db.js';\n",
      'src/kernel/k.ts': "import { db } from '../adapters/db.js';\n",
      'src/adapters/db.ts': 'export const db = 1;\n',
    });
    expect(rules(vs)).toEqual([
      'core-to-platform src/kernel/k.ts -> src/adapters/db.ts',
      'core-to-platform src/memory/a.ts -> src/adapters/db.ts',
    ]);
  });

  it("allows another context's index.ts but catches its internals", () => {
    const vs = violations({
      'src/memory/a.ts': "import { x } from '../affect/index.js';\nimport { y } from '../affect/deep/y.js';\n",
      'src/affect/index.ts': "export const x = 1;\n",
      'src/affect/deep/y.ts': 'export const y = 1;\n',
    });
    expect(rules(vs)).toEqual(['context-internal src/memory/a.ts -> src/affect/deep/y.ts']);
  });

  it('lets L1 implement L3 ports and outer layers wire adapters, but keeps L1 below L4', () => {
    const vs = violations({
      'src/adapters/db.ts': "import type { Port } from '../memory/port.js';\nimport { flag } from '../pipeline/flags.js';\n",
      'src/memory/port.ts': 'export interface Port {}\n',
      'src/pipeline/flags.ts': "import { db } from '../adapters/db.js';\nexport const flag = db;\n",
      'src/app/main.ts': "import { db } from '../adapters/db.js';\n",
    });
    expect(rules(vs)).toContain('upward src/adapters/db.ts -> src/pipeline/flags.ts');
    expect(rules(vs).filter((r) => !r.startsWith('cycle'))).toHaveLength(1);
  });

  it('reports every static cycle, even inside one layer, but not cycles closed by lazy imports', () => {
    const vs = violations({
      'src/memory/a.ts': "import { b } from './b.js';\nexport const a = b;\n",
      'src/memory/b.ts': "import { a } from './a.js';\nexport const b = 1;\n",
      'src/affect/c.ts': "import { d } from './d.js';\nexport const c = d;\n",
      'src/affect/d.ts': "export async function d() { return import('./c.js'); }\n",
    });
    expect(rules(vs)).toEqual(['cycle src/memory/a.ts -> src/memory/b.ts', 'cycle src/memory/b.ts -> src/memory/a.ts']);
  });

  it('skips test files and unassigned dirs', () => {
    const vs = violations({
      'src/memory/__tests__/a.test.ts': "import { x } from '../../app/main.js';\n",
      'src/misc/loose.ts': "import { x } from '../app/main.js';\n",
      'src/app/main.ts': 'export const x = 1;\n',
    });
    expect(vs).toEqual([]);
  });
});

describe('architecture gate: orchestration reaches contexts through their index.ts', () => {
  it('catches L4 and L5 importing a context file other than its index.ts', () => {
    const vs = violations({
      'src/pipeline/turn.ts': "import { recall } from '../memory/recall/engine.js';\n",
      'src/app/route.ts': "export async function h() { return import('../affect/deep/arc.js'); }\n",
      'src/memory/recall/engine.ts': 'export const recall = 1;\n',
      'src/affect/deep/arc.ts': 'export {};\n',
    });
    expect(rules(vs)).toEqual([
      'orchestration-internal src/app/route.ts -> src/affect/deep/arc.ts',
      'orchestration-internal src/pipeline/turn.ts -> src/memory/recall/engine.ts',
    ]);
  });

  it("allows the context's index.ts, the kernel and adapters", () => {
    expect(
      violations({
        'src/pipeline/turn.ts': [
          "import { recall } from '../memory/index.js';",
          "import { arc } from '../affect';",
          "import { K } from '../kernel/user.js';",
          "import { db } from '../adapters/db.js';",
        ].join('\n'),
        'src/memory/index.ts': 'export const recall = 1;\n',
        'src/affect/index.ts': 'export const arc = 1;\n',
        'src/kernel/user.ts': 'export const K = 1;\n',
        'src/adapters/db.ts': 'export const db = 1;\n',
      })
    ).toEqual([]);
  });

  it('files a type-only reach-through under type-orchestration-internal', () => {
    const vs = violations({
      'src/pipeline/turn.ts': "import type { Fact } from '../memory/recall/types.js';\n",
      'src/memory/recall/types.ts': 'export type Fact = 1;\n',
    });
    expect(rules(vs)).toEqual(['type-orchestration-internal src/pipeline/turn.ts -> src/memory/recall/types.ts']);
  });

  it('fails a new reach-through against a baseline that grandfathers an old one', () => {
    const files = {
      'src/pipeline/old.ts': "import { recall } from '../memory/recall/engine.js';\n",
      'src/memory/recall/engine.ts': 'export const recall = 1;\n',
    };
    const base = toBaseline(violations(files));
    expect(base['orchestration-internal']).toEqual(['src/pipeline/old.ts -> src/memory/recall/engine.ts']);
    const now = violations({ ...files, 'src/pipeline/new.ts': "import { recall } from '../memory/recall/engine.js';\n" });
    expect(compare(base, now).added.map((v) => `${v.rule} ${v.from}`)).toEqual(['orchestration-internal src/pipeline/new.ts']);
  });

  it('counts reach-throughs per target context on the scoreboard', () => {
    const graph = buildGraph(
      repo({ 'src/pipeline/a.ts': "import '../memory/deep/b.js';\n", 'src/memory/deep/b.ts': 'export {};\n' })
    );
    const board = scoreboard(graph.files, graph.edges, check(graph, MAP), MAP);
    expect(board).toMatch(/\| L4 → L3 \| 1 \| 0 \|/);
    expect(board).toMatch(/\| memory \| 1 \| 0 \| 0 \| 0 \| 0 \| 1 \|/);
  });
});

describe('architecture gate: only what the change adds fails (merge-base comparison)', () => {
  const v = (from: string, to: string, rule: Violation['rule'] = 'orchestration-internal'): Violation => ({ rule, from, to, line: 1 });
  const same = (p: string): string => p;

  it('passes edges the base already had, and fails a new one', () => {
    const base = [v('src/a.ts', 'src/m/x.ts')];
    expect(newViolations([v('src/a.ts', 'src/m/x.ts')], base, same)).toEqual([]);
    expect(newViolations([v('src/a.ts', 'src/m/x.ts'), v('src/a.ts', 'src/m/y.ts')], base, same)).toEqual([
      v('src/a.ts', 'src/m/y.ts'),
    ]);
  });

  it('keeps the edges of a moved file, and of an import of a moved file', () => {
    const base = [v('src/a.ts', 'src/m/x.ts')];
    const renamed = (p: string): string => ({ 'src/moved/a.ts': 'src/a.ts', 'src/m/z.ts': 'src/m/x.ts' })[p] ?? p;
    expect(newViolations([v('src/moved/a.ts', 'src/m/z.ts')], base, renamed)).toEqual([]);
  });

  it('treats an import moved from one file to another as moved, once', () => {
    const base = [v('src/big.ts', 'src/m/x.ts')];
    const isNew = (p: string): string | null => (p === 'src/part.ts' ? null : p);
    expect(newViolations([v('src/part.ts', 'src/m/x.ts')], base, isNew)).toEqual([]); // split out of big.ts
    expect(newViolations([v('src/part.ts', 'src/m/x.ts'), v('src/other.ts', 'src/m/x.ts')], base, isNew)).toEqual([
      v('src/other.ts', 'src/m/x.ts'),
    ]);
  });

  it('passes an import turned type-only: type-X is known when the base had X on the same edge', () => {
    const base = [v('src/a.ts', 'src/m/x.ts', 'upward')];
    expect(newViolations([v('src/a.ts', 'src/m/x.ts', 'type-upward')], base, same)).toEqual([]);
    // the other way round is not free: a type-only edge turned runtime is new runtime coupling
    expect(newViolations([v('src/a.ts', 'src/m/x.ts', 'upward')], [v('src/a.ts', 'src/m/x.ts', 'type-upward')], same)).toHaveLength(1);
  });

  it('fails every violation of a new file that no removed edge accounts for', () => {
    expect(newViolations([v('src/new.ts', 'src/m/x.ts', 'upward')], [], (p) => (p === 'src/new.ts' ? null : p))).toHaveLength(1);
  });
});

describe('architecture gate: orchestration-internal warns until its enforcement date', () => {
  const v = (rule: Violation['rule']): Violation => ({ rule, from: 'src/pipeline/a.ts', to: 'src/memory/x.ts', line: 1 });
  const added = [v('orchestration-internal'), v('type-orchestration-internal'), v('upward')];

  it('is pinned to 2026-11-08', () => {
    expect(ORCHESTRATION_ENFORCED_FROM).toBe('2026-11-08');
  });

  it('warns the day before: orchestration imports are warnings, every other rule still fails', () => {
    const r = enforcement(added, '2026-11-07');
    expect(r.warnings.map((x) => x.rule)).toEqual(['orchestration-internal', 'type-orchestration-internal']);
    expect(r.errors.map((x) => x.rule)).toEqual(['upward']);
  });

  it('fails from the date itself, and after', () => {
    for (const day of ['2026-11-08', '2026-11-09', '2026-12-01']) {
      const r = enforcement(added, day);
      expect(r.warnings, day).toEqual([]);
      expect(r.errors.map((x) => x.rule), day).toEqual(['orchestration-internal', 'type-orchestration-internal', 'upward']);
    }
  });
});

describe('architecture gate: orchestration entry points', () => {
  it('accepts a sub-folder index.ts as an entry into the context', () => {
    expect(
      violations({
        'src/pipeline/turn.ts': "import { recall } from '../memory/recall/index.js';\n",
        'src/memory/recall/index.ts': 'export const recall = 1;\n',
      })
    ).toEqual([]);
  });

  it('suggests the narrowest existing entry, or says there is none', () => {
    const r = repo({
      'src/memory/index.ts': 'export {};\n'.repeat(40),
      'src/memory/recall/index.ts': 'export {};\n',
      'src/memory/recall/engine.ts': 'export {};\n',
      'src/memory/recall/deep/leaf.ts': 'export {};\n',
      'src/memory/store/file.ts': 'export {};\n',
      'src/affect/arc/inner.ts': 'export {};\n',
    });
    expect(orchestrationHint('src/memory/recall/engine.ts', r, MAP)).toBe(
      'import src/memory/recall/index.ts instead (export what you need there)'
    );
    expect(orchestrationHint('src/memory/recall/deep/leaf.ts', r, MAP)).toMatch(
      /^src\/memory\/recall\/deep\/ has no index\.ts; import the nearest entry, src\/memory\/recall\/index\.ts/
    );
    expect(orchestrationHint('src/memory/store/file.ts', r, MAP)).toMatch(
      /the nearest entry is the 41-line src\/memory\/index\.ts: add src\/memory\/store\/index\.ts/
    );
    expect(orchestrationHint('src/affect/arc/inner.ts', r, MAP)).toMatch(/^no index\.ts between src\/affect\/arc\/ and src\/affect\//);
  });
});

describe('architecture gate: vendor SDKs stay out of core', () => {
  it('catches L2 and L3 importing a vendor SDK directly, under the package name', () => {
    const vs = violations({
      'src/memory/store.ts': "import { getFirestore } from 'firebase-admin/firestore';\n",
      'src/kernel/room.ts': "import { Room } from '@livekit/rtc-node';\n",
    });
    expect(rules(vs)).toEqual(['vendor src/kernel/room.ts -> @livekit/rtc-node', 'vendor src/memory/store.ts -> firebase-admin']);
    expect(vs.find((v) => v.rule === 'vendor')!.line).toBe(1);
  });

  it('allows the vendor import in L4, L5 and L1, where adapters and wiring live', () => {
    expect(
      violations({
        'src/pipeline/turn.ts': "import { Room } from '@livekit/agents';\n",
        'src/app/main.ts': "import admin from 'firebase-admin';\n",
        'src/adapters/store.ts': "import admin from 'firebase-admin';\n",
      })
    ).toEqual([]);
  });

  it('does not mistake a local file named like a vendor for the vendor', () => {
    expect(violations({ 'src/memory/store.ts': "import { x } from '../adapters/firebase-admin-app.js';\n" })).toEqual([]);
  });
});

describe('architecture gate: ratchet', () => {
  const v = (from: string, to: string, rule: Violation['rule'] = 'upward'): Violation => ({ rule, from, to, line: 1 });
  const base = toBaseline([v('src/a.ts', 'src/b.ts'), v('src/c.ts', 'src/d.ts', 'cycle')]);

  it('passes when nothing changed', () => {
    const r = compare(base, [v('src/a.ts', 'src/b.ts'), v('src/c.ts', 'src/d.ts', 'cycle')]);
    expect(r.added).toEqual([]);
    expect(r.fixed).toBe(0);
  });

  it('passes when an edge goes away, and lowers the baseline without adding anything', () => {
    const r = compare(base, [v('src/a.ts', 'src/b.ts')]);
    expect(r.added).toEqual([]);
    expect(r.fixed).toBe(1);
    expect(r.lowered.cycle).toEqual([]);
    expect(r.lowered.upward).toEqual(['src/a.ts -> src/b.ts']);
  });

  it('fails on a new edge, even when the total went down', () => {
    const r = compare(base, [v('src/x.ts', 'src/b.ts')]);
    expect(r.added.map((a) => `${a.from} -> ${a.to}`)).toEqual(['src/x.ts -> src/b.ts']);
    expect(r.fixed).toBe(2);
  });

  it('treats the same edge under a different rule as new', () => {
    expect(compare(base, [v('src/a.ts', 'src/b.ts', 'cycle')]).added).toHaveLength(1);
  });
});

describe('architecture gate: the real layer map', () => {
  it('uses the longest prefix and keeps entrypoints in L5', () => {
    expect(placementOf('src/agents/voice-agent/turn-handler.ts')?.layer).toBe('L4');
    expect(placementOf('src/agents/model-provider/factory.ts')?.layer).toBe('L1');
    expect(placementOf('src/agents/gce/job-runner.ts')?.layer).toBe('L5');
    expect(placementOf('src/speech/tts-gateway/index.ts')?.layer).toBe('L1');
    expect(placementOf('src/speech/ssml-tagger.ts')).toMatchObject({ layer: 'L3', context: 'expression' });
    expect(placementOf('src/services/superhuman/dream-keeper.ts')).toMatchObject({ layer: 'L3', context: 'growth' });
    expect(placementOf('src/services/some-loose-file.ts')).toBeNull();
  });

  it('names only paths that exist, so a moved dir has to update the map', () => {
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../../../..');
    expect(Object.keys(LAYER_MAP).filter((key) => !existsSync(join(repoRoot, key)))).toEqual([]);
  });

  it('only uses known layers and contexts', () => {
    for (const value of Object.values(LAYER_MAP)) {
      expect(value).toMatch(
        /^(unassigned|L[1245]|L3:(identity|perception|memory|understanding|affect|judgment|expression|relationship|agency|growth))$/
      );
    }
  });

  it('prints a scoreboard per layer pair and per context', () => {
    const graph = buildGraph(
      repo({ 'src/memory/a.ts': "import '../pipeline/b.js';\n", 'src/pipeline/b.ts': 'export {};\n' })
    );
    const board = scoreboard(graph.files, graph.edges, check(graph, MAP), MAP);
    expect(board).toMatch(/\| L3 → L4 \| 1 \| 0 \|/);
    expect(board).toMatch(/Cycles: 0 static import cycles/);
  });
});
