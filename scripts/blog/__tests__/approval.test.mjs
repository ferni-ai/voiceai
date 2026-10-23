import { describe, expect, it, vi } from 'vitest';
import { APPROVED, NEEDS_APPROVAL, approvalDecision, runApproval } from '../approval.mjs';

const REPO = 'ferni-ai/voiceai';
const SHA = 'abc1234def5678';

/** A blog-approved label added to a drafted post that passed the judge. */
const event = (over = {}, pr = {}) => ({
  action: 'labeled',
  label: { name: APPROVED },
  sender: { login: 'seth', type: 'User' },
  repository: { full_name: REPO },
  pull_request: {
    number: 42,
    state: 'open',
    draft: false,
    head: { ref: 'blog/draft-how-ferni-works-2026-10-26', sha: SHA, repo: { full_name: REPO } },
    labels: [{ name: NEEDS_APPROVAL }, { name: APPROVED }],
    ...pr,
  },
  ...over,
});

/** gh: the labeler's permission by login, and a record of every call. */
const fakeGh = (roles) =>
  vi.fn((args) => {
    const login = /collaborators\/([^/]+)\/permission/.exec(args[1] ?? '')?.[1];
    if (login) {
      if (!(login in roles)) throw new Error('404');
      return JSON.stringify({ permission: roles[login] });
    }
    return '';
  });
const armed = (gh) => gh.mock.calls.some(([args]) => args[0] === 'pr' && args[1] === 'merge');
const unlabelled = (gh) =>
  gh.mock.calls.some(
    ([args]) => args.includes('DELETE') && args.at(-1).endsWith(`/labels/${APPROVED}`)
  );

describe('runApproval', () => {
  it("arms auto-merge, pinned to the approved commit, on a repo admin's label", () => {
    const gh = fakeGh({ seth: 'admin' });
    expect(runApproval(event(), gh)).toMatchObject({ arm: true });
    expect(gh).toHaveBeenCalledWith([
      'pr',
      'merge',
      '42',
      '--auto',
      '--repo',
      REPO,
      '--match-head-commit',
      SHA,
    ]);
    expect(unlabelled(gh)).toBe(false);
  });

  it("ignores a write collaborator's label and takes it off again", () => {
    const gh = fakeGh({ mallory: 'write' });
    const d = runApproval(event({ sender: { login: 'mallory', type: 'User' } }), gh);
    expect(d).toMatchObject({ arm: false, unlabel: true });
    expect(d.reason).toMatch(/mallory is not a repo admin \(write\)/);
    expect(armed(gh)).toBe(false);
    expect(unlabelled(gh)).toBe(true);
  });

  it('arms nothing when the permission lookup fails, or the labeler is a bot', () => {
    const lookupFails = fakeGh({});
    expect(runApproval(event(), lookupFails).arm).toBe(false);
    expect(armed(lookupFails)).toBe(false);
    const bot = fakeGh({ 'ferni-bot[bot]': 'admin' });
    const sender = { login: 'ferni-bot[bot]', type: 'Bot' };
    expect(runApproval(event({ sender }), bot).arm).toBe(false);
    expect(armed(bot)).toBe(false);
  });
});

describe('approvalDecision', () => {
  it('arms only a drafted, open, ready post that passed the judge', () => {
    expect(approvalDecision(event(), 'admin').arm).toBe(true);
    const cases = [
      event({ label: { name: 'blog-draft' } }),
      event({ action: 'unlabeled' }),
      event({}, { draft: true }),
      event({}, { state: 'closed' }),
      event({}, { labels: [{ name: APPROVED }] }), // never passed the judge
      event({}, { head: { ref: 'feat/x', sha: SHA, repo: { full_name: REPO } } }),
      event({}, { head: { ref: 'blog/draft-x', sha: SHA, repo: { full_name: 'fork/voiceai' } } }),
    ];
    for (const e of cases) {
      const d = approvalDecision(e, 'admin');
      expect(d.arm).toBe(false);
      expect(d.unlabel).toBeUndefined();
    }
  });

  it('ignores maintain and write: only admin approves', () => {
    for (const p of ['maintain', 'write', 'read', undefined])
      expect(approvalDecision(event(), p).arm).toBe(false);
  });
});
