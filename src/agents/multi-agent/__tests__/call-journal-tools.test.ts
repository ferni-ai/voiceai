/**
 * CALL_JOURNAL=on: every persona starts with the journal tools, the initial cap
 * keeps them, and quickNote sends journal requests to them.
 *
 * Dev eval 2026-10-17 (CALL_JOURNAL on): "journal" was not among the 90 tools
 * offered, Ferni said "I don't actually have a journal here", and another run
 * saved the request as a session-only quickNote.
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { capToolsToLimit, getMaxTools, isEssentialTool } from '../../../config/tool-config.js';
import { getToolGateway, resetToolGateway } from '../../../tools/gateway/tool-gateway.js';
import {
  QUICK_NOTE_JOURNAL_STEER,
  notesToolDefinitions,
} from '../../../tools/domains/simple-utilities/notes-tools.js';
import { getToolDescription } from '../../../tools/utils/tool-descriptions.js';
import { withCallJournalTools } from '../call-journal-tools.js';
import { resolveInitialToolLimit } from '../initial-tools.js';

const JOURNAL_TOOLS = ['journal', 'addGratitude'];
const ctxFor = (agentId: string) => ({
  userId: 'test-user',
  sessionId: 'session-1',
  agentId,
  agentDisplayName: agentId,
});
const capped = <T>(tools: Record<string, T>) =>
  capToolsToLimit(tools, resolveInitialToolLimit(getMaxTools()));

/** The handoff path's tools (Tool Gateway Tier 0), then the same cap agent-setup applies. */
async function handedToPeterTools(): Promise<Record<string, unknown>> {
  resetToolGateway();
  const gateway = getToolGateway();
  await gateway.warmup();
  const loaded = gateway.getSessionTools() as Record<string, unknown>;
  return capped(await withCallJournalTools(loaded, ctxFor('peter-john')));
}

/** Ferni's first agent carries far more tools than the cap (orchestrator plus always-available). */
async function ferniTools(): Promise<Record<string, unknown>> {
  const many = Object.fromEntries(
    Array.from({ length: 300 }, (_, i) => [`domainTool${i}`, { description: 'x' }])
  );
  return capped(await withCallJournalTools(many, ctxFor('ferni')));
}

const quickNoteDescription = () =>
  (notesToolDefinitions.find((d) => d.id === 'quickNote')?.create({} as never) as {
    description: string;
  }).description;

beforeEach(() => {
  vi.stubEnv('JOURNAL_ONE_STORE', 'on');
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetToolGateway();
});

describe('CALL_JOURNAL off', () => {
  beforeEach(() => vi.stubEnv('CALL_JOURNAL', 'off'));

  it('changes nothing: same tools, journal not essential, quickNote as before', async () => {
    const tools = { someTool: {} };
    expect(await withCallJournalTools(tools, ctxFor('ferni'))).toBe(tools);
    expect(Object.keys(await handedToPeterTools())).not.toContain('journal');
    expect(isEssentialTool('journal')).toBe(false);
    expect(quickNoteDescription()).toBe(getToolDescription('quickNote'));
  }, 60_000);
});

describe('CALL_JOURNAL on', () => {
  beforeEach(() => vi.stubEnv('CALL_JOURNAL', 'on'));

  it('a handed-to persona is offered the journal tools from its first turn', async () => {
    const tools = await handedToPeterTools();
    expect(Object.keys(tools)).toEqual(expect.arrayContaining(JOURNAL_TOOLS));
    // The call-journal version, with a real write action, not the legacy prompt-only tool.
    const journal = tools.journal as { parameters: { shape: object } };
    expect(Object.keys(journal.parameters.shape)).toContain('action');
    // Only these two, not the whole productivity domain.
    expect(Object.keys(tools)).not.toContain('manageRoutine');
  }, 60_000);

  it("Ferni's first agent keeps them through the cap", async () => {
    expect(Object.keys(await ferniTools())).toEqual(expect.arrayContaining(JOURNAL_TOOLS));
  }, 60_000);

  it('quickNote sends journal requests to the journal tool', () => {
    expect(quickNoteDescription()).toBe(getToolDescription('quickNote') + QUICK_NOTE_JOURNAL_STEER);
    expect(QUICK_NOTE_JOURNAL_STEER).toMatch(/journal tool with action "write"/);
  });
});

it('agent-setup adds them on every path, before the cap (handoff, first agent, fallback)', () => {
  const setup = readFileSync(new URL('../agent-setup.ts', import.meta.url), 'utf8');
  expect(setup).toMatch(/await withCallJournalTools\(loadedTools, \w+\)/);
});
