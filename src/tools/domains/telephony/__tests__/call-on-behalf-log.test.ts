/**
 * The dial path's log lines (#4445): a number the caller gave, or one a store, the compliance
 * check or the carrier quoted back in an error, must reach no logger. Each row feeds a
 * fictional number through one path and reads every line any logger received. Fictional data.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sink = vi.hoisted(() => {
  const calls: unknown[][] = [];
  const outOfScope: unknown[][] = [];
  const make = (into: unknown[][]): Record<string, unknown> => {
    const record = (...args: unknown[]) => void into.push(args);
    return { debug: record, info: record, warn: record, error: record };
  };
  const logger = make(calls);
  // compliance.ts:161 logs the issues themselves; that line is filed separately (#4445 body),
  // so its logger reads into a second list that no row here asserts on.
  const compliance = make(outOfScope);
  logger.child = (bindings?: { module?: string }) =>
    bindings?.module === 'telephony-compliance' ? compliance : logger;
  return { calls, logger };
});
vi.mock('../../../../utils/safe-logger.js', () => ({
  getLogger: () => sink.logger,
  safeLog: () => sink.logger,
  createLogger: () => sink.logger,
}));

// Partial: call-on-behalf now imports the scripts, which reach `voice` through the audio modules.
vi.mock('@livekit/agents', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@livekit/agents')>()),
  llm: {
    tool: vi.fn((config) => ({ parameters: config.parameters, execute: config.execute })),
  },
  log: () => sink.logger,
}));

// The save-for-later step reads CONTACT_SAVE_ON_YES outside its own try, so a throwing read
// rejects it and reaches the .catch at the call site. The Nth read of that key can be made to throw.
const saveFlag = vi.hoisted(() => ({ reads: 0, failOnRead: 0, error: new Error('flag read') }));
vi.mock('../../../../config/env-flag.js', async (importActual) => {
  const actual = await importActual<typeof import('../../../../config/env-flag.js')>();
  return {
    ...actual,
    flagOn: (name: string, ...rest: unknown[]) => {
      if (name === 'CONTACT_SAVE_ON_YES' && ++saveFlag.reads === saveFlag.failOnRead) {
        throw saveFlag.error;
      }
      return (actual.flagOn as (...a: unknown[]) => boolean)(name, ...rest);
    },
  };
});

const entity = vi.hoisted(() => ({
  ready: false,
  find: vi.fn(async (): Promise<unknown> => null),
}));
vi.mock('../../../../memory/entity-store/integration.js', () => ({
  isEntityStoreReady: () => entity.ready,
  findContactForTelephony: entity.find,
}));

const contacts = vi.hoisted(() => ({
  searchContacts: vi.fn(async (): Promise<unknown[]> => []),
  getContacts: vi.fn(async (): Promise<unknown[]> => []),
  upsertContact: vi.fn(async (): Promise<unknown> => ({})),
}));
vi.mock('../../../../services/contacts/contact-relationship-service.js', () => contacts);

vi.mock('../../../../services/global-services.js', () => ({
  getGlobalServicesSync: () => ({ store: { getProfile: async () => null } }),
}));

vi.mock('../../../../services/outreach/deferred-calls.js', () => ({
  placeOrHold: async (request: unknown, place: (r: unknown) => Promise<string>) => ({
    callId: await place(request),
  }),
}));

import type { ToolContext } from '../../../registry/types.js';
import { createCallOnBehalfTool, registerOnBehalfCallInitiator } from '../call-on-behalf.js';

const NUMBER_DIGITS = '2025550142';
const SPOKEN = '202-555-0142';
const BAD_NUMBER = '555-0142'; // not dialable: the compliance reason quotes it
const NAME = 'zorbleflax-fictional-contact';

const ctx: ToolContext = {
  userId: 'user-fic1',
  agentId: 'ferni',
  agentDisplayName: 'Ferni',
  services: {
    has: () => false,
    get: () => {
      throw new Error('Service not available');
    },
    getOptional: () => undefined,
  },
};

/** Every line any logger received, as text. */
const logged = () => JSON.stringify(sink.calls);

