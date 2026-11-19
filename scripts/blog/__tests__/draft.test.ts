import * as fs from 'node:fs';
import * as path from 'node:path';
import matter from 'gray-matter';
import { describe, expect, it, vi } from 'vitest';
import { REQUIRED_FIELDS } from '../brand-gate.js';
import {
  draftPost,
  isoWeek,
  repeatGateEnabled,
  reviseEnabled,
  usedSources,
  type DraftDeps,
} from '../draft.js';
import type { JudgeResult, Verdict } from '../judge.js';
import { existingPosts } from '../existing-posts.js';
import { HOUSE_FACTS, sourceList, type GhRunner } from '../grounding.js';
import { POST_TYPES } from '../post-types.js';
import { RUBRIC } from '../rubric.js';
import { parseFocus } from '../team-letter.js';

const root = path.resolve(__dirname, '../../..');
const TODAY = '2026-10-19';
/**
 * The real folders, as of the day before the fixture PRs. A post published
 * later (a whats-new dated after them) would move the whats-new window past
 * them and turn every whats-new case into 'nothing-to-draft'.
 */
const POSTS_BEFORE = '2026-10-14';
const postsBeforeFixtures = (folder: string) =>
  existingPosts(folder).filter((p) => p.date <= POSTS_BEFORE);

// Read the real blog folders as they stood before the fixture PRs merged, so a
// newly published post can't move whats-new's lookback window past them.
const POSTS_AS_OF = '2026-10-14';
vi.mock('../existing-posts.js', async (importActual) => {
  const actual = await importActual<typeof import('../existing-posts.js')>();
  return {
    ...actual,
    existingPosts: (dir: string) => actual.existingPosts(dir).filter((p) => p.date <= POSTS_AS_OF),
  };
});

const pr = (
  number: number,
  title: string,
  mergedAt: string | null,
  extra: Record<string, unknown> = {}
) => ({
  number,
  title,
  body: `Body of ${number}. <!-- hidden note -->`,
  html_url: `https://github.com/ferni-ai/voiceai/pull/${number}`,
  merged_at: mergedAt,
  updated_at: mergedAt ?? '2026-10-18T00:00:00Z',
  user: { login: 'someone', type: 'User' },
  author_association: 'MEMBER',
  head: { ref: `feat/${number}` },
  ...extra,
});

const PRS = [
  pr(101, 'feat(sdk): let a caller see and forget facts', '2026-10-15T10:00:00Z'),
  pr(102, 'feat(sdk): bump everything', '2026-10-15T09:00:00Z', {
    user: { login: 'dependabot[bot]', type: 'Bot' },
  }),
  pr(103, 'feat(sdk): an earlier draft', '2026-10-15T08:00:00Z', {
    head: { ref: 'blog/draft-mission-essay-2026-10-12' },
  }),
  pr(104, 'feat(sdk): closed without merging', null),
  pr(99, 'feat(sdk): merged before the window', '2025-12-01T00:00:00Z'),
];

/** Every PR touches only the web app unless `files` says otherwise. */
const WEB_FILES = [{ filename: 'apps/web/src/ui/memory.ts', status: 'modified', patch: '+x' }];
/** Repo permission by login; anyone not listed has only read, as on a public repo. */
const fakeGh = (
  prs = PRS,
  files: Record<number, unknown[]> = {},
  roles: Record<string, string> = {}
): GhRunner =>
  vi.fn((args: string[]) => {
    const login = /collaborators\/([^/]+)\/permission/.exec(args[1])?.[1];
    if (login) return JSON.stringify({ permission: roles[login] ?? 'read' });
    const n = /pulls\/(\d+)\/files/.exec(args[1])?.[1];
    return JSON.stringify(n ? (files[Number(n)] ?? WEB_FILES) : prs);
  });

/** A body long enough for every type's length band, with no number, dash or forbidden word. */
const BODY = Array.from(
  { length: 48 },
  () => 'We kept working on this part of Ferni with care and patience.'
).join(' ');
const answer = (title: string, body = BODY) =>
  JSON.stringify({ title, excerpt: 'A short, honest note.', body });

