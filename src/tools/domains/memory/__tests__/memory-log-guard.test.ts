/**
 * The memory tools and the remembered-fact writer log ids, counts and lengths only:
 * never what the caller asked Ferni to remember, a correction, a guess, or the
 * conversation around it. The call-log guard's reader (log-guard.ts) checks the source.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { offences } from '../../../../agents/voice-agent-entry/__tests__/log-guard.js';

const FILES = [
  'src/tools/domains/memory/tools-unified.ts',
  'src/tools/domains/memory/honest-memory.ts',
  'src/memory/dynamic/remembered-facts.ts',
  'src/memory/dynamic/replace-remembered.ts',
  'src/memory/storage/remembered-fact-store.ts',
];

describe('memory tool logs carry no caller content', () => {
  it.each(FILES)('%s', (file) => {
    expect(offences(file, readFileSync(file, 'utf8'))).toEqual([]);
  });

  it('would catch the predictUserNeed log as it was', () => {
    const was = "log.info({ agentId: ctx.agentId, context, prediction, confidence }, 'x');";
    expect(offences('planted.ts', was).length).toBeGreaterThan(0);
  });
});
