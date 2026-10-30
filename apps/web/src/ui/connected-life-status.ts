/**
 * Link status for the "What We're Connected To" tiles (connected-life.ui.ts).
 *
 * - Only tiles that render are checked: a hidden tile's status route is never
 *   called (config/menu-visibility.ts; Spotify was still polled while hidden).
 * - The checks run side by side, not one after another (each can take its
 *   full 15 s timeout plus retries).
 * - A check that fails is 'error', not 'disconnected': "not connected" is a
 *   claim about the person's account that a failed request can't make.
 *
 * @module ui/connected-life-status
 */

import { LINKEDIN_ENABLED } from '../config/linkedin.js';
import { isIntegrationVisible } from '../config/menu-visibility.js';
import { getDeviceId } from '../state/app.state.js';
import { t } from '../i18n/index.js';
import { apiGet } from '../utils/api.js';

export type ConnectionStatus = 'connected' | 'disconnected' | 'error';

/** Each status, by the tile id it shows on. */
const TILE_IDS = {
  appleHealth: 'apple-health',
  oura: 'oura',
  wearables: 'wearables',
  googleCalendar: 'google-calendar',
  linkedin: 'linkedin',
  spotify: 'spotify',
  ecobee: 'ecobee',
} as const;

export type StatusKey = keyof typeof TILE_IDS;
export type IntegrationStatuses = Record<StatusKey, ConnectionStatus>;

/** The tiles /api/v1/integrations/status answers for. */
const V1_KEYS: StatusKey[] = [
  'appleHealth',
  'oura',
  'wearables',
  'googleCalendar',
  'linkedin',
];

interface V1Status {
  integrations?: {
    biometrics?: { connected: boolean; platform?: string };
    calendar?: { connected: boolean };
    linkedin?: { connected: boolean };
  };
}

function shown(key: StatusKey): boolean {
  return isIntegrationVisible(TILE_IDS[key]) && (key !== 'linkedin' || LINKEDIN_ENABLED);
}

function biometricKey(platform: string | undefined): StatusKey {
  const p = platform?.toLowerCase() ?? '';
  if (p.includes('apple')) return 'appleHealth';
  if (p.includes('oura')) return 'oura';
  return 'wearables';
}

/** Check every shown tile's link status, at once. */
export async function fetchIntegrationStatuses(): Promise<IntegrationStatuses> {
  const connected = new Set<StatusKey>();
  const failed = new Set<StatusKey>();
  /** Runs one status check for `keys`; marks them failed if it fails. */
  const check = async <T>(
    keys: StatusKey[],
    request: () => Promise<{ ok: boolean; data?: T }>,
    read: (data: T) => void
  ) => {
    if (keys.length === 0) return;
    const res = await request().catch(() => ({ ok: false as const, data: undefined }));
    if (res.ok && res.data !== undefined) read(res.data);
    else keys.forEach((key) => failed.add(key));
  };

  await Promise.all([
    check<V1Status>(
      V1_KEYS.filter(shown),
      () => apiGet('/api/v1/integrations/status'),
      ({ integrations: i }) => {
        if (i?.biometrics?.connected) connected.add(biometricKey(i.biometrics.platform));
        if (i?.calendar?.connected) connected.add('googleCalendar');
        if (i?.linkedin?.connected) connected.add('linkedin');
      }
    ),
    // Spotify link status is per device (without device_id the server reports SDK config)
    check<{ linked?: boolean }>(
      shown('spotify') ? ['spotify'] : [],
      () => apiGet('/spotify/status', { device_id: getDeviceId() }),
      (data) => void (data.linked && connected.add('spotify'))
    ),
    check<{ providers?: Record<string, { connected: boolean }> }>(
      shown('googleCalendar') ? ['googleCalendar'] : [],
      () => apiGet('/api/calendar/providers/status'),
      (data) =>
        void (
          Object.values(data.providers ?? {}).some((p) => p.connected) &&
          connected.add('googleCalendar')
        )
    ),
  ]);

  const statuses = {} as IntegrationStatuses;
  for (const key of Object.keys(TILE_IDS) as StatusKey[]) {
    statuses[key] = connected.has(key) ? 'connected' : failed.has(key) ? 'error' : 'disconnected';
  }
  return statuses;
}

/**
 * A tile's right-hand side: "Connected", a Connect button, or, when its check
 * failed, that it couldn't check and a way to try again.
 */
export function renderTileAction(id: string, status: ConnectionStatus, checkIcon: string): string {
  if (status === 'connected') {
    return `<span class="connected-life-status connected">${checkIcon} ${t('connectedLife.connected')}</span>`;
  }
  if (status === 'error') {
    return `<span class="connected-life-status error">${t('connectedLife.statusFailed')}</span>
      <button class="connected-life-connect-btn" data-retry="${id}">${t('common.retry')}</button>`;
  }
  return `<button class="connected-life-connect-btn" data-connect="${id}">${t('common.connect')}</button>`;
}