function deps(model: (prompt: string) => string, gh = fakeGh(), taken: string[] = []) {
  const writes: Array<{ file: string; content: string }> = [];
  const generate = vi.fn(async (prompt: string) => model(prompt));
  const d: DraftDeps = {
    root,
    repo: 'ferni-ai/voiceai',
    gh,
    today: TODAY,
    model: { generate },
    writeFile: (file, content) => writes.push({ file, content }),
    listPosts: postsBeforeFixtures,
    // Never the real folder: a post published on TODAY would rename the draft (#2214).
    fileExists: (file) => taken.includes(path.basename(file)),
  };
  return { d, writes, generate, gh };
}

describe('each post type', () => {
  for (const type of Object.values(POST_TYPES)) {
    it(`${type.id}: writes valid front matter to ${type.folder}`, async () => {
      const { d, writes } = deps(() => answer(`A fresh ${type.id} title`));
      const result = await draftPost({ type: type.id, persona: 'maya' }, d);

      expect(result.status, JSON.stringify(result.issues)).toBe('written');
      expect(writes).toHaveLength(1);
      expect(result.title).toBe(`A fresh ${type.id} title`);
      expect(path.dirname(writes[0].file)).toBe(path.join(root, type.folder));
      const { data, content } = matter(writes[0].content);
      for (const field of REQUIRED_FIELDS) expect(data[field], field).toBeTruthy();
      expect(data.category).toBe(type.category);
      expect(data.sources).toEqual(sourceList(usedSources(result.sources, content)));
      if (type.id === 'team-letter') {
        expect(data.author).toBe('Maya Santos');
        expect(data.authorColor).toBe('#a67a6a');
        expect(content.trimStart()).toMatch(
          /^\*Maya is one of the characters .* Maya is a character, not a real person\.\*/
        );
      } else {
        expect(data.author).toBe('The Ferni Team');
      }
    });
  }

  it('takes the next free name when a post with that name exists', async () => {
    const dev = deps(() => answer('Anything'), fakeGh(), [`whats-new-${TODAY}.md`]);
    await draftPost({ type: 'whats-new' }, dev.d);
    expect(path.basename(dev.writes[0].file)).toBe(`whats-new-${TODAY}-2.md`);
  });

  it('names a whats-new post by date and a consumer post by its title', async () => {
    const dev = deps(() => answer('Anything'));
    await draftPost({ type: 'whats-new' }, dev.d);
    expect(path.basename(dev.writes[0].file)).toBe(`whats-new-${TODAY}.md`);
    const consumer = deps(() => answer("Why Ferni Says It Doesn't Know"));
    await draftPost({ type: 'mission-essay' }, consumer.d);
    expect(path.basename(consumer.writes[0].file)).toBe('why-ferni-says-it-doesnt-know.md');
  });
});

