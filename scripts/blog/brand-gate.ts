/**
 * The brand gate: what a draft must not do to be published. Pure:
 * the caller passes the word lists and the grounding text.
 */

import matter from 'gray-matter';
import { findTerm } from '../../apps/cli/src/commands/quality/check-brand-compliance.js';
import { RETIRED_STACK } from './brand-terms.js';

type Rule = 'front-matter' | 'em-dash' | 'ellipsis' | 'forbidden-word' | 'retired-stack';
export interface GateIssue {
  rule: Rule | 'real-claim' | 'number' | 'length' | 'not-live' | 'unsafe-link' | 'unsafe-html';
  message: string;
}

export interface GateOptions {
  terms: { words: string[]; phrases: string[] };
  /** The grounding pack's text. Without it the number rule is skipped. */
  sourceText?: string;
  words?: { min: number; max: number };
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
