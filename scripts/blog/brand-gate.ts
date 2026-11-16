/**
 * The brand gate: what a draft must not do to be published. Pure:
 * the caller passes the word lists and the grounding text.
 */

import matter from 'gray-matter';
import { findTerm } from '../../apps/cli/src/commands/quality/check-brand-compliance.js';
import { RETIRED_STACK } from './brand-terms.js';

type Rule =
  'front-matter' | 'em-dash' | 'ellipsis' | 'forbidden-word' | 'retired-stack' | 'repetition';
export interface GateIssue {
  rule: Rule | 'real-claim' | 'number' | 'length' | 'not-live' | 'unsafe-link' | 'unsafe-html';
  message: string;
}

export interface GateOptions {
  terms: { words: string[]; phrases: string[] };
  /** The grounding pack's text. Without it the number rule is skipped. */
  sourceText?: string;
  words?: { min: number; max: number };
  /** Reject a line said twice, or the excerpt said again in the body (BLOG_REPEAT_GATE). */
  repeats?: boolean;
}

export const REQUIRED_FIELDS =
  'title excerpt author authorInitials authorColor date category readTime sources'.split(' ');

/** Phrases that present people or stories as real. Allowed only next to a composite label. */
const REAL_CLAIMS = [
  /\breal (?:stories|people who|users?|conversations with|moments from)\b/i,
  /\b(?:gave|granted|with) (?:us )?permission\b|\bpermission granted\b/i,
  /\bnames? (?:have been |has been )?changed\b/i,
  /\b(?:one|a|our) (?:user|listener|caller|member) (?:told|wrote|said|shared)\b/i,
  /\b(?:users|people) (?:tell|have told) us\b/i,
  /\b[A-Z][a-z]+(?:, \d{2})? (?:told us|wrote to us|shared with us)\b/,
  /["”]\s*(?:\n\s*>?\s*)?(?:-|--|–|—)\s*[A-Z][a-z]+/, // a quote signed with a name
  /["”],? (?:says|said|writes|wrote) [A-Z][a-z]+/,
];
const COMPOSITE_LABEL =
  /\b(?:composites?|illustrative|illustrations?|fictional|not real (?:users|people)|not a real person)\b/i;

/** Small counts ("two steps", "Part 3") need no source; anything else does. */
const FREE_NUMBER_MAX = 12;

/** Title, excerpt and body as a reader sees them, without code, comments or link targets. */
function prose(title: string, excerpt: string, body: string): string {
  return [title, excerpt, body]
    .join('\n')
    .replace(/```[\s\S]*?```|`[^`\n]*`|<!--[\s\S]*?-->|https?:\/\/\S+/g, ' ')
    .replace(/\]\([^)]*\)/g, ']')
    .replace(/\[?#\d+\]?/g, ' '); // PR and issue references
}

const around = (text: string, i: number): string =>
  text
    .slice(Math.max(0, i - 30), i + 40)
    .replace(/\s+/g, ' ')
    .trim();

function numberIssues(text: string, sourceText: string, postYear: string): GateIssue[] {
  const flat = sourceText.replace(/(\d),(\d)/g, '$1$2');
  const known = new Set(flat.match(/\d+(?:\.\d+)?%?/g) ?? []);
  const issues: GateIssue[] = [];
  for (const m of text.matchAll(/(?<![\w.])\d[\d,]*(?:\.\d+)?%?/g)) {
    const token = m[0].replace(/,/g, '').replace(/\.$/, '');
    const plain = token.replace(/%$/, '');
    const pct = token.endsWith('%');
    const free = !pct && Number.isInteger(Number(plain)) && Number(plain) <= FREE_NUMBER_MAX;
    const sourced = known.has(token) || (!pct && known.has(`${plain}%`)) || plain === postYear;
    const spelled = pct && flat.includes(`${plain} percent`);
    if (free || sourced || spelled) continue;
    const message = `"${m[0]}" isn't in the sources: "${around(text, m.index)}"`;
    issues.push({ rule: 'number', message });
  }
  return issues;
}

/**
 * How many words in a row count as saying a line again. Measured 2026-11-16:
 * six flagged 7 of 25 drafted letters the judge marked down on craft and 5 of
 * 25 published posts; five flagged 10 published posts, seven missed most
 * letters. Word counts alone flagged every published post (topic words
 * repeat), so they aren't checked.
 */
export const REPEAT_RUN = 6;

const words = (text: string): string[] =>
  [
    ...text
      .toLowerCase()
      .replace(/[’']/g, "'")
      .matchAll(/[a-z0-9][a-z0-9']*/g),
  ].map((m) => m[0]);

/**
 * Each stretch of `REPEAT_RUN` or more words in `text` that also appears in
 * `earlier`, longest match first and not overlapping. With `earlier`
 * omitted, a stretch counts when it appeared before in `text` itself.
 */
export function repeatedRuns(text: string[], earlier?: string[]): string[] {
  const seen = new Map<string, number>();
  const from = earlier ?? text;
  for (let j = 0; j + REPEAT_RUN <= from.length; j++) {
    const key = from.slice(j, j + REPEAT_RUN).join(' ');
    if (!seen.has(key)) seen.set(key, j);
  }
  const runs: string[] = [];
  for (let i = 0; i + REPEAT_RUN <= text.length; i++) {
    const j = seen.get(text.slice(i, i + REPEAT_RUN).join(' '));
    // Within one text, only a match that ends before this one starts.
    if (j === undefined || (!earlier && j + REPEAT_RUN > i)) continue;
    let len = REPEAT_RUN;
    while (
      i + len < text.length &&
      j + len < from.length &&
      (earlier || j + len < i) &&
      text[i + len] === from[j + len]
    )
      len++;
    runs.push(text.slice(i, i + len).join(' '));
    i += len - 1;
  }
  return runs;
}

function repeatIssues(excerpt: string, body: string): GateIssue[] {
  const bodyWords = words(prose('', '', body));
  const said = repeatedRuns(bodyWords).map((run) => ({
    rule: 'repetition' as const,
    message: `said twice in the post: "${run}". Say it once.`,
  }));
  const echoed = repeatedRuns(bodyWords, words(prose('', excerpt, ''))).map((run) => ({
    rule: 'repetition' as const,
    message: `the excerpt is repeated in the body: "${run}". Say it in new words or leave it out of the body.`,
  }));
  const unique = new Map([...said, ...echoed].map((i) => [i.message, i]));
  return [...unique.values()].slice(0, 6);
}

function frontMatterIssues(data: Record<string, unknown>): GateIssue[] {
  return REQUIRED_FIELDS.filter((f) => {
    const v = data[f];
    return v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
  }).map((f) => ({ rule: 'front-matter', message: `missing front-matter field "${f}"` }));
}

function textIssues(text: string, terms: GateOptions['terms']): GateIssue[] {
  const issues: GateIssue[] = [];
  const add = (rule: Rule, what: string, at: number): number =>
    issues.push({ rule, message: `${what}: "${around(text, at)}"` });
  for (const m of text.matchAll(/—|\s–\s/g)) add('em-dash', 'an em dash', m.index);
  for (const m of text.matchAll(/\.\.\.|…/g)) add('ellipsis', 'an ellipsis', m.index);
  for (const term of [...terms.phrases, ...terms.words]) {
    const at = findTerm(text, term);
    if (at >= 0) add('forbidden-word', `"${term}"`, at);
  }
  for (const name of RETIRED_STACK) {
    const at = findTerm(text, name);
    if (at >= 0) add('retired-stack', `${name} is retired`, at);
  }
  if (COMPOSITE_LABEL.test(text)) return issues;
  for (const m of REAL_CLAIMS.map((p) => p.exec(text)).filter((x) => x !== null)) {
    const message = `presents people or stories as real, with no composite label: "${around(text, m.index)}"`;
    issues.push({ rule: 'real-claim', message });
  }
  return issues;
}

export function checkPost(markdown: string, opts: GateOptions): GateIssue[] {
  let parsed: { data: Record<string, unknown>; content: string };
  try {
    parsed = matter(markdown);
  } catch (error) {
    return [{ rule: 'front-matter', message: `unparseable front matter: ${String(error)}` }];
  }
  const { data, content: body } = parsed;
  const text = prose(String(data.title ?? ''), String(data.excerpt ?? ''), body);
  const issues = [...frontMatterIssues(data), ...textIssues(text, opts.terms)];
  if (opts.repeats) issues.push(...repeatIssues(String(data.excerpt ?? ''), body));

  if (opts.sourceText !== undefined) {
    const date = data.date instanceof Date ? data.date.toISOString() : String(data.date ?? '');
    issues.push(...numberIssues(text, opts.sourceText, date.slice(0, 4)));
  }
  const count = body.split(/\s+/).filter(Boolean).length;
  if (opts.words && (count < opts.words.min * 0.8 || count > opts.words.max * 1.2)) {
    const message = `${count} words; aim for ${opts.words.min} to ${opts.words.max}`;
    issues.push({ rule: 'length', message });
  }
  return issues;
}
