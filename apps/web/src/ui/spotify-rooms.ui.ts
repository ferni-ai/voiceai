/**
 * Spotify Rooms Configuration UI
 *
 * Configure multi-room music playback by assigning
 * Spotify Connect devices to named rooms.
 *
 * DESIGN PRINCIPLES:
 *   - Drag-drop device assignment (future enhancement)
 *   - Clear device discovery with real-time status
 *   - Room groups for whole-house audio
 *   - Uses safe DOM methods (no innerHTML)
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api.js';
import { toast } from './toast.ui.js';

// ============================================================================
// TYPES
// ============================================================================

interface SpotifyRoom {
  id: string;
  name: string;
  deviceIds: string[];
  defaultVolume: number;
  icon?: string;
}

interface SpotifyRoomGroup {
  id: string;
  name: string;
  roomIds: string[];
}

interface SpotifyDevice {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
  volume_percent: number;
}

interface RoomConfig {
  rooms: SpotifyRoom[];
  roomGroups: SpotifyRoomGroup[];
  defaultRoomId: string | null;
}

interface SpotifyRoomsCallbacks {
  onClose?: () => void;
  onRoomCreated?: (room: SpotifyRoom) => void;
  onRoomDeleted?: (roomId: string) => void;
}

// ============================================================================
// SAFE DOM HELPERS
// ============================================================================

function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string>,
  children?: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'className') {
        el.className = value;
      } else {
        el.setAttribute(key, value);
      }
    }
  }
  if (children) {
    for (const child of children) {
      if (typeof child === 'string') {
        el.appendChild(document.createTextNode(child));
      } else {
        el.appendChild(child);
      }
    }
  }
  return el;
}

function createSvgIcon(pathD: string, viewBox = '0 0 24 24'): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');

  const paths = pathD.split('|');
  for (const d of paths) {
    if (d.startsWith('L:')) {
      const [, coords] = d.split(':');
      const [x1, y1, x2, y2] = coords.split(',');
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', x1);
      line.setAttribute('y1', y1);
      line.setAttribute('x2', x2);
      line.setAttribute('y2', y2);
      svg.appendChild(line);
    } else if (d.startsWith('C:')) {
      const [, coords] = d.split(':');
      const [cx, cy, r] = coords.split(',');
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', cx);
      circle.setAttribute('cy', cy);
      circle.setAttribute('r', r);
      svg.appendChild(circle);
    } else {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      svg.appendChild(path);
    }
  }
  return svg;
}

const ICON_PATHS = {
  close: 'L:18,6,6,18|L:6,6,18,18',
  plus: 'L:12,5,12,19|L:5,12,19,12',
  trash: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
  speaker: 'M11 5L6 9H2v6h4l5 4V5z|M19.07 4.93a10 10 0 0 1 0 14.14|M15.54 8.46a5 5 0 0 1 0 7.07',
  home: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  refresh: 'M23 4v6h-6|M1 20v-6h6|M3.51 9a9 9 0 0 1 14.85-3.36L23 10|M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
  star: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  check: 'M20 6L9 17l-5-5',
};

// ============================================================================
// SPOTIFY ROOMS UI CLASS
// ============================================================================

class SpotifyRoomsUI {
  private panel: HTMLElement | null = null;
  private styleElement: HTMLStyleElement | null = null;
  private isVisible = false;
  private callbacks: SpotifyRoomsCallbacks = {};
  private config: RoomConfig | null = null;
  private devices: SpotifyDevice[] = [];
  private isLoading = false;
  private selectedDevices: Set<string> = new Set();

  initialize(): void {
    if (this.panel) return;
    this.injectStyles();
    this.createPanel();
  }

  setCallbacks(callbacks: SpotifyRoomsCallbacks): void {
    this.callbacks = callbacks;
  }

  async show(): Promise<void> {
    this.initialize();
    if (!this.panel) return;

    await this.fetchData();
    this.renderContent();
    this.panel.classList.add('spotify-rooms--visible');
    this.isVisible = true;
  }

  hide(): void {
    if (!this.panel) return;
    this.panel.classList.remove('spotify-rooms--visible');
    this.isVisible = false;
    this.selectedDevices.clear();
    this.callbacks.onClose?.();
  }

  private async fetchData(): Promise<void> {
    this.isLoading = true;

    try {
      const [configRes, devicesRes] = await Promise.all([
        apiGet<RoomConfig>('/api/spotify/rooms'),
        apiGet<{ devices: SpotifyDevice[] }>('/api/spotify/devices'),
      ]);

      if (configRes.ok && configRes.data) {
        this.config = configRes.data;
      } else {
        this.config = { rooms: [], roomGroups: [], defaultRoomId: null };
      }

      if (devicesRes.ok && devicesRes.data) {
        this.devices = devicesRes.data.devices;
      }
    } catch (error) {
      if (import.meta.env?.DEV) console.debug('Failed to fetch Spotify room data:', error);
      this.config = { rooms: [], roomGroups: [], defaultRoomId: null };
    }

    this.isLoading = false;
  }

  private createPanel(): void {
    this.panel = createElement('div', { className: 'spotify-rooms' });
    const content = createElement('div', { className: 'spotify-rooms__content' });
    this.panel.appendChild(content);

    this.panel.addEventListener('click', (e) => {
      if (e.target === this.panel) this.hide();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) this.hide();
    });

    document.body.appendChild(this.panel);
  }

  private renderContent(): void {
    const content = this.panel?.querySelector('.spotify-rooms__content');
    if (!content) return;

    content.textContent = '';

    // Header
    const header = this.createHeader();
    content.appendChild(header);

    // Body
    const body = createElement('div', { className: 'spotify-rooms__body' });

    if (this.isLoading) {
      body.appendChild(createElement('div', { className: 'spotify-rooms__loading' }, ['Loading...']));
    } else {
      this.renderRoomsSection(body);
      this.renderDevicesSection(body);
    }

    content.appendChild(body);
  }

  private createHeader(): HTMLElement {
    const header = createElement('div', { className: 'spotify-rooms__header' });

    const title = createElement('h2', { className: 'spotify-rooms__title' }, ['Spotify Rooms']);
    header.appendChild(title);

    const actions = createElement('div', { className: 'spotify-rooms__header-actions' });

    const refreshBtn = createElement('button', {
      className: 'spotify-rooms__icon-btn',
      title: 'Refresh devices',
      'aria-label': 'Refresh devices',
    });
    refreshBtn.appendChild(createSvgIcon(ICON_PATHS.refresh));
    refreshBtn.addEventListener('click', async () => {
      await this.fetchData();
      this.renderContent();
      toast.info('Devices refreshed');
    });
    actions.appendChild(refreshBtn);

    const closeBtn = createElement('button', {
      className: 'spotify-rooms__icon-btn',
      'aria-label': 'Close',
    });
    closeBtn.appendChild(createSvgIcon(ICON_PATHS.close));
    closeBtn.addEventListener('click', () => this.hide());
    actions.appendChild(closeBtn);

    header.appendChild(actions);
    return header;
  }

  private renderRoomsSection(container: HTMLElement): void {
    const section = createElement('div', { className: 'spotify-rooms__section' });

    const sectionHeader = createElement('div', { className: 'spotify-rooms__section-header' });
    sectionHeader.appendChild(createElement('h3', {}, ['Your Rooms']));

    const addBtn = createElement('button', { className: 'spotify-rooms__add-btn' });
    addBtn.appendChild(createSvgIcon(ICON_PATHS.plus));
    addBtn.appendChild(createElement('span', {}, ['Add Room']));
    addBtn.addEventListener('click', () => this.showAddRoomForm());
    sectionHeader.appendChild(addBtn);

    section.appendChild(sectionHeader);

    const list = createElement('div', { className: 'spotify-rooms__list' });

    if (!this.config || this.config.rooms.length === 0) {
      list.appendChild(
        createElement('div', { className: 'spotify-rooms__empty' }, [
          'No rooms configured yet. Add a room to start multi-room playback!',
        ])
      );
    } else {
      for (const room of this.config.rooms) {
        list.appendChild(this.createRoomCard(room));
      }
    }

    section.appendChild(list);
    container.appendChild(section);
  }

  private createRoomCard(room: SpotifyRoom): HTMLElement {
    const card = createElement('div', {
      className: 'room-card',
      'data-room-id': room.id,
    });

    // Header
    const header = createElement('div', { className: 'room-card__header' });

    const icon = createElement('div', { className: 'room-card__icon' });
    icon.appendChild(createSvgIcon(ICON_PATHS.home));
    header.appendChild(icon);

    const info = createElement('div', { className: 'room-card__info' });
    const nameEl = createElement('span', { className: 'room-card__name' });
    nameEl.textContent = room.name;
    info.appendChild(nameEl);

    const devicesCount = room.deviceIds.length;
    const devicesText = devicesCount === 1 ? '1 device' : `${devicesCount} devices`;
    const metaEl = createElement('span', { className: 'room-card__meta' });
    metaEl.textContent = `${devicesText} • Vol: ${room.defaultVolume}%`;
    info.appendChild(metaEl);

    header.appendChild(info);

    // Default indicator
    if (this.config?.defaultRoomId === room.id) {
      const defaultBadge = createElement('span', { className: 'room-card__default' }, ['Default']);
      header.appendChild(defaultBadge);
    }

    card.appendChild(header);

    // Device list
    if (room.deviceIds.length > 0) {
      const deviceList = createElement('div', { className: 'room-card__devices' });
      for (const deviceId of room.deviceIds) {
        const device = this.devices.find((d) => d.id === deviceId);
        if (device) {
          const deviceTag = createElement('span', { className: 'room-card__device-tag' });
          deviceTag.textContent = device.name;
          deviceList.appendChild(deviceTag);
        }
      }
      card.appendChild(deviceList);
    }

    // Actions
    const actions = createElement('div', { className: 'room-card__actions' });

    if (this.config?.defaultRoomId !== room.id) {
      const defaultBtn = createElement('button', {
        className: 'room-card__btn',
        title: 'Set as default',
      });
      defaultBtn.appendChild(createSvgIcon(ICON_PATHS.star));
      defaultBtn.addEventListener('click', () => this.setDefaultRoom(room.id));
      actions.appendChild(defaultBtn);
    }

    const deleteBtn = createElement('button', {
      className: 'room-card__btn room-card__btn--danger',
      title: 'Delete room',
    });
    deleteBtn.appendChild(createSvgIcon(ICON_PATHS.trash));
    deleteBtn.addEventListener('click', () => this.deleteRoom(room.id));
    actions.appendChild(deleteBtn);

    card.appendChild(actions);

    return card;
  }

  private renderDevicesSection(container: HTMLElement): void {
    const section = createElement('div', { className: 'spotify-rooms__section' });

    const sectionHeader = createElement('div', { className: 'spotify-rooms__section-header' });
    sectionHeader.appendChild(createElement('h3', {}, ['Available Devices']));
    section.appendChild(sectionHeader);

    if (this.devices.length === 0) {
      section.appendChild(
        createElement('div', { className: 'spotify-rooms__empty' }, [
          'No Spotify devices found. Make sure Spotify is open on your speakers or devices.',
        ])
      );
    } else {
      const list = createElement('div', { className: 'spotify-rooms__device-list' });
      for (const device of this.devices) {
        list.appendChild(this.createDeviceCard(device));
      }
      section.appendChild(list);
    }

    container.appendChild(section);
  }

  private createDeviceCard(device: SpotifyDevice): HTMLElement {
    const isAssigned = this.config?.rooms.some((r) => r.deviceIds.includes(device.id));

    const card = createElement('div', {
      className: `device-card ${device.is_active ? 'device-card--active' : ''} ${isAssigned ? 'device-card--assigned' : ''}`,
      'data-device-id': device.id,
    });

    const icon = createElement('div', { className: 'device-card__icon' });
    icon.appendChild(createSvgIcon(ICON_PATHS.speaker));
    card.appendChild(icon);

    const info = createElement('div', { className: 'device-card__info' });
    const nameEl = createElement('span', { className: 'device-card__name' });
    nameEl.textContent = device.name;
    info.appendChild(nameEl);

    const typeEl = createElement('span', { className: 'device-card__type' });
    typeEl.textContent = device.type;
    if (device.is_active) {
      typeEl.textContent += ' • Active';
    }
    if (isAssigned) {
      const room = this.config?.rooms.find((r) => r.deviceIds.includes(device.id));
      if (room) {
        typeEl.textContent += ` • ${room.name}`;
      }
    }
    info.appendChild(typeEl);

    card.appendChild(info);

    if (isAssigned) {
      const checkIcon = createElement('div', { className: 'device-card__check' });
      checkIcon.appendChild(createSvgIcon(ICON_PATHS.check));
      card.appendChild(checkIcon);
    }

    return card;
  }

  private showAddRoomForm(): void {
    const name = prompt('Room name (e.g., "Living Room"):');
    if (!name) return;

    // Get unassigned devices
    const assignedDeviceIds = new Set(this.config?.rooms.flatMap((r) => r.deviceIds) ?? []);
    const unassignedDevices = this.devices.filter((d) => !assignedDeviceIds.has(d.id));

    if (unassignedDevices.length === 0) {
      toast.warning('No unassigned devices available');
      return;
    }

    const deviceOptions = unassignedDevices.map((d, i) => `${i + 1}. ${d.name}`).join('\n');
    const deviceChoice = prompt(`Select devices (comma-separated numbers):\n${deviceOptions}`);
    if (!deviceChoice) return;

    const selectedIndices = deviceChoice.split(',').map((s) => parseInt(s.trim(), 10) - 1);
    const selectedDeviceIds = selectedIndices
      .filter((i) => i >= 0 && i < unassignedDevices.length)
      .map((i) => unassignedDevices[i].id);

    if (selectedDeviceIds.length === 0) {
      toast.warning('No valid devices selected');
      return;
    }

    this.createRoom({ name, deviceIds: selectedDeviceIds });
  }

  private async createRoom(data: { name: string; deviceIds: string[]; defaultVolume?: number }): Promise<void> {
    try {
      const res = await apiPost<SpotifyRoom>('/api/spotify/rooms', {
        name: data.name,
        deviceIds: data.deviceIds,
        defaultVolume: data.defaultVolume ?? 50,
      });

      if (res.ok && res.data) {
        if (!this.config) {
          this.config = { rooms: [], roomGroups: [], defaultRoomId: null };
        }
        this.config.rooms.push(res.data);
        toast.success(`${data.name} created!`);
        this.callbacks.onRoomCreated?.(res.data);
        this.renderContent();
      } else {
        toast.error(res.error || "Couldn't create room");
      }
    } catch (error) {
      toast.error("Couldn't create room");
    }
  }

  private async setDefaultRoom(roomId: string): Promise<void> {
    try {
      const res = await apiPut('/api/spotify/rooms/default', { roomId });
      if (res.ok) {
        if (this.config) {
          this.config.defaultRoomId = roomId;
        }
        toast.success('Default room updated');
        this.renderContent();
      }
    } catch (error) {
      toast.error("Couldn't set default room");
    }
  }

  private async deleteRoom(roomId: string): Promise<void> {
    if (!confirm('Delete this room?')) return;

    try {
      const res = await apiDelete(`/api/spotify/rooms/${roomId}`);
      if (res.ok) {
        if (this.config) {
          this.config.rooms = this.config.rooms.filter((r) => r.id !== roomId);
          if (this.config.defaultRoomId === roomId) {
            this.config.defaultRoomId = this.config.rooms[0]?.id ?? null;
          }
        }
        toast.success('Room deleted');
        this.callbacks.onRoomDeleted?.(roomId);
        this.renderContent();
      }
    } catch (error) {
      toast.error("Couldn't delete room");
    }
  }

  private injectStyles(): void {
    if (this.styleElement) return;

    this.styleElement = document.createElement('style');
    this.styleElement.textContent = `
      .spotify-rooms {
        position: fixed;
        inset: 0;
        z-index: var(--z-modal-backdrop);
        background: var(--backdrop-heavy);
        opacity: 0;
        visibility: hidden;
        transition: opacity ${DURATION.SLOW}ms ${EASING.OUT_EXPO}, visibility ${DURATION.SLOW}ms;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--space-md);
      }

      .spotify-rooms--visible {
        opacity: 1;
        visibility: visible;
      }

      .spotify-rooms__content {
        background: var(--color-bg-primary);
        border-radius: var(--radius-lg);
        width: 100%;
        max-width: 600px;
        max-height: 80vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        transform: scale(0.95) translateY(20px);
        transition: transform ${DURATION.SLOW}ms ${EASING.OUT_EXPO};
      }

      .spotify-rooms--visible .spotify-rooms__content {
        transform: scale(1) translateY(0);
      }

      .spotify-rooms__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--space-md);
        border-bottom: 1px solid var(--color-border-subtle);
      }

      .spotify-rooms__title {
        font-size: 1.25rem;
        font-weight: 600;
        color: var(--color-text-primary);
        margin: 0;
      }

      .spotify-rooms__header-actions {
        display: flex;
        gap: var(--space-xs);
      }

      .spotify-rooms__icon-btn {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: none;
        border: none;
        border-radius: var(--radius-full);
        color: var(--color-text-secondary);
        cursor: pointer;
        transition: background ${DURATION.FAST}ms, color ${DURATION.FAST}ms;
      }

      .spotify-rooms__icon-btn:hover,
      .spotify-rooms__icon-btn:focus-visible {
        background: var(--color-bg-elevated);
        color: var(--color-text-primary);
      }

      .spotify-rooms__icon-btn svg {
        width: 20px;
        height: 20px;
      }

      .spotify-rooms__body {
        flex: 1;
        overflow-y: auto;
        padding: var(--space-md);
      }

      .spotify-rooms__section {
        margin-bottom: var(--space-lg);
      }

      .spotify-rooms__section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--space-sm);
      }

      .spotify-rooms__section-header h3 {
        font-size: 1rem;
        font-weight: 600;
        color: var(--color-text-primary);
        margin: 0;
      }

      .spotify-rooms__add-btn {
        display: flex;
        align-items: center;
        gap: var(--space-xs);
        padding: var(--space-xs) var(--space-sm);
        background: var(--color-accent-primary);
        border: none;
        border-radius: var(--radius-md);
        color: white;
        font-size: 0.875rem;
        cursor: pointer;
        transition: opacity ${DURATION.FAST}ms;
      }

      .spotify-rooms__add-btn:hover,
      .spotify-rooms__add-btn:focus-visible {
        opacity: 0.9;
      }

      .spotify-rooms__add-btn svg {
        width: 16px;
        height: 16px;
      }

      .spotify-rooms__list {
        display: flex;
        flex-direction: column;
        gap: var(--space-sm);
      }

      .spotify-rooms__empty {
        text-align: center;
        padding: var(--space-lg);
        color: var(--color-text-muted);
        font-size: 0.875rem;
      }

      .spotify-rooms__loading {
        text-align: center;
        padding: var(--space-lg);
        color: var(--color-text-secondary);
      }

      .spotify-rooms__device-list {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: var(--space-sm);
      }

      /* Room Card */
      .room-card {
        background: var(--color-bg-secondary);
        border-radius: var(--radius-md);
        padding: var(--space-md);
      }

      .room-card__header {
        display: flex;
        align-items: center;
        gap: var(--space-sm);
        margin-bottom: var(--space-sm);
      }

      .room-card__icon {
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--color-bg-primary);
        border-radius: var(--radius-md);
        color: var(--color-accent-primary);
      }

      .room-card__icon svg {
        width: 20px;
        height: 20px;
      }

      .room-card__info {
        flex: 1;
        min-width: 0;
      }

      .room-card__name {
        display: block;
        font-weight: 500;
        color: var(--color-text-primary);
      }

      .room-card__meta {
        display: block;
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }

      .room-card__default {
        padding: 2px 8px;
        background: var(--color-accent-primary);
        color: white;
        font-size: 0.625rem;
        font-weight: 600;
        text-transform: uppercase;
        border-radius: var(--radius-full);
      }

      .room-card__devices {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-xs);
        margin-bottom: var(--space-sm);
      }

      .room-card__device-tag {
        padding: 2px 8px;
        background: var(--color-bg-tertiary);
        color: var(--color-text-secondary);
        font-size: 0.75rem;
        border-radius: var(--radius-full);
      }

      .room-card__actions {
        display: flex;
        gap: var(--space-xs);
        justify-content: flex-end;
      }

      .room-card__btn {
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: none;
        border: none;
        border-radius: var(--radius-sm);
        color: var(--color-text-secondary);
        cursor: pointer;
        transition: background ${DURATION.FAST}ms, color ${DURATION.FAST}ms;
      }

      .room-card__btn:hover,
      .room-card__btn:focus-visible {
        background: var(--color-bg-primary);
        color: var(--color-text-primary);
      }

      .room-card__btn--danger:hover,
      .room-card__btn--danger:focus-visible {
        color: var(--color-semantic-error);
      }

      .room-card__btn svg {
        width: 16px;
        height: 16px;
      }

      /* Device Card */
      .device-card {
        display: flex;
        align-items: center;
        gap: var(--space-sm);
        padding: var(--space-sm);
        background: var(--color-bg-secondary);
        border-radius: var(--radius-md);
        border: 1px solid transparent;
        transition: border-color ${DURATION.FAST}ms;
      }

      .device-card--active {
        border-color: var(--color-semantic-success);
      }

      .device-card--assigned {
        opacity: 0.6;
      }

      .device-card__icon {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--color-text-secondary);
      }

      .device-card__icon svg {
        width: 20px;
        height: 20px;
      }

      .device-card__info {
        flex: 1;
        min-width: 0;
      }

      .device-card__name {
        display: block;
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--color-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .device-card__type {
        display: block;
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }

      .device-card__check {
        color: var(--color-semantic-success);
      }

      .device-card__check svg {
        width: 16px;
        height: 16px;
      }

      @media (prefers-reduced-motion: reduce) {
        .spotify-rooms,
        .spotify-rooms__content {
          transition: none;
        }
      }
    `;

    document.head.appendChild(this.styleElement);
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const spotifyRoomsUI = new SpotifyRoomsUI();

/**
 * Show Spotify rooms panel
 */
export function showSpotifyRooms(): void {
  spotifyRoomsUI.show();
}

/**
 * Hide Spotify rooms panel
 */
export function hideSpotifyRooms(): void {
  spotifyRoomsUI.hide();
}

/**
 * Set callbacks for Spotify rooms events
 */
export function setSpotifyRoomsCallbacks(callbacks: SpotifyRoomsCallbacks): void {
  spotifyRoomsUI.setCallbacks(callbacks);
}
