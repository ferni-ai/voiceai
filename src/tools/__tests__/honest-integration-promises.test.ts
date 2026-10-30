/**
 * Honest-promises sweep (integrations plan, lane S4): Ferni must not offer a
 * connect path that doesn't exist, and must not claim an action it never took.
 * - Instacart, Uber and Lyft can't be connected, so their tools say so instead
 *   of "Would you like me to help you connect your account?".
 * - grocery_order only builds a cart; it said "Order placed".
 * - a reservation said "Booked!" on any 2xx, with or without a confirmation.
 * - a ride request said "on the way" before any driver accepted it.
 * Each test fails if the old claim comes back.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const world = vi.hoisted(() => ({
  addToCartOk: [] as boolean[],
  booking: { success: true, confirmationNumber: '' as string | undefined },
  appointments: 0,
}));

vi.mock('../../services/integrations/instacart/instacart-client.js', () => ({
  getInstacartClient: () => ({
    isConnected: () => true,
    createCart: async () => ({ success: true, data: { id: 'cart-1' } }),
    addToCart: async () => ({ success: world.addToCartOk.shift() ?? true }),
  }),
}));

// The confirm-before-send wrapper is tested on its own; these tests read the tool's own words.
vi.mock('../registry/outbound-gate.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  gateOutboundTool: <T>(def: T): T => def,
}));

vi.mock('../../services/integrations/uber/uber-client.js', () => ({
  getUberClient: () => ({
    requestRide: async () => ({ success: true, data: { requestId: 'req-1', eta: 4 } }),
  }),
}));

vi.mock('../../services/restaurant-reservations.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isReservationServiceConfigured: () => true,
  searchRestaurants: async () => [
    { name: 'Luigi', reservationProvider: 'opentable', externalId: 'r1', phone: '+15550100' },
  ],
  bookReservation: async () => ({ ...world.booking, message: 'ok', provider: 'opentable' }),
}));

vi.mock('../scheduling/appointment-core.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createAppointmentRequest: async () => {
    world.appointments++;
    return { type: 'restaurant', businessName: 'Luigi', businessPhone: '+15550100' };
  },
}));

import { getActionTypeConfig } from '../../services/actions/action-engine.js';
import type { Action } from '../../services/actions/action-types.js';
import { definitions as commerce, GROCERY_ORDER_UNAVAILABLE } from '../domains/commerce/index.js';
import {
  definitions as transportation,
  RIDE_BOOKING_UNAVAILABLE,
  rideRequestedMessage,
} from '../domains/transportation/index.js';
import { definitions as marketing } from '../domains/marketing/index.js';
import { createAppointmentTools } from '../scheduling/appointments-tools.js';
import type { ToolContext } from '../registry/types.js';

/** Offers a connect path that Instacart, Uber and Lyft don't have. */
const CONNECT_OFFER = /help you connect|connect (your|uber|lyft)/i;

type Executable = { execute: (args: Record<string, unknown>, opts?: unknown) => Promise<string> };

function build(defs: typeof commerce, id: string): Executable {
  const def = defs.find((d) => d.id === id);
  if (!def) throw new Error(`${id} not defined`);
  return def.create({ userId: 'u1' } as ToolContext) as unknown as Executable;
}

beforeEach(() => {
  world.addToCartOk = [];
  world.booking = { success: true, confirmationNumber: '' };
  world.appointments = 0;
});

