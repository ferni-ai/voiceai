/**
 * A small model of a GitHub Actions workflow's jobs, enough to say which jobs
 * run for an event: each job's check names, `needs:` and job-level `if:`,
 * evaluated the way Actions does (a job without a status function in its
 * `if:` needs every `needs:` job to have run and passed). Change-detection
 * outputs (`needs.X.outputs.Y`) read as 'true': the worst case, where the
 * change touches everything. An expression it can't read throws.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const DIR = '.github/workflows';

export type Event = 'push' | 'pull_request' | 'merge_group' | 'schedule';

export interface Job {
  workflow: string;
  id: string;
  /** Check names it reports (one per matrix entry when the name uses the matrix). */
  checks: string[];
  needs: string[];
  if?: string;
}

/** The event names under a workflow's top-level `on:`. */
export function triggers(workflow: string): string[] {
  const text = readFileSync(join(ROOT, DIR, workflow), 'utf8');
  const on = /^on:\n((?:(?: {2}.*)?\n)+)/m.exec(text)?.[1] ?? '';
  return [...on.matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]);
}

/** Every job of a workflow file. */
export function jobs(workflow: string): Job[] {
  const text = readFileSync(join(ROOT, DIR, workflow), 'utf8');
  const body = text.slice(text.indexOf('\njobs:\n') + 7);
  const parts = body.split(/^ {2}([A-Za-z0-9_-]+):\n/m);
  const out: Job[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const id = parts[i];
    const t = parts[i + 1];
    const name = /^ {4}name: (.*)$/m.exec(t)?.[1].replace(/^'(.*)'$/, '$1') ?? id;
    const inline = /^ {4}needs: \[?([^\]\n]*)\]?$/m.exec(t)?.[1];
    const listed = /^ {4}needs:\n((?: {6}- .*\n)+)/m.exec(t)?.[1];
    const needs = (inline ?? listed ?? '').split(/[\s,]+/).filter((n) => /^[A-Za-z0-9_]/.test(n));
    const ifm = /^ {4}if: (.*)\n((?: {6,}.*\n)*)/m.exec(t);
    const cond = ifm
      ? `${ifm[1].replace(/^[>|]-?$/, '')} ${ifm[2]}`.replace(/\s+/g, ' ').trim()
      : undefined;
    out.push({ workflow, id, checks: expandMatrix(name, t), needs, if: cond });
  }
  return out;
}

function expandMatrix(name: string, text: string): string[] {
  const m = /\$\{\{ matrix\.(\w+) \}\}/.exec(name);
  if (!m) return [name];
  const values = new RegExp(`^ +${m[1]}: \\[([^\\]]*)\\]$`, 'm').exec(text)?.[1].split(/,\s*/);
  if (!values?.length) throw new Error(`${name}: matrix.${m[1]} values not found`);
  return values.map((v) => name.replace(m[0], v.trim()));
}

/**
 * Whether a job-level `if:` is true for the event (refs/heads/main for push).
 * `outputs` overrides named `needs.X.outputs.Y` values (the rest read as 'true')
 * and `needs.X.result` values (the rest read as 'success'). Workflow inputs and
 * workflow_run payload fields read as '': these events carry neither.
 */
