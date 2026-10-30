/** The call report's turn steps (turn-call-report.ts, #3080): a crisis turn never marks it delivered. */
import { llm } from '@livekit/agents';
import { describe, expect, it, vi } from 'vitest';

const confirm = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock(
  '../../../intelligence/context-builders/external/call-report.js',
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    confirmCallReportReached: confirm,
  })
);

const { noteCallReportReached } = await import('../turn-call-report.js');

describe('noteCallReportReached', () => {
  it('a crisis turn never marks the report; any other turn does, with its words and hold', () => {
    const ctx = llm.ChatContext.empty();
    const held = Promise.resolve();
    noteCallReportReached('s-1', ctx, { latest: 'hey', held, crisis: true });
    expect(confirm).not.toHaveBeenCalled();
    noteCallReportReached('s-1', ctx, { latest: 'hey', held, crisis: false });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith(
      's-1',
      ctx.items,
      expect.objectContaining({ latest: 'hey', held })
    );
  });
});
