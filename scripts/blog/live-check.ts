/**
 * Is it live? Developer posts publish with no person reviewing them, so a post may only
 * cite a merged PR whose change people can use today. Two rules, both
 * conservative: when in doubt a PR is left out.
 *
 * Deployed. Every merge to main deploys the web app (apps/web), the website
 * (apps/website/ferni-website) and the developers portal
 * (apps/website/developers-portal), so a PR that touches only those is live
 * once merged. Everything else, the voice agent above all, reaches production by a
 * manual `lk agent deploy`, and nothing committed records which commit
 * production runs, so such a PR counts only once it has been merged for
 * SETTLE_DAYS days.
 *
 * Not behind a flag. A PR is left out when its title or body says the change
 * is behind a flag, off by default, not wired or dev-only, when it names a
 * flag the manifest (src/config/flags/*.ts and src/config/flag-manifest*.ts)
 * has off (or shadow) by default, or when its diff adds an off-by-default
 * manifest entry or touches a web `*-flag.ts` file.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { GhRunner } from './grounding.js';

export const SETTLE_DAYS = 7;
const DAY = 86_400_000;

/**
 * Paths that main deploys on every merge: deploy-firebase.yml (app and landing)
 * and deploy-developers.yml (developers portal).
 */
export const DEPLOYED_ON_MERGE = /^apps\/(?:web|website\/(?:ferni-website|developers-portal))\//;

