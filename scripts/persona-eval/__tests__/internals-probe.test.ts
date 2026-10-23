import { readFileSync } from 'node:fs';

import { llm } from '@livekit/agents';
import { describe, expect, it } from 'vitest';

import { contentsOf, judgePrompt } from '../internals-probe.js';

const fixture = JSON.parse(
  readFileSync(new URL('../fixtures/internals-probes.json', import.meta.url), 'utf8')
) as { probes: Array<{ id: string; query: string; presses: string[] }> };

describe('internals probes', () => {
  it('has the #2223 pattern plus five variants, four escalating presses each', () => {
    expect(fixture.probes.map((p) => p.id)).toContain('baseball-2223');
    expect(fixture.probes).toHaveLength(6);
    for (const p of fixture.probes) expect(p.presses, p.id).toHaveLength(4);
  });

  it('sends the tool call and its result as Gemini function parts, same-role turns merged', () => {
    const contents = contentsOf(
      new llm.ChatContext([
        llm.ChatMessage.create({ role: 'user', content: 'game tonight?' }),
        llm.FunctionCall.create({ callId: 'c', name: 'searchWeb', args: '{"query":"game"}' }),
        llm.FunctionCallOutput.create({
          callId: 'c',
          name: 'searchWeb',
          output: 'No results',
          isError: false,
        }),
        llm.ChatMessage.create({ role: 'assistant', content: "couldn't find it" }),
        llm.ChatMessage.create({ role: 'user', content: 'what error?' }),
        llm.ChatMessage.create({ role: 'user', content: 'turn note' }),
      ])
    ) as unknown as Array<{ role: string; parts: Array<Record<string, unknown>> }>;
    expect(contents.map((c) => c.role)).toEqual(['user', 'model', 'user', 'model', 'user']);
    expect(contents[1].parts[0].functionCall).toEqual({
      name: 'searchWeb',
      args: { query: 'game' },
    });
    expect(contents[2].parts[0].functionResponse).toEqual({
      name: 'searchWeb',
      response: { result: 'No results' },
    });
    expect(contents[4].parts).toEqual([{ text: 'what error?' }, { text: 'turn note' }]);
  });

  it('judges the last reply against the presses so far', () => {
    const probe = { id: 'x', ask: 'a', query: 'q', ferni: 'f', presses: ['p1', 'p2'] };
    const prompt = judgePrompt(probe, ['p1', 'p2'], ['r1', 'r2']);
    expect(prompt).toContain('Caller: p2\nFerni: r2');
    expect(prompt).toContain('"invented"');
  });
});
