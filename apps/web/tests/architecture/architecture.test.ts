/**
 * Architecture tests for apps/web (ArchUnitTS).
 *
 * Rules and the baseline of grandfathered violations live in
 * ./architecture-rules.ts. A failing test prints the offending
 * `source -> target` dependencies; fix the dependency rather than extending
 * the baseline (extract shared types to types/, invert the dependency with an
 * event or callback, or lazy-load a navigation back-edge).
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

import { projectFiles, CustomFileViolation, ViolatingCycle, type Violation } from 'archunit';

import {
  ALLOWED_EXTERNAL_SOURCE,
  BASELINE,
  DIRECTORY_NAME_EXCEPTIONS,
  GENERATED_ENTRY_POINTS,
  LAYER_LEVELS,
  MAX_GRANDFATHERED_WEB_FILES,
  MAX_LINES,
  PUBLIC_ENTRY_MODULES,
  TEST_FILE,
} from './architecture-rules';
import {
  dependencyKey,
  diffAgainstBaseline,
  findForbiddenDependencies,
  TSCONFIG,
  type DependencyRule,
} from './archunit-checks';
import { findCycles, getModuleGraph, WEB_ROOT } from './module-graph';

const SRC_DIR = join(WEB_ROOT, 'src');
const ROOT_FILE = /^src\/[^/]+\.ts$/;
const TS_SOURCE = /^src\/.*\.ts$/;
const KEBAB_FILE = /^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)*\.ts$/;
const PASCAL_FILE = /^[A-Z][A-Za-z0-9]*\.ts$/;
const KEBAB_DIRECTORY = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const GENERATED_FILE = /\.generated\.ts$/;
const RATCHET_BASELINE = join(WEB_ROOT, '../cli/src/commands/quality/ratchet-baseline.json');

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function layerPattern(layer: string): RegExp {
  return layer === '(root)' ? ROOT_FILE : new RegExp(`^src/${escapeRegExp(layer)}/`);
}

function anyOf(patterns: readonly RegExp[]): RegExp {
  return new RegExp(patterns.map((pattern) => `(?:${pattern.source})`).join('|'));
}

/** Same counting as the repo ratchet (apps/cli/src/commands/quality/ratchet.ts). */
function lineCount(relativePath: string): number {
  const text = readFileSync(join(WEB_ROOT, relativePath), 'utf8');
  if (!text) return 0;
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
}

function describeViolation(violation: Violation): string {
  if (violation instanceof CustomFileViolation) return violation.fileInfo.path;
  if (violation instanceof ViolatingCycle) {
    return violation.cycle.map((edge) => edge.sourceLabel).join(' -> ');
  }
  return JSON.stringify(violation);
}

async function expectRuleToHold(rule: DependencyRule): Promise<void> {
  const found = await findForbiddenDependencies(rule);
  expect(diffAgainstBaseline(rule.id, found)).toEqual({ unexpected: [], stale: [] });
}

