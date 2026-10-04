/**
 * The PR review reads the branch's changes against its base. It used to read
 * only staged/unstaged changes, which a CI checkout never has, so every PR got
 * "No changes to review".
 */
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

let repo = '';
const git = (...args: string[]): string => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });

beforeAll(() => {
  // main has base.ts; origin/main then gains main-only.ts; the branch adds feature.ts.
  repo = mkdtempSync(join(tmpdir(), 'ai-review-'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  writeFileSync(join(repo, 'base.ts'), 'export const base = 1;\n');
  git('add', '.');
  git('commit', '-qm', 'base');
  git('switch', '-qc', 'feature');
  writeFileSync(join(repo, 'feature.ts'), 'export const feature = 2;\n');
  git('add', '.');
  git('commit', '-qm', 'feature');
  git('switch', '-q', 'main');
  writeFileSync(join(repo, 'main-only.ts'), 'export const later = 3;\n');
  git('add', '.');
  git('commit', '-qm', 'main moves on');
  git('update-ref', 'refs/remotes/origin/main', 'main');
  git('switch', '-q', 'feature');
});

afterAll(() => rmSync(repo, { recursive: true, force: true }));

const fetchMock = vi.fn();

beforeEach(() => {
  vi.resetModules();
  fetchMock.mockReset().mockResolvedValue(
    new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '✅ Code looks good!' }] } }] }))
  );
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('FERNI_PROJECT_ROOT', repo);
  vi.stubEnv('GOOGLE_API_KEY', 'test-key');
  vi.stubEnv('GITHUB_BASE_REF', '');
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

/** The diff text sent to Gemini, or undefined if nothing was sent. */
function sentDiff(): string | undefined {
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
  if (!init) return undefined;
  return (JSON.parse(String(init.body)) as { contents: Array<{ parts: Array<{ text: string }> }> }).contents[0]
    ?.parts[0]?.text;
}

describe('ai review', () => {
  it("in a PR job, reviews the branch's own changes against the base branch", async () => {
    vi.stubEnv('GITHUB_BASE_REF', 'main');
    const { handleAIReview } = await import('../ai-review.js');
    await handleAIReview(['general']);
    expect(sentDiff()).toContain('feature.ts');
    expect(sentDiff()).not.toContain('main-only.ts'); // base's newer commits are not the PR's
  });

  it('--base picks the ref explicitly', async () => {
    const { handleAIReview } = await import('../ai-review.js');
    await handleAIReview(['general', '--base', 'main']);
    expect(sentDiff()).toContain('feature.ts');
  });

  it('without a base, a clean tree still has nothing to review', async () => {
    const { handleAIReview } = await import('../ai-review.js');
    await handleAIReview(['general']);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not call Gemini when the base ref does not exist', async () => {
    vi.stubEnv('GITHUB_BASE_REF', 'no-such-branch');
    const { handleAIReview } = await import('../ai-review.js');
    await handleAIReview(['general']);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
