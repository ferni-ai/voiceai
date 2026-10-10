/**
 * What I Do For You - "Connected services" tab
 *
 * Shows which services Ferni's routines can draw on (calendar, wearables, ...)
 * from the same server status the Everything Connected panel uses, with a
 * button that opens that panel to connect or change them.
 */

import { LINKEDIN_ENABLED } from '../../config/linkedin.js';
import { t } from '../../i18n/index.js';
import {
  fetchWearableProviders,
  getPlatformConfig,
  WEARABLE_PROVIDERS,
} from '../../services/biometrics.service.js';
import { apiGet } from '../../utils/api.js';
import { openEverythingConnected } from '../everything-connected.js';

export interface CareConnection {
  id: string;
  name: string;
  connected: boolean;
}

interface IntegrationsStatus {
  integrations?: {
    biometrics?: { connected: boolean; platform?: string | null };
    calendar?: { connected: boolean };
    linkedin?: { connected: boolean };
  };
}

/**
 * What the server says is connected, or null when it couldn't be reached.
 * Wearables are listed only when the server has them configured (or the user
 * already linked one), so we never show a service nobody can connect.
 */
export async function loadCareConnections(): Promise<CareConnection[] | null> {
  const [status, wearables] = await Promise.all([
    apiGet<IntegrationsStatus>('/api/v1/integrations/status'),
    fetchWearableProviders(),
  ]);
  if (!status.ok && !wearables) return null;

  const integrations = status.data?.integrations;
  const rows: CareConnection[] = [
    {
      id: 'calendar',
      name: t('menu.items.calendar'),
      connected: !!integrations?.calendar?.connected,
    },
  ];
  if (LINKEDIN_ENABLED) {
    rows.push({
      id: 'linkedin',
      name: t('menu.items.linkedin'),
      connected: !!integrations?.linkedin?.connected,
    });
  }
  if (integrations?.biometrics?.connected && /apple/i.test(integrations.biometrics.platform ?? '')) {
    rows.push({ id: 'apple_health', name: t('menu.items.appleHealth'), connected: true });
  }
  for (const id of WEARABLE_PROVIDERS) {
    const provider = wearables?.find((w) => w.provider === id);
    if (provider && (provider.configured || provider.linked)) {
      rows.push({ id, name: getPlatformConfig(id)?.name ?? id, connected: provider.linked });
    }
  }
  return rows;
}

export function renderCareConnections(rows: CareConnection[] | null): string {
  if (!rows) {
    return `<div class="ferni-empty"><p>${t('ferniCare.connections.loadError')}</p></div>`;
  }
  const items = rows
    .map(
      (row) => `
        <div class="ferni-routine" data-connection-id="${row.id}">
          <div class="ferni-routine__content">
            <div class="ferni-routine__name">${row.name}</div>
          </div>
          <span class="ferni-routine__status ferni-routine__status--${row.connected ? 'active' : 'paused'}">
            ${t(row.connected ? 'ferniCare.connections.connected' : 'ferniCare.connections.notConnected')}
          </span>
        </div>`
    )
    .join('');
  return `
    <div class="ferni-routines">
      <p class="ferni-care__subtitle">${t('ferniCare.connections.intro')}</p>
      ${items}
      <button class="ferni-add-btn" data-action="open-connections">${t('menu.items.allConnections')}</button>
    </div>
  `;
}

/**
 * Fill the tab, unless the user has already moved to another one.
 * The Everything Connected button closes the care dashboard (`closeDashboard`) and opens that panel.
 */
export async function showCareConnections(
  content: Element,
  isStillActive: () => boolean,
  closeDashboard: () => void
): Promise<void> {
  content.innerHTML = `<div class="ferni-loading"><div class="ferni-loading-spinner"></div></div>`;
  const rows = await loadCareConnections();
  if (!isStillActive()) return;
  content.innerHTML = renderCareConnections(rows);
  content.querySelector('[data-action="open-connections"]')?.addEventListener('click', () => {
    closeDashboard();
    openEverythingConnected();
  });
}