describe('grounding', () => {
  it('whats-new uses only merged, human PRs from the window, through REST', async () => {
    const { d, gh } = deps(() => answer('x'));
    const result = await draftPost({ type: 'whats-new', dryRun: true }, d);

    expect(result.sources.map((s) => s.label)).toEqual([
      'PR #101: feat(sdk): let a caller see and forget facts',
    ]);
    for (const n of [99, 102, 103, 104]) expect(result.prompt).not.toContain(`PR #${n}`);
    expect(result.prompt).not.toContain('hidden note');
    const [args] = (gh as ReturnType<typeof vi.fn>).mock.calls[0] as [string[]];
    expect(args[0]).toBe('api');
    expect(args[1]).toMatch(/^repos\/ferni-ai\/voiceai\/pulls\?state=closed/);
    expect(args).not.toContain('graphql');
  });

  it('leaves out PRs that are flagged off or not deployed yet', async () => {
    const prs = [
      ...PRS,
      pr(105, 'feat(sdk): check mishearings, behind a flag', '2026-10-16T10:00:00Z'),
      pr(106, 'feat(sdk): store dates', '2026-10-16T09:00:00Z', {
        body: 'Gated by `CALL_JOURNAL` until we know it helps.',
      }),
      pr(107, 'feat(sdk): a new greeting', '2026-10-16T08:00:00Z'),
      pr(108, 'feat(sdk): an older greeting', '2026-10-10T08:00:00Z'),
      pr(109, 'feat(sdk): a new switch', '2026-10-16T07:00:00Z'),
    ];
    const agent = [{ filename: 'src/agents/greeting.ts', status: 'modified', patch: '+x' }];
    const manifest = [
      { filename: 'apps/web/src/ui/x.ts', status: 'added', patch: '+x' },
      {
        filename: 'src/config/flag-manifest.ts',
        status: 'modified',
        patch: "+  NEW_THING: { default: 'off', owner: 'web', kind: 'experiment' },",
      },
    ];
    const { d } = deps(() => answer('x'), fakeGh(prs, { 107: agent, 108: agent, 109: manifest }));
    const result = await draftPost({ type: 'whats-new', since: '2026-10-01', dryRun: true }, d);

    expect(result.sources.map((s) => s.label)).toEqual([
      'PR #101: feat(sdk): let a caller see and forget facts',
      'PR #108: feat(sdk): an older greeting',
    ]);
  });

  it('leaves out PRs whose author is not an org member or collaborator', async () => {
    const prs = [
      ...PRS,
      pr(110, 'feat(sdk): a change from outside', '2026-10-16T10:00:00Z', {
        user: { login: 'outsider', type: 'User' },
        author_association: 'CONTRIBUTOR',
        body: 'Text from someone outside the team.',
      }),
      pr(111, 'feat(sdk): from a first-timer', '2026-10-16T09:00:00Z', {
        user: { login: 'newcomer', type: 'User' },
        author_association: 'FIRST_TIME_CONTRIBUTOR',
      }),
      // A member whose org membership is private reads as CONTRIBUTOR.
      pr(112, 'feat(sdk): from a private member', '2026-10-16T08:00:00Z', {
        user: { login: 'quiet-member', type: 'User' },
        author_association: 'CONTRIBUTOR',
      }),
    ];
    const { d } = deps(() => answer('x'), fakeGh(prs, {}, { 'quiet-member': 'write' }));
    const result = await draftPost({ type: 'whats-new', since: '2026-10-01', dryRun: true }, d);

    expect(result.sources.map((s) => s.label)).toEqual([
      'PR #112: feat(sdk): from a private member',
      'PR #101: feat(sdk): let a caller see and forget facts',
    ]);
    expect(result.prompt).not.toContain('Text from someone outside the team');
  });

  it('strips URLs, HTML and template tags from PR text and caps each body', async () => {
    const body = [
      'Keep this sentence.',
      '<script>alert("x")</script><img src=x onerror="steal()"> <a href="https://evil.example/a">a link</a>',
      '[click here](https://evil.example/b) and https://evil.example/c and www.evil.example/d',
      'and evil.com/e and <https://evil.example/f> and javascript:void(0) and {{ site.secret }}',
      '[ref]: https://evil.example/g',
      'x'.repeat(5000),
    ].join('\n');
    const title = 'feat(sdk): see <b>https://evil.example/t</b>';
    const prs = [pr(113, title, '2026-10-16T10:00:00Z', { body })];
    const { d } = deps(() => answer('x'), fakeGh(prs));
    const result = await draftPost({ type: 'whats-new', since: '2026-10-01', dryRun: true }, d);

    const { text, label } = result.sources[0];
    expect(text).toContain('Keep this sentence.');
    expect(text).toContain('click here');
    for (const bad of ['evil', 'script', 'onerror', '<', 'javascript:', '{{', 'http'])
      expect(text, bad).not.toContain(bad);
    expect(label).toBe('PR #113: feat(sdk): see');
    expect(result.prompt.slice(result.prompt.indexOf('FACTS'))).not.toContain('evil');
    expect(text.length).toBeLessThanOrEqual(
      'feat(sdk): see\n\n'.length + 2000 + ' [truncated]'.length
    );
    expect(text).toMatch(/\[truncated\]$/);
  });

  it('whats-new takes only changes a developer building on Ferni would notice', async () => {
    const prs = [
      ...PRS,
      pr(114, 'feat(memory): remember birthdays', '2026-10-16T10:00:00Z'),
      pr(115, 'fix(api): the practice view lists outreach', '2026-10-16T09:00:00Z'),
      pr(116, 'fix(cli): the ratchet counts tests', '2026-10-16T08:00:00Z'),
      pr(117, 'feat(marketplace): list a persona with its price', '2026-10-16T07:00:00Z'),
      pr(118, 'fix(developers): fix a broken quickstart link', '2026-10-16T06:00:00Z'),
      pr(120, 'docs(sdk): reword the readme', '2026-10-16T05:00:00Z'),
      pr(121, 'chore(marketplace): bump a dependency', '2026-10-16T04:00:00Z'),
      pr(122, 'feat(mcp): a tool to list facts', '2026-10-16T03:00:00Z'),
    ];
    const { d } = deps(() => answer('x'), fakeGh(prs));
    const dev = await draftPost({ type: 'whats-new', since: '2026-10-01', dryRun: true }, d);
    expect(dev.sources.map((s) => s.label)).toEqual([
      'PR #117: feat(marketplace): list a persona with its price',
      'PR #118: fix(developers): fix a broken quickstart link',
      'PR #122: feat(mcp): a tool to list facts',
      'PR #101: feat(sdk): let a caller see and forget facts',
    ]);
    // The consumer change still reaches a consumer post.
    const bip = await draftPost(
      { type: 'building-in-public', since: '2026-10-01', dryRun: true },
      d
    );
    expect(bip.sources.map((s) => s.label)).toContain('PR #114: feat(memory): remember birthdays');
  });

  it("a letter gets the house facts without the product status a character can't say", async () => {
    const { d } = deps(() => answer('x'));
    const letter = await draftPost({ type: 'team-letter', persona: 'maya', dryRun: true }, d);
    const bip = await draftPost({ type: 'building-in-public', dryRun: true }, d);
    for (const status of ['two seconds', 'development agent']) {
      expect(bip.prompt).toContain(status);
      expect(letter.prompt).not.toContain(status);
    }
    expect(letter.prompt).toContain('essentially no users yet');
    expect(letter.prompt).toContain('composites we wrote');
  });

  it('a letter is written from one moment of the biography, not all of it', async () => {
    const moment = 'Worked the store after school and watched what people actually bought.';
    const prompts: string[] = [];
    const { d, writes } = deps((prompt) => {
      prompts.push(prompt);
      return prompt.startsWith('Below is the biography')
        ? JSON.stringify({ moment, idea: 'Watching closely is a way of caring.' })
        : answer('What the shelves told me');
    });
    const result = await draftPost({ type: 'team-letter', persona: 'peter' }, d);

    expect(result.status, JSON.stringify(result.issues)).toBe('written');
    expect(prompts[0]).toContain('Red Sox, always.');
    const letter = prompts[1];
    expect(letter).toContain(moment);
    expect(letter).toContain('Watching closely is a way of caring.');
    for (const other of ['Red Sox', 'Pawtucket', 'Brown', 'pattern journal'])
      expect(letter, other).not.toContain(other);
    expect(matter(writes[0].content).data.sources).toContain(
      'src/personas/bundles/peter-john/identity/biography-core.md (one moment)'
    );
  });

  it('keeps the whole biography when the picked moment is not copied from it', async () => {
    const prompts: string[] = [];
    const { d } = deps((prompt) => {
      prompts.push(prompt);
      return prompt.startsWith('Below is the biography')
        ? JSON.stringify({ moment: 'Peter sailed to Lisbon alone.', idea: 'Go far.' })
        : answer('A letter');
    });
    const result = await draftPost({ type: 'team-letter', persona: 'peter' }, d);
    expect(result.status).toBe('written');
    expect(prompts[1]).toContain('Red Sox, always.');
    expect(prompts[1]).not.toContain('Lisbon');
  });

  it('gives a letter how the character sounds, not sample lines to paste', async () => {
    const readme = fs.readFileSync(path.join(root, 'brand/voice-tone/README.md'), 'utf-8');
    expect(readme).toContain('The correlation here is surprisingly strong');
    const { d } = deps(() => answer('x'));
    const { prompt } = await draftPost({ type: 'team-letter', persona: 'peter', dryRun: true }, d);
    expect(prompt).toContain('Curious, pattern-obsessed');
    for (const sample of ['Example Messages', 'surprisingly strong', 'Carolyn', 'Ooh!'])
      expect(prompt, sample).not.toContain(sample);
  });

  it('reads a picked moment through bold markers and line breaks, and rejects one not in the text', () => {
    const bio = '**Behind the register at twelve.** Worked the store\nafter school.';
    expect(
      parseFocus(
        '{"moment": "Behind the register at twelve. Worked the store after school.", "idea": "i"}',
        bio
      )
    ).toEqual({
      moment: 'Behind the register at twelve. Worked the store after school.',
      idea: 'i',
    });
    expect(
      parseFocus('{"moment": "Behind the register at ten.", "idea": "i"}', bio)
    ).toBeUndefined();
    expect(parseFocus('not json', bio)).toBeUndefined();
    expect(parseFocus('{"moment": "", "idea": "i"}', bio)).toBeUndefined();
  });

  it('lists in the front matter only the pull requests the post cites', async () => {
    const prs = [...PRS, pr(119, 'feat(sdk): page through facts', '2026-10-16T10:00:00Z')];
    const cites = `${BODY} We wrote about it in [#101](https://github.com/ferni-ai/voiceai/pull/101).`;
    const { d, writes } = deps(() => answer('A small change', cites), fakeGh(prs));
    const result = await draftPost({ type: 'building-in-public', since: '2026-10-01' }, d);

    expect(result.status, JSON.stringify(result.issues)).toBe('written');
    expect(result.sources.map((s) => s.label)).toContain('PR #119: feat(sdk): page through facts');
    const listed = matter(writes[0].content).data.sources as string[];
    expect(listed).toEqual([
      'PR #101: feat(sdk): let a caller see and forget facts (https://github.com/ferni-ai/voiceai/pull/101)',
      `${HOUSE_FACTS.label} (${HOUSE_FACTS.url})`,
    ]);
  });

  it('keeps every source listed when a post cites none, so the front matter is never empty', () => {
    const prSource = { label: 'PR #7: x', text: 'x', number: 7 };
    expect(usedSources([prSource], 'No link here, and not #70 either.')).toEqual([prSource]);
    expect(usedSources([prSource], 'See #7.')).toEqual([prSource]);
  });

  it('matches a cited PR by #N or /pull/N, and #70 is not #7', () => {
    const seven = { label: 'PR #7: x', text: 'x', number: 7 };
    const seventy = { label: 'PR #70: y', text: 'y', number: 70 };
    const doc = { label: 'doc.md', text: 'z' };
    const all = [seven, seventy, doc];
    expect(usedSources(all, 'See [#70](https://github.com/o/r/pull/70).')).toEqual([seventy, doc]);
    expect(usedSources(all, 'In #7 we fixed it.')).toEqual([seven, doc]);
    expect(usedSources(all, 'https://github.com/o/r/pull/7 says so.')).toEqual([seven, doc]);
  });

  it('tells the drafter how the judge scores it and the bar for its audience', async () => {
    const { d } = deps(() => answer('x'));
    const dev = await draftPost({ type: 'whats-new', dryRun: true }, d);
    const consumer = await draftPost({ type: 'mission-essay', dryRun: true }, d);
    expect(dev.prompt).toContain('every score is 3 or more and honesty is 5');
    expect(consumer.prompt).toContain('every score is 4 or more and honesty is 5');
    for (const [dimension, text] of Object.entries(RUBRIC)) {
      expect(dev.prompt).toContain(`- ${dimension}: ${text}`);
      expect(consumer.prompt).toContain(`- ${dimension}: ${text}`);
    }
  });

  it('passes the titles already published so the topic is not repeated', async () => {
    const { d } = deps(() => answer('x'));
    const result = await draftPost({ type: 'mission-essay', dryRun: true }, d);
    expect(result.prompt).toContain('The Loneliness Gap (the-loneliness-gap)');
  });

  it('writes nothing when there are no merged PRs to write from', async () => {
    const { d, writes, generate } = deps(() => answer('x'), fakeGh([]));
    const result = await draftPost({ type: 'whats-new' }, d);
    expect(result.status).toBe('nothing-to-draft');
    expect(generate).not.toHaveBeenCalled();
    expect(writes).toHaveLength(0);
  });

  it('a dry run calls no model and writes nothing', async () => {
    const { d, writes, generate } = deps(() => answer('x'));
    const result = await draftPost({ type: 'building-in-public', dryRun: true }, d);
    expect(result.status).toBe('dry-run');
    expect(result.prompt).toContain('PR #101');
    expect(generate).not.toHaveBeenCalled();
    expect(writes).toHaveLength(0);
  });
});

