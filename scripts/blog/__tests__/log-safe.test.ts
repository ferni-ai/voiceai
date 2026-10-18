import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GateIssue } from '../brand-gate.js';
import type { DraftResult } from '../draft.js';
import { linkCount, ruleCounts } from '../log-safe.js';
import { unsafeOutput } from '../untrusted-text.js';

// The drafter and the gate run in a public Actions log. These tests run the
// real CLI scripts with the model and gh mocked out, and check what they print.

const MARKER = 'INJECTED-MARKER-7f3a';
const draftPost = vi.hoisted(() => vi.fn());
vi.mock('../draft.js', () => ({ draftPost }));
vi.mock('../model.js', () => ({ geminiModel: async () => ({ generate: vi.fn() }) }));

class Exit extends Error {
  constructor(readonly code: number | undefined) {
    super(`exit ${code}`);
  }
}

let lines: string[];
beforeEach(() => {
  lines = [];
  const capture = (...args: unknown[]): void => void lines.push(args.map(String).join(' '));
  vi.spyOn(console, 'log').mockImplementation(capture);
  vi.spyOn(console, 'error').mockImplementation(capture);
  vi.spyOn(process, 'exit').mockImplementation((code) => {
    throw new Exit(code as number | undefined);
  });
});
afterEach(() => vi.restoreAllMocks());

const SCRIPTS = {
  'draft-post.ts': () => import('../draft-post.js'),
  'check-post.ts': () => import('../check-post.js'),
};

/** Imports a CLI script fresh with these arguments; returns its exit code, if it exited. */
async function run(script: keyof typeof SCRIPTS, args: string[]): Promise<number | undefined> {
  const argv = process.argv;
  process.argv = [argv[0], script, ...args];
  vi.resetModules();
  try {
    await SCRIPTS[script]();
    return undefined;
  } catch (error) {
    if (error instanceof Exit) return error.code;
    throw error;
  } finally {
    process.argv = argv;
  }
}

const output = (): string => lines.join('\n');

const SOURCES = [
  { label: 'PR #205: feat: b', number: 205, title: 'feat: b', text: 'x', body: 'x', mergedAt: '' },
  { label: 'PR #101: feat: a', number: 101, title: 'feat: a', text: 'x', body: 'x', mergedAt: '' },
  { label: 'Brand voice guide', text: `doc text ${MARKER}` },
];

const DRAFT = `---
title: "A post ${MARKER}"
sources:
  - "PR #101: feat: a (https://github.com/ferni-ai/voiceai/pull/101)"
---

Read [this](https://evil.example/${MARKER}) and https://evil.example/two.
<script>${MARKER}</script>
`;

/** A finding; `rule` is a plain string so tests can name any rule. */
const issue = (rule: string, message = ''): GateIssue => ({ rule, message }) as GateIssue;

const result = (extra: Partial<DraftResult>): DraftResult => ({
  status: 'rejected',
  type: 'whats-new',
  prompt: `prompt with ${MARKER}`,
  sources: SOURCES,
  issues: [],
  ...extra,
});

describe('draft-post.ts on a rejected draft', () => {
  it('prints rule codes, counts and source PR numbers, never the draft or what findings quote', async () => {
    draftPost.mockResolvedValue(
      result({
        markdown: DRAFT,
        issues: [
          issue('unsafe-link', `links off the allowlist: https://evil.example/${MARKER}`),
          issue('em-dash', `an em dash: "${MARKER} — x"`),
          issue('em-dash', `an em dash: "y — ${MARKER}"`),
        ],
      })
    );
    const code = await run('draft-post.ts', ['--type', 'whats-new']);

    expect(code).toBe(1);
    expect(output()).not.toContain(MARKER);
    expect(output()).not.toContain('evil.example');
    expect(output()).toContain('reasons: unsafe-link x1, em-dash x2');
    expect(output()).toContain(`draft: ${DRAFT.length} characters, 2 links`);
    expect(output()).toContain('sources: #101, #205, 1 docs');
  });

  it('prints the real unsafe-link and unsafe-html findings as codes, with no link targets', async () => {
    const issues = unsafeOutput(DRAFT);
    expect(issues.map((i) => i.message).join('\n')).toContain(MARKER); // the findings do quote it
    draftPost.mockResolvedValue(result({ markdown: DRAFT, issues }));
    const code = await run('draft-post.ts', ['--type', 'whats-new']);

    expect(code).toBe(1);
    expect(output()).not.toContain(MARKER);
    expect(output()).not.toContain('evil.example');
    expect(output()).toMatch(/reasons: unsafe-link x2, unsafe-html x\d+/);
  });

  it('prints only the rule code when the answer was unreadable', async () => {
    const message = `unreadable answer: SyntaxError: "{${MARKER}" is not valid JSON`;
    draftPost.mockResolvedValue(result({ issues: [issue('front-matter', message)] }));
    const code = await run('draft-post.ts', ['--type', 'whats-new']);

    expect(code).toBe(1);
    expect(output()).not.toContain(MARKER);
    expect(output()).toContain('reasons: front-matter x1');
    expect(output()).toContain('draft: none readable');
  });

  it('prints the draft and the findings with --details, for local runs', async () => {
    const issues = [issue('em-dash', `an em dash: "${MARKER}"`)];
    draftPost.mockResolvedValue(result({ markdown: DRAFT, issues }));
    await run('draft-post.ts', ['--type', 'whats-new', '--details']);

    expect(output()).toContain(`[em-dash] an em dash: "${MARKER}"`);
    expect(output()).toContain(`<script>${MARKER}</script>`);
  });
});

describe('draft-post.ts on a written draft', () => {
  it('prints only the title and the slug', async () => {
    draftPost.mockResolvedValue(
      result({
        status: 'written',
        title: 'Better memory',
        path: `/somewhere/${MARKER}/whats-new-2026-10-19.md`,
        markdown: DRAFT,
      })
    );
    const code = await run('draft-post.ts', ['--type', 'whats-new']);

    expect(code).toBeUndefined();
    expect(lines).toEqual(['Wrote "Better memory" (slug whats-new-2026-10-19)']);
  });
});

describe('check-post.ts on a failing post', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-log-safe-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('prints rule codes and counts, never the text a finding quotes', async () => {
    const file = path.join(dir, 'post.md');
    fs.writeFileSync(file, `---\ntitle: "x"\n---\n\nThis ${MARKER} — and more.\n`);
    const code = await run('check-post.ts', [file]);

    expect(code).toBe(1);
    expect(output()).not.toContain(MARKER);
    expect(output()).toContain('em-dash x1');
    expect(output()).toMatch(/front-matter x\d+/);
  });

  it('prints an off-allowlist link as unsafe-link only, not its target', async () => {
    const file = path.join(dir, 'post.md');
    fs.writeFileSync(
      file,
      `---\ntitle: "x"\n---\n\nRead [this](https://evil.example/${MARKER}).\n`
    );
    const code = await run('check-post.ts', [file]);

    expect(code).toBe(1);
    expect(output()).toContain('unsafe-link x1');
    expect(output()).not.toContain(MARKER);
    expect(output()).not.toContain('evil.example');
  });
});

describe('the summaries', () => {
  it('counts each rule once in the order first found', () => {
    const issues = [issue('number'), issue('length'), issue('number')];
    expect(ruleCounts(issues)).toBe('number x2, length x1');
  });

  it('counts links in the body only, once each', () => {
    const body = '[a](https://x.example/1) <https://x.example/2> www.x.example/3 [b](/blog/c/)';
    expect(linkCount(`---\nsources:\n  - "https://github.com/a"\n---\n${body}`)).toBe(4);
  });
});
