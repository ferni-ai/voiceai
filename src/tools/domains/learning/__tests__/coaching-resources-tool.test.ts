import { beforeEach, describe, expect, it, vi } from 'vitest';

const videoCandidates = vi.fn(async () => [] as unknown[]);
vi.mock('../../../../services/coach-media/candidates.js', () => ({
  videoCandidates,
  bookCandidates: vi.fn(async () => []),
}));
const groundedAnswer = vi.fn(async () => ({
  answer: 'Heel drops are well supported.',
  sources: [{ title: 'nhs.uk', url: 'https://www.nhs.uk/a' }],
}));
vi.mock('../../../../services/coach-media/grounded-search.js', () => ({ groundedAnswer }));
const takeDailyBudget = vi.fn(async () => true);
vi.mock('../../../../services/coach-media/quota.js', () => ({
  takeDailyBudget,
  GROUNDING_PER_USER_PER_DAY: 30,
}));

const { runFindCoachingResources } = await import('../coaching-resources-tool.js');

beforeEach(() => vi.clearAllMocks());

describe('runFindCoachingResources', () => {
  it('falls back to the grounded answer when no video candidates came back (budget spent)', async () => {
    const out = await runFindCoachingResources(
      { topic: 'shin splints', format: 'video' },
      {},
      'u1'
    );
    expect(videoCandidates).toHaveBeenCalledWith('shin splints', false);
    expect(groundedAnswer).toHaveBeenCalledWith('shin splints');
    expect(out).toContain('Heel drops are well supported.');
  });

  it('makes no paid lookup for a caller with no account', async () => {
    const out = await runFindCoachingResources({ topic: 'shin splints' }, {}, 'anonymous');
    expect(takeDailyBudget).not.toHaveBeenCalled();
    expect(groundedAnswer).not.toHaveBeenCalled();
    expect(out).toContain('once signed in');
    await runFindCoachingResources({ topic: 'shin splints' }, {}, undefined);
    expect(groundedAnswer).not.toHaveBeenCalled();
  });

  it("stops at the caller's daily grounding cap before any lookup", async () => {
    takeDailyBudget.mockResolvedValueOnce(false);
    const out = await runFindCoachingResources({ topic: 'shin splints' }, {}, 'u1');
    expect(takeDailyBudget).toHaveBeenCalledWith('grounding:u1', 30);
    expect(groundedAnswer).not.toHaveBeenCalled();
    expect(videoCandidates).not.toHaveBeenCalled();
    expect(out).toContain('a lot of lookups today');
  });
});
