/**
 * What a connect moment can connect, one entry per integration. The ask, the
 * one-tap invite and the start-from-invite route read only this table, so a
 * new integration is one entry here plus its own flag.
 *
 * @module services/connect-moments/connectables
 */
import { flagOn, type Env } from '../../config/env-flag.js';

export type ConnectableId = 'calendar';

export interface Connectable {
  id: ConnectableId;
  /** The OAuth provider whose existing connect flow the invite opens (oauth-start.ts). */
  provider: string;
  /** Where the browser lands once connected; the provider's callback adds its status. */
  returnUrl: string;
  /** This integration's own flag. Off: no ask, no invite, and its invites don't redeem. */
  enabled: (env?: Env) => boolean;
}

export const CONNECTABLES: Readonly<Record<ConnectableId, Connectable>> = {
  calendar: {
    id: 'calendar',
    provider: 'google_calendar',
    returnUrl: '/',
    enabled: (env) => flagOn('CONNECT_MOMENT_CALENDAR', env),
  },
};

/** The entry for an id from outside (a stored invite, a tool argument), or undefined. */
export function connectableFor(id: unknown): Connectable | undefined {
  return typeof id === 'string' && Object.hasOwn(CONNECTABLES, id)
    ? CONNECTABLES[id as ConnectableId]
    : undefined;
}

/** True when any integration's connect moment is on. */
export function anyConnectMomentOn(env: Env = process.env): boolean {
  return Object.values(CONNECTABLES).some((c) => c.enabled(env));
}