describe('the retry', () => {
  it("sends the gate's findings back once and writes the fixed draft", async () => {
    const replies = [
      answer('Better memory', `${BODY} Recall is 73% faster.`),
      answer('Better memory'),
    ];
    const { d, writes, generate } = deps(() => replies.shift() ?? '');
    const result = await draftPost({ type: 'whats-new' }, d);

    expect(generate).toHaveBeenCalledTimes(2);
    const second = generate.mock.calls[1][0];
    expect(second).toContain('YOUR LAST DRAFT WAS REJECTED');
    expect(second).toContain('[number] "73%"');
    expect(result.status).toBe('written');
    expect(writes[0].content).not.toContain('73%');
  });

  it('gives up after the second failure and writes nothing', async () => {
    const { d, writes, generate } = deps(() =>
      answer('Better memory', `${BODY} It was hard—really.`)
    );
    const result = await draftPost({ type: 'whats-new' }, d);

    expect(generate).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('rejected');
    expect(result.issues.map((i) => i.rule)).toEqual(['em-dash']);
    expect(writes).toHaveLength(0);
  });

  it('treats an unreadable model answer as a failure to retry', async () => {
    const replies = ['not json', answer('Better memory')];
    const { d, generate } = deps(() => replies.shift() ?? '');
    const result = await draftPost({ type: 'whats-new' }, d);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('written');
  });
});

