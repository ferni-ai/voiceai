/**
 * CONTACT_SAVE_ON_YES without Firestore: the reference normalizer, the read-back note, and the
 * confirm gate's onYes hook (runs only for the confirmed action, never at the read-back, with
 * the session id). The stores themselves are covered on the emulator (owner-contact.emulator).
 */
import { describe, expect, it, vi } from 'vitest';
import type { ToolContext, ToolDefinition } from '../../../registry/types.js';
import {
  outreachConfirmListeners,
  withOutreachConfirmation,
  type ConfirmSpec,
} from '../../communication/outreach/outreach-confirm.js';
import { askAboutNumber, ownerRefKey, type OwnerContact } from '../owner-contact.js';

describe('ownerRefKey', () => {
  it.each([
    ['my dad', 'dad'],
    ['Dad', 'dad'],
    ["dad's", 'dad'],
    ['my dad’s', 'dad'],
    ['my dads', 'dad'],
    ['the Dentist', 'dentist'],
    ['Doug at 801-555-0142', 'doug'],
    ['Chris', 'chris'],
  ])('"%s" → "%s"', (said, key) => expect(ownerRefKey(said)).toBe(key));
});

describe('askAboutNumber', () => {
  const none: OwnerContact = {
    key: 'doug',
    name: 'Doug',
    entities: [],
    rows: [],
    others: { entities: [], rows: [] },
  };
  it('a new person: no note, nothing shared or changed', () => {
    expect(askAboutNumber(none, 'Doug', '+18015550142')).toEqual({
      note: '',
      given: { who: 'Doug', e164: '+18015550142', change: false, shared: [] },
    });
  });
  it("another person's number: asks, and names exactly their records", () => {
    const mom = { id: 'm1', name: 'Mom', aliases: ['mom'], contactPhone: '+18015550177' };
    const found = { ...none, others: { entities: [mom], rows: [] } };
    const { note, given } = askAboutNumber(found, 'Doug', '+18015550177');
    expect(note).toBe(" (that's the number I have for Mom: is Doug at the same number?)");
    expect(given.shared).toEqual(['e:m1']);
  });
  it("the person's saved number differs: the read-back says it changes", () => {
    const dad = { id: 'd1', name: 'Dad', aliases: [], attrPhone: '+18015550199' };
    const found = { ...none, key: 'dad', name: 'Dad', entities: [dad] };
    const { note, given } = askAboutNumber(found, 'my dad', '+18015550142');
    expect(note).toBe(", and change Dad's saved number (now ending 0199) to this one");
    expect(given.change).toBe(true);
  });
});

describe('ConfirmSpec.onYes in the confirm gate', () => {
  function gated(sessionId: string | undefined) {
    const execute = vi.fn(async () => 'placed');
    const onYes = vi.fn(async () => undefined);
    const spec: ConfirmSpec = {
      prepare: async (args) => ({ args: { ...args, prepared: true }, readBack: 'a call to Dad' }),
      onYes,
    };
    const def = { id: 'callOnBehalf', create: () => ({ execute }) } as unknown as ToolDefinition;
    const ctx: ToolContext = {
      userId: 'u-1',
      agentId: 'ferni',
      agentDisplayName: 'Ferni',
      sessionId,
    };
    const tool = withOutreachConfirmation(def, spec).create(ctx) as unknown as {
      execute: (a: unknown, o: unknown) => Promise<unknown>;
    };
    const session = { agentState: 'listening' };
    const listeners = outreachConfirmListeners(session);
    const call = async (callId: string) => {
      const out = await tool.execute(
        { contactQuery: 'dad' },
        { ctx: { session }, toolCallId: callId }
      );
      listeners.onToolsExecuted({ functionCalls: [{ callId }] });
      return out;
    };
    const say = (t: string) => listeners.onTranscript({ transcript: t, isFinal: true });
    return { call, say, execute, onYes };
  }

  it('never at the read-back; once on the yes, with the prepared args and session id', async () => {
    const g = gated('sess-1');
    await g.call('c1');
    expect(g.onYes).not.toHaveBeenCalled();
    expect(g.execute).not.toHaveBeenCalled();
    g.say('Yes.');
    expect(await g.call('c2')).toBe('placed');
    expect(g.onYes).toHaveBeenCalledTimes(1);
    expect(g.onYes).toHaveBeenCalledWith({ contactQuery: 'dad', prepared: true }, 'u-1', 'sess-1');
    expect(g.onYes.mock.invocationCallOrder[0]).toBeLessThan(g.execute.mock.invocationCallOrder[0]);
  });

  it('a no runs neither', async () => {
    const g = gated('sess-2');
    await g.call('c1');
    g.say('No, wait.');
    await g.call('c2');
    expect(g.onYes).not.toHaveBeenCalled();
    expect(g.execute).not.toHaveBeenCalled();
  });

  it('an unknown session id reaches onYes as undefined (owner-contact refuses it)', async () => {
    const g = gated(undefined);
    await g.call('c1');
    g.say('Yes.');
    await g.call('c2');
    expect(g.onYes).toHaveBeenCalledWith(expect.anything(), 'u-1', undefined);
  });
});
