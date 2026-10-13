/**
 * Medications: dose times are the user's wall clock, and the tool result
 * says what is (and isn't) set up. Dev, 2026-10-11: "remind me to take my
 * blood pressure pill every morning at eight" got "I've got that set up to
 * remind you daily"; nothing fires dose reminders.
 */
// Prod servers run in UTC; pin it so a dev machine's own zone can't mask the bug.
process.env.TZ = 'UTC';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const calendar = vi.hoisted(() => [] as Array<{ title: string; at: Date }>);

vi.mock('@livekit/agents', () => ({
  llm: { tool: vi.fn((config) => config) },
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../../services/calendar/calendar-bridge.js', () => ({
  syncMedicationToCalendar: vi.fn(
    async (_u: string, _id: string, name: string, _dose: string, at: Date) => {
      calendar.push({ title: name, at });
      return { success: true };
    }
  ),
}));
vi.mock('../../../../services/stores/productivity-store.js', () => ({
  getProductivityStore: () => ({
    loadUserData: async () => {},
    getUserMedications: () => [],
    getUserDoseLogs: () => [],
    setMedication: () => {},
    setDoseLog: () => {},
  }),
}));

import { rememberCallerTimeZone } from '../../../../utils/caller-time-zone.js';
import { addMedication, createMedicationTools, getDueDoses } from '../medications.js';

type Exec = { execute: (args: Record<string, unknown>, opts?: unknown) => Promise<string> };

describe('medications in the user zone', () => {
  beforeEach(() => {
    calendar.length = 0;
  });
  afterEach(() => vi.useRealTimers());

  it('addMedication: the next 8 AM dose is 8 AM New York, and the result promises no reminders', async () => {
    // Sunday 22:41 New York (Monday 02:41 UTC).
    vi.useFakeTimers({ now: new Date('2026-10-12T02:41:00Z'), toFake: ['Date'] });
    rememberCallerTimeZone('America/New_York', 'voice-eval-meds-ny');
    const { addMedication: tool } = createMedicationTools() as unknown as { addMedication: Exec };

    const said = await tool.execute(
      { name: 'Lisinopril', dosage: '10mg', frequency: 'once_daily' },
      { ctx: { userData: { userId: 'voice-eval-meds-ny' } } }
    );

    expect(calendar).toHaveLength(1);
    expect(calendar[0].at.toISOString()).toBe('2026-10-12T12:00:00.000Z'); // 8 AM EDT Monday
    expect(said).toContain("Dose and refill reminders aren't supported yet");
    expect(said).not.toMatch(/I'll remind you/i);
  });

  it('getDueDoses: an 8:00 dose is due at 8:05 in the user zone, across the DST change', async () => {
    rememberCallerTimeZone('America/New_York', 'voice-eval-meds-dst');
    // Sunday 2026-11-01 (clocks fell back at 2 AM): 07:55 EST = 12:55Z.
    vi.useFakeTimers({ now: new Date('2026-11-01T12:55:00Z'), toFake: ['Date'] });
    await addMedication({
      userId: 'voice-eval-meds-dst',
      name: 'Metformin',
      dosage: '500mg',
      frequency: 'once_daily',
      timeZone: 'America/New_York',
    });
    expect(getDueDoses('voice-eval-meds-dst')).toHaveLength(0);

    vi.setSystemTime(new Date('2026-11-01T13:05:00Z')); // 08:05 EST
    expect(getDueDoses('voice-eval-meds-dst').map((d) => d.scheduledTime)).toEqual(['08:00']);
  });
});
