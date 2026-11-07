/**
 * The tool dispatcher logs the shape of a call's arguments, never their values. Every
 * tool call passes through executeTool, and a tool's string arguments are what the
 * caller said, so the "Tool start" line, the unknown-tool line and the meta-tool unwrap
 * lines carry each key with its type and a string's length, and nothing else.
 *
 * Through the REAL safe-logger (the global setup mocks it; this unmocks it): under vitest
 * it writes to process.stderr, which is captured. Each case runs the real dispatcher with
 * a planted fictional marker, for a demo visitor and for a signed-in owner, and asserts
 * the line still fires once, carries the key and length, and never the marker.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.LOG_LEVEL = 'debug';
});
vi.unmock('../../../utils/safe-logger.js');

import { getLogger } from '../../../utils/safe-logger.js';
import { toolArgShape } from '../tool-arg-shape.js';
import { executeTool } from '../tool-dispatcher.js';

// Fictional caller words with a marker no log line could carry by accident.
const MARKER = 'SAM-MARKER-sunflower';
const SAID = `ask Sam about the ${MARKER} at 555-0123`;

const DEMO_ID = 'device:demo_1700000000000_sam01';
const OWNER_ID = 'sam-owner-uid-0101';

let out: string[];
beforeEach(() => {
  out = [];
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
    out.push(String(chunk));
    return true;
  });
});
afterEach(() => vi.restoreAllMocks());

/** The captured log lines whose message is exactly `msg`. */
function linesWith(msg: string): string[] {
  return out
    .join('')
    .split('\n')
    .filter((l) => l.includes(`"msg":${JSON.stringify(msg)}`));
}

let seq = 0;
const ctxFor = (userId: string) => ({
  userId,
  sessionId: `sam-session-${++seq}`,
  personaId: 'ferni',
});

describe('tool dispatch logs the shape of arguments, never the caller words', () => {
  it('control: the capture sees a word field when one is logged', () => {
    getLogger().info({ said: SAID }, 'capture control');
    expect(out.join('')).toContain(MARKER);
  });

  for (const userId of [DEMO_ID, OWNER_ID]) {
    describe(userId === DEMO_ID ? 'demo visitor' : 'owner', () => {
      it('"Tool start" for a registered tool carries keys and lengths', async () => {
        const result = await executeTool(
          { name: 'getCurrentTime', args: { timezone: 'UTC', aboutWhat: SAID } },
          ctxFor(userId)
        );
        expect(result.success).toBe(true);
        const lines = linesWith('Tool start: getCurrentTime');
        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain(
          `"argShape":{"timezone":"string:3","aboutWhat":"string:${SAID.length}"}`
        );
        expect(lines[0]).toContain(`"userId":${JSON.stringify(userId)}`);
        expect(out.join('')).not.toContain('sunflower');
      });

      it('the unknown-tool line carries keys and lengths', async () => {
        const result = await executeTool(
          { name: 'samUnknownTool', args: { query: SAID, limit: 3 } },
          ctxFor(userId)
        );
        expect(result.success).toBe(true);
        const lines = linesWith('Unknown tool — no route');
        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain(`"argShape":{"query":"string:${SAID.length}","limit":"number"}`);
        expect(lines[0]).toContain('"fn":"samUnknownTool"');
        expect(out.join('')).not.toContain('sunflower');
      });

      // Malformed args JSON: unquoted words (the parser quotes the input around the bad
      // token) and an unclosed brace after a marker string.
      for (const broken of [`{"aboutWhat": sunflower for Sam}`, `{"note":"${MARKER}`]) {
        it(`a meta-tool parse failure logs its length and error class only: ${broken.length} chars`, async () => {
          await executeTool(
            { name: 'executeTool', args: { toolName: 'getCurrentTime', args: broken } },
            ctxFor(userId)
          );
          const parse = linesWith('Failed to parse meta-tool args JSON');
          expect(parse).toHaveLength(1);
          const record = JSON.parse(parse[0]) as Record<string, unknown>;
          expect(record.rawArgsChars).toBe(broken.length);
          expect(record.errorClass).toBe('SyntaxError');
          // Structural: no error text at all, so nothing rests on the logger's scrub.
          expect(record).not.toHaveProperty('error');
          expect(record).not.toHaveProperty('err');
          for (const word of broken.match(/[A-Za-z]{4,}/g) ?? []) {
            expect(parse[0]).not.toContain(word);
          }
          expect(out.join('')).not.toContain('sunflower');
        });
      }

      it('a meta-tool call without a toolName logs the shape of its args', async () => {
        await executeTool({ name: 'executeTool', args: { args: SAID } }, ctxFor(userId));
        const missing = linesWith('Meta-tool call missing toolName');
        expect(missing).toHaveLength(1);
        expect(missing[0]).toContain(`"argShape":{"args":"string:${SAID.length}"}`);
        expect(out.join('')).not.toContain('sunflower');
      });
    });
  }
});

describe('toolArgShape', () => {
  it('gives each key its type, and lengths for strings and arrays', () => {
    const args = { name: 'Sam', tags: ['a', 'b'], when: null, nested: { said: SAID }, ok: true };
    expect(toolArgShape(args)).toEqual({
      name: 'string:3',
      tags: 'array:2',
      when: 'null',
      nested: 'object',
      ok: 'boolean',
    });
    expect(toolArgShape(SAID)).toBe(`string:${SAID.length}`);
    expect(toolArgShape(undefined)).toBe('undefined');
  });

  it('caps the keys it lists', () => {
    const many = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`k${i}`, i]));
    const shape = toolArgShape(many) as Record<string, string>;
    expect(Object.keys(shape)).toHaveLength(21);
    expect(shape['…']).toBe('+5 keys');
  });
});
