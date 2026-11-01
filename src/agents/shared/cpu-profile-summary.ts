/**
 * Turns a V8 CPU profile into the few lines that say what held the event loop.
 *
 * Samples are charged to an OWNER: the nearest frame of our own code on the
 * sampled stack (dist/ or src/, outside node_modules), else the nearest
 * package frame (e.g. `@livekit/agents`), else the leaf's V8 name
 * (`(garbage collector)`, `(program)`). Idle samples are counted apart.
 *
 * Windows (event-loop stalls, in the profile's microsecond clock) get their
 * own owner ranking, so a 250 ms stall is tied to the code that ran in it.
 *
 * @module agents/shared/cpu-profile-summary
 */

export interface CpuProfileNode {
  id: number;
  callFrame: { functionName: string; url: string; lineNumber: number };
  children?: number[];
}

export interface CpuProfile {
  nodes: CpuProfileNode[];
  startTime: number;
  endTime: number;
  samples?: number[];
  timeDeltas?: number[];
}

export interface ProfileWindow {
  label: string;
  startUs: number;
  endUs: number;
}

export interface Ranked {
  name: string;
  ms: number;
}

export interface CpuProfileSummary {
  /** Sampled time that was not idle. */
  busyMs: number;
  idleMs: number;
  gcMs: number;
  /** Leaf functions by self time. */
  selfTop: Ranked[];
  /** Owners (see module doc) by time. */
  ownerTop: Ranked[];
  windows: Array<{ label: string; busyMs: number; owners: Ranked[] }>;
}

const IDLE = '(idle)';
const GC = '(garbage collector)';

/** `/app/dist/agents/x.js` -> `agents/x.js`; package paths -> `pkg/rest`. */
export function shortUrl(url: string): string {
  const nm = url.lastIndexOf('node_modules/');
  if (nm >= 0) return url.slice(nm + 'node_modules/'.length);
  const m = /\/(?:dist|src)\/(.*)$/.exec(url);
  if (m) return m[1];
  return url.replace(/^file:\/\//, '');
}

/** Our own code: dist/ or src/, outside node_modules. */
export function isOwnCode(url: string): boolean {
  return /\/(dist|src)\//.test(url) && !url.includes('node_modules/');
}

/** The package a frame's file belongs to, or null for our own code and V8 frames. */
export function packageOf(url: string): string | null {
  const nm = url.lastIndexOf('node_modules/');
  if (nm < 0) return null;
  const parts = url.slice(nm + 'node_modules/'.length).split('/');
  return parts[0].startsWith('@') ? `${parts[0]}/${parts[1] ?? ''}` : parts[0];
}

/** `fn path:line` (1-based line), or the bare name for V8 frames. */
export function callFrameName(callFrame: CpuProfileNode['callFrame']): string {
  const { functionName, url, lineNumber } = callFrame;
  const fn = functionName || '(anonymous)';
  return url ? `${fn} ${shortUrl(url)}:${lineNumber + 1}` : fn;
}

function frameName(n: CpuProfileNode): string {
  return callFrameName(n.callFrame);
}

function top(m: Map<string, number>, n: number): Ranked[] {
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, us]) => ({ name, ms: Math.round(us / 1000) }));
}

function add(m: Map<string, number>, k: string, us: number): void {
  m.set(k, (m.get(k) ?? 0) + us);
}

export function summarizeCpuProfile(
  profile: CpuProfile,
  windows: ProfileWindow[] = [],
  n = 12
): CpuProfileSummary {
  const byId = new Map<number, CpuProfileNode>();
  const parent = new Map<number, number>();
  for (const node of profile.nodes) {
    byId.set(node.id, node);
    for (const c of node.children ?? []) parent.set(c, node.id);
  }
  const ownerCache = new Map<number, string>();
  const ownerOf = (leafId: number): string => {
    const hit = ownerCache.get(leafId);
    if (hit) return hit;
    let pkg: string | null = null;
    let id: number | undefined = leafId;
    let owner: string | null = null;
    while (id !== undefined) {
      const node = byId.get(id);
      if (!node) break;
      if (isOwnCode(node.callFrame.url)) {
        owner = frameName(node);
        break;
      }
      pkg ??= packageOf(node.callFrame.url);
      id = parent.get(id);
    }
    const leaf = byId.get(leafId);
    const name = owner ?? pkg ?? (leaf ? frameName(leaf) : '(unknown)');
    ownerCache.set(leafId, name);
    return name;
  };

  const self = new Map<string, number>();
  const owners = new Map<string, number>();
  const win = windows.map(() => ({ busy: 0, owners: new Map<string, number>() }));
  let idle = 0;
  let gc = 0;
  let busy = 0;
  const samples = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];
  let t = profile.startTime;
  for (let i = 0; i < samples.length; i++) {
    t += deltas[i] ?? 0;
    // A sample stands for the time until the next one.
    const us = Math.max(0, (i + 1 < deltas.length ? deltas[i + 1] : 0) || 0);
    const leaf = byId.get(samples[i]);
    if (!leaf) continue;
    const leafName = leaf.callFrame.functionName;
    if (leafName === IDLE) {
      idle += us;
      continue;
    }
    busy += us;
    if (leafName === GC) gc += us;
    add(self, frameName(leaf), us);
    const owner = ownerOf(leaf.id);
    add(owners, owner, us);
    windows.forEach((w, k) => {
      if (t >= w.startUs && t < w.endUs) {
        win[k].busy += us;
        add(win[k].owners, owner, us);
      }
    });
  }
  return {
    busyMs: Math.round(busy / 1000),
    idleMs: Math.round(idle / 1000),
    gcMs: Math.round(gc / 1000),
    selfTop: top(self, n),
    ownerTop: top(owners, n),
    windows: windows.map((w, k) => ({
      label: w.label,
      busyMs: Math.round(win[k].busy / 1000),
      owners: top(win[k].owners, 4),
    })),
  };
}
