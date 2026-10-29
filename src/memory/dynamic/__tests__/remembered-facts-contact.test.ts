/**
 * MEMORY_TOOLS_HONEST: the remembered-fact writer itself refuses a phone number or email
 * as a free-text fact, for every caller (keepForRecall and replaceRemembered), not only
 * the tools. Called here directly, without a tool.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// No forgotten topics on file: the honest write's fail-closed read finds an empty list
vi.mock('../../../utils/firestore-utils.js', async (importOriginal) => {
  const empty = { get: async () => ({ exists: false, data: () => undefined }) };
  const user = { collection: () => ({ doc: () => empty }) };
  return {
    ...(await importOriginal<typeof import('../../../utils/firestore-utils.js')>()),
    getFirestoreDb: () => ({ collection: () => ({ doc: () => user }) }),
  };
});

import { hasContactData } from '../../../intelligence/person-model/util.js';
import {
  keepForRecall,
  useContactDataCheck,
  type FactDocWrite,
  type RememberedFactStore,
} from '../remembered-facts.js';
import { replaceRemembered } from '../replace-remembered.js';
import type { MemoryControlStore } from '../../recall/memory-control.js';
import { useSecretModel } from '../../secret-check.js';

const HONEST = { MEMORY_TOOLS_HONEST: 'on' };
const PHONE = "Dana's new number is (202) 555-0147";
const EMAIL = 'my work email is dana at example dot com';

function store() {
  const create = vi.fn(async (_u: string, docs: FactDocWrite[]) => docs.length);
  return { create, store: { create } satisfies RememberedFactStore };
}

beforeEach(() => {
  useSecretModel(async () => '{"secret":false}');
  useContactDataCheck(hasContactData); // as the agent process does (remembered-fact-store-register.ts)
});
afterEach(() => useContactDataCheck(null));

describe('keepForRecall refuses contact data', () => {
  it.each([PHONE, EMAIL])('on: %s is refused as contact, and nothing is created', async (fact) => {
    const s = store();
    const got = await keepForRecall('u-contact-1', { fact }, { store: s.store, env: HONEST });
    expect(got).toEqual({ kind: 'refused', reason: 'contact' });
    expect(s.create).not.toHaveBeenCalled();
  });

  it('on: the same fact without the number is kept (the refusal is the number)', async () => {
    const s = store();
    const fact = "Dana's new job starts in May";
    const got = await keepForRecall('u-contact-2', { fact }, { store: s.store, env: HONEST });
    expect(got.kind).toBe('kept');
    expect(s.create).toHaveBeenCalledTimes(1);
  });

  it('on, with no contact rule handed in: nothing is kept (fails closed)', async () => {
    useContactDataCheck(null);
    const s = store();
    const got = await keepForRecall('u-contact-3', { fact: 'likes jazz' }, { store: s.store, env: HONEST }); // prettier-ignore
    expect(got).toEqual({ kind: 'failed' });
    expect(s.create).not.toHaveBeenCalled();
  });

  it('off (REMEMBER_TO_RECALL only): unchanged, no contact refusal', async () => {
    const s = store();
    const env = { REMEMBER_TO_RECALL: 'on' };
    const got = await keepForRecall('u-contact-4', { fact: PHONE }, { store: s.store, env });
    expect(got).not.toEqual({ kind: 'refused', reason: 'contact' });
  });
});

describe('replaceRemembered goes through the same refusal', () => {
  it('on: a correction to a phone number is refused, and the old fact is not forgotten', async () => {
    const forget = vi.fn(async () => undefined);
    const old = { entityName: 'user', key: 'asked_to_remember', value: 'my sister Dana lives in Denver', confidence: 1 }; // prettier-ignore
    const control: MemoryControlStore = {
      facts: async () => [{ id: 'f1', data: old }],
      fact: async () => old,
      copies: async () => [],
      forgotten: async () => [],
      forget,
      correct: async () => undefined,
    };
    const s = store();
    const got = await replaceRemembered(
      'u-contact-5',
      { original: 'my sister Dana lives in Denver', updated: PHONE },
      { store: s.store, control, env: HONEST }
    );
    expect(got).toEqual({ kind: 'not_kept', kept: { kind: 'refused', reason: 'contact' } });
    expect(s.create).not.toHaveBeenCalled();
    expect(forget).not.toHaveBeenCalled();
  });
});
