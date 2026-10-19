/**
 * Ferni must never claim a booking it didn't make.
 *
 * backgroundReservation used to queue a "reservation executor" that waited a
 * second, invented a confirmation like RES-4F9K2Q with Math.random() and later
 * told the user "Reserved ... Confirmation: RES-...". Two orphaned services did
 * the same with SIM-/CONF- numbers. These tests pin that the tool now says
 * nothing is reserved and offers to call, that the fabricating executor is
 * gone, and that no tool or service source can mint a confirmation number.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config) => ({
      description: config.description,
      parameters: config.parameters,
      execute: config.execute,
    })),
  },
}));

vi.mock('../../../../services/superhuman/event-intelligence-services.js', () => ({}));

import type { ToolContext } from '../../../registry/types.js';
import { definitions, reservationCantBook } from '../index.js';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..');

/** What a fabricated booking looks like in a reply. */
const CLAIMED_BOOKING =
  /\b(?:RES|SIM|CONF|HTL|VEN|ACT|SVC|GEN)-[A-Z0-9]{4,}\b|confirmation(?: number| #)?:|^(?:reserved|booked)\b|\bI(?:'ve| have)? (?:reserved|booked)\b|\bis (?:booked|reserved|confirmed)\b|you'?re all set/im;

/** Source shapes that mint a confirmation number nobody issued. */
const FABRICATION_SOURCE: Array<[string, RegExp]> = [
  ['prefixed id template', /`(?:RES|SIM|CONF|HTL|VEN|ACT|SVC|GEN)-\$\{/],
  ['confirmation from Math.random', /confirmation\w*\s*[:=][^;\n]*Math\.random/i],
  ['confirmation generator', /function\s+generateConfirmation\w*/],
  ['simulated booking delay', /simulate\w*(?:Reservation|Booking|Appointment)\w*\(/],
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      out.push(...sourceFiles(full));
    } else if (name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

async function runReservationTool(args: Record<string, unknown>): Promise<string> {
  const def = definitions.find((d) => d.id === 'backgroundReservation');
  expect(def).toBeDefined();
  const tool = def!.create({ userId: 'u1', sessionId: 's1' } as ToolContext) as unknown as {
    execute: (a: Record<string, unknown>) => Promise<string>;
  };
  return tool.execute(args);
}

describe('backgroundReservation: honest reply', () => {
  it('says nothing is reserved and offers to find the number and call', async () => {
    const reply = await runReservationTool({
      venueName: 'Nobu',
      dateTime: 'Saturday at 7pm',
      partySize: 4,
    });

    expect(reply).toBe(reservationCantBook('Nobu'));
    expect(reply).toMatch(/can't book Nobu/);
    expect(reply).toMatch(/nothing's reserved/);
    expect(reply).toMatch(/call them for you/);
    expect(reply).not.toMatch(CLAIMED_BOOKING);
  });

  it('stays honest without a venue', async () => {
    const reply = await runReservationTool({});
    expect(reply).toMatch(/can't book that directly yet/);
    expect(reply).not.toMatch(CLAIMED_BOOKING);
  });

  it('tells the model to route to findBusiness and callOnBehalf, not to book', () => {
    const def = definitions.find((d) => d.id === 'backgroundReservation')!;
    expect(def.description).toMatch(/does NOT make a booking/);
    expect(def.description).toMatch(/findBusiness/);
    expect(def.description).toMatch(/callOnBehalf/);
  });
});

describe('fabricating booking paths are gone', () => {
  it('the reservation executor and the SIM- services are deleted', async () => {
    for (const path of [
      'src/services/background-agents/executors/reservation-executor.ts',
      'src/services/scheduling/appointment-integration.ts',
      'src/services/integrations/restaurant-booking.ts',
    ]) {
      expect(existsSync(join(REPO_ROOT, path)), path).toBe(false);
    }
    const barrel: Record<string, unknown> =
      await import('../../../../services/background-agents/executors/index.js');
    expect(barrel.executeReservationTask).toBeUndefined();
    expect(barrel.queueReservationTask).toBeUndefined();
  });

  it('no tool or service source mints a confirmation number', () => {
    const hits: string[] = [];
    for (const root of ['src/tools', 'src/services']) {
      for (const file of sourceFiles(join(REPO_ROOT, root))) {
        const text = readFileSync(file, 'utf8');
        for (const [label, pattern] of FABRICATION_SOURCE) {
          if (pattern.test(text)) hits.push(`${relative(REPO_ROOT, file)}: ${label}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it('the scan catches the shape it guards against', () => {
    const old = [
      'const random = Math.random().toString(36).slice(2, 8).toUpperCase();',
      'function generateConfirmationNumber(prefix: string): string {',
      'const confirmationNumber = `SIM-${Date.now().toString().slice(-6)}`;',
      'await simulateReservationDelay();',
    ].join('\n');
    const caught = FABRICATION_SOURCE.filter(([, p]) => p.test(old)).map(([l]) => l);
    expect(caught).toEqual([
      'prefixed id template',
      'confirmation generator',
      'simulated booking delay',
    ]);
    expect('Reserved Nobu for 4. Confirmation: RES-4F9K2Q').toMatch(CLAIMED_BOOKING);
  });
});