describe('the repetition rule in the drafter', () => {
  /** A body long enough for whats-new with no six words repeated. */
  const consonants = 'bcdfghjklmnprstvz';
  const VARIED = Array.from({ length: 400 }, (_, i) => {
    const c = consonants[i % 17];
    const v = 'aeiou'[Math.floor(i / 17) % 5];
    return `${c}${v}${consonants[Math.floor(i / 85) % 17]}o`;
  }).join(' ');

  it('is on only when BLOG_REPEAT_GATE is "on"', () => {
    expect(repeatGateEnabled({ BLOG_REPEAT_GATE: 'on' })).toBe(true);
    for (const value of [undefined, 'off', 'true', 'ON', '1'])
      expect(repeatGateEnabled({ BLOG_REPEAT_GATE: value })).toBe(false);
  });

  it('off: a draft that repeats itself is written on the first call', async () => {
    vi.stubEnv('BLOG_REPEAT_GATE', 'off');
    const { d, generate } = deps(() => answer('Better memory'));
    const result = await draftPost({ type: 'whats-new' }, d);
    vi.unstubAllEnvs();
    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('written');
  });

  it('on: a draft that repeats itself goes back once with the repeated line', async () => {
    vi.stubEnv('BLOG_REPEAT_GATE', 'on');
    const replies = [answer('Better memory'), answer('Better memory', VARIED)];
    const { d, writes, generate } = deps(() => replies.shift() ?? '');
    const result = await draftPost({ type: 'whats-new' }, d);
    vi.unstubAllEnvs();

    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0]).toContain(
      '[repetition] said twice in the post: "we kept working on this part of ferni with care and patience'
    );
    expect(result.status).toBe('written');
    expect(writes[0].content).toContain(VARIED);
  });
});

