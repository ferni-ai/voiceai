/**
 * Seed Fund bonuses through the real Stripe webhook handler (handleWebhookEvent, the code
 * that runs after /api/subscription/webhook verifies the signature) and the real ledger on
 * the Firestore emulator. Stripe events are constructed; nothing goes over the network.
 *
 * Runs when FIRESTORE_EMULATOR_HOST is set (CI: data-layer-e2e.yml).
 */
import admin from 'firebase-admin';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { handleWebhookEvent } from '../../billing/stripe-subscription.js';
import { STARTER_SEEDS } from '../ledger.js';

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
let db: admin.firestore.Firestore;
let uid: string;

beforeAll(() => {
  if (!emulator) return;
  // The handler uses the default app, as in production
  if (!admin.apps.some((a) => a?.name === '[DEFAULT]')) {
    admin.initializeApp({ projectId: 'demo-seed-ledger' });
  }
  db = admin.firestore();
});

beforeEach(() => {
  uid = `u-${Math.random().toString(36).slice(2)}`;
});

type Obj = Record<string, unknown>;
const deliver = (type: string, object: Obj, id = `evt_${Math.random()}`) =>
  handleWebhookEvent({ id, type, data: { object } } as never);

const account = async () => (await db.collection('user_seeds').doc(uid).get()).data();
const entryIds = async () =>
  (await db.collection('user_seeds').doc(uid).collection('entries').get()).docs
    .map((d) => d.id)
    .sort();

/** What POST /api/garden/plant asks Stripe for (createPaymentIntent's metadata). */
const plant = (id: string, amount: number): Obj => ({
  id,
  object: 'payment_intent',
  amount,
  amount_received: amount,
  status: 'succeeded',
  metadata: { ferni_user_id: uid, payment_type: 'ferni_fund', garden_type: 'one_time' },
});

/** An invoice of a garden monthly gift (subscription metadata as garden-routes sets it). */
const invoice = (id: string, subId: string, billingReason: string, amountPaid: number): Obj => ({
  id,
  object: 'invoice',
  customer: 'cus_1',
  subscription: subId,
  billing_reason: billingReason,
  amount_paid: amountPaid,
  subscription_details: {
    metadata: { ferni_user_id: uid, tier: 'friend', garden_type: 'monthly', seeds_uid: uid },
  },
});

describe.skipIf(!emulator)('Stripe webhooks pay Seed Fund bonuses (Firestore emulator)', () => {
  it('a $25 gift credits 75 once, even when Stripe delivers the event twice', async () => {
    const pi = `pi_${uid}`;
    await deliver('payment_intent.succeeded', plant(pi, 2500), 'evt_same');
    await deliver('payment_intent.succeeded', plant(pi, 2500), 'evt_same');

    expect(await account()).toMatchObject({
      balance: STARTER_SEEDS + 75,
      earnedFrom: { contribution: 75 },
    });
    expect(await entryIds()).toEqual(['starter', `stripe:${pi}`]);
  });

  it('a payment that is not a Seed Fund plant pays nothing', async () => {
    const tip = plant(`pi_tip_${uid}`, 5000);
    tip.metadata = { ferni_user_id: uid, payment_type: 'tip' };
    await deliver('payment_intent.succeeded', tip);

    expect(await account()).toBeUndefined();
  });

  it('the first invoice of a $20 monthly gift pays 150; a renewal pays nothing', async () => {
    const sub = `sub_${uid}`;
    await deliver('invoice.paid', invoice('in_1', sub, 'subscription_create', 2000));
    await deliver('invoice.paid', invoice('in_1', sub, 'subscription_create', 2000)); // redelivery
    await deliver('invoice.paid', invoice('in_2', sub, 'subscription_cycle', 2000));

    expect(await account()).toMatchObject({
      balance: STARTER_SEEDS + 150,
      earnedFrom: { subscription: 150 },
    });
    expect(await entryIds()).toEqual(['starter', `stripe-sub:${sub}:founding`]);
  });

  it('a $10 monthly gift pays the founding-member 50', async () => {
    await deliver('invoice.paid', invoice('in_3', `sub_m_${uid}`, 'subscription_create', 1000));

    expect((await account())?.balance).toBe(STARTER_SEEDS + 50);
  });
});
