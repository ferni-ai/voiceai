/**
 * Regression test for the "Failed to save relationship to Firestore" log
 * line that also showed `userId: "Sam"` - the caller's display name,
 * rather than their real user id ("voice-eval-sam").
 *
 * The relationship tools accept `userId` as an LLM-supplied tool argument.
 * If the LLM supplies the speaker's display name instead of their
 * authenticated id, relationships get saved and read under the wrong
 * Firestore path. `getRelationshipToolDefinitions()` must always use the
 * session's `ctx.userId`, regardless of what the tool call argument says.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ToolContext } from '../../../../registry/types.js';

vi.mock('@livekit/agents', () => ({
  llm: { tool: vi.fn((config: unknown) => config) },
}));

vi.mock('firebase-admin', () => ({
  default: { apps: [], firestore: vi.fn() },
}));

vi.mock('../../../../../utils/safe-logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../../sports.js', () => ({
  getTeamScore: vi.fn().mockResolvedValue('Eagles won 24-17 against the Cowboys'),
}));

function makeCtx(userId: string): ToolContext {
  return {
    userId,
    agentId: 'ferni',
    agentDisplayName: 'Ferni',
  };
}

describe('relationship tools use the authenticated user id', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('saves addRelationship under ctx.userId even when the tool call passes a display name as userId', async () => {
    const { getRelationshipToolDefinitions } = await import('../index.js');
    const { getRelationships } = await import('../storage.js');

    const ctx = makeCtx('voice-eval-sam');
    const defs = getRelationshipToolDefinitions();
    const addRelationshipDef = defs.find((d) => d.id === 'addRelationship');
    expect(addRelationshipDef).toBeDefined();

    const tool = addRelationshipDef!.create(ctx);
    await tool.execute({
      userId: 'Sam', // the caller's display name, NOT their real user id
      name: 'Alice',
      relationshipType: 'friend',
    });

    const underRealId = await getRelationships('voice-eval-sam');
    const underDisplayName = await getRelationships('Sam');

    expect(underRealId.some((r) => r.name === 'Alice')).toBe(true);
    expect(underDisplayName.some((r) => r.name === 'Alice')).toBe(false);
  });
});
