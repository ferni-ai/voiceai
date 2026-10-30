/**
 * The call report's turn steps (turn-call-report.ts, #3080): any safety signal on the request or
 * the call holds the report back, and a held report is never marked delivered.
 */
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

const { noteCallReportReached, turnRequestFor } = await import('../turn-call-report.js');
const { TURN_CONTEXT_HEADER } = await import('../../multi-agent/turn-context-header.js');
const { TURN_CONTEXT_SAFETY } = await import('../../multi-agent/pushed-notes.js');
const { SAFETY_NOTE } = await import('../../processors/turn-processor/safety-note.js');
const { noteCrisisRisk } = await import('../../../services/safety/crisis-call-risk.js');

const REPORT = [
  '## While they were away (tell them on this call)',
  'ZEBRA-SECRET from the call',
  'Bring it up early, in your own words; ask before acting on anything in it.',
].join('\n');
const GUIDANCE = '[CRISIS SUPPORT] Stay with them; name the 988 line.';

/** A request whose pushed turn note holds the report, with `extra` on that note. */
function request(extra?: Record<string, unknown>, note = REPORT): llm.ChatContext {
  const c = llm.ChatContext.empty();
  c.addMessage({ role: 'assistant', content: 'Hey, good to hear you.' });
  c.addMessage({ role: 'system', content: [`${TURN_CONTEXT_HEADER}\n${note}`], extra });
  c.addMessage({ role: 'user', content: 'okay' });
  return c;
}
const text = (ctx: llm.ChatContext): string =>
  ctx.items.map((i) => (i as { textContent?: string }).textContent ?? '').join('\n');

describe('turnRequestFor: the report waits on any safety signal', () => {
  it.each([
    // the r7 leak: the pipeline wrote crisis guidance and the report into one pushed note
    [
      'a pushed note holding safety guidance',
      { [TURN_CONTEXT_SAFETY]: GUIDANCE },
      `${GUIDANCE}\n\n${REPORT}`,
    ],
    ['a marked safety note', { [SAFETY_NOTE]: true }, REPORT],
  ] as const)('%s: stripped, and it waits', (_l, extra, note) => {
    const [ctx, waits] = turnRequestFor(request(extra, note), 's-signal', false);
    expect(waits).toBe(true);
    expect(text(ctx)).not.toContain('ZEBRA-SECRET');
    expect(text(ctx)).not.toContain('Bring it up early');
  });

  it('crisis risk noted on the call: stripped, even with nothing marked in the request', () => {
    noteCrisisRisk('s-risk');
    const [ctx, waits] = turnRequestFor(request(), 's-risk', false);
    expect(waits).toBe(true);
    expect(text(ctx)).not.toContain('ZEBRA-SECRET');
  });

  it('a crisis-shaped request: stripped', () => {
    const [ctx, waits] = turnRequestFor(request(), 's-crisis', true);
    expect(waits).toBe(true);
    expect(text(ctx)).not.toContain('ZEBRA-SECRET');
  });

  it('no signal at all: the request as sent, report kept', () => {
    const sent = request();
    const [ctx, waits] = turnRequestFor(sent, 's-quiet', false);
    expect(waits).toBe(false);
    expect(ctx).toBe(sent);
    expect(text(ctx)).toContain('ZEBRA-SECRET');
  });
});

describe('noteCallReportReached', () => {
  it('a held report is never marked; any other turn marks it, with its words and hold', () => {
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
