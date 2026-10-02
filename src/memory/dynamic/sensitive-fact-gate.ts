/**
 * Consent gate for extracted facts and entities.
 *
 * Health, money and beliefs are only remembered once the user has switched
 * that category on (services/memory-consent). Extraction runs this before it
 * writes: a fact labelled with a sensitive fact type, or whose text matches a
 * sensitive category, is dropped while that category is off.
 *
 * Fails closed: if consent can't be read, sensitive facts are dropped.
 *
 * @module memory/dynamic/sensitive-fact-gate
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'SensitiveFactGate' });

export interface GateableFact {
  entityName: string;
  key: string;
  value: unknown;
  factType?: string;
}

export interface GateableEntity {
  name: string;
  type: string;
  attributes?: Record<string, string>;
}

type Category = 'health' | 'finances' | 'beliefs';

interface ConsentApi {
  isCategoryEnabled(userId: string, category: Category): Promise<boolean>;
  sensitiveCategoriesOf(text: string): Category[];
  categoryForFactType(factType: string | undefined): Category | null;
}

export interface GateResult<F, E> {
  facts: F[];
  entities: E[];
  dropped: number;
}

/** Keep only facts/entities the user has consented to us remembering. Never throws. */
export async function filterSensitive<F extends GateableFact, E extends GateableEntity>(
  userId: string,
  facts: readonly F[],
  entities: readonly E[]
): Promise<GateResult<F, E>> {
  let consent: ConsentApi;
  try {
    // Lazy: the consent service sits in the service layer.
    consent = await import('../../services/memory-consent/index.js');
  } catch (error) {
    log.warn({ error: String(error) }, 'Consent service unavailable; dropping sensitive facts');
    consent = {
      isCategoryEnabled: async () => false,
      sensitiveCategoriesOf: () => [],
      categoryForFactType: (t) => (t === 'health' ? 'health' : null),
    };
  }
  const allowed = new Map<Category, boolean>();
  const isAllowed = async (cats: readonly Category[]): Promise<boolean> => {
    for (const c of cats) {
      if (!allowed.has(c)) allowed.set(c, await consent.isCategoryEnabled(userId, c));
      if (!allowed.get(c)) return false;
    }
    return true;
  };

  const keptFacts: F[] = [];
  for (const f of facts) {
    const typed = consent.categoryForFactType(f.factType);
    const cats = new Set<Category>(
      consent.sensitiveCategoriesOf(`${f.key.replace(/_/g, ' ')} ${String(f.value)}`)
    );
    if (typed) cats.add(typed);
    if (await isAllowed([...cats])) keptFacts.push(f);
  }
  const keptEntities: E[] = [];
  for (const e of entities) {
    // People and places are kept; a concept like "diabetes" or "church" is sensitive.
    const text =
      e.type === 'person' || e.type === 'place'
        ? ''
        : `${e.name} ${Object.values(e.attributes ?? {}).join(' ')}`;
    if (await isAllowed(consent.sensitiveCategoriesOf(text))) keptEntities.push(e);
  }
  const dropped = facts.length - keptFacts.length + entities.length - keptEntities.length;
  if (dropped > 0) log.debug({ userId, dropped }, 'Dropped sensitive items without consent');
  return { facts: keptFacts, entities: keptEntities, dropped };
}
