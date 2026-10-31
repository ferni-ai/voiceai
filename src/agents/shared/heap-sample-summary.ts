/**
 * Turns a V8 sampling heap profile (HeapProfiler.getSamplingProfile) into the
 * few lines that say what holds the call's memory.
 *
 * The profile holds only sampled allocations that are still alive, so a
 * summary taken mid-call shows what the call has kept since sampling began,
 * and one taken after its cleanup shows what it never let go. Live bytes are
 * charged to an OWNER as CPU time is in cpu-profile-summary.ts: the nearest
 * frame of our own code on the allocating stack, else the nearest package,
 * else the leaf's V8 name.
 *
 * @module agents/shared/heap-sample-summary
 */
import { type CpuProfileNode, callFrameName, isOwnCode, packageOf } from './cpu-profile-summary.js';

export interface HeapSampleNode {
  callFrame: CpuProfileNode['callFrame'];
  selfSize: number;
  children?: HeapSampleNode[];
}

export interface HeapSampleProfile {
  head: HeapSampleNode;
}

export interface LiveBytes {
  name: string;
  mb: number;
}

export interface HeapSampleSummary {
  /** Live sampled bytes, in MB. */
  liveMb: number;
  /** Allocating functions by live MB. */
  selfTop: LiveBytes[];
  /** Owners (see module doc) by live MB. */
  ownerTop: LiveBytes[];
}

const mb = (bytes: number): number => Math.round((bytes / 1048576) * 10) / 10;

const ranked = (m: Map<string, number>, n: number): LiveBytes[] =>
  [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, bytes]) => ({ name, mb: mb(bytes) }));

const add = (m: Map<string, number>, k: string, v: number): void => {
  m.set(k, (m.get(k) ?? 0) + v);
};

export function summarizeHeapSample(profile: HeapSampleProfile, n = 12): HeapSampleSummary {
  const self = new Map<string, number>();
  const owners = new Map<string, number>();
  let live = 0;
  // Iterative walk; `stack` is the path from the root to the node, root first.
  const walk: Array<{ node: HeapSampleNode; stack: HeapSampleNode[] }> = [
    { node: profile.head, stack: [] },
  ];
  while (walk.length > 0) {
    const { node, stack } = walk.pop() as { node: HeapSampleNode; stack: HeapSampleNode[] };
    const path = [...stack, node];
    if (node.selfSize > 0) {
      live += node.selfSize;
      add(self, callFrameName(node.callFrame), node.selfSize);
      let owner: string | null = null;
      let pkg: string | null = null;
      for (let i = path.length - 1; i >= 0 && !owner; i--) {
        const { url } = path[i].callFrame;
        if (isOwnCode(url)) owner = callFrameName(path[i].callFrame);
        else pkg ??= packageOf(url);
      }
      add(owners, owner ?? pkg ?? callFrameName(node.callFrame), node.selfSize);
    }
    for (const child of node.children ?? []) walk.push({ node: child, stack: path });
  }
  return {
    liveMb: mb(live),
    selfTop: ranked(self, n),
    ownerTop: ranked(owners, n),
  };
}
