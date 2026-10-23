/**
 * Input hardening. Developer posts publish with no person reviewing them and the repo is
 * public, so text the drafter didn't write is data, never instructions:
 * - Only PRs by org members or collaborators are read (`trustedAuthor`).
 * - PR titles and bodies lose every URL, all HTML and template tags before
 *   the model sees them (`stripMarkup`), and each body is cut to MAX_PR_BODY.
 * - A draft that links anywhere off LINK_ALLOWLIST, or carries raw HTML or a
 *   Nunjucks tag, is rejected outright with no retry (`unsafeOutput`).
 */

import type { GateIssue } from './brand-gate.js';
import type { GhRunner } from './grounding.js';

/** Characters of each PR body the model sees. */
export const MAX_PR_BODY = 2000;
/** Characters of a model answer; the longest post type runs well under this. */
export const MAX_ANSWER_CHARS = 20_000;

/** Where a draft may link: the site's own pages, ferni.ai and its subdomains, the org on GitHub. */
export const LINK_ALLOWLIST = [
  'relative links on the site (/path or #anchor)',
  'ferni.ai and *.ferni.ai',
  'github.com/ferni-ai/*',
];

const TRUSTED_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
const WRITE_ROLES = new Set(['admin', 'maintain', 'write']);

export interface PrAuthor {
  number: number;
  user: { login: string; type: string } | null;
  author_association?: string;
}

/**
 * Whether a PR's author is an org member or collaborator. author_association
 * reads CONTRIBUTOR for a member whose org membership is private, so anyone
 * else is checked by their permission on the repo: write or above is trusted.
 * Bots never are. A failed lookup counts as untrusted.
 */
export function trustedAuthor(
  pr: PrAuthor,
  repo: string,
  gh: GhRunner,
  cache = new Map<string, boolean>()
): boolean {
  const login = pr.user?.login;
  if (!login || pr.user?.type === 'Bot' || login.endsWith('[bot]')) return false;
  if (TRUSTED_ASSOCIATIONS.has(pr.author_association ?? '')) return true;
  let trusted = cache.get(login);
  if (trusted === undefined) {
    try {
      const url = `repos/${repo}/collaborators/${encodeURIComponent(login)}/permission`;
      const { permission } = JSON.parse(gh(['api', url])) as { permission?: string };
      trusted = WRITE_ROLES.has(permission ?? '');
    } catch {
      trusted = false;
    }
    cache.set(login, trusted);
  }
  if (!trusted)
    console.error(`Left out PR #${pr.number}: ${login} is not a member or collaborator`);
  return trusted;
}

// Bare domains only: the site's markdown-it doesn't linkify, so this list stays
// short enough that names like Socket.io or deploy.sh in a post aren't caught.
const TLDS = 'com|net|org|ai|app|dev|co|xyz|info|biz|ly|gg|site|online|link|click|top|ru|cn';
const URL_ANYWHERE = /\b[a-z][a-z0-9+.-]*:\/\/[^\s<>"'`)\]]+/gi;
const WWW = /\bwww\.[^\s<>"'`)\]]+/gi;
const BARE_DOMAIN = new RegExp(
  `(?<![\\w@.-])(?:[a-z0-9-]+\\.)+(?:${TLDS})\\b(?:/[^\\s<>"'\`)\\]]*)?`,
  'gi'
);
const SCRIPT_SCHEME = /\b(?:javascript|vbscript|data|file):(?=\S)/gi;
/** Markdown posts run through Nunjucks before markdown (markdownTemplateEngine: 'njk'). */
const TEMPLATE_TAG = /\{[{%#]|[}%#]\}/g;
const RAW_HTML = /<\/?[a-z][\w:-]*(?:\s[^<>]*)?\/?>/gi;
const DANGEROUS_BLOCK =
  /<(script|style|iframe|object|embed|template|noscript|svg|math)\b[\s\S]*?(?:<\/\1\s*>|$)/gi;

/** PR text without HTML, links or URLs, as the model may read it. */
export function stripMarkup(text: string): string {
  return text
    .replace(/<!--[\s\S]*?(?:-->|$)/g, ' ')
    .replace(DANGEROUS_BLOCK, ' ')
    .replace(RAW_HTML, ' ')
    .replace(/<(?=[a-z!?/])/gi, '') // an unclosed tag left behind
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // [text](target) keeps the text
    .replace(/^[ \t]*\[[^\]]+\]:.*$/gm, ' ') // [ref]: target
    .replace(URL_ANYWHERE, ' ')
    .replace(WWW, ' ')
    .replace(BARE_DOMAIN, ' ')
    .replace(SCRIPT_SCHEME, ' ')
    .replace(TEMPLATE_TAG, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Whether a draft may link to `target`. */
export function allowedLink(target: string): boolean {
  if (/^#|^\/(?![/\\])/.test(target)) return true;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(target) ? target : `https://${target}`);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  if (host === 'ferni.ai' || host.endsWith('.ferni.ai')) return true;
  return host === 'github.com' && /^\/ferni-ai\//i.test(url.pathname);
}

/** Every link target in a draft: markdown, reference, autolink, HTML attribute or bare URL. */
export function linkTargets(markdown: string): string[] {
  const patterns = [
    /\]\(\s*<?([^\s)>]+)/g,
    /^[ \t]*\[[^\]]+\]:\s*<?(\S+?)>?(?:\s|$)/gm,
    /<([a-z][a-z0-9+.-]*:[^>\s]+)>/gi,
    new RegExp(URL_ANYWHERE.source, 'gi'),
    new RegExp(WWW.source, 'gi'),
    new RegExp(BARE_DOMAIN.source, 'gi'),
  ];
  const found = patterns.flatMap((p) => [...markdown.matchAll(p)].map((m) => m[1] ?? m[0]));
  return [...new Set(found.map((t) => t.replace(/[.,;:!?]+$/, '')))];
}

/** A tag opening (closed or not), a comment, CDATA or a processing instruction. */
const HTML_START = /<\/?[a-z][\w:-]*(?=[\s/>]|$)|<!--|<!\[CDATA\[|<\?/gim;
/** Code that markdown escapes; the HTML check skips it (links and template tags don't). */
const CODE = /```[\s\S]*?```|`[^`\n]*`/g;

/**
 * Why a draft must not publish at all. Every link target, inside code or not,
 * must be on the allowlist (so no javascript: or data: links either). Raw HTML
 * outside code is refused, and so is any Nunjucks tag, which the site would run.
 */
export function unsafeOutput(markdown: string): GateIssue[] {
  const issues: GateIssue[] = linkTargets(markdown)
    .filter((t) => !allowedLink(t))
    .map((t) => ({ rule: 'unsafe-link', message: `links off the allowlist: ${t}` }));
  for (const m of markdown.replace(CODE, ' ').matchAll(HTML_START))
    issues.push({ rule: 'unsafe-html', message: `raw HTML: ${m[0]}` });
  for (const m of markdown.matchAll(/\{[{%#]/g))
    issues.push({ rule: 'unsafe-html', message: `a template tag: ${m[0]}` });
  return issues;
}
