/**
 * Building the card (spec §5.4.1): once per session (single flight), inside a 400 ms budget,
 * only for a verified member who is not held under MINOR_CARE, dropped at session end.
 * Ports are counting fakes; ids are fictional.
 */
import { describe, expect, it } from 'vitest';
import { runSessionCleanup } from '../../../session/event-cleanup-registry.js';
import { getCallerCard } from '../load.js';
import type { CallerCardPorts } from '../ports.js';

let seq = 0;
const session = () => `card-load-${++seq}`;
/** A read that never answers. */
const never = <T>(): Promise<T> =>
  new Promise<T>(() => {
    /* never settles */
  });

function fakes(over: Partial<CallerCardPorts> = {}) {
  const reads = { home: 0, minorCare: 0 };
  const ports: CallerCardPorts = {
    home: async () => {
      reads.home++;
      return { place: 'Maplewood', source: 'preferences' };
    },
    forgotten: async () => [],
    minorCare: async () => {
      reads.minorCare++;
      return false;
    },
    ...over,
  };
  return { ports, reads };
}

describe('getCallerCard: single flight per session', () => {
  it('two persona setups make one home read and see the same card', async () => {
    const { ports, reads } = fakes();
    const s = session();
    const [a, b] = await Promise.all([
      getCallerCard(s, 'riley-test', ports),
      getCallerCard(s, 'riley-test', ports),
    ]);
    const c = await getCallerCard(s, 'riley-test', ports);
    expect(reads.home).toBe(1);
    expect(a?.home?.value).toEqual({ place: 'Maplewood', source: 'preferences' });
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it('the session ending drops the card, so the next build reads again', async () => {
    const { ports, reads } = fakes();
    const s = session();
    await getCallerCard(s, 'riley-test', ports);
    await runSessionCleanup(s);
    await getCallerCard(s, 'riley-test', ports);
    expect(reads.home).toBe(2);
  });

  it("never hands one caller's card to another id on the same session", async () => {
    const { ports } = fakes();
    const s = session();
    await getCallerCard(s, 'riley-test', ports);
    expect(await getCallerCard(s, 'someone-else', ports)).toBeNull();
  });
});

describe('getCallerCard: the 400 ms budget', () => {
  it('a home read that never answers: back within 450 ms, no Home, budgetHit', async () => {
    const { ports } = fakes({ home: never });
    const started = Date.now();
    const card = await getCallerCard(session(), 'riley-test', ports);
    expect(Date.now() - started).toBeLessThan(450);
    expect(card?.home).toBeNull();
    expect(card?.budgetHit).toBe(true);
  });

  it('a failing home read: no Home, no throw', async () => {
    const { ports } = fakes({ home: () => Promise.reject(new Error('down')) });
    const card = await getCallerCard(session(), 'riley-test', ports);
    expect(card?.home).toBeNull();
    expect(card?.budgetHit).toBe(false);
  });
});

describe('getCallerCard: who gets no card', () => {
  it.each(['onbehalf:abc', 'anon:x', 'phone:+15555550142', 'device:d1', 'anonymous', ''])(
    '%s: null, and nothing is read',
    async (id) => {
      const { ports, reads } = fakes();
      expect(await getCallerCard(session(), id, ports)).toBeNull();
      expect(reads).toEqual({ home: 0, minorCare: 0 });
    }
  );

  it('an account held under MINOR_CARE: null, and its home is never read', async () => {
    const { ports, reads } = fakes({ minorCare: async () => true });
    expect(await getCallerCard(session(), 'riley-test', ports)).toBeNull();
    expect(reads.home).toBe(0);
  });

  it('a minor-care check that never answers fails closed: null within the budget', async () => {
    const { ports, reads } = fakes({ minorCare: never });
    const started = Date.now();
    expect(await getCallerCard(session(), 'riley-test', ports)).toBeNull();
    expect(Date.now() - started).toBeLessThan(450);
    expect(reads.home).toBe(0);
  });
});