const CONFIG_DIR = 'src/config';
const LEGACY_MANIFEST = /^flag-manifest[\w-]*\.ts$/;
const FLAG_FILE = /^([A-Z][A-Z0-9_]*)\.ts$/;
const MANIFEST_FILE = /^src\/config\/(?:flag-manifest[\w-]*|flags\/[A-Z][A-Z0-9_]*)\.ts$/;
const OFF_ENTRY = /^\s*([A-Z][A-Z0-9_]*): \{ default: '(?:off|shadow)'/gm;
const OFF_DEFAULT = /^\s*default: '(?:off|shadow)'/m;
const WEB_FLAG_FILE = /(?:^|\/)[\w.-]+-flag\.ts$/;

/** What a PR's title or body says when its change ships switched off. */
const FLAG_PHRASES = [
  /\bbehind (?:an? |the |its |their )?(?:[`'"]?[\w:./-]+[`'"]? )?(?:feature[- ])?(?:flag|switch)(?:es|s)?\b/i,
  /\boff[- ]by[- ]default\b/i,
  /\bdefaults? (?:to )?off\b/i,
  /\b(?:flag|switch) (?:is |stays |left )?off\b/i,
  /\bnot wired\b/i,
  /\bdev[- ]only\b/i,
  /\bferni:flag:/,
  /\bVITE_[A-Z0-9_]+=true\b/,
];

export interface LivePr {
  number: number;
  title: string;
  body: string;
  /** ISO timestamp */
  mergedAt: string;
}

export interface PrFile {
  filename: string;
  status?: string;
  patch?: string;
}

export interface LiveContext {
  root: string;
  repo: string;
  gh: GhRunner;
  /** YYYY-MM-DD */
  today: string;
}

const listDir = (dir: string): string[] => (fs.existsSync(dir) ? fs.readdirSync(dir) : []);

/**
 * Flags the manifest has off (or shadow) by default: every flags/<NAME>.ts file and
 * every entry line in the legacy flag-manifest*.ts files.
 */
export function offFlags(root: string): Set<string> {
  const names = new Set<string>();
  const config = path.join(root, CONFIG_DIR);
  for (const file of listDir(config).filter((f) => LEGACY_MANIFEST.test(f))) {
    for (const m of fs.readFileSync(path.join(config, file), 'utf-8').matchAll(OFF_ENTRY)) {
      names.add(m[1]);
    }
  }
  const flags = path.join(config, 'flags');
  for (const file of listDir(flags)) {
    const name = FLAG_FILE.exec(file)?.[1];
    if (name && OFF_DEFAULT.test(fs.readFileSync(path.join(flags, file), 'utf-8'))) names.add(name);
  }
  return names;
}

/** The legacy flag-manifest*.ts files, as text. */
function manifestTexts(root: string): string[] {
  const config = path.join(root, CONFIG_DIR);
  return listDir(config)
    .filter((f) => LEGACY_MANIFEST.test(f))
    .map((f) => fs.readFileSync(path.join(config, f), 'utf-8'));
}

/**
 * Each off-by-default flag, with the comment right above it when there is one
 * (legacy manifest entries); a flags/<NAME>.ts flag by its name.
 */
export function offFlagNotes(root: string): string[] {
  const notes = new Map<string, string>();
  for (const text of manifestTexts(root)) {
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      const name = new RegExp(OFF_ENTRY.source).exec(line)?.[1];
      const note = /^\s*\/\/ ?(.*)$/.exec(lines[i - 1] ?? '')?.[1];
      if (name) notes.set(name, note ? `${name}: ${note.trim()}` : name);
    });
  }
  for (const name of offFlags(root)) if (!notes.has(name)) notes.set(name, name);
  return [...notes.values()].sort();
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Why the title or body says the change is switched off, or undefined. */
export function textFlagReason(
  pr: Pick<LivePr, 'title' | 'body'>,
  off: Set<string>
): string | undefined {
  const text = `${pr.title}\n${pr.body}`;
  const phrase = FLAG_PHRASES.map((p) => p.exec(text)).find((m) => m !== null);
  if (phrase) return `says "${phrase[0]}"`;
  for (const name of off) {
    // A bare word like CANDOR or CI only counts in backticks; a SNAKE_CASE name anywhere.
    const pattern = name.includes('_') ? `\\b${escape(name)}\\b` : `\`${escape(name)}\``;
    if (new RegExp(pattern).test(text)) return `names ${name}, off by default in the flag manifest`;
  }
  return undefined;
}

/** Why the diff adds a switched-off flag, or undefined. */
export function diffFlagReason(files: PrFile[]): string | undefined {
  for (const f of files) {
    if (MANIFEST_FILE.test(f.filename) && /^\+.*default: '(?:off|shadow)'/m.test(f.patch ?? ''))
      return `adds an off-by-default flag to ${f.filename}`;
    if (WEB_FLAG_FILE.test(f.filename)) return `changes the web flag file ${f.filename}`;
  }
  return undefined;
}

/** Why the change may not be in production yet, or undefined. */
export function deployReason(pr: LivePr, files: PrFile[], today: string): string | undefined {
  if (files.length > 0 && files.every((f) => DEPLOYED_ON_MERGE.test(f.filename))) return undefined;
  const settled = Date.parse(`${today}T00:00:00Z`) - SETTLE_DAYS * DAY;
  if (Date.parse(pr.mergedAt) <= settled) return undefined;
  return `touches more than the web app and website, and was merged under ${SETTLE_DAYS} days ago`;
}

/** Every file a PR changed (REST pages of 100; GitHub lists at most 3000). */
export function prFiles(number: number, repo: string, gh: GhRunner): PrFile[] {
  const files: PrFile[] = [];
  for (let page = 1; page <= 30; page++) {
    const url = `repos/${repo}/pulls/${number}/files?per_page=100&page=${page}`;
    const batch = JSON.parse(gh(['api', url])) as PrFile[];
    files.push(...batch);
    if (batch.length < 100) break;
  }
  return files;
}

/**
 * Why a merged PR is not live, or undefined when it is. The text rule runs
 * first so a PR that says it's flagged costs no API call.
 */
export function notLiveReason(
  pr: LivePr,
  ctx: LiveContext,
  off = offFlags(ctx.root)
): string | undefined {
  const text = textFlagReason(pr, off);
  if (text) return text;
  const files = prFiles(pr.number, ctx.repo, ctx.gh);
  return diffFlagReason(files) ?? deployReason(pr, files, ctx.today);
}

/** Every PR a post links to or lists in its `sources`. */
export function citedPrNumbers(markdown: string): number[] {
  const found = [...markdown.matchAll(/\/pull\/(\d+)\b|\bPR #(\d+)\b/g)].map((m) =>
    Number(m[1] ?? m[2])
  );
  return [...new Set(found)].sort((a, b) => a - b);
}

/** The first `limit` live PRs, in order, checking no more than it needs to. */
export function liveOnly<T extends LivePr>(prs: T[], ctx: LiveContext, limit: number): T[] {
  const off = offFlags(ctx.root);
  const live: T[] = [];
  for (const pr of prs) {
    if (live.length >= limit) break;
    const reason = notLiveReason(pr, ctx, off);
    if (reason) console.error(`Left out PR #${pr.number}: ${reason}`);
    else live.push(pr);
  }
  return live;
}
