/**
 * recordCommitment keeps what someone can act on: a goodbye is not stored, a
 * bare "her" becomes the person the model named, and a real plan is stored.
 * Only the store and the tool wrapper are fakes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@livekit/agents', () => ({
  llm: { tool: vi.fn((config) => ({ execute: config.execute })) },
}));

const saveCommitment = vi.fn(async (c: Record<string, unknown>) => ({
  commitment: { id: 'c1', ...c },
}));
vi.mock('../../../../services/superhuman/commitment-keeper.js', () => ({
  saveCommitment: (c: Record<string, unknown>) => saveCommitment(c),
  detectCommitment: vi.fn(),
  loadUserCommitments: vi.fn(),
  updateCommitmentStatus: vi.fn(),
  getFollowUpsForUser: vi.fn(),
}));

import { commitmentTools } from '../commitments.js';
import type { ToolContext } from '../../../registry/types.js';

type Exec = (p: Record<string, unknown>) => Promise<string>;
const recordDef = commitmentTools.find((t) => t.id === 'recordCommitment');
const record = () =>
  (recordDef?.create({ userId: 'u1' } as ToolContext) as unknown as { execute: Exec }).execute;

describe('recordCommitment', () => {
  beforeEach(() => saveCommitment.mockClear());

  it('does not store a goodbye', async () => {
    const reply = await record()({ statement: "I'll catch you later", summary: 'catch you later' });
    expect(saveCommitment).not.toHaveBeenCalled();
    expect(reply).toMatch(/^Not recorded/);
  });

  it('stores "call her tomorrow" as said when no one is named: a pronoun never drops a plan', async () => {
    await record()({ statement: "I'll call her tomorrow", summary: 'call her' });
    expect(saveCommitment.mock.calls[0][0]).toMatchObject({ statement: "I'll call her tomorrow" });
  });

  it('stores "call her tomorrow" as "call Mindy tomorrow" when the model named her', async () => {
    await record()({
      statement: "I'll call her tomorrow",
      summary: 'call Mindy',
      personInvolved: 'Mindy',
    });
    expect(saveCommitment).toHaveBeenCalledTimes(1);
    expect(saveCommitment.mock.calls[0][0]).toMatchObject({
      statement: "I'll call Mindy tomorrow",
    });
  });

  it('names her as the object even with more in the line: "text Mindy back after lunch"', async () => {
    await record()({
      statement: "I'll text her back after lunch",
      summary: 'text Mindy back',
      personInvolved: 'Mindy',
    });
    expect(saveCommitment.mock.calls[0][0]).toMatchObject({
      statement: "I'll text Mindy back after lunch",
    });
  });

  it('stores a real plan word for word', async () => {
    const reply = await record()({ statement: 'send Mindy the photos', summary: 'send photos' });
    expect(saveCommitment.mock.calls[0][0]).toMatchObject({ statement: 'send Mindy the photos' });
    expect(reply).toMatch(/^Got it/);
  });
});