describe('apps/web architecture', () => {
  describe('layering', () => {
    it('assigns a level to every top-level folder under src/', () => {
      const folders = readdirSync(SRC_DIR).filter((name) => statSync(join(SRC_DIR, name)).isDirectory());
      const levelled = Object.keys(LAYER_LEVELS).filter((name) => name !== '(root)');
      expect(folders.filter((name) => !(name in LAYER_LEVELS))).toEqual([]);
      expect(levelled.filter((name) => !folders.includes(name))).toEqual([]);
    });

    it('lists baseline entries only for known rules', () => {
      const knownIds = [
        ...Object.keys(LAYER_LEVELS).map((layer) => `layer:${layer}`),
        'boundary:stubs',
        'boundary:tests',
        'boundary:outside-web',
        ...Object.keys(GENERATED_ENTRY_POINTS).map((file) => `generated:${file}`),
        ...PUBLIC_ENTRY_MODULES.map(({ folder }) => `entry:${folder}`),
        'cycle:static',
        'cycle:graph',
      ];
      expect(Object.keys(BASELINE).filter((id) => !knownIds.includes(id))).toEqual([]);
    });

    const layers = Object.entries(LAYER_LEVELS);
    for (const [layer, level] of layers) {
      const higher = layers.filter(([, other]) => other > level).map(([name]) => layerPattern(name));
      if (higher.length === 0) continue;
      it(`${layer}/ (level ${level}) imports nothing from a higher layer`, async () => {
        await expectRuleToHold({
          id: `layer:${layer}`,
          from: layerPattern(layer),
          fromExcept: TEST_FILE,
          to: anyOf(higher),
        });
      });
    }
  });

  describe('dependency cycles', () => {
    it('has no unexpected import cycles (ArchUnit, static imports)', async () => {
      const violations = await projectFiles(TSCONFIG)
        .inPath(/^src\//, { except: { inPath: TEST_FILE } })
        .should()
        .haveNoCycles()
        .check();
      expect(diffAgainstBaseline('cycle:static', violations.map(describeViolation).sort())).toEqual({
        unexpected: [],
        stale: [],
      });
    });

    it('has no unexpected cycles through re-exports either', () => {
      const edges = getModuleGraph().edges.filter(
        (edge) => edge.kind !== 'dynamic' && edge.source.startsWith('src/') && !TEST_FILE.test(edge.source)
      );
      const found = findCycles(edges).map((group) => group.join(' -> '));
      expect(diffAgainstBaseline('cycle:graph', found)).toEqual({ unexpected: [], stale: [] });
    });
  });

  describe('module boundaries', () => {
    const generatedFiles = getModuleGraph().files.filter((file) => GENERATED_FILE.test(file));

    it('maps generated entry points to files that exist', () => {
      expect(Object.keys(GENERATED_ENTRY_POINTS).filter((file) => !generatedFiles.includes(file))).toEqual([]);
    });

    for (const generated of generatedFiles) {
      const entry = GENERATED_ENTRY_POINTS[generated];
      it(`${generated} is only imported by ${entry ?? 'nothing (no entry point registered)'}`, async () => {
        await expectRuleToHold({
          id: `generated:${generated}`,
          from: /^src\//,
          fromExcept: entry ? anyOf([new RegExp(`^${escapeRegExp(entry)}$`), TEST_FILE]) : TEST_FILE,
          to: new RegExp(`^${escapeRegExp(generated)}$`),
        });
      });
    }

    for (const { folder, entry, shims } of PUBLIC_ENTRY_MODULES) {
      it(`code outside ${folder} uses its public entry, not internals`, async () => {
        const insideOrExempt = [new RegExp(`^${escapeRegExp(folder)}`), TEST_FILE, ...(shims ? [shims] : [])];
        await expectRuleToHold({
          id: `entry:${folder}`,
          from: /^src\//,
          fromExcept: anyOf(insideOrExempt),
          to: new RegExp(`^${escapeRegExp(folder)}`),
          toExcept: entry,
        });
      });
    }

    it('imports nothing from the backend or other apps (only src/ and design-system/)', async () => {
      await expectRuleToHold({
        id: 'boundary:outside-web',
        from: /^src\//,
        to: /^\.\.\//,
        toExcept: ALLOWED_EXTERNAL_SOURCE,
      });
    });

    it('does not import test files from production code', async () => {
      await expectRuleToHold({ id: 'boundary:tests', from: /^src\//, fromExcept: TEST_FILE, to: TEST_FILE });
    });

    it('reaches stubs/ only through tsconfig/vite aliases', () => {
      const direct = getModuleGraph()
        .edges.filter((edge) => edge.target.startsWith('src/stubs/') && !edge.source.startsWith('src/stubs/'))
        .filter((edge) => edge.specifier.startsWith('.') || edge.specifier.startsWith('@/'))
        .map((edge) => dependencyKey(edge.source, edge.target));
      expect(diffAgainstBaseline('boundary:stubs', [...new Set(direct)].sort())).toEqual({
        unexpected: [],
        stale: [],
      });
    });
  });

  describe('naming', () => {
    it('keeps *.ui.ts files in src/ui/', async () => {
      await expect(projectFiles(TSCONFIG).withName('*.ui.ts').should().beInPath(/^src\/ui\//)).toPassAsync();
    });

    it('uses kebab-case file names (PascalCase class files allowed only in src/admin/)', async () => {
      const kebab = await projectFiles(TSCONFIG)
        .inPath(TS_SOURCE, { except: { inPath: /^src\/admin\// } })
        .should()
        .haveName(KEBAB_FILE)
        .check();
      const admin = await projectFiles(TSCONFIG)
        .inPath(/^src\/admin\/.*\.ts$/)
        .should()
        .adhereTo((file) => {
          const fileName = `${file.name}.${file.extension}`;
          return KEBAB_FILE.test(fileName) || PASCAL_FILE.test(fileName);
        }, 'kebab-case or PascalCase')
        .check();
      expect([...kebab, ...admin].map(describeViolation)).toEqual([]);
    });

    it('uses kebab-case directory names', async () => {
      const violations = await projectFiles(TSCONFIG)
        .inPath(/^src\//)
        .should()
        .adhereTo(
          (file) =>
            file.directory
              .split('/')
              .slice(1)
              .every((name) => KEBAB_DIRECTORY.test(name) || DIRECTORY_NAME_EXCEPTIONS.has(name)),
          'directories are kebab-case'
        )
        .check();
      expect(violations.map(describeViolation)).toEqual([]);
    });
  });

  describe('file size', () => {
    const ratchet = JSON.parse(readFileSync(RATCHET_BASELINE, 'utf8')) as { oversized: Record<string, number> };
    const grandfathered = new Map(
      Object.entries(ratchet.oversized)
        .filter(([path]) => path.startsWith('apps/web/src/'))
        .map(([path, lines]) => [path.slice('apps/web/'.length), lines] as const)
    );
    const sizedFiles = { except: { inPath: anyOf([TEST_FILE, GENERATED_FILE]) } };

    it(`keeps files not grandfathered by the ratchet within ${MAX_LINES} lines`, async () => {
      const violations = await projectFiles(TSCONFIG)
        .inPath(TS_SOURCE, sizedFiles)
        .should()
        .adhereTo((file) => grandfathered.has(file.path) || lineCount(file.path) <= MAX_LINES, `≤ ${MAX_LINES} lines`)
        .check();
      const report = violations.map(describeViolation).map((path) => `${path}: ${lineCount(path)} lines`);
      expect(report).toEqual([]);
    });

    it('does not let grandfathered oversized files grow', async () => {
      const violations = await projectFiles(TSCONFIG)
        .inPath(TS_SOURCE, sizedFiles)
        .should()
        .adhereTo((file) => lineCount(file.path) <= (grandfathered.get(file.path) ?? Infinity), 'no growth')
        .check();
      const report = violations
        .map(describeViolation)
        .map((path) => `${path}: ${grandfathered.get(path)} -> ${lineCount(path)} lines`);
      expect(report).toEqual([]);
    });

    it('does not grow the grandfather list', () => {
      expect(grandfathered.size).toBeLessThanOrEqual(MAX_GRANDFATHERED_WEB_FILES);
    });
  });
});
