/**
 * toolsExecutedFields (#4442): a FunctionToolsExecuted event as a log line may say it. The
 * event carries the arguments the model wrote from the caller's words and the tool's whole
 * output; the fields keep tool names, argument names and sizes, and nothing else. Fictional data.
 */
import { describe, expect, it } from 'vitest';
import { toolsExecutedFields } from '../tools-executed-fields.js';

const WORDS = 'zorbleflax-fictional-contact';
const ARGS = JSON.stringify({ contactQuery: WORDS, purpose: 'return the fictional ladder' });
const OUTPUT = 'Calling zorbleflax-fictional-contact now about the fictional ladder';

describe('toolsExecutedFields', () => {
  it('keeps names and sizes for an SDK event, joining each output to its call by callId', () => {
    const out = toolsExecutedFields({
      functionCalls: [
        { callId: 'c2', name: 'recallFromMemory', args: JSON.stringify({ query: WORDS }) },
        { callId: 'c1', name: 'callOnBehalf', args: ARGS },
      ],
      functionCallOutputs: [
        { callId: 'c1', name: 'callOnBehalf', output: OUTPUT, isError: false },
        { callId: 'c2', name: 'recallFromMemory', output: { facts: [WORDS] }, isError: true },
      ],
    });
    expect(out).toEqual({
      toolCount: 2,
      tools: [
        {
          name: 'callOnBehalf',
          isError: false,
          argKeys: ['contactQuery', 'purpose'],
          argChars: ARGS.length,
          outputChars: OUTPUT.length,
        },
        {
          name: 'recallFromMemory',
          isError: true,
          argKeys: ['query'],
          argChars: JSON.stringify({ query: WORDS }).length,
          outputChars: JSON.stringify({ facts: [WORDS] }).length,
        },
      ],
    });
  });

  it('carries no argument value and no output text, whatever the shape', () => {
    const shapes: unknown[] = [
      {
        functionCalls: [{ callId: 'c1', name: 'callOnBehalf', args: ARGS }],
        functionCallOutputs: [{ callId: 'c1', name: 'callOnBehalf', output: OUTPUT }],
      },
      {
        functionCalls: [{ name: 'callOnBehalf', arguments: { contactQuery: WORDS } }],
        functionCallOutputs: [{ name: 'callOnBehalf', output: OUTPUT }],
      },
      { tools: [{ name: 'callOnBehalf', result: OUTPUT, error: WORDS }] },
      { name: 'callOnBehalf', result: OUTPUT, error: WORDS },
    ];
    for (const shape of shapes) {
      const logged = JSON.stringify(toolsExecutedFields(shape));
      expect(logged).not.toContain('zorbleflax');
      expect(logged).not.toContain('ladder');
    }
  });

  it('reads the older shapes', () => {
    expect(
      toolsExecutedFields({
        tools: [
          { name: 'a', result: 'xx' },
          { name: 'b', error: 'boom' },
        ],
      }).tools
    ).toEqual([
      { name: 'a', isError: false, argKeys: [], argChars: 0, outputChars: 2 },
      { name: 'b', isError: true, argKeys: [], argChars: 0, outputChars: 0 },
    ]);
    expect(toolsExecutedFields({ name: 'solo', result: 'abc' })).toEqual({
      toolCount: 1,
      tools: [{ name: 'solo', isError: false, argKeys: [], argChars: 0, outputChars: 3 }],
    });
  });

  it('cuts every string to an id and caps the argument names', () => {
    const long = 'x'.repeat(200);
    const manyKeys = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`${long}${i}`, 1]));
    const [tool] = toolsExecutedFields({
      functionCalls: [{ callId: 'c1', name: long, args: JSON.stringify(manyKeys) }],
      functionCallOutputs: [{ callId: 'c1', name: long, output: 'ok' }],
    }).tools;
    expect(tool.name).toHaveLength(40);
    expect(tool.argKeys).toHaveLength(20);
    for (const key of tool.argKeys) expect(key).toHaveLength(40);
  });

  it('survives what it cannot measure: bad JSON, a cycle, no event, a wrong type', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const [bad] = toolsExecutedFields({
      functionCalls: [{ callId: 'c1', name: 'a', args: `{not json ${WORDS}` }],
      functionCallOutputs: [{ callId: 'c1', name: 'a', output: cyclic }],
    }).tools;
    expect(bad).toMatchObject({ argKeys: [], outputChars: -1 });
    expect(JSON.stringify(bad)).not.toContain('zorbleflax');
    for (const odd of [undefined, null, 'text', 7, {}, { functionCallOutputs: 'nope' }]) {
      expect(() => toolsExecutedFields(odd)).not.toThrow();
      expect(toolsExecutedFields(odd).toolCount).toBe(1);
    }
  });
});
