/**
 * Shared helpers for the contact-pick tests: the real contact store (in memory, since the
 * test files mock Firestore out), the real lookup, and the real gated callOnBehalf tool.
 * Each test file declares its own vi.mock()s; these helpers only drive the real code.
 */

import { vi } from 'vitest';
import { upsertContact } from '../../../../services/contacts/contact-relationship-service.js';
import { ToolRegistry } from '../../../registry/index.js';
import type { ToolContext } from '../../../registry/types.js';
import { outreachConfirmListeners } from '../../communication/outreach/outreach-confirm.js';
import { findContact } from '../call-on-behalf.js';
import { getTelephonyToolDefinitions } from '../index.js';
import type { Pick, Seed } from './contact-pick.fixtures.js';

export const USER = 'user-pick';

/** Stored in this order, so "stored first" in a fixture is first in the store. */
export async function seed(rows: Seed[], userId = USER): Promise<void> {
  for (const [i, [name, phone, notes, relationship, email]] of rows.entries()) {
    // eslint-disable-next-line no-await-in-loop -- stored order is the point
    await upsertContact(userId, {
      name,
      contactId: `c${i}_${name}`,
      phone,
      notes,
      email,
      relationship: relationship as 'family' | undefined,
    });
  }
}

/** What "said" rings: "Name|digits", "ASK" (a question for the caller), or null. */
export async function rings(said: string, userId = USER): Promise<Pick> {
  const found = await findContact(said, userId);
  if (!found) return null;
  if ('ask' in found) return 'ASK';
  return `${found.name}|${found.phone}`;
}

/** The env a live call needs to reach the (mocked) phone line; no real call is placed. */
export function stubCallEnv(): void {
  for (const [k, v] of Object.entries({
    SIP_TRUNK_ID: 'ST_test',
    LIVEKIT_URL: 'wss://livekit.test',
    LIVEKIT_API_KEY: 'key',
    LIVEKIT_API_SECRET: 'secret',
    TWILIO_ACCOUNT_SID: 'AC_test',
    TWILIO_AUTH_TOKEN: 'token',
    TWILIO_PHONE_NUMBER: '+15550000000',
    CALL_HOURS_GUARD: 'off',
    OUTBOUND_CONFIRM: '',
  }))
    vi.stubEnv(k, v);
}

/** The gated callOnBehalf tool as the live agent gets it: read-back, the caller's words, dial. */
export function liveCall(userId = USER) {
  const registry = new ToolRegistry();
  for (const def of getTelephonyToolDefinitions()) registry.register(def);
  const ctx: ToolContext = { userId, agentId: 'ferni', agentDisplayName: 'Ferni' };
  const session = { agentState: 'listening' };
  const listeners = outreachConfirmListeners(session);
  return {
    call: async (args: Record<string, unknown>, callId: string) => {
      const tool = registry.get('callOnBehalf')!.create(ctx);
      const out = await tool.execute(args, { ctx: { session }, toolCallId: callId });
      listeners.onToolsExecuted({ functionCalls: [{ callId }] });
      return String(out);
    },
    caller: (text: string) => listeners.onTranscript({ transcript: text, isFinal: true }),
  };
}