describe('links in a draft', () => {
  it('rejects a draft that links off the allowlist, writes nothing and does not retry', async () => {
    const { d, writes, generate } = deps(() =>
      answer('Better memory', `${BODY} Read more [here](https://evil.example/post).`)
    );
    const result = await draftPost({ type: 'whats-new' }, d);

    expect(result.status).toBe('rejected');
    expect(generate).toHaveBeenCalledTimes(1);
    expect(writes).toHaveLength(0);
    expect(result.issues).toEqual([
      { rule: 'unsafe-link', message: 'links off the allowlist: https://evil.example/post' },
    ]);
  });

  it('rejects raw HTML in a draft and writes nothing', async () => {
    const { d, writes } = deps(() => answer('Better memory', `${BODY} <img src=x onerror=y>`));
    const result = await draftPost({ type: 'whats-new' }, d);
    expect(result.status).toBe('rejected');
    expect(result.issues.map((i) => i.rule)).toContain('unsafe-html');
    expect(writes).toHaveLength(0);
  });

  it('publishes a draft whose links are all on the allowlist', async () => {
    const links = [
      '[memory](https://github.com/ferni-ai/voiceai/pull/101)',
      '[Ferni](https://ferni.ai/)',
      '[the app](https://app.ferni.ai/)',
      '[docs](https://developers.ferni.ai/getting-started/)',
      '[an earlier post](/blog/the-loneliness-gap/)',
    ].join(', ');
    const { d, writes } = deps(() => answer('Better memory', `${BODY} See ${links}.`));
    const result = await draftPost({ type: 'whats-new' }, d);

    expect(result.status, JSON.stringify(result.issues)).toBe('written');
    expect(writes[0].content).toContain('https://developers.ferni.ai/getting-started/');
  });

  it('caps the length of the model answer', async () => {
    const { d, writes, generate } = deps(() => answer('Better memory', BODY.repeat(40)));
    const result = await draftPost({ type: 'whats-new' }, d);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('rejected');
    expect(result.issues[0].message).toMatch(/the cap is 20000/);
    expect(writes).toHaveLength(0);
  });
});

