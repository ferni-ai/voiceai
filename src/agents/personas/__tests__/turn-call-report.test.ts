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

describe('turnRequestFor: a safety tool in the request is a signal too (#3080 r8)', () => {
  /** A request with the report pushed, then one tool call and its output. */
  function withTool(name: string, output: string): llm.ChatContext {
    const c = request();
    c.insert(llm.FunctionCall.create({ callId: 'c1', name, args: '{}' }));
    c.insert(llm.FunctionCallOutput.create({ callId: 'c1', name, output, isError: false }));
    return c;
  }

  it.each([
    ['a crisis tool, whatever it says', 'provideCrisisResources', 'I care about you.'],
    ['a presence tool', 'breatheWithMe', 'Breathe in for four.'],
    ['any tool naming crisis resources', 'jobLossSupport', 'You can call or text 988 any time.'],
  ])('%s: stripped, and it waits', (_l, name, output) => {
    const [ctx, waits] = turnRequestFor(withTool(name, output), 's-tool', false);
    expect(waits).toBe(true);
    expect(text(ctx)).not.toContain('ZEBRA-SECRET');
  });

  it('an ordinary tool: the report rides', () => {
    const [ctx, waits] = turnRequestFor(withTool('getWeather', 'Sunny, 72.'), 's-weather', false);
    expect(waits).toBe(false);
    expect(text(ctx)).toContain('ZEBRA-SECRET');
  });

  it('a check that throws holds the report (fails safe)', () => {
    const c = request();
    Object.defineProperty(c.items[1]!, 'extra', {
      get() {
        throw new Error('unreadable');
      },
    });
    const [ctx, waits] = turnRequestFor(c, 's-throw', false);
    expect(waits).toBe(true);
    expect(text(ctx)).not.toContain('ZEBRA-SECRET');
  });
});

describe('turnRequestFor: any tool output naming help holds the report (#3157)', () => {
  function withOutput(output: string): llm.ChatContext {
    const c = request();
    c.insert(llm.FunctionCall.create({ callId: 'c2', name: 'jobLossSupport', args: '{}' }));
    c.insert(
      llm.FunctionCallOutput.create({
        callId: 'c2',
        name: 'jobLossSupport',
        output,
        isError: false,
      })
    );
    return c;
  }

  // Fictional surroundings; the numbers are the real lines a tool could name.
  it.each([
    ['988 in words', 'You can call nine eight eight tonight.'],
    ['9 8 8 with spaces', 'Dial 9 8 8 if it gets heavy.'],
    ['9-8-8 with dashes', 'Dial 9-8-8 if it gets heavy.'],
    [
      '988 after a newline in JSON',
      JSON.stringify({ tips: 'Rest first.\n988 is open all night.' }),
    ],
    ['the Crisis Text Line number alone', 'Text 741741 any time.'],
    ['the DV hotline number alone', 'Reach them at 1-800-799-7233.'],
    ['the Trevor number alone', 'Reach them at 1-866-488-7386.'],
    ['the old Lifeline number alone', 'Reach them at 1-800-273-8255.'],
    ['call 911', 'If you are hurt, call 911.'],
    ['a line name split across array parts', JSON.stringify(['Crisis Life', 'line, open now'])],
    ['a line written as an object key', JSON.stringify({ 'Call 988 any time': true })],
  ])('%s: stripped, and it waits', (_l, output) => {
    const [ctx, waits] = turnRequestFor(withOutput(output), 's-help', false);
    expect(waits).toBe(true);
    expect(text(ctx)).not.toContain('ZEBRA-SECRET');
  });

  it('no report on the request (flag off): a tool naming help leaves the request as sent', () => {
    const c = llm.ChatContext.empty();
    c.addMessage({ role: 'user', content: 'what can I do tonight?' });
    c.insert(llm.FunctionCall.create({ callId: 'c3', name: 'jobLossSupport', args: '{}' }));
    c.insert(
      llm.FunctionCallOutput.create({
        callId: 'c3',
        name: 'jobLossSupport',
        output: 'Call 9-8-8 any time.',
        isError: false,
      })
    );
    const [ctx, waits] = turnRequestFor(c, 's-off', false);
    expect(waits).toBe(true);
    expect(ctx).toBe(c);
  });

  it('an amount is not a line: the report rides', () => {
    const [ctx, waits] = turnRequestFor(withOutput('The flight is $988 return.'), 's-fare', false);
    expect(waits).toBe(false);
    expect(text(ctx)).toContain('ZEBRA-SECRET');
  });

  const filler = (n: number): string => 'The trail loops past the lake and back. '.repeat(n);

  it('a line across a window edge, deep in a long output, still holds', () => {
    // 2040 characters of filler put "988" at 2047-2049, across the first window's end (2048).
    const output = `${filler(51)}x call 988 tonight. ${filler(100)}`;
    expect(output.indexOf('988')).toBe(2047);
    expect(turnRequestFor(withOutput(output), 's-edge', false)[1]).toBe(true);
  });

  it('an ordinary long output rides', () => {
    expect(turnRequestFor(withOutput(filler(800)), 's-long', false)[1]).toBe(false);
  });

  it('an output too long to read holds the report (fails safe)', () => {
    expect(turnRequestFor(withOutput(filler(5000)), 's-huge', false)[1]).toBe(true);
  });

  it('an output nested deeper than it reads holds the report', () => {
    let deep: unknown = 'quiet';
    for (let i = 0; i < 12; i++) deep = { inner: deep };
    expect(turnRequestFor(withOutput(JSON.stringify(deep)), 's-deep', false)[1]).toBe(true);
  });

  it('a long timetable full of short numbers is read in bounded time', () => {
    const table = 'bus 214 leaves gate 307 for dock 412, '.repeat(3000); // ~114 KB
    const started = performance.now();
    turnRequestFor(withOutput(table), 's-table', false);
    expect(performance.now() - started).toBeLessThan(250);
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