describe('no connect offers for accounts that cannot be connected', () => {
  it('orderGroceries says it cannot order and offers no Instacart connect', async () => {
    const reply = await build(commerce, 'orderGroceries').execute({});

    expect(reply).toBe(GROCERY_ORDER_UNAVAILABLE);
    expect(reply).not.toMatch(CONNECT_OFFER);
  });

  it('requestRide says it books nothing and offers no Uber or Lyft connect', async () => {
    const reply = await build(transportation, 'requestRide').execute({ destination: 'airport' });

    expect(reply).toBe(RIDE_BOOKING_UNAVAILABLE);
    expect(reply).not.toMatch(CONNECT_OFFER);
    expect(reply).not.toMatch(/I'll get price estimates/i);
  });
});

describe('grocery_order reports a cart, never a placed order', () => {
  const action = {
    payload: {
      items: [
        { name: 'milk', productId: 'p1', quantity: 1 },
        { name: 'eggs', productId: 'p2', quantity: 1 },
        { name: 'bread', quantity: 1 },
      ],
    },
  } as unknown as Action;

  it('counts only the items the cart accepted and fails as "No order placed"', async () => {
    world.addToCartOk = [true, false];

    const result = await getActionTypeConfig('grocery_order')!.executor(action, { userId: 'u1' });

    expect(result).toEqual({
      success: false,
      message:
        "No order placed: I put 1 of 3 items in an Instacart cart, but I can't place the order.",
    });
    expect(result.message).not.toMatch(/order placed for/i);
  });

  it('rollback does not claim it cancelled an order', async () => {
    const result = await getActionTypeConfig('grocery_order')!.rollback!(action, { userId: 'u1' });

    expect(result.message).not.toMatch(/order cancelled/i);
    expect(result.message).toBe('No order was placed, so there was nothing to cancel.');
  });
});

describe('ride requests are sent, not "on the way"', () => {
  it('uber_ride reports the request as sent and unconfirmed', async () => {
    const action = { payload: { fareId: 'f1' } } as unknown as Action;

    const result = await getActionTypeConfig('uber_ride')!.executor(action, { userId: 'u1' });

    expect(result).toMatchObject({ success: true, message: rideRequestedMessage('Uber') });
    expect(result.message).not.toMatch(/on the way/i);
  });

  it('names the provider and says it is unconfirmed until a driver accepts', () => {
    for (const provider of ['Uber', 'Lyft'] as const) {
      const message = rideRequestedMessage(provider);
      expect(message).toBe(
        `${provider} ride requested. It isn't confirmed until a driver accepts it.`
      );
      expect(message).not.toMatch(/on the way/i);
    }
  });
});

describe('makeReservation says "Booked" only with a confirmation number', () => {
  const reserve = (): Promise<string> =>
    (createAppointmentTools().makeReservation as unknown as Executable).execute(
      {
        restaurantName: 'Luigi',
        dateTime: 'tomorrow at 7pm',
        partySize: 2,
        guestPhone: '+15550199',
      },
      { ctx: { userData: { userId: 'u1' } } }
    );

  it('a 2xx with no confirmation number is not booked and saves no appointment', async () => {
    world.booking = { success: true, confirmationNumber: undefined };

    const reply = await reserve();

    expect(reply).not.toMatch(/booked!/i);
    expect(reply).toMatch(
      /^Not booked yet: I sent a request to Luigi for 2 on .+, but no confirmation came back\./
    );
    expect(world.appointments).toBe(0);
  });

  it('a blank confirmation number is not booked either', async () => {
    world.booking = { success: true, confirmationNumber: '  ' };

    expect(await reserve()).toMatch(/^Not booked yet/);
  });

  it('a confirmation number is booked and quoted', async () => {
    world.booking = { success: true, confirmationNumber: 'OT-123' };

    const reply = await reserve();

    expect(reply).toMatch(/Booked! Luigi, party of 2/);
    expect(reply).toContain('Confirmation: OT-123');
    expect(world.appointments).toBe(1);
  });
});

describe('postToTwitter without house credentials', () => {
  it('says it cannot post and offers no X account connect', async () => {
    vi.stubEnv('TWITTER_ACCESS_TOKEN', '');

    const reply = await build(marketing, 'postToTwitter').execute({
      action: 'post',
      content: 'hi',
    });

    expect(reply).toBe(
      "I can't post to X right now: posting isn't set up, and I can't connect your own X account."
    );
    expect(reply).not.toMatch(/help you connect/i);
    vi.unstubAllEnvs();
  });
});