function evaluate(cond: string, event: Event, outputs: Record<string, string> = {}): boolean {
  const src = cond
    .replace(/^\$\{\{\s*|\s*\}\}$/g, '')
    .replace(/needs\.[\w-]+\.outputs\.[\w-]+/g, (ref) => `'${outputs[ref] ?? 'true'}'`)
    .replace(/needs\.[\w-]+\.result\b/g, (ref) => `'${outputs[ref] ?? 'success'}'`)
    .replace(/github\.event\.pull_request\.labels\.\*\.name/g, '[]')
    .replace(/github\.event\.inputs\.\w+/g, "''")
    .replace(/github\.event\.workflow_run\.[\w.]+/g, "''")
    .replace(/\binputs\.\w+/g, "''")
    .replace(/github\.repository\b/g, "'o/r'")
    .replace(/github\.event_name/g, `'${event}'`)
    .replace(/github\.ref\b/g, "'refs/heads/main'");
  const tokens = src.match(/'[^']*'|\[\]|==|!=|&&|\|\||[!(),]|[A-Za-z_]\w*|\S/g) ?? [];
  let i = 0;
  const peek = (): string | undefined => tokens[i];
  const take = (t?: string): string => {
    const tok = tokens[i++];
    if (tok === undefined || (t !== undefined && tok !== t))
      throw new Error(`can't evaluate: ${cond}`);
    return tok;
  };
  type V = string | boolean | string[];
  const fns: Record<string, (...a: V[]) => V> = {
    always: () => true,
    cancelled: () => false,
    success: () => true,
    failure: () => false,
    startsWith: (a, b) => String(a).startsWith(String(b)),
    contains: (a, b) => (Array.isArray(a) ? a.includes(String(b)) : String(a).includes(String(b))),
  };
  const primary = (): V => {
    const t = take();
    if (t === '!') return !primary();
    if (t === '(') {
      const v = or();
      take(')');
      return v;
    }
    if (t === '[]') return [];
    if (t.startsWith("'")) return t.slice(1, -1);
    if (t === 'true' || t === 'false') return t === 'true';
    const fn = fns[t];
    if (!fn) throw new Error(`can't evaluate ${t} in: ${cond}`);
    take('(');
    const args: V[] = [];
    while (peek() !== ')') {
      args.push(or());
      if (peek() === ',') take(',');
    }
    take(')');
    return fn(...args);
  };
  const cmp = (): V => {
    const a = primary();
    if (peek() === '==' || peek() === '!=') {
      const op = take();
      const b = primary();
      return op === '==' ? a === b : a !== b;
    }
    return a;
  };
  const and = (): V => {
    let v = cmp();
    while (peek() === '&&') {
      take();
      const rhs = cmp();
      v = v && rhs;
    }
    return v;
  };
  const or = (): V => {
    let v = and();
    while (peek() === '||') {
      take();
      const rhs = and();
      v = v || rhs;
    }
    return v;
  };
  const result = or();
  if (i !== tokens.length) throw new Error(`can't evaluate: ${cond}`);
  return Boolean(result);
}

const STATUS_FN = /\b(always|cancelled|failure|success)\(\)/;

/** Ids of the jobs of a workflow that run for the event. */
export function running(
  workflow: string,
  event: Event,
  outputs: Record<string, string> = {}
): Set<string> {
  const all = jobs(workflow);
  const ran = new Set<string>();
  if (!triggers(workflow).includes(event)) return ran;
  const decided = new Set<string>();
  while (decided.size < all.length) {
    const before = decided.size;
    for (const j of all) {
      if (decided.has(j.id) || !j.needs.every((n) => decided.has(n))) continue;
      const needsOk = j.needs.every((n) => ran.has(n));
      const explicitStatus = j.if !== undefined && STATUS_FN.test(j.if);
      const ok =
        (explicitStatus || needsOk) && (j.if === undefined || evaluate(j.if, event, outputs));
      if (ok) ran.add(j.id);
      decided.add(j.id);
    }
    if (decided.size === before) throw new Error(`${workflow}: needs cycle or unknown job`);
  }
  return ran;
}

/** Every workflow file name. */
export function workflows(): string[] {
  return readdirSync(join(ROOT, DIR)).filter((f) => /\.ya?ml$/.test(f));
}

/** Transitive `needs:` of a job. */
export function allNeeds(workflow: string, id: string): string[] {
  const byId = new Map(jobs(workflow).map((j) => [j.id, j]));
  const seen = new Set<string>();
  const walk = (j: string): void => {
    for (const n of byId.get(j)?.needs ?? []) {
      if (seen.has(n)) continue;
      seen.add(n);
      walk(n);
    }
  };
  walk(id);
  return [...seen];
}
