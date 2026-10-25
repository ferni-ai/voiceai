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
 * build. Each `${{ vars.X }}` or `${{ vars.X || 'default' }}` is resolved from VARS_JSON
 * (the workflow passes `${{ toJSON(vars) }}`), so a repo variable flipped for prod is
 * flipped here too, with no second copy to keep in step. Values that name a real
 * account (the Venmo handle) become a placeholder of the same shape.
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

function varsFromEnv() {
  const raw = process.env.VARS_JSON;
  if (raw === undefined) throw new Error('VARS_JSON is not set (pass ${{ toJSON(vars) }})');
  return JSON.parse(raw || '{}');
}

const lines = (flags) => Object.entries(flags).map(([k, v]) => `${k}=${v}`);

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const read = (p) => readFileSync(join(ROOT, p), 'utf8');
  const mode = process.argv[2];
  try {
    if (mode === 'web') console.log(lines(webFlags(read(WEB_BUILD), varsFromEnv())).join('\n'));
    else if (mode === 'server') console.log(lines(serverFlags(read(SERVER_ENV))).join('\n'));
    else if (mode === 'diff') console.log(diffTable(webFlags(read(WEB_BUILD), varsFromEnv())));
    else throw new Error('usage: prod-web-flags.mjs web|server|diff');
  } catch (error) {
    console.error(`::error::prod-web-flags: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}