describe('isoWeek', () => {
  it('follows ISO 8601 at year boundaries', () => {
    expect(isoWeek('2026-10-19')).toBe(43);
    expect(isoWeek('2027-01-01')).toBe(53);
    expect(isoWeek('2026-01-01')).toBe(1);
  });
});

describe('a failed model call', () => {
  it('throws instead of reporting a brand-gate failure, and writes nothing', async () => {
    const { d, writes, generate } = deps(() => {
      throw new Error('403 permission denied');
    });

    await expect(draftPost({ type: 'whats-new' }, d)).rejects.toThrow('403 permission denied');
    expect(generate).toHaveBeenCalledTimes(1);
    expect(writes).toHaveLength(0);
  });
});

describe('the rewrite against the judge (BLOG_REVISE)', () => {
  const DIMS = ['on_message', 'brand_voice', 'honesty', 'meaningful', 'impact', 'craft'] as const;
  const verdict = (craft: number): JudgeResult => ({
    status: craft >= 4 ? 'pass' : 'fail',
    model: 'judge',
    verdict: {
      scores: Object.fromEntries(
        DIMS.map((d) => [
          d,
          { score: d === 'craft' ? craft : 5, reason: `${d}: says the same thing twice` },
        ])
      ) as Verdict['scores'],
      summary: 'one line',
    },
    failures: craft >= 4 ? [] : [`craft ${craft} (needs 4)`],
  });
  const REWRITE = BODY.replace('with care and patience', 'with care');
  const twoAnswers = (second: string) => {
    const prompts: string[] = [];
    const model = (prompt: string) => {
      prompts.push(prompt);
      return prompts.length === 1 ? answer('First draft') : answer('Second draft', second);
    };
    return { prompts, model };
  };

  it('is on only when BLOG_REVISE is "on"', () => {
    expect(reviseEnabled({})).toBe(false);
    expect(reviseEnabled({ BLOG_REVISE: 'off' })).toBe(false);
    expect(reviseEnabled({ BLOG_REVISE: 'true' })).toBe(false);
    expect(reviseEnabled({ BLOG_REVISE: 'on' })).toBe(true);
  });

  it('off: one model call, the first clean draft is written, nothing is judged', async () => {
    const { prompts, model } = twoAnswers(REWRITE);
    const { d, writes } = deps(model);
    const result = await draftPost({ type: 'building-in-public' }, d);
    expect(result.status).toBe('written');
    expect(prompts).toHaveLength(1);
    expect(result.review).toBeUndefined();
    expect(matter(writes[0].content).data.title).toBe('First draft');
  });

  it("on and the judge fails it: rewrites once with the judge's notes and writes the rewrite", async () => {
    const { prompts, model } = twoAnswers(REWRITE);
    const { d, writes } = deps(model);
    const review = vi.fn(async () => verdict(3));
    const result = await draftPost({ type: 'building-in-public' }, { ...d, review });

    expect(review).toHaveBeenCalledOnce();
    const [judged, sourceText] = review.mock.calls[0] as unknown as [string, string];
    expect(matter(judged).data.title).toBe('First draft');
    expect(sourceText).toContain('essentially no users yet');
    expect(prompts).toHaveLength(2);
    expect(prompts[1].startsWith(prompts[0])).toBe(true);
    expect(prompts[1]).toContain('FACTS');
    expect(prompts[1]).toContain('YOUR DRAFT');
    expect(prompts[1]).toContain('"title":"First draft"');
    expect(prompts[1]).toContain('- craft 3 (needs 4): craft: says the same thing twice');
    expect(prompts[1]).not.toContain('honesty 5');
    expect(prompts[1]).toContain(
      "never by adding a fact, number, person, place or event that isn't in the FACTS"
    );
    expect(result.status).toBe('written');
    expect(result.review?.revised).toBe(true);
    expect(result.title).toBe('Second draft');
    expect(writes).toHaveLength(1);
    expect(matter(writes[0].content).data.title).toBe('Second draft');
  });

  it('on and the judge passes it: no rewrite', async () => {
    const { prompts, model } = twoAnswers(REWRITE);
    const { d, writes } = deps(model);
    const result = await draftPost(
      { type: 'building-in-public' },
      { ...d, review: async () => verdict(4) }
    );
    expect(prompts).toHaveLength(1);
    expect(result.review).toMatchObject({ revised: false, before: { status: 'pass' } });
    expect(matter(writes[0].content).data.title).toBe('First draft');
  });

  it('on and the judge gives no verdict: no rewrite', async () => {
    const { prompts, model } = twoAnswers(REWRITE);
    const { d, writes } = deps(model);
    const none: JudgeResult = { status: 'error', model: 'judge', failures: ['no verdict'] };
    const result = await draftPost(
      { type: 'building-in-public' },
      { ...d, review: async () => none }
    );
    expect(prompts).toHaveLength(1);
    expect(result.review?.revised).toBe(false);
    expect(matter(writes[0].content).data.title).toBe('First draft');
  });

  it('on and the rewrite fails the brand gate: the first draft stands', async () => {
    const { prompts, model } = twoAnswers(`${REWRITE} It is fast \u2014 really fast.`);
    const { d, writes } = deps(model);
    const result = await draftPost(
      { type: 'building-in-public' },
      { ...d, review: async () => verdict(3) }
    );
    expect(prompts).toHaveLength(2);
    expect(result.status).toBe('written');
    expect(result.review?.revised).toBe(false);
    expect(writes).toHaveLength(1);
    expect(matter(writes[0].content).data.title).toBe('First draft');
  });

  it('on and the judge throws: the first draft stands', async () => {
    const { prompts, model } = twoAnswers(REWRITE);
    const { d, writes } = deps(model);
    const review = async (): Promise<JudgeResult> => {
      throw new Error('privacyData.json: ENOENT');
    };
    const result = await draftPost({ type: 'building-in-public' }, { ...d, review });
    expect(result.status).toBe('written');
    expect(prompts).toHaveLength(1);
    expect(result.review).toMatchObject({ revised: false, before: { status: 'error' } });
    expect(matter(writes[0].content).data.title).toBe('First draft');
  });

  it('on: a draft that needed a gate retry is still judged and rewritten', async () => {
    const prompts: string[] = [];
    const answers = [
      answer('First draft', `${BODY} It is fast \u2014 really fast.`),
      answer('Second draft'),
      answer('Third draft', REWRITE),
    ];
    const { d, writes } = deps((prompt) => {
      prompts.push(prompt);
      return answers[prompts.length - 1];
    });
    const result = await draftPost(
      { type: 'building-in-public' },
      { ...d, review: async () => verdict(3) }
    );
    expect(prompts).toHaveLength(3);
    expect(prompts[2]).toContain('"title":"Second draft"');
    expect(result.review?.revised).toBe(true);
    expect(matter(writes[0].content).data.title).toBe('Third draft');
  });
});
