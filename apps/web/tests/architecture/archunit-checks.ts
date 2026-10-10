/**
 * Helpers that run a dependency rule through ArchUnitTS and the supplementary
 * module graph, and compare the result with the baseline.
 */

import { join } from 'path';

import { projectFiles, ViolatingFileDependency, type Violation } from 'archunit';

import { BASELINE } from './architecture-rules';
import { getModuleGraph, WEB_ROOT } from './module-graph';

export const TSCONFIG = join(WEB_ROOT, 'tsconfig.json');

/** "Files matching `from` must not depend on files matching `to`." */
export interface DependencyRule {
  readonly id: string;
  readonly from: RegExp;
  readonly fromExcept?: RegExp;
  readonly to: RegExp;
  readonly toExcept?: RegExp;
}

export function dependencyKey(source: string, target: string): string {
  return `${source} -> ${target}`;
}

function violationKeys(violations: readonly Violation[]): string[] {
  const keys: string[] = [];
  for (const violation of violations) {
    if (!(violation instanceof ViolatingFileDependency)) {
      throw new Error(`Unexpected ArchUnit violation: ${JSON.stringify(violation)}`);
    }
    for (const edge of violation.dependency.cumulatedEdges) {
      // ArchUnit adds a self-edge per file, and only treats ./node_modules as
      // external, not pnpm's hoisted ../../node_modules.
      if (edge.source === edge.target || edge.target.includes('node_modules/')) continue;
      keys.push(dependencyKey(edge.source, edge.target));
    }
  }
  return keys;
}

/**
 * All `source -> target` keys breaking the rule. Static imports come from
 * ArchUnitTS; re-exports and dynamic `import()` (which ArchUnitTS does not
 * extract) come from the TypeScript-compiler module graph.
 */
export async function findForbiddenDependencies(rule: DependencyRule): Promise<string[]> {
  const fromOptions = rule.fromExcept ? { except: { inPath: rule.fromExcept } } : undefined;
  const toOptions = rule.toExcept ? { except: { inPath: rule.toExcept } } : undefined;
  const staticViolations = await projectFiles(TSCONFIG)
    .inPath(rule.from, fromOptions)
    .shouldNot()
    .dependOnFiles()
    .inPath(rule.to, toOptions)
    .check({ allowEmptyTests: true });

  const otherEdges = getModuleGraph()
    .edges.filter((edge) => edge.kind !== 'import')
    .filter((edge) => rule.from.test(edge.source) && !rule.fromExcept?.test(edge.source))
    .filter((edge) => rule.to.test(edge.target) && !rule.toExcept?.test(edge.target))
    .map((edge) => dependencyKey(edge.source, edge.target));

  return [...new Set([...violationKeys(staticViolations), ...otherEdges])].sort();
}

export interface BaselineDiff {
  /** Violations not in the baseline: new architecture breaks. */
  readonly unexpected: readonly string[];
  /** Baseline entries that no longer occur: remove them from the baseline. */
  readonly stale: readonly string[];
}

export function diffAgainstBaseline(ruleId: string, found: readonly string[]): BaselineDiff {
  const allowed = new Set(BASELINE[ruleId] ?? []);
  const seen = new Set(found);
  return {
    unexpected: found.filter((key) => !allowed.has(key)),
    stale: [...allowed].filter((key) => !seen.has(key)),
  };
}
