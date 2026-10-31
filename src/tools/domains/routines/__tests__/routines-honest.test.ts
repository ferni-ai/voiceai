/**
 * What I Do For You: a routine set up by voice is saved, not run. Nothing runs
 * saved routines yet (createWorkflow saves them paused, and the scheduler's
 * registerCallback has no callers), so the reply may never say it's done, running
 * or a reminder. Before 2026-10-25 it said "Done! I'll ... for you now", saved
 * "7:30 AM" as 7:30 UTC, and "set up a routine" loaded productivity's manageRoutine,
 * a second store the panel never reads (with a second tool id runRoutine).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { getWorkflowData } from '../../../../services/stores/workflow-store.js';
import {
  forgetCallerTimeZone,
  rememberCallerTimeZone,
} from '../../../../utils/caller-time-zone.js';
import { isFindableDomain } from '../../../dynamic-loader/findable-domains.js';
import { createSessionToolLoader } from '../../../dynamic-loader/index.js';
import type { ToolContext } from '../../../registry/types.js';
import { routineToolDefinitions } from '../index.js';

const uid = () => `u-${Math.random().toString(36).slice(2)}`;

function tool(id: string, ctx: Partial<ToolContext>) {
  const definition = routineToolDefinitions.find((d) => d.id === id);
  if (!definition) throw new Error(`no ${id} in the routines domain`);
  return definition.create(ctx as ToolContext) as unknown as {
    description: string;
    execute: (args: unknown, opts?: unknown) => Promise<string>;
  };
}

const PROMISES = /done!|for you now|i'll|i will|remind|running|every (day|morning)|automatic/i;

afterEach(() => forgetCallerTimeZone('s-chicago', 'u-chicago'));

describe('createRoutine says what happened: saved, not running', () => {
  it.each([
    ['time', '7:30 AM'],
    ['phrase', 'good morning'],
    ['location', 'home'],
  ])(
    'a %s routine: saved in What I Do For You, and it says it does not run yet',
    async (triggerType, triggerValue) => {
      const userId = uid();
      const said = await tool('createRoutine', { userId }).execute(
        { name: 'Morning stretch', triggerType, triggerValue, action: 'Time to stretch' },
        {}
      );

      expect(said).toBe(
        `Saved "Morning stretch" in What I Do For You. It won't run on its own yet.`
      );
      expect(said.replace("won't run on its own yet", '')).not.toMatch(PROMISES);
      const [saved] = (await getWorkflowData(userId)).workflows;
      expect(saved).toMatchObject({ name: 'Morning stretch', status: 'paused', runCount: 0 });
    }
  );

  it('the description the model reads promises nothing either', () => {
    const { description } = tool('createRoutine', { userId: uid() });
    expect(description).toContain("doesn't run on its own yet");
    expect(description.replace("doesn't run on its own yet", '')).not.toMatch(PROMISES);
  });
});

describe('createRoutine keeps the time where the caller is', () => {
  it('7:30 AM in a Chicago call is 7:30 America/Chicago, not 7:30 UTC', async () => {
    rememberCallerTimeZone('America/Chicago', 's-chicago', 'u-chicago');
    await tool('createRoutine', { userId: 'u-chicago', sessionId: 's-chicago' }).execute(
      { name: 'Stretch', triggerType: 'time', triggerValue: '7:30 AM', action: 'Stretch' },
      {}
    );
    const [saved] = (await getWorkflowData('u-chicago')).workflows;
    expect(saved.trigger).toEqual({
      type: 'time',
      schedule: '30 7 * * *',
      timezone: 'America/Chicago',
    });
  });

  it('with no zone for the call it saves no zone, never a made-up UTC', async () => {
    const userId = uid();
    await tool('createRoutine', { userId, sessionId: `s-${userId}` }).execute(
      { name: 'Stretch', triggerType: 'time', triggerValue: '7:30 AM', action: 'Stretch' },
      {}
    );
    const [saved] = (await getWorkflowData(userId)).workflows;
    expect(saved.trigger).toMatchObject({ type: 'time', schedule: '30 7 * * *' });
    expect((saved.trigger as { timezone?: string }).timezone).toBeUndefined();
  });
});

describe('"set up a routine" reaches the store the panel reads', () => {
  it('the routine topic loads the routines domain, and findTools may reach it', () => {
    const loader = createSessionToolLoader({ enableAutoUnload: false, essentialDomains: [] });
    for (const said of ['can you set up a routine for me', 'what routines do I have']) {
      expect(loader.detectTopics(said).suggestedDomains, said).toContain('routines');
    }
    expect(isFindableDomain('routines')).toBe(true);
  });

  it('productivity registers no routine tools, so no id is in both domains', async () => {
    const { getToolDefinitions } = await import('../../productivity/index.js');
    const productivity = (await getToolDefinitions()).map((d) => d.id);
    const routines = routineToolDefinitions.map((d) => d.id);

    expect(routines).toEqual(expect.arrayContaining(['createRoutine', 'runRoutine']));
    expect(productivity).not.toContain('manageRoutine');
    expect(productivity.filter((id) => routines.includes(id))).toEqual([]);
  });
});
