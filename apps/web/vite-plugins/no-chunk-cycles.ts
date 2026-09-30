/**
 * Fail the build when output chunks statically import each other in a cycle.
 *
 * A cycle across chunks lets one chunk run before a binding it needs from the
 * other is initialized ("Cannot access 'x' before initialization" at startup).
 * The chunking in vite.config.ts is designed to be acyclic; this keeps it so.
 */

import type { Plugin } from 'vite';

interface ChunkLike {
  type: string;
  fileName: string;
  imports?: string[];
}

/** Every cycle in a static import graph, as file-name paths. */
export function findChunkCycles(graph: Map<string, string[]>): string[][] {
  const cycles: string[][] = [];
  const state = new Map<string, 'active' | 'done'>();
  const stack: string[] = [];

  const visit = (node: string): void => {
    state.set(node, 'active');
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      if (state.get(next) === 'active') {
        cycles.push([...stack.slice(stack.indexOf(next)), next]);
      } else if (!state.has(next)) {
        visit(next);
      }
    }
    stack.pop();
    state.set(node, 'done');
  };

  for (const node of graph.keys()) {
    if (!state.has(node)) visit(node);
  }
  return cycles;
}

export function noChunkCycles(): Plugin {
  return {
    name: 'ferni:no-chunk-cycles',
    apply: 'build',
    generateBundle(_options, bundle) {
      const graph = new Map<string, string[]>();
      for (const item of Object.values(bundle) as ChunkLike[]) {
        if (item.type === 'chunk') graph.set(item.fileName, item.imports ?? []);
      }
      const cycles = findChunkCycles(graph);
      if (cycles.length) {
        this.error(
          `Static import cycle between chunks (breaks module init order):\n` +
            cycles.map((c) => `  ${c.join(' -> ')}`).join('\n')
        );
      }
    },
  };
}
