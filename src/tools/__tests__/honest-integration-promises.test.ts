/**
 * Honest-promises sweep (integrations plan, lane S4): Ferni must not offer a
 * connect path that doesn't exist, and must not claim an action it never took.
 * - Instacart, Uber and Lyft can't be connected, so their tools say so instead
 *   of "Would you like me to help you connect your account?".
 * - grocery_order only builds a cart; it said "Order placed".
 * - restaurant booking: online booking was removed with OpenTable and Resy
 *   (2026-10-30); see domains/calendar/__tests__/restaurant-call-on-behalf.test.ts.
 * - a ride request said "on the way" before any driver accepted it.
 * - music shortcuts asked "connect Spotify?" and rooms pointed at a
 *   "Settings > Spotify Rooms" page that doesn't exist.
 * Each test fails if the old claim comes back.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const world = vi.hoisted(() => ({
  addToCartOk: [] as boolean[],
  musicTools: [] as Array<{ id: string; create: () => unknown }>,
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

vi.mock('../../services/integrations/lyft/lyft-client.js', () => ({
  getLyftClient: () => ({
    requestRide: async () => ({ success: true, data: { rideId: 'ride-1' } }),
  }),
}));

vi.mock('../domains/entertainment/index.js', () => ({
  getToolDefinitions: async () => world.musicTools,
}));

vi.mock('../../services/identity/spotify-room-service.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getRoomsForVoice: async () => ({ rooms: [], groups: [] }),
  getRoomConfig: async () => ({ success: true, data: { rooms: [] } }),
  transferToRoom: async () => ({ success: false, error: 'not found' }),
  discoverDevices: async () => ({
    success: true,
    data: [{ id: 'd1', name: 'Kitchen', type: 'Speaker', is_active: false }],
  }),
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
import { spotifyConnectTools } from '../domains/entertainment/spotify-connect.js';
import { shortcutsToolDefinitions } from '../domains/simple-utilities/shortcuts-tools.js';
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
  world.musicTools = [];
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

    expect(result).toMatchObject({
      success: true,
      message: "Uber ride requested. It isn't confirmed until a driver accepts it.",
    });
    expect(result.message).not.toMatch(/on the way/i);
  });

  it('lyft_ride reports the request as sent and unconfirmed', async () => {
    const action = { payload: { startLatitude: 1, startLongitude: 2 } } as unknown as Action;

    const result = await getActionTypeConfig('lyft_ride')!.executor(action, { userId: 'u1' });

    expect(result).toMatchObject({
      success: true,
      message: "Lyft ride requested. It isn't confirmed until a driver accepts it.",
    });
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

/** Points at a Spotify link or a rooms page that doesn't exist. */
const SPOTIFY_DEAD_END = /connect(ed)? spotify|spotify connected|spotify rooms|settings/i;

describe('quickMusic offers no Spotify connect', () => {
  it('no music tool: says music is unavailable', async () => {
    const reply = await build(shortcutsToolDefinitions, 'quickMusic').execute({ query: 'jazz' });

    expect(reply).toBe("Music isn't available right now, so I can't play anything.");
    expect(reply).not.toMatch(SPOTIFY_DEAD_END);
  });

  it('playback throws: offers another song, not a Spotify check', async () => {
    world.musicTools = [
      {
        id: 'playMusic',
        create: () => ({
          execute: async () => {
            throw new Error('boom');
          },
        }),
      },
    ];

    const reply = await build(shortcutsToolDefinitions, 'quickMusic').execute({ query: 'jazz' });

    expect(reply).toBe("I couldn't play music just now. Want me to try a different song?");
    expect(reply).not.toMatch(SPOTIFY_DEAD_END);
  });
});

describe('music rooms never point at a Settings page', () => {
  it('listMusicRooms with no rooms says they cannot be set up', async () => {
    const reply = await build(spotifyConnectTools, 'listMusicRooms').execute({});

    expect(reply).toBe("No music rooms are set up, and I can't set them up for you yet.");
    expect(reply).not.toMatch(SPOTIFY_DEAD_END);
  });

  it('syncMusicRooms with no rooms says they cannot be set up', async () => {
    const reply = await build(spotifyConnectTools, 'syncMusicRooms').execute({});

    expect(reply).toBe("No music rooms are set up, and I can't set them up for you yet.");
    expect(reply).not.toMatch(SPOTIFY_DEAD_END);
  });

  it('discoverSpotifyDevices lists devices without sending anyone to Settings', async () => {
    const reply = await build(spotifyConnectTools, 'discoverSpotifyDevices').execute({});

    expect(reply).toContain('Kitchen (Speaker)');
    expect(reply).toContain("I can't add a device to a room for you yet.");
    expect(reply).not.toMatch(SPOTIFY_DEAD_END);
  });
});
