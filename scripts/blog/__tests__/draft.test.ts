import * as path from 'node:path';
import matter from 'gray-matter';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { REQUIRED_FIELDS } from '../brand-gate.js';
import { draftPost, isoWeek, type DraftDeps } from '../draft.js';
import type { ExistingPost } from '../existing-posts.js';
import type { GhRunner } from '../grounding.js';
import { POST_TYPES } from '../post-types.js';

const root = path.resolve(__dirname, '../../..');
const TODAY = '2026-10-19';

// Read the real blog folders as they stood before the fixture PRs merged, so a
// newly published post can't move whats-new's lookback window past them.
const POSTS_AS_OF = '2026-10-14';
// Posts a test adds in front of the real ones, by folder suffix.
const injected = vi.hoisted(() => ({ posts: [] as Array<{ folder: string; post: ExistingPost }> }));
vi.mock('../existing-posts.js', async (importActual) => {
  const actual = await importActual<typeof import('../existing-posts.js')>();
  return {
    ...actual,
    existingPosts: (dir: string) => [
      ...injected.posts.filter((p) => dir.endsWith(p.folder)).map((p) => p.post),
      ...actual.existingPosts(dir).filter((p) => p.date <= POSTS_AS_OF),
    ],
  };
});
beforeEach(() => {
  injected.posts = [];
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
  pr(101, 'feat(memory): let a caller see and forget facts', '2026-10-15T10:00:00Z'),
  pr(102, 'feat(deps): bump everything', '2026-10-15T09:00:00Z', {
    user: { login: 'dependabot[bot]', type: 'Bot' },
  }),
  pr(103, 'docs(blog): an earlier draft', '2026-10-15T08:00:00Z', {
    head: { ref: 'blog/draft-mission-essay-2026-10-12' },
  }),
  pr(104, 'feat(calls): closed without merging', null),
  pr(99, 'feat(old): merged before the window', '2025-12-01T00:00:00Z'),
];

/** Every PR touches only the developer portal (deployed on merge) unless `files` says otherwise. */
const WEB_FILES = [
  {
    filename: 'apps/website/developers-portal/src/pages/sdk/memory.njk',
    status: 'modified',
    patch: '+x',
  },
];
/** Repo permission by login; anyone not listed has only read, as on a public repo. */
const fakeGh = (
  prs = PRS,
  files: Record<number, unknown[]> = {},
  roles: Record<string, string> = {},
  open: unknown[] = []
): GhRunner =>
  vi.fn((args: string[]) => {
    const login = /collaborators\/([^/]+)\/permission/.exec(args[1])?.[1];
    if (login) return JSON.stringify({ permission: roles[login] ?? 'read' });
    if (args[1].includes('state=open')) return JSON.stringify(open);
    const n = /pulls\/(\d+)\/files/.exec(args[1])?.[1];
    return JSON.stringify(n ? (files[Number(n)] ?? WEB_FILES) : prs);
  });

/** A body long enough for every type's length band, with no number, dash or forbidden word. */
const BODY = `${Array.from(
  { length: 48 },
  () => 'We kept working on this part of Ferni with care and patience.'
).join(' ')} It landed in [#101](https://github.com/ferni-ai/voiceai/pull/101).`;
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
      expect(data.sources.length).toBe(result.sources.length);
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
      'PR #101: feat(memory): let a caller see and forget facts',
    ]);
    for (const n of [99, 102, 103, 104]) expect(result.prompt).not.toContain(`PR #${n}`);
    expect(result.prompt).not.toContain('hidden note');
    const calls = (gh as ReturnType<typeof vi.fn>).mock.calls.map(([a]) => a as string[]);
    for (const args of calls) expect(args[0]).toBe('api');
    expect(calls.some((a) => /^repos\/ferni-ai\/voiceai\/pulls\?state=closed/.test(a[1]))).toBe(
      true
    );
    expect(calls.flat()).not.toContain('graphql');
  });

  it('leaves out PRs that are flagged off or not deployed yet', async () => {
    const prs = [
      ...PRS,
      pr(105, 'feat(voice): check mishearings, behind a flag', '2026-10-16T10:00:00Z'),
      pr(106, 'feat(memory): store dates', '2026-10-16T09:00:00Z', {
        body: 'Gated by `CALL_JOURNAL` until we know it helps.',
      }),
      pr(107, 'feat(agent): a new greeting', '2026-10-16T08:00:00Z'),
      pr(108, 'feat(agent): an older greeting', '2026-10-10T08:00:00Z'),
      pr(109, 'feat(web): a new switch', '2026-10-16T07:00:00Z'),
    ];
    const agent = [
      { filename: 'src/api/v1/developers/greeting-routes.ts', status: 'modified', patch: '+x' },
    ];
    const manifest = [
      { filename: 'apps/website/developers-portal/src/js/x.js', status: 'added', patch: '+x' },
      {
        filename: 'src/config/flag-manifest.ts',
        status: 'modified',
        patch: "+  NEW_THING: { default: 'off', owner: 'web', kind: 'experiment' },",
      },
    ];
    const { d } = deps(() => answer('x'), fakeGh(prs, { 107: agent, 108: agent, 109: manifest }));
    const result = await draftPost({ type: 'whats-new', since: '2026-10-01', dryRun: true }, d);

    expect(result.sources.map((s) => s.label)).toEqual([
      'PR #101: feat(memory): let a caller see and forget facts',
      'PR #108: feat(agent): an older greeting',
    ]);
  });

  it('leaves out PRs whose author is not an org member or collaborator', async () => {
    const prs = [
      ...PRS,
      pr(110, 'feat(web): a change from outside', '2026-10-16T10:00:00Z', {
        user: { login: 'outsider', type: 'User' },
        author_association: 'CONTRIBUTOR',
        body: 'Text from someone outside the team.',
      }),
      pr(111, 'feat(web): from a first-timer', '2026-10-16T09:00:00Z', {
        user: { login: 'newcomer', type: 'User' },
        author_association: 'FIRST_TIME_CONTRIBUTOR',
      }),
      // A member whose org membership is private reads as CONTRIBUTOR.
      pr(112, 'feat(web): from a private member', '2026-10-16T08:00:00Z', {
        user: { login: 'quiet-member', type: 'User' },
        author_association: 'CONTRIBUTOR',
      }),
    ];
    const { d } = deps(() => answer('x'), fakeGh(prs, {}, { 'quiet-member': 'write' }));
    const result = await draftPost({ type: 'whats-new', since: '2026-10-01', dryRun: true }, d);

    expect(result.sources.map((s) => s.label)).toEqual([
      'PR #112: feat(web): from a private member',
      'PR #101: feat(memory): let a caller see and forget facts',
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
    const title = 'feat(web): see <b>https://evil.example/t</b>';
    const prs = [pr(113, title, '2026-10-16T10:00:00Z', { body })];
    const { d } = deps(() => answer('x'), fakeGh(prs));
    const result = await draftPost({ type: 'whats-new', since: '2026-10-01', dryRun: true }, d);

    const { text, label } = result.sources[0];
    expect(text).toContain('Keep this sentence.');
    expect(text).toContain('click here');
    for (const bad of ['evil', 'script', 'onerror', '<', 'javascript:', '{{', 'http'])
      expect(text, bad).not.toContain(bad);
    expect(label).toBe('PR #113: feat(web): see');
    expect(result.prompt.slice(result.prompt.indexOf('FACTS'))).not.toContain('evil');
    expect(text.length).toBeLessThanOrEqual(
      'feat(web): see\n\n'.length + 2000 + ' [truncated]'.length
    );
    expect(text).toMatch(/\[truncated\]$/);
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

describe('content gates', () => {
  const devPost = (cited: number[]): ExistingPost => ({
    slug: 'whats-new-2026-10-18',
    title: "What's New",
    date: '2026-10-18',
    body: 'An earlier changelog.',
    cited,
  });
  const labels = (sources: Array<{ label: string }>) => sources.map((s) => s.label);

  it('rejects a draft that repeats 8 words of a recent post, and says so on the retry', async () => {
    const line = 'A reply from Ferni takes around two seconds today, slower than we want.';
    injected.posts = [
      {
        folder: 'ferni-website/src/blog',
        post: { slug: 'x', title: 'X', date: '2026-10-18', body: `Honestly? ${line}`, cited: [] },
      },
    ];
    const { d, writes, generate } = deps(() => answer('On waiting', `${BODY} ${line}`));
    const result = await draftPost({ type: 'mission-essay' }, d);

    expect(result.status).toBe('rejected');
    expect(result.issues.map((i) => i.rule)).toEqual(['repeat-phrase']);
    expect(result.issues[0].message).toContain('a reply from ferni takes around two seconds today');
    expect(generate.mock.calls[1][0]).toContain('[repeat-phrase]');
    expect(writes).toHaveLength(0);
  });

  it('lists only the PRs the post mentions as its sources', async () => {
    const prs = [...PRS, pr(114, 'feat(sdk): a second change', '2026-10-16T10:00:00Z')];
    const { d, writes } = deps(() => answer('Two changes, one told'), fakeGh(prs));
    const result = await draftPost({ type: 'whats-new' }, d);

    expect(result.status, JSON.stringify(result.issues)).toBe('written');
    expect(result.prompt).toContain('PR #114');
    expect(labels(result.sources)).toEqual([
      'PR #101: feat(memory): let a caller see and forget facts',
    ]);
    const { data } = matter(writes[0].content);
    expect(data.sources).toHaveLength(1);
    expect(data.sources[0]).toMatch(/^PR #101: /);
  });

  it('whats-new leaves out PRs an earlier developer post or an open whats-new draft cites', async () => {
    injected.posts = [{ folder: 'developers-portal/src/blog', post: devPost([101]) }];
    const prs = [
      ...PRS,
      pr(114, 'feat(sdk): in the open draft', '2026-10-16T10:00:00Z'),
      pr(115, 'feat(api): new this week', '2026-10-16T09:00:00Z'),
    ];
    const open = [
      {
        head: { ref: 'blog/draft-whats-new-2026-10-18' },
        body: '### Sources\n- PR #114: feat(sdk)',
      },
      { head: { ref: 'blog/draft-mission-essay-2026-10-18' }, body: '- PR #115: not a changelog' },
    ];
    const { d } = deps(() => answer('x'), fakeGh(prs, {}, {}, open));
    const result = await draftPost({ type: 'whats-new', since: '2026-10-01', dryRun: true }, d);
    expect(labels(result.sources)).toEqual(['PR #115: feat(api): new this week']);
  });

  it('whats-new takes only PRs that touch the developer portal or the developer API', async () => {
    const prs = [
      ...PRS,
      pr(116, 'feat(web): a consumer app change', '2026-10-16T10:00:00Z'),
      pr(117, 'docs(blog): a hand-edited dev post', '2026-10-16T09:00:00Z'),
      pr(118, 'feat(api): developer webhooks', '2026-10-01T09:00:00Z'),
    ];
    const files = {
      116: [{ filename: 'apps/web/src/ui/back.ts', status: 'modified', patch: '+x' }],
      117: [{ filename: 'apps/website/developers-portal/src/blog/a.md', status: 'modified' }],
      118: [{ filename: 'src/api/v1/developers/webhooks-routes.ts', status: 'modified' }],
    };
    const { d } = deps(() => answer('x'), fakeGh(prs, files));
    const result = await draftPost({ type: 'whats-new', since: '2026-09-30', dryRun: true }, d);
    expect(labels(result.sources)).toEqual([
      'PR #101: feat(memory): let a caller see and forget facts',
      'PR #118: feat(api): developer webhooks',
    ]);
    const none = deps(() => answer('x'), fakeGh(prs.slice(5, 7), files));
    const empty = await draftPost({ type: 'whats-new', since: '2026-09-30' }, none.d);
    expect(empty.status).toBe('nothing-to-draft');
    expect(none.generate).not.toHaveBeenCalled();
  });

  it('writes nothing when the model skips', async () => {
    const { d, writes } = deps(() => JSON.stringify({ skip: true }));
    const result = await draftPost({ type: 'how-ferni-works' }, d);
    expect(result.status).toBe('nothing-to-draft');
    expect(writes).toHaveLength(0);
  });

  it('gives consumer posts the house facts as constraints, never as facts, and letters none', async () => {
    const prompt = async (type: string) =>
      (await draftPost({ type, persona: 'peter', dryRun: true }, deps(() => '').d)).prompt;
    const works = await prompt('how-ferni-works');
    const constraints = works.slice(works.indexOf('TRUE TODAY'), works.indexOf('ANSWER FORMAT'));
    expect(constraints).toContain('around two seconds');
    const facts = works.slice(works.indexOf('\nFACTS\n'));
    expect(facts).not.toMatch(/two seconds|1176|development agent/);
    for (const type of ['team-letter', 'whats-new']) {
      const p = await prompt(type);
      expect(p, type).not.toMatch(/TRUE TODAY|two seconds|development agent/);
    }
  });

  it('gives each type its purpose', async () => {
    const brief = (id: string) => POST_TYPES[id].brief;
    expect(brief('how-ferni-works')).toMatch(/ONE feature a person can see or hear/);
    expect(brief('how-ferni-works')).toMatch(/the moment someone notices it/);
    expect(brief('team-letter')).toMatch(/ONE scene from their biography/);
    expect(brief('team-letter')).toMatch(/inviting the reader to call them on Ferni/);
    expect(brief('whats-new')).toMatch(/the SDK, the developer API and the developer portal/);
    expect(brief('whats-new')).toMatch(/none was covered by an earlier post/);
  });
});