/** Fails the way a store or carrier does: the message names the number, the error has a status. */
const quoting = (what: string) =>
  Object.assign(new Error(`${what}: To=+1${NUMBER_DIGITS} (${SPOKEN}) refused`), {
    status: 403,
  });

const run = (args: Record<string, unknown>) =>
  createCallOnBehalfTool(ctx).execute({ contactQuery: NAME, purpose: 'return a ladder', ...args });

const expectNumberAbsent = () => {
  const text = logged();
  expect(text).not.toContain('5550142');
  expect(text).not.toContain(NUMBER_DIGITS);
  expect(text).not.toContain(SPOKEN);
  expect(text).not.toContain('zorbleflax');
};

beforeEach(() => {
  entity.ready = false;
  vi.stubEnv('CONTACT_SAVE_ON_YES', 'off');
  registerOnBehalfCallInitiator(vi.fn(async () => 'call-fic-1'));
});
afterEach(() => {
  vi.unstubAllEnvs();
  sink.calls.length = 0;
  saveFlag.reads = 0;
  saveFlag.failOnRead = 0;
  entity.find.mockReset();
  entity.find.mockResolvedValue(null);
  for (const fn of [contacts.searchContacts, contacts.getContacts, contacts.upsertContact]) {
    fn.mockReset();
  }
  contacts.searchContacts.mockResolvedValue([]);
  contacts.getContacts.mockResolvedValue([]);
});

describe('no number reaches a log on the dial path', () => {
  it('an entity-store lookup that fails logs its class and status, not its message', async () => {
    entity.ready = true;
    entity.find.mockRejectedValue(quoting('entity store'));
    await run({ phoneNumber: NUMBER_DIGITS });
    const line = sink.calls.find(
      (c) => c[1] === 'Entity store lookup failed, falling back to legacy'
    );
    expect(line?.[0]).toEqual({ error: 'Error', status: 403 });
    expectNumberAbsent();
  });

  it('a contact resolution that fails logs its class and status', async () => {
    contacts.searchContacts.mockRejectedValue(quoting('contact search'));
    await run({});
    const line = sink.calls.find((c) => c[1] === 'Contact resolution failed');
    expect(line?.[0]).toEqual({ error: 'Error', status: 403 });
    expectNumberAbsent();
  });

  it('a contact that fails to save logs its class and status, on both save paths', async () => {
    contacts.upsertContact.mockRejectedValue(quoting('contact save'));
    await run({ phoneNumber: NUMBER_DIGITS });
    await vi.waitFor(() =>
      expect(sink.calls.some((c) => c[1] === 'Failed to save contact')).toBe(true)
    );
    expectNumberAbsent();
  });

  it('a save that rejects outright logs its class and status, not its message', async () => {
    saveFlag.failOnRead = 2; // the first read is the contact lookup's, the second the save's
    saveFlag.error = quoting('flag store');
    await run({ phoneNumber: NUMBER_DIGITS });
    await vi.waitFor(() =>
      expect(sink.calls.some((c) => c[1] === 'Failed to save contact for future')).toBe(true)
    );
    const line = sink.calls.find((c) => c[1] === 'Failed to save contact for future');
    expect(line?.[0]).toEqual({ error: 'Error', status: 403 });
    expectNumberAbsent();
  });

  it('a compliance refusal logs how many issues, not the issues that quote the number', async () => {
    const result = await run({ phoneNumber: BAD_NUMBER });
    expect(JSON.stringify(result)).toContain("isn't a valid US phone number");
    const line = sink.calls.find((c) => c[1] === 'Compliance check failed');
    expect(line?.[0]).toEqual({ issueCount: 1 });
    expectNumberAbsent();
  });

  it('a call the carrier refuses logs its class and status, not the refusal body', async () => {
    registerOnBehalfCallInitiator(
      vi.fn(async () => {
        throw quoting('carrier');
      })
    );
    await run({ phoneNumber: NUMBER_DIGITS });
    const line = sink.calls.find((c) => c[1] === 'Failed to initiate call');
    expect(line?.[0]).toEqual({ error: 'Error', status: 403 });
    expectNumberAbsent();
  });
});
