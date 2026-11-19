/**
 * Admin code is never in the app's static import graph, so Rollup cannot put
 * it in a chunk every visitor downloads (app audit 2026-11-16, item 19:
 * admin-api-*.js loaded for signed-out visitors, because soul-stats.service
 * imported it statically). Only import() may reach src/admin/ from the entry.
 *
 * Type-only imports are erased by the build but counted here, so this errs
 * toward failing; use `import type` sparingly across the boundary.
 */

import { describe, expect, it } from 'vitest';
import { getModuleGraph } from './module-graph';

const APP_ENTRY = 'src/index.ts'; // <script type="module" src="/src/index.ts"> in index.html

/** Files reachable from `entry` without crossing an import() call, with the path that reached each. */
function staticClosure(entry: string): Map<string, string[]> {
  const next = new Map<string, string[]>();
  for (const { source, target, kind } of getModuleGraph().edges) {
    if (kind === 'dynamic') continue;
    next.set(source, [...(next.get(source) ?? []), target]);
  }
  const reached = new Map<string, string[]>([[entry, [entry]]]);
  const queue = [entry];
  for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
    for (const target of next.get(file) ?? []) {
      if (reached.has(target)) continue;
      reached.set(target, [...(reached.get(file) ?? []), target]);
      queue.push(target);
    }
  }
  return reached;
}

// Walking the whole app graph takes about 1 s alone but went past the 5 s
// default once under a loaded full-suite run.
describe('admin code loads only for admins', { timeout: 20_000 }, () => {
  it('the app entry reaches the module graph it is checked against', () => {
    // Guards the check below from passing on an empty or misnamed graph.
    expect(staticClosure(APP_ENTRY).size).toBeGreaterThan(100);
  });

  it('no src/admin/ module is statically imported from the app entry', () => {
    const leaks = [...staticClosure(APP_ENTRY)]
      .filter(([file]) => file.startsWith('src/admin/'))
      .map(([, path]) => path.join(' -> '));
    expect(leaks).toEqual([]);
  });
});
