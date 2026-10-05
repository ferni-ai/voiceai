import { describe, expect, it, vi } from 'vitest';
import { withAuthenticatedUserId } from '../with-authenticated-user-id.js';

describe('withAuthenticatedUserId', () => {
  it('overrides LLM-supplied userId with session ctx.userId', async () => {
    const execute = vi.fn(async (args: { userId: string; name: string }) => args);
    const tool = { execute } as { execute: typeof execute };

    const wrapped = withAuthenticatedUserId(tool, {
      userId: 'auth-user-uuid',
    } as never);

    const result = await wrapped.execute({ userId: 'Sam', name: 'Alex' });
    expect(result.userId).toBe('auth-user-uuid');
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'auth-user-uuid', name: 'Alex' })
    );
  });
});
