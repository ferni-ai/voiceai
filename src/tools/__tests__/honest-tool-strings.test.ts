/**
 * Tool results say only what happened (#1439, #1447).
 *
 * setBirthday said "I'll remind you 7 and 1 days before" and scheduleRide said "Ride Scheduled
 * ... I'll remind you before your ride"; neither saves a job, so nothing ever fired. The home
 * broadcast said "Message sent!" and dinner "Announcing to all speakers" from a path that reaches
 * no speaker. Each tool here returns no job id, so its words must hold no promise and no success.
 */
import { describe, expect, it } from 'vitest';
import { definitions as homeTools } from '../domains/smart-home/index.js';
import { definitions as socialTools } from '../domains/social-events/index.js';
import { definitions as rideTools } from '../domains/transportation/index.js';
import type { ToolDefinition } from '../registry/types.js';
import { NO_TIMED_REMINDER } from '../utils/honest-schedule.js';

type Exec = { execute: (args: Record<string, unknown>) => Promise<string> };
const ctx = { userId: 'u-honest-strings', agentId: 'ferni', agentDisplayName: 'Ferni' };

function run(defs: readonly ToolDefinition[], id: string, args: Record<string, unknown>) {
  const def = defs.find((d) => d.id === id);
  if (!def) throw new Error(`no tool ${id}`);
  return (def.create(ctx as never) as unknown as Exec).execute(args);
}

/** Words that claim a reminder will fire, or that something was done. */
const PROMISE = /\bI'll remind\b|\bremind you\b|\bscheduled\b|\bwill remind\b/i;
const DONE =
  /\bsent!|\bbroadcasting to\b|\bannouncing to\b|\bstarting intercom\b|\badded\b|\bmarked\b/i;

describe('reminder promises with no job behind them (#1439)', () => {
  it('the no-reminder line is a plain sentence with no "Noted," lead', () => {
    expect(NO_TIMED_REMINDER).toBe("I can't set a timed reminder for that.");
  });

  it('setBirthday notes the birthday and says no reminder is set', async () => {
    const said = await run(socialTools, 'setBirthday', { name: 'Maria', date: 'March 15' });
    expect(said).toContain('Maria');
    expect(said).toContain(NO_TIMED_REMINDER);
    expect(said).not.toMatch(PROMISE);
    expect(said).not.toMatch(/\bsaved\b/i); // a per-process map, not a saved record
  });

  it('scheduleRide says nothing was booked and no reminder is set', async () => {
    const said = await run(rideTools, 'scheduleRide', {
      destination: 'the airport',
      pickupTime: 'tomorrow at 6am',
    });
    expect(said).toMatch(/^Not booked/);
    expect(said).toContain('the airport');
    expect(said).toContain(NO_TIMED_REMINDER);
    expect(said).not.toMatch(PROMISE);
  });

  it('homeMaintenanceReminder add and complete claim no schedule or log', async () => {
    const added = await run(homeTools, 'homeMaintenanceReminder', {
      action: 'add',
      task: 'replace HVAC filter',
      frequency: 'quarterly',
    });
    expect(added).toContain('replace HVAC filter');
    expect(added).toContain(NO_TIMED_REMINDER);
    const done = await run(homeTools, 'homeMaintenanceReminder', {
      action: 'complete',
      task: 'replace HVAC filter',
    });
    expect(done).toContain("I don't keep a maintenance log here");
    for (const said of [added, done]) {
      expect(said).not.toMatch(PROMISE);
      expect(said).not.toMatch(DONE);
    }
  });
});

describe('home speaker tools that reach no speaker (#1447)', () => {
  it.each([
    [
      'broadcastMessage',
      { message: 'dinner in five', target: 'kitchen' },
      "I couldn't broadcast that to the kitchen: I can't reach your home speakers yet, so nothing was played.",
    ],
    [
      'announceDinner',
      {},
      "I couldn't announce dinner: I can't reach your home speakers yet, so nothing was played.",
    ],
    [
      'intercomCall',
      { room: 'office' },
      "I couldn't start an intercom call to office: I can't reach your home speakers yet, so nothing was played.",
    ],
  ])('%s says nothing was played, in a plain sentence', async (id, args, sentence) => {
    const said = await run(homeTools, id, args);
    expect(said).toBe(sentence);
    expect(said).not.toMatch(DONE);
    expect(said).not.toMatch(/\bI can broadcast\b|would you like me to send/i);
  });
});
