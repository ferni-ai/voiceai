/**
 * manageAppointment and restaurant are offered on live calls. Given a phone
 * number they used to POST straight to Twilio (one-way script, 60 s recording,
 * no read-back, no spoken yes). They must never place a call, and their replies
 * must not claim one.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The old dial read these at import, so a configured Twilio is what made it real.
vi.hoisted(() => {
  process.env.TWILIO_ACCOUNT_SID = 'ACtest';
  process.env.TWILIO_AUTH_TOKEN = 'token-test';
  process.env.TWILIO_PHONE_NUMBER = '+15550000000';
});

vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config) => ({ description: config.description, execute: config.execute })),
  },
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../../services/scheduling/appointment-followup.js', () => ({
  getAppointmentFollowUpService: () => ({
    trackAppointment: vi.fn(),
    recordCallAttempt: vi.fn(),
    updateStatus: vi.fn(),
  }),
}));
vi.mock('../../../../services/calendar/calendar-bridge.js', () => ({
  syncAppointmentToCalendar: vi.fn(async () => ({ success: false })),
  updateCalendarSyncedItem: vi.fn(),
  removeCalendarSyncedItem: vi.fn(),
}));

import type { ToolContext, ToolDefinition } from '../../../registry/types.js';
import { createAppointmentTools } from '../../../scheduling/appointments-tools.js';
import { getToolDefinitions } from '../index.js';

type Exec = { execute: (args: object, opts: unknown) => Promise<unknown> };
const ctx = { userId: 'u-business', agentId: 'ferni' } as ToolContext;
const opts = { toolCallId: 't', ctx: {} };

const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ sid: 'CA123' }), { status: 201 }));
const twilioCalls = () =>
  fetchSpy.mock.calls.filter((c: unknown[]) => String(c[0]).includes('api.twilio.com')).length;

/** The ways a reply can claim a call that never happened. */
const CLAIMS_A_CALL = /I'm calling|calling .* now|right now|One moment|Give me (just )?a moment/i;

async function run(id: string, args: object): Promise<string> {
  const def = (await getToolDefinitions()).find((d: ToolDefinition) => d.id === id);
  if (!def) throw new Error(`${id} not registered`);
  return String(await (def.create(ctx) as Exec).execute(args, opts));
}

beforeEach(() => {
  fetchSpy.mockClear();
  vi.stubGlobal('fetch', fetchSpy);
});

describe('business tools never dial', () => {
  it('manageAppointment schedule with a phone places no call and says so', async () => {
    const reply = await run('manageAppointment', {
      action: 'schedule',
      businessName: 'Bright Smiles Dental',
      businessPhone: '+15555550123',
      dateTime: 'next Tuesday at 2pm',
      appointmentType: 'dentist',
    });
    expect(twilioCalls()).toBe(0);
    expect(reply).toContain("I haven't called them");
    expect(reply).toContain("I'll only dial once you say yes");
    expect(reply).not.toMatch(CLAIMS_A_CALL);
  });

  it('restaurant reserve with a phone places no call and says so', async () => {
    const reply = await run('restaurant', {
      action: 'reserve',
      restaurantName: 'Bern Steakhouse',
      restaurantPhone: '+15555550199',
      dateTime: 'tomorrow at 7pm',
      partySize: 4,
    });
    expect(twilioCalls()).toBe(0);
    expect(reply).toContain("I haven't called them");
    expect(reply).not.toMatch(CLAIMS_A_CALL);
  });

  it('confirm and cancel do not claim a call', async () => {
    for (const action of ['confirm', 'cancel']) {
      const reply = await run('manageAppointment', {
        action,
        businessName: 'Bright Smiles Dental',
        businessPhone: '+15555550123',
        dateTime: 'next Tuesday at 2pm',
      });
      expect(reply).toContain("I haven't called Bright Smiles Dental");
      expect(reply).not.toMatch(CLAIMS_A_CALL);
    }
    expect(twilioCalls()).toBe(0);
  });

  it('with no phone it asks for the number without promising to call', async () => {
    const reply = await run('manageAppointment', {
      action: 'schedule',
      businessName: 'Bright Smiles Dental',
      dateTime: 'next Tuesday at 2pm',
    });
    expect(reply).toContain('If you give me their number');
    expect(reply).not.toMatch(/I'll call/);
  });
});

describe('checkAvailability', () => {
  it('says it has not called instead of "I\'m calling"', async () => {
    const tool = createAppointmentTools().checkAvailability as unknown as Exec;
    const reply = String(
      await tool.execute(
        { businessName: 'Bern Steakhouse', businessPhone: '+15555550199', dateTime: 'tomorrow 7pm' },
        opts
      )
    );
    expect(reply).toContain("I haven't called Bern Steakhouse");
    expect(reply).not.toMatch(CLAIMS_A_CALL);
    expect(twilioCalls()).toBe(0);
  });
});
