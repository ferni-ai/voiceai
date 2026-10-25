/**
 * Fails when user-facing copy makes a privacy promise Ferni can't keep.
 *
 * Ferni saves conversations to remember people, outside providers process them
 * to make Ferni work, and deleting the account erases them. Copy that says the
 * opposite ("stays between us", "never shared", "we don't store") was on the
 * website, the landing FAQ and in the app until 2026-10-18. This scan keeps it
 * from coming back: it reads the website sources (and the built site when
 * present), the server and persona sources, and the web app's code and strings.
 *
 * A legitimate sentence that happens to match (a negation about something else,
 * like Plaid never sharing bank credentials) goes in
 * scripts/privacy-claims-allowlist.json with the file, a fragment of the line
 * and the reason.
 *
 * Usage: pnpm tsx scripts/check-privacy-claims.ts   (exit 1 on any finding)
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

export interface Banned {
  id: string;
  pattern: RegExp;
}

/** Promises the product can't keep. Matched case-insensitively, apostrophes normalized. */
export const BANNED: Banned[] = [
  { id: 'stays-between-us', pattern: /\bstays?\s+(?:just\s+)?between\s+us\b/i },
  { id: 'never-shared', pattern: /\bnever\s+(?:sold\s+or\s+)?shared\b/i },
  {
    id: 'we-dont-store',
    pattern: /\bwe\s+(?:do\s+not|don't)\s+(?:store|keep|save)\s+(?:your|any|it|them|what)\b/i,
  },
  { id: 'only-you-can-see', pattern: /\bonly\s+you\s+can\s+(?:see|read|access)\b/i },
  {
    id: 'end-to-end-encrypted',
    pattern: /\bend-to-end\s+encrypt|\bencrypted\s+end-to-end\b/i,
  },
  {
    id: 'data-stays-private',
    pattern: /\b(?:data|conversations?|information)\s+(?:stays?|remains?)\s+private\b/i,
  },
];

export interface AllowEntry {
  file: string;
  contains: string;
  reason: string;
}

export interface Finding {
  file: string;
  line: number;
  id: string;
  text: string;
}

/** Roots relative to the repo, with the extensions read under each. */
export const SCAN_ROOTS: Array<{ dir: string; exts: string[] }> = [
  { dir: 'apps/website/ferni-website/src', exts: ['.njk', '.html', '.md', '.json', '.js'] },
  { dir: 'apps/website/ferni-website/_site', exts: ['.html'] },
  { dir: 'src', exts: ['.ts', '.json', '.md'] },
  { dir: 'apps/web/src', exts: ['.ts', '.json'] },
  { dir: 'apps/web/public', exts: ['.html'] },
];

const SKIP_DIRS = new Set(['node_modules', '__tests__', 'dist', 'tests', '.git']);
const SKIP_FILE = /\.(?:test|spec)\.[a-z]+$/;

function normalize(line: string): string {
  return line.replace(/[‘’ʼ]/g, "'");
}

/** Every banned phrase in one file's text. */
export function scanText(text: string, file: string): Finding[] {
  const findings: Finding[] = [];
  text.split('\n').forEach((raw, i) => {
    const line = normalize(raw);
    for (const b of BANNED) {
      if (b.pattern.test(line)) {
        findings.push({ file, line: i + 1, id: b.id, text: raw.trim() });
      }
    }
  });
  return findings;
}

function* walk(dir: string, exts: string[]): Generator<string> {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(path.join(dir, entry.name), exts);
    } else if (exts.includes(path.extname(entry.name)) && !SKIP_FILE.test(entry.name)) {
      yield path.join(dir, entry.name);
    }
  }
}

export function isAllowed(f: Finding, allow: AllowEntry[]): boolean {
  return allow.some((a) => a.file === f.file && f.text.includes(a.contains));
}

/** Findings under `root` that no allowlist entry covers. */
export function scanRepo(root: string, allow: AllowEntry[]): Finding[] {
  const out: Finding[] = [];
  for (const { dir, exts } of SCAN_ROOTS) {
    for (const abs of walk(path.join(root, dir), exts)) {
      const rel = path.relative(root, abs).split(path.sep).join('/');
      for (const f of scanText(fs.readFileSync(abs, 'utf8'), rel)) {
        if (!isAllowed(f, allow)) out.push(f);
      }
    }
  }
  return out;
}

export const ALLOWLIST_FILE = 'scripts/privacy-claims-allowlist.json';

export function loadAllowlist(root: string): AllowEntry[] {
  return JSON.parse(fs.readFileSync(path.join(root, ALLOWLIST_FILE), 'utf8')) as AllowEntry[];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.cwd();
  const findings = scanRepo(root, loadAllowlist(root));
  for (const f of findings) {
    process.stdout.write(`${f.file}:${f.line} [${f.id}] ${f.text.slice(0, 200)}\n`);
  }
  if (findings.length > 0) {
    process.stdout.write(
      `\n${findings.length} privacy claim(s) Ferni can't keep. Say what's true instead: Ferni saves ` +
        `conversations to remember you, never sells them, outside providers process them to make ` +
        `Ferni work, and deleting the account erases them. A legitimate match goes in ${ALLOWLIST_FILE}.\n`
    );
    process.exit(1);
  }
  process.stdout.write('No false privacy claims found.\n');
}
