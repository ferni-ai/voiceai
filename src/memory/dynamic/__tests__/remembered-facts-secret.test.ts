/**
 * REMEMBER_TO_RECALL (#2514 round 3): what the word rules let through is read
 * by a model before it is embedded or stored. Only a clear no is kept; yes, a
 * timeout, an error or garbage keeps nothing and embeds nothing. A word-rule
 * hit never reaches the model, and with the flag off nothing does.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rememberToRecall, type FactDocWrite, type RememberedFactStore } from '../remembered-facts.js'; // prettier-ignore
import { FACT_VECTOR_DIMENSION } from '../../recall/stored-fact-vectors.js';
import { type SecretModel } from '../../secret-check.js';

const ON = { REMEMBER_TO_RECALL: 'on' };
const UID = 'u-secret-gate';
// No credential word: the word rules keep it, so only the model can stop it
const DOOR = 'the side door opens with 7 7 3 1';
const DANA = 'my sister Dana is moving to Denver in June';

function harness(model: SecretModel) {
  const facts = new Map<string, Record<string, unknown>>();
  const create = vi.fn(async (_userId: string, docs: FactDocWrite[]) => {
    for (const d of docs) facts.set(d.id, d.data);
    return docs.length;
  });
  const store: RememberedFactStore = { create };
  const embed = vi.fn(async (texts: string[]) => texts.map(() => new Array<number>(FACT_VECTOR_DIMENSION).fill(0.1))); // prettier-ignore
  const embedding = { enabled: true, embed, model: async () => 'm' };
  const check = vi.fn(model);
  const run = async (fact: string, env: Record<string, string> = ON) =>
    rememberToRecall(UID, { fact }, { store, embedding, env, secretCheck: { model: check, timeoutMs: 30 } }); // prettier-ignore
  return { facts, create, embed, check, run };
}

const says =
  (secret: boolean): SecretModel =>
  async () =>
    JSON.stringify({ secret });
const embedded = (embed: ReturnType<typeof harness>['embed']) => embed.mock.calls.flatMap(([t]) => t).join('\n'); // prettier-ignore

afterEach(() => vi.unstubAllEnvs());

describe('the secret check before a remembered fact is kept', () => {
  it('the model says yes: not stored and not embedded', async () => {
    const h = harness(says(true));
    expect(await h.run(DOOR)).toBe(false);
    expect(h.check).toHaveBeenCalledTimes(1);
    expect(h.create).not.toHaveBeenCalled();
    expect(h.embed).not.toHaveBeenCalled();
  });

  it('the model says no: stored, and embedded from its text', async () => {
    const h = harness(says(false));
    expect(await h.run(DANA)).toBe(true);
    expect([...h.facts.values()][0]).toMatchObject({ value: DANA, source: 'caller_asserted' });
    expect([...h.facts.values()][0]).toHaveProperty('embedding');
    expect(embedded(h.embed)).toContain(DANA);
  });

  it.each<[string, SecretModel]>([
    ['a timeout', async () => new Promise(() => {})],
    ['an error', async () => Promise.reject(new Error('quota'))],
    ['garbage', async () => 'I think it is fine'],
    ['an empty reply', async () => ''],
  ])('%s fails closed: not stored, not embedded', async (_why, model) => {
    const h = harness(model);
    expect(await h.run(DANA)).toBe(false);
    expect(h.create).not.toHaveBeenCalled();
    expect(h.embed).not.toHaveBeenCalled();
  });

  it('a word-rule hit is dropped without asking the model', async () => {
    const h = harness(says(false));
    expect(await h.run('the wifi password is sunshine42')).toBe(false);
    expect(h.check).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
  });

  it('flag off: the model is never asked and nothing is written', async () => {
    const h = harness(says(false));
    expect(await h.run(DANA, {})).toBe(false);
    expect(h.check).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
    expect(h.embed).not.toHaveBeenCalled();
  });
});
