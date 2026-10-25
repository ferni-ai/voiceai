#!/usr/bin/env node
/**
 * The flags production's web app is built and served with, for the menu gate
 * (menu-e2e.yml) and the nightly walk (signed-in-e2e.yml), so they walk the menu
 * app.ferni.ai shows and not a default build's. Until 2026-10-25 the gate's build had
 * no flags: it tested "Your Contribution" and the old "What I've learned" panel, which
 * prod no longer shows, and never opened What Ferni Knows or Chip In, which it does.
 *
 *   node scripts/ci/prod-web-flags.mjs web     VITE_* lines for apps/web/.env.development.local
 *   node scripts/ci/prod-web-flags.mjs server  KEY=on|off lines for the API server's env
 *   node scripts/ci/prod-web-flags.mjs diff    a default build vs prod's, as a markdown table
 *
 * web: the VITE_* env of deploy-firebase.yml's "Build frontend" step, the app.ferni.ai
 * build. Each `${{ vars.X }}` or `${{ vars.X || 'default' }}` there is resolved from the
 * step's PROD_VAR_X, which the workflow sets from the same repo variable, so a variable
 * flipped for prod is flipped here too. Only the variables that build reads are passed,
 * never `toJSON(vars)`: this repo is public and a step's env is printed in its log. An
 * account (the Venmo handle) is never passed at all, only whether it is set
 * (PROD_VAR_X_SET), and the walk gets a placeholder of the same shape. The names must
 * match the build's exactly, both ways, or this fails: a flag added to the build can't
 * be left out of the walk unnoticed.
 * server: the on/off flags of deploy/ui-server/env.yaml (the API server's prod env).
 *
 * Read by line, as workflow-concurrency.mjs does: the repo has no YAML library at its root.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const WEB_BUILD = '.github/workflows/deploy-firebase.yml';
export const WEB_BUILD_STEP = 'Build frontend';
export const SERVER_ENV = 'deploy/ui-server/env.yaml';

/** Set in prod, and an account rather than a switch: the walk gets one of the same shape. */
export const PLACEHOLDERS = { VITE_VENMO_HANDLE: 'ferni-e2e-placeholder' };

const VAR_REF = /^\$\{\{\s*vars\.([A-Za-z0-9_]+)\s*(?:\|\|\s*'([^']*)'\s*)?\}\}$/;

/** The VITE_* entries of one step's env block: name -> raw value. */
export function stepEnv(workflow, stepName) {
  const lines = workflow.split('\n');
  const start = lines.findIndex((l) => l.trim() === `- name: ${stepName}`);
  if (start < 0) throw new Error(`no "${stepName}" step`);
  const env = {};
  for (const line of lines.slice(start + 1)) {
    if (/^\s*- (name|uses):/.test(line)) break;
    const m = /^\s+(VITE_[A-Z0-9_]+):\s*(.+?)\s*$/.exec(line);
    if (m) env[m[1]] = m[2];
  }
  if (Object.keys(env).length === 0) throw new Error(`"${stepName}" sets no VITE_* flag`);
  return env;
}

/** One value as the workflow would see it, from the repo variables. */
export function resolve(name, raw, vars) {
  const m = VAR_REF.exec(raw);
  if (!m) throw new Error(`${name}: "${raw}" is not \${{ vars.X }} or \${{ vars.X || 'y' }}`);
  const value = vars[m[1]];
  return value === undefined || value === '' ? (m[2] ?? '') : String(value);
}

/** Prod's VITE_* values, with placeholders for the accounts. */
export function webFlags(workflow, vars) {
  const out = {};
  for (const [name, raw] of Object.entries(stepEnv(workflow, WEB_BUILD_STEP))) {
    const value = resolve(name, raw, vars);
    out[name] = value && PLACEHOLDERS[name] ? PLACEHOLDERS[name] : value;
  }
  return out;
}

/** The on/off flags of the API server's prod env. */
export function serverFlags(envYaml) {
  const out = {};
  for (const line of envYaml.split('\n')) {
    const m = /^([A-Z][A-Z0-9_]*):\s*"(on|off)"\s*$/.exec(line);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

/** A default build (nothing set) next to prod's, one row per flag. */
export function diffTable(flags) {
  const rows = Object.entries(flags).map(([name, value]) => {
    const prod = PLACEHOLDERS[name] && value ? '(set, placeholder)' : value || '(unset)';
    return `| ${name} | (unset) | ${prod} |`;
  });
  return ['| Flag | Default build | Prod build (the walk now) |', '|---|---|---|', ...rows].join(
    '\n'
  );
}

export const VAR_PREFIX = 'PROD_VAR_';

/** The repo variables the build reads, from the PROD_VAR_* env the workflow passes. */
export function varsFromEnv(workflow, env) {
  const wanted = new Set();
  for (const [name, raw] of Object.entries(stepEnv(workflow, WEB_BUILD_STEP))) {
    const m = VAR_REF.exec(raw);
    if (!m) throw new Error(`${name}: "${raw}" is not \${{ vars.X }} or \${{ vars.X || 'y' }}`);
    wanted.add(PLACEHOLDERS[m[1]] ? `${VAR_PREFIX}${m[1]}_SET` : `${VAR_PREFIX}${m[1]}`);
  }
  const passed = Object.keys(env).filter((k) => k.startsWith(VAR_PREFIX));
  const missing = [...wanted].filter((k) => env[k] === undefined);
  const extra = passed.filter((k) => !wanted.has(k));
  if (missing.length || extra.length) {
    throw new Error(
      `pass exactly the variables ${WEB_BUILD} builds with` +
        (missing.length ? `; missing: ${missing.join(', ')}` : '') +
        (extra.length ? `; not read by the build: ${extra.join(', ')}` : '')
    );
  }
  const vars = {};
  for (const key of wanted) {
    const name = key.slice(VAR_PREFIX.length).replace(/_SET$/, '');
    if (!PLACEHOLDERS[name]) vars[name] = env[key];
    else if (env[key] === 'true') vars[name] = PLACEHOLDERS[name];
    else if (env[key] !== 'false') throw new Error(`${key} must be true or false`);
  }
  return vars;
}

const lines = (flags) => Object.entries(flags).map(([k, v]) => `${k}=${v}`);

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const read = (p) => readFileSync(join(ROOT, p), 'utf8');
  const mode = process.argv[2];
  try {
    const web = () => webFlags(read(WEB_BUILD), varsFromEnv(read(WEB_BUILD), process.env));
    if (mode === 'web') console.log(lines(web()).join('\n'));
    else if (mode === 'server') console.log(lines(serverFlags(read(SERVER_ENV))).join('\n'));
    else if (mode === 'diff') console.log(diffTable(web()));
    else throw new Error('usage: prod-web-flags.mjs web|server|diff');
  } catch (error) {
    console.error(`::error::prod-web-flags: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}
