/**
 * Seed Fund bonus tiers: the server pays the same amounts the web paid, at the same
 * boundaries. The web files are read as text so a change on either side fails here.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  awardContributionSeeds,
  awardFoundingSeeds,
  CONTRIBUTION_TIERS,
  contributionSeeds,
  FOUNDING_TIERS,
  foundingSeeds,
} from '../payment-bonuses.js';

const WEB = join(process.cwd(), 'apps/web/src/services');
const economy = readFileSync(join(WEB, 'seeds-economy.service.ts'), 'utf8');
const payment = readFileSync(join(WEB, 'seed-payment.ts'), 'utf8');

/** `name: { ... amount: N` in SEED_REWARDS. */
function webReward(name: string): number {
  const match = new RegExp(`${name}:\\s*\\{[^}]*?amount:\\s*(\\d+)`).exec(economy);
  if (!match) throw new Error(`SEED_REWARDS.${name} not found in seeds-economy.service.ts`);
  return Number(match[1]);
}

describe('contributionSeeds', () => {
  it.each([
    [0, 0],
    [499, 0],
    [500, 10],
    [999, 10],
    [1000, 25],
    [2499, 25],
    [2500, 75],
    [4999, 75],
    [5000, 200],
    [10000, 200],
    [Number.NaN, 0],
  ])('%i cents pays %i seeds', (cents, seeds) => {
    expect(contributionSeeds(cents)).toBe(seeds);
  });
});

describe('foundingSeeds', () => {
  it.each([
    [900, 0],
    [999, 0],
    [1000, 50],
    [1900, 50],
    [1999, 50],
    [2000, 150],
    [5000, 150],
  ])('%i cents a month pays %i seeds', (cents, seeds) => {
    expect(foundingSeeds(cents)).toBe(seeds);
  });
});

describe('server tiers match the web', () => {
  it('one-time gift: recordContribution thresholds and SEED_REWARDS amounts', () => {
    const body = /export function recordContribution[\s\S]*?\n}\n/.exec(economy)?.[0] ?? '';
    const web = [
      ...body.matchAll(/amountCents >= (\d+)\)\s*\{\s*reward = SEED_REWARDS\.(\w+);/g),
    ].map(([, cents, name]) => ({ minCents: Number(cents), seeds: webReward(name ?? '') }));

    expect(web.length).toBeGreaterThan(0);
    expect(web).toEqual(CONTRIBUTION_TIERS);
  });

  it('monthly gift: announceMonthlyGiftPaid thresholds and founding bonus amounts', () => {
    const memberMin = /dollars < (\d+)\) return null/.exec(payment)?.[1];
    const patronMin = /dollars >= (\d+) \? 'founding-patron'/.exec(payment)?.[1];
    const web = [
      { minCents: Number(patronMin) * 100, seeds: webReward('foundingPatronBonus') },
      { minCents: Number(memberMin) * 100, seeds: webReward('foundingMemberBonus') },
    ];

    expect(web).toEqual(FOUNDING_TIERS);
  });
});

// A db that fails the test if touched: these events must be decided before any write
const untouchable = new Proxy(
  {},
  {
    get: () => {
      throw new Error('Firestore touched for an event that pays nothing');
    },
  }
) as never;

describe('events that pay nothing never reach the ledger', () => {
  const plant = { payment_type: 'ferni_fund', garden_type: 'one_time', ferni_user_id: 'u1' };

  it.each([
    ['a tip', { ...plant, payment_type: 'tip' }, 5000],
    ['a fund gift not from the garden', { ...plant, garden_type: undefined }, 5000],
    ['no user', { ...plant, ferni_user_id: '' }, 5000],
    ['under $5', plant, 499],
  ])('payment_intent.succeeded: %s', async (_, metadata, amount) => {
    const intent = { id: 'pi_1', amount, metadata: metadata as Record<string, string> };
    expect(await awardContributionSeeds(intent, untouchable)).toBeNull();
  });

  const monthly = { garden_type: 'monthly', seeds_uid: 'u1' };
  const first = { id: 'in_1', subscription: 'sub_1', billing_reason: 'subscription_create' };

  it.each([
    ['a renewal', { ...first, billing_reason: 'subscription_cycle' }, monthly, 2000],
    ['not a Seed Fund gift', first, { tier: 'friend' }, 2000],
    ['no verified account', first, { garden_type: 'monthly' }, 2000],
    ['under $10', first, monthly, 999],
  ])('invoice.paid: %s', async (_, invoice, metadata, amountPaid) => {
    const paid = { ...invoice, amount_paid: amountPaid, subscription_details: { metadata } };
    expect(await awardFoundingSeeds(paid, untouchable)).toBeNull();
  });
});
