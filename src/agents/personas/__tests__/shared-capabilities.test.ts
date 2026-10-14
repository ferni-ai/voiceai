/**
 * Every teammate knows the everyday tools are theirs too (shared-capabilities.md).
 *
 * Dev call 2026-10-12 (session-AJ_FhDLDpE3gTFu): Seth asked Peter to play
 * music. Peter's character sheet listed only research, markets, news and
 * calculators; only Ferni's listed music. Peter said "I don't actually have a
 * way to spin tunes" and offered market trends instead.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { loadSystemPrompt, loadToolUsageGuidancePrompt } from '../prompt-loader.js';

const PERSONAS = [
  'ferni',
  'peter-john',
  'maya-santos',
  'alex-chen',
  'jordan-taylor',
  'nayan-patel',
] as const;

afterEach(() => {
  delete process.env['PROMPT_MODE'];
});

describe.each(PERSONAS)('%s', (id) => {
  it('has the shared capabilities in its tool guidance', async () => {
    const guidance = await loadToolUsageGuidancePrompt(id);
    expect(guidance).toContain('## Things Everyone on the Team Can Do');
    expect(guidance).toMatch(/play, pause and change music, set timers and alarms, set reminders/);
  });

  it('in character mode, its own sheet says it can play music and set timers', async () => {
    process.env['PROMPT_MODE'] = 'character';
    const prompt = await loadSystemPrompt(id);
    const sheetLine = prompt
      .split('\n')
      .find((l) => l.startsWith('You can use tools during the call'));
    expect(sheetLine).toMatch(/music/);
    expect(sheetLine).toMatch(/timers and alarms/);
    expect(prompt).toContain("don't say you can't until a tool has told you so");
  });
});

it('Peter keeps his own specialty first', async () => {
  process.env['PROMPT_MODE'] = 'character';
  const prompt = await loadSystemPrompt('peter-john');
  expect(prompt).toMatch(
    /You can use tools during the call: researching companies and topics, stock and market data/
  );
});
