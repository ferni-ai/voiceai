/**
 * Static invariants on firestore.rules for collections no ordinary client may
 * read or write, or may write only in a narrowed way. It parses the rules text,
 * so it runs in the unit suite with no emulator; the behaviour itself is checked
 * against the emulator in rules-lockdown.emulator.test.ts.
 *
 * FIRESTORE_RULES_PATH points it at another rules file (used to show it fails
 * on the rules this change replaced).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RULES_PATH = resolve(process.env.FIRESTORE_RULES_PATH ?? 'firestore.rules');
const rules = readFileSync(RULES_PATH, 'utf8');

type Allow = { ops: string[]; cond: string };

/** The `allow` statements directly inside `match /<collection>/{...} { ... }`. */
function allowsFor(collection: string): Allow[] | null {
  const head = new RegExp(`match /${collection}/\\{[^}]+\\}\\s*\\{`).exec(rules);
  if (!head) return null;
  let depth = 1;
  let i = head.index + head[0].length;
  const start = i;
  for (; i < rules.length && depth > 0; i++) {
    if (rules[i] === '{') depth++;
    else if (rules[i] === '}') depth--;
  }
  const body = rules
    .slice(start, i - 1)
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\s+/g, ' ');
  return [...body.matchAll(/allow ([a-z, ]+?)\s*:\s*if (.+?);/g)].map((m) => ({
    ops: m[1].split(',').map((s) => s.trim()),
    cond: m[2].trim(),
  }));
}

/** Expands read/write into the concrete operations they grant. */
function grants(a: Allow, op: 'get' | 'list' | 'create' | 'update' | 'delete'): boolean {
  const group = op === 'get' || op === 'list' ? 'read' : 'write';
  return a.ops.includes(op) || a.ops.includes(group);
}

/** Splits a condition on top-level `||` (parentheses respected). */
function disjuncts(cond: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < cond.length; i++) {
    const ch = cond[i];
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (depth === 0 && cond.startsWith('||', i)) {
      out.push(cur.trim());
      cur = '';
      i++;
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out.map((d) => d.replace(/^\((.*)\)$/, '$1').trim());
}

const PRIVILEGED = new Set(['isAdmin()', 'isServiceAccount()']);
const privilegedOnly = (cond: string) => disjuncts(cond).every((d) => PRIVILEGED.has(d));

/** Every collection whose match block names start with one of these prefixes. */
function collectionsMatching(re: RegExp): string[] {
  return [...rules.matchAll(/match \/([a-z_]+)\/\{/g)].map((m) => m[1]).filter((c) => re.test(c));
}

const SERVER_ONLY = [
  'optimization_feedback',
  'optimization_recommendations',
  'optimization_experiments',
  'optimization_sessions',
  'optimization_patterns',
  'optimization_cycles',
  'optimization_daily_summaries',
  'optimization_weekly_reports',
  'tool_usage_stats',
  'tool_usage_calls',
  'learning_signals',
];

const DEVELOPER = [
  'developer_mcp_servers',
  'developer_tools',
  'developer_webhooks',
  'developer_activities',
  'developer_workflows',
  'developer_oauth_providers',
];

describe(`firestore.rules lockdown (${RULES_PATH})`, () => {
  it('finds every collection it checks (the checks below are not vacuous)', () => {
    for (const c of [
      ...SERVER_ONLY,
      ...DEVELOPER,
      'marketplace_tools',
      'marketplace_agents',
      'marketplace_publishers',
      'marketplace_installations',
    ]) {
      expect(allowsFor(c)?.length ?? 0, c).toBeGreaterThan(0);
    }
    // A new optimization_*/tool_usage_* collection is covered automatically.
    expect(collectionsMatching(/^(optimization_|tool_usage_|learning_signals$)/).sort()).toEqual(
      expect.arrayContaining([...SERVER_ONLY].sort())
    );
  });

  it('analytics and learning collections grant nothing beyond admin/service accounts', () => {
    const offenders: string[] = [];
    for (const c of collectionsMatching(/^(optimization_|tool_usage_|learning_signals$)/)) {
      for (const a of allowsFor(c) ?? []) {
        if (!privilegedOnly(a.cond))
          offenders.push(`${c}: allow ${a.ops.join(', ')}: if ${a.cond}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('developer_* collections take no client create/update/delete, and keep owner read', () => {
    const offenders: string[] = [];
    for (const c of DEVELOPER) {
      const allows = allowsFor(c) ?? [];
      for (const a of allows) {
        const writes = (['create', 'update', 'delete'] as const).some((op) => grants(a, op));
        if (writes && !privilegedOnly(a.cond)) {
          offenders.push(`${c}: allow ${a.ops.join(', ')}: if ${a.cond}`);
        }
      }
      const ownerRead = allows.some(
        (a) => grants(a, 'get') && a.cond.includes('resource.data.publisherId == request.auth.uid')
      );
      if (!ownerRead) offenders.push(`${c}: owner read rule missing`);
    }
    expect(offenders).toEqual([]);
  });

  /**
   * Each non-privileged path through `op` must carry `guard`. A disjunct that is
   * just isAdmin()/isServiceAccount() is exempt.
   */
  function unguardedPaths(collection: string, op: 'create' | 'update', guard: RegExp): string[] {
    return (allowsFor(collection) ?? [])
      .filter((a) => grants(a, op))
      .flatMap((a) => disjuncts(a.cond))
      .filter((d) => !PRIVILEGED.has(d) && !guard.test(d))
      .map((d) => `${collection} ${op}: ${d}`);
  }

  const affectedKeysGuard = (...keys: string[]) =>
    new RegExp(
      String.raw`!\s*request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\.hasAny\(\[` +
        keys.map((k) => String.raw`(?=[^\]]*'${k}')`).join('') +
        String.raw`[^\]]*\]\)`
    );

  it('marketplace tool/agent owners cannot change verification or publisher on update', () => {
    const guard = affectedKeysGuard('verification', 'publisher');
    expect([
      ...unguardedPaths('marketplace_tools', 'update', guard),
      ...unguardedPaths('marketplace_agents', 'update', guard),
    ]).toEqual([]);
  });

  it('marketplace tool/agent create cannot arrive verified', () => {
    // Either the check inline, or through clientVerificationOk(), which must check it.
    const guard = /clientVerificationOk\(request\.resource\.data\)|'verified', false\) == false/;
    expect([
      ...unguardedPaths('marketplace_tools', 'create', guard),
      ...unguardedPaths('marketplace_agents', 'create', guard),
    ]).toEqual([]);
    if (rules.includes('clientVerificationOk(')) {
      const fn =
        /function clientVerificationOk\(data\)\s*\{([\s\S]*?);\s*\}/.exec(rules)?.[1] ?? '';
      expect(fn.replace(/\s+/g, ' ')).toContain(".get('verified', false) == false");
    }
  });

  it('marketplace publishers cannot set or change their own verified flag', () => {
    expect([
      ...unguardedPaths('marketplace_publishers', 'create', /'verified', false\) == false/),
      ...unguardedPaths('marketplace_publishers', 'update', affectedKeysGuard('verified')),
    ]).toEqual([]);
  });

  it('marketplace installations cannot be moved to another userId on update', () => {
    expect(
      unguardedPaths('marketplace_installations', 'update', affectedKeysGuard('userId'))
    ).toEqual([]);
  });
});
