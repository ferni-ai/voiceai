/**
 * One draft, start to finish: gather the facts, ask the model, run the brand
 * gate, retry once with the gate's findings, and write the post only if it
 * passes. Everything outside (gh, the model, the disk, the date) is passed in.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { checkPost, type GateIssue, type GateOptions } from './brand-gate.js';
import { forbiddenTerms } from './brand-terms.js';
import { existingPosts, slugify } from './existing-posts.js';
import { renderPack, sourceList, type GhRunner, type Source } from './grounding.js';
import type { DraftModel } from './model.js';
import { getPostType, type PostType } from './post-types.js';
import { buildPrompt, parseDraft, type DraftText } from './prompt.js';
import { characterLabel, letterAuthor, pickPersona } from './team-letter.js';
import { NEEDS_PRS, collectSources } from './type-sources.js';
import { MAX_ANSWER_CHARS, unsafeOutput } from './untrusted-text.js';

export interface DraftDeps {
  root: string;
  repo: string;
  gh: GhRunner;
  /** YYYY-MM-DD */
  today: string;
  model?: DraftModel;
  writeFile?: (file: string, content: string) => void;
  /** Whether a post file already exists; defaults to the real folder. */
  fileExists?: (file: string) => boolean;
}

export interface DraftOptions {
  type: string;
  since?: string;
  persona?: string;
  dryRun?: boolean;
}

export interface DraftResult {
  status: 'written' | 'dry-run' | 'nothing-to-draft' | 'rejected';
  type: string;
  prompt: string;
  sources: Source[];
  path?: string;
  /** The written post's title, for the log line (see log-safe.ts). */
  title?: string;
  markdown?: string;
  issues: GateIssue[];
}

interface PostMeta {
  author: PostType['author'];
  date: string;
  sources: Source[];
  seriesPart?: number;
  label?: string;
}

interface Attempt {
  draft?: DraftText;
  markdown?: string;
  issues: GateIssue[];
  /** An off-allowlist link or raw HTML: rejected at once, never retried. */
  unsafe?: boolean;
}

export const ATTEMPTS = 2;
const DAY = 86_400_000;

export function isoWeek(day: string): number {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  return Math.ceil(((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY + 1) / 7);
}

/** whats-new covers everything since the last dev post; the others look back a few weeks. */
function defaultSince(type: PostType, lastPost: string | undefined, today: string): string {
  const back = (n: number): string =>
    new Date(Date.parse(today) - n * DAY).toISOString().slice(0, 10);
  if (type.id === 'whats-new') return lastPost ?? back(7);
  return back(type.id === 'how-ferni-works' ? 30 : 14);
}

export function renderPost(type: PostType, draft: DraftText, meta: PostMeta): string {
  const q = (s: string): string => JSON.stringify(s);
  const body = [meta.label, draft.body.trim()].filter(Boolean).join('\n\n');
  const words = body.split(/\s+/).filter(Boolean).length;
  const series = type.series ? [`series: ${q(type.series)}`, `seriesPart: ${meta.seriesPart}`] : [];
  const sources = sourceList(meta.sources).map((s) => `  - ${q(s)}`);
  return `---
title: ${q(draft.title)}
excerpt: ${q(draft.excerpt)}
author: ${q(meta.author.name)}
authorInitials: ${q(meta.author.initials)}
authorColor: ${q(meta.author.color)}
date: ${meta.date}
category: ${q(type.category)}
readTime: ${Math.max(1, Math.round(words / 200))}
${[...series, 'sources:', ...sources].join('\n')}
---

${body}
`;
}

/**
 * One model call through the gate. An answer that won't parse is a failure like any other;
 * a failed call (auth, quota, network) throws, so it isn't reported as a brand-gate failure.
 */
async function attempt(
  prompt: string,
  model: DraftModel,
  render: (d: DraftText) => string,
  gate: GateOptions
): Promise<Attempt> {
  const answer = await model.generate(prompt);
  if (answer.length > MAX_ANSWER_CHARS) {
    const message = `answer is ${answer.length} characters; the cap is ${MAX_ANSWER_CHARS}`;
    return { issues: [{ rule: 'length', message }] };
  }
  try {
    const draft = parseDraft(answer);
    const markdown = render(draft);
    const unsafe = unsafeOutput(markdown);
    if (unsafe.length > 0) return { draft, markdown, issues: unsafe, unsafe: true };
    return { draft, markdown, issues: checkPost(markdown, gate) };
  } catch (error) {
    return { issues: [{ rule: 'front-matter', message: `unreadable answer: ${String(error)}` }] };
  }
}

/** `<slug>.md` in the folder, or `<slug>-2.md` and on if that's taken. */
function freePath(
  folder: string,
  title: string,
  exists: (file: string) => boolean = fs.existsSync
): string {
  const slug = slugify(title);
  let file = path.join(folder, `${slug}.md`);
  for (let i = 2; exists(file); i++) file = path.join(folder, `${slug}-${i}.md`);
  return file;
}

export async function draftPost(opts: DraftOptions, deps: DraftDeps): Promise<DraftResult> {
  const type = getPostType(opts.type);
  const folder = path.join(deps.root, type.folder);
  const existing = existingPosts(folder);
  const since = opts.since ?? defaultSince(type, existing[0]?.date, deps.today);
  const persona = pickPersona(isoWeek(deps.today), opts.persona);
  const ctx = { root: deps.root, repo: deps.repo, gh: deps.gh, since, today: deps.today, persona };
  const { prs, docs } = collectSources(type, ctx);
  const sources = [...prs, ...docs];
  const terms = forbiddenTerms(deps.root, type.audience);
  const ask = (feedback?: GateIssue[]): string =>
    buildPrompt(type, sources, existing, [...terms.words, ...terms.phrases], feedback);
  const result: DraftResult = {
    status: 'dry-run',
    type: type.id,
    prompt: ask(),
    sources,
    issues: [],
  };

  if (NEEDS_PRS.has(type.id) && prs.length === 0) return { ...result, status: 'nothing-to-draft' };
  if (opts.dryRun) return result;
  if (!deps.model) throw new Error('no model to draft with');

  const letter = type.id === 'team-letter';
  const meta: PostMeta = {
    author: letter ? letterAuthor(deps.root, persona) : type.author,
    date: deps.today,
    sources,
    seriesPart: existing.filter((p) => p.series === type.series).length + 1,
    label: letter ? characterLabel(persona) : undefined,
  };
  const gate = { terms, sourceText: renderPack(sources), words: type.words };
  const render = (d: DraftText): string => renderPost(type, d, meta);
  for (let n = 1; n <= ATTEMPTS; n++) {
    // Sequential on purpose: the second call carries the first one's findings.
    // eslint-disable-next-line no-await-in-loop
    const { draft, markdown, issues, unsafe } = await attempt(
      result.prompt,
      deps.model,
      render,
      gate
    );
    if (unsafe) return { ...result, status: 'rejected', issues, markdown };
    if (draft && markdown && issues.length === 0) {
      const file = freePath(
        folder,
        type.id === 'whats-new' ? `whats-new-${deps.today}` : draft.title,
        deps.fileExists
      );
      (deps.writeFile ?? fs.writeFileSync)(file, markdown);
      return { ...result, status: 'written', path: file, title: draft.title, markdown };
    }
    Object.assign(result, { issues, markdown, prompt: ask(issues) });
  }
  return { ...result, status: 'rejected' };
}
