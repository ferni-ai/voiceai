/**
 * "This is session #N together" uses the one count of sessions together (the session
 * profile's totalConversations), not the relationship engine's own counter, which
 * disagreed with it in prod (engine 17, profile 21, conversation docs 30).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../relationship/persistence.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadRelationshipMemory: vi.fn().mockResolvedValue(null),
  saveRelationshipMemory: vi.fn().mockResolvedValue(undefined),
}));

const { initializeRelationship } = await import('../../../relationship/engine.js');
const { buildRelationshipStageContext } = await import('../relationship-stage.js');

describe('relationship-stage session number', () => {
  it.each([
    { n: 0, counted: 0, line: null },
    { n: 1, counted: 1, line: 'session #2 together' },
    { n: 3, counted: 3, line: 'session #4 together' },
  ])('$n sessions together: $line', async ({ counted, line }) => {
    const userId = `stage-${counted}`;
    // The engine's own counter says 17; it plays no part in the line
    const { createDefaultMemory, loadRelationshipMemory } =
      await import('../../../relationship/persistence.js');
    vi.mocked(loadRelationshipMemory).mockResolvedValueOnce({
      ...createDefaultMemory(userId, 'ferni'),
      totalSessions: 17,
    });
    await initializeRelationship(userId, 'ferni');
    const injections = await buildRelationshipStageContext({
      services: { userId, userProfile: { totalConversations: counted } },
      persona: { id: 'ferni' },
    } as unknown as Parameters<typeof buildRelationshipStageContext>[0]);
    const text = JSON.stringify(injections);
    if (line) expect(text).toContain(line);
    else expect(text).not.toMatch(/session #\d+ together/);
  });
});
