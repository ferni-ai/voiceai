/**
 * A small model of a GitHub Actions workflow's jobs, enough to say which jobs
 * run for an event: each job's check names, `needs:` and job-level `if:`,
 * evaluated the way Actions does (a job without a status function in its
 * `if:` needs every `needs:` job to have run and passed). Change-detection
 * outputs (`needs.X.outputs.Y`) read as 'true': the worst case, where the
 * change touches everything. An expression it can't read throws, and so does
 * an output reference Actions would read as '': one to an output job X doesn't
 * declare under `outputs:`, or to a job X outside the reader's `needs:`. Such a
 * job would silently never run, and reading it as 'true' would hide that.
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
  /** Names it declares under `outputs:` (what `needs.<id>.outputs.<name>` can read). */
  outputs: string[];
}

/** The event names under a workflow's top-level `on:` (`dir` defaults to the repo's workflows). */
export function triggers(workflow: string, dir = join(ROOT, DIR)): string[] {
  const text = readFileSync(join(dir, workflow), 'utf8');
  const on = /^on:\n((?:(?: {2}.*)?\n)+)/m.exec(text)?.[1] ?? '';
  return [...on.matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]);
}

/** Every job of a workflow file (`dir` defaults to the repo's workflows). */
export function jobs(workflow: string, dir = join(ROOT, DIR)): Job[] {
  const text = readFileSync(join(dir, workflow), 'utf8');
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
    const declared = /^ {4}outputs:\n((?:(?: {6,}.*)?\n)+)/m.exec(t)?.[1] ?? '';
    const outputs = [...declared.matchAll(/^ {6}([A-Za-z0-9_-]+):/gm)].map((m) => m[1]);
    out.push({ workflow, id, checks: expandMatrix(name, t), needs, if: cond, outputs });
  }
  return out;
}

function expandMatrix(name: string, text: string): string[] {
  const m = /\$\{\{ matrix\.(\w+) \}\}/.exec(name);
  if (!m) return [name];
  const literal = new RegExp(`^ +${m[1]}: \\[([^\\]]*)\\]$`, 'm').exec(text)?.[1].split(/,\s*/);
  // A matrix built by an expression (`${{ fromJSON(cond && '[1, 2]' || '[1]') }}`)
  // reports the union of the lists it can pick.
  const expr = new RegExp(`^ +${m[1]}: \\$\\{\\{(.*)\\}\\}$`, 'm').exec(text)?.[1];
  const picked = expr
    ? [...new Set([...expr.matchAll(/'\[([^\]]*)\]'/g)].flatMap((l) => l[1].split(/,\s*/)))]
    : undefined;
  const values = (literal ?? picked ?? included(m[1], text))?.map((v) => v.trim()).filter(Boolean);
  if (values?.length) return values.map((v) => name.replace(m[0], v));
  // Built at run time with no list in the file (`${{ fromJSON(needs.plan.outputs.types) }}`):
  // the check names are unknowable here, so the job reports its name unexpanded.
  if (expr !== undefined) return [name];
  throw new Error(`${name}: matrix.${m[1]} values not found`);
}

/** The `key` values of a matrix given only as `include:` entries, or undefined if it has none. */
function included(key: string, text: string): string[] | undefined {
  const block = /^( +)include:\n((?:\1 .*\n|\s*\n)*)/m.exec(text)?.[2];
  if (!block) return undefined;
  const values = [...block.matchAll(new RegExp(`^ +(?:- )?${key}: (.+)$`, 'gm'))];
  return values.map((v) => v[1].replace(/^(['"])(.*)\1$/, '$2'));
}

const OUTPUT_REF = /needs\.([\w-]+)\.outputs\.([\w-]+)/g;

/**
 * Throws for each `needs.<job>.outputs.<name>` in `reader`'s `if:` that Actions would read
 * as '': `job` is not in the reader's `needs:`, or `job` declares no output `name`
 * (`declared`: each job's declared output names). A declared one reads as 'true' in evaluate.
 */
function checkOutputRefs(reader: Job, declared: ReadonlyMap<string, ReadonlySet<string>>): void {
  for (const [ref, job, name] of reader.if?.matchAll(OUTPUT_REF) ?? []) {
    const where = `${reader.workflow} ${reader.id}: ${ref}`;
    if (!reader.needs.includes(job)) throw new Error(`${where}: ${job} is not in its needs`);
    if (!declared.get(job)?.has(name)) {
      throw new Error(`${where}: ${job} declares no output ${name}`);
    }
  }
}

/**
 * Whether a job-level `if:` is true for the event (refs/heads/main for push).
 * `outputs` overrides named `needs.X.outputs.Y` values (the rest read as 'true')
 * and `needs.X.result` values (the rest read as 'success'). Workflow inputs and
 * workflow_run and issue payload fields read as '': these events carry neither.
 * Repository variables (`vars.X`) read as '', as an unset one does; override
 * them by name (`'vars.OPTIONAL_CI': 'off'`). So does a push's head commit message
 * (no `[publish]`-style tag); override `github.event.head_commit.message`.
 * The repository is 'o/r'. A pull_request comes from a branch of it (its head repo
 * is 'o/r'; override `github.event.pull_request.head.repo.full_name` for a fork);
 * other events carry no pull request, so that field reads as ''.
 */
function evaluate(cond: string, event: Event, outputs: Record<string, string> = {}): boolean {
  const src = cond
    .replace(/^\$\{\{\s*|\s*\}\}$/g, '')
    .replace(OUTPUT_REF, (ref) => `'${outputs[ref] ?? 'true'}'`)
    .replace(/needs\.[\w-]+\.result\b/g, (ref) => `'${outputs[ref] ?? 'success'}'`)
    .replace(/\bvars\.\w+/g, (ref) => `'${outputs[ref] ?? ''}'`)
    .replace(/github\.event\.head_commit\.message/g, (ref) => `'${outputs[ref] ?? ''}'`)
    .replace(/github\.event\.pull_request\.labels\.\*\.name/g, '[]')
    .replace(/github\.event\.pull_request\.head\.repo\.full_name/g, (ref) => {
      return `'${outputs[ref] ?? (event === 'pull_request' ? 'o/r' : '')}'`;
    })
    .replace(/github\.event\.inputs\.\w+/g, "''")
    .replace(/github\.event\.workflow_run\.[\w.]+/g, "''")
    .replace(/github\.event\.issue\.[\w.]+/g, "''")
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

/**
 * A workflow's jobs, after throwing for any `needs.X.outputs.Y` in a job-level `if:` that
 * Actions would read as '' (see checkOutputRefs), whether or not that `if:` is ever reached.
 * `running` calls it first; it reads no `if:` beyond the output references.
 */
export function checkOutputs(workflow: string, dir = join(ROOT, DIR)): Job[] {
  const all = jobs(workflow, dir);
  const declared = new Map(all.map((j) => [j.id, new Set(j.outputs)]));
  for (const j of all) checkOutputRefs(j, declared);
  return all;
}

const STATUS_FN = /\b(always|cancelled|failure|success)\(\)/;

/**
 * Ids of the jobs of a workflow that run for the event (`dir` defaults to the repo's
 * workflows). Every job's output references are checked first, whatever the event and
 * whether or not its `if:` is reached, so a dropped `outputs:` line always throws.
 */
export function running(
  workflow: string,
  event: Event,
  outputs: Record<string, string> = {},
  dir = join(ROOT, DIR)
): Set<string> {
  const all = checkOutputs(workflow, dir);
  const ran = new Set<string>();
  if (!triggers(workflow, dir).includes(event)) return ran;
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
