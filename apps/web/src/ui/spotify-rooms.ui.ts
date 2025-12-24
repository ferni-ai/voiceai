/**
 * Spotify Rooms Configuration UI
 *
 * Configure multi-room music playback by assigning
 * Spotify Connect devices to named rooms.
 *
 * DESIGN PRINCIPLES:
 *   - Proper modal forms (no browser prompt() dialogs)
 *   - Clear device discovery with real-time status
 *   - Room editing and management
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
  trash: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2|L:3,6,21,6|L:10,11,10,17|L:14,11,14,17',
  speaker: 'M11 5L6 9H2v6h4l5 4V5z|M19.07 4.93a10 10 0 0 1 0 14.14|M15.54 8.46a5 5 0 0 1 0 7.07',
  home: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  refresh: 'M23 4v6h-6|M1 20v-6h6|M3.51 9a9 9 0 0 1 14.85-3.36L23 10|M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
  star: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  check: 'M20 6L9 17l-5-5',
  edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7|M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
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

  // Form modal state
  private formModal: HTMLElement | null = null;
  private editingRoom: SpotifyRoom | null = null;

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
    this.hideFormModal();
    this.panel.classList.remove('spotify-rooms--visible');
    this.isVisible = false;
    this.selectedDevices.clear();
    this.callbacks.onClose?.();
  }

  private async fetchData(): Promise<void> {
    this.isLoading = true;
    this.renderContent();

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
    this.renderContent();
  }

  private createPanel(): void {
    this.panel = createElement('div', { className: 'spotify-rooms' });
    const content = createElement('div', { className: 'spotify-rooms__content' });
    this.panel.appendChild(content);

    this.panel.addEventListener('click', (e) => {
      if (e.target === this.panel) this.hide();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) {
        if (this.formModal) {
          this.hideFormModal();
        } else {
          this.hide();
        }
      }
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
      body.appendChild(this.renderLoadingState());
    } else {
      this.renderRoomsSection(body);
      this.renderDevicesSection(body);
    }

    content.appendChild(body);
  }

  private renderLoadingState(): HTMLElement {
    const loading = createElement('div', { className: 'spotify-rooms__loading' });
    loading.appendChild(createSvgIcon(ICON_PATHS.refresh));
    loading.appendChild(createElement('span', {}, ['Loading devices...']));
    return loading;
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
    addBtn.addEventListener('click', () => this.showRoomForm());
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

    // Edit button
    const editBtn = createElement('button', {
      className: 'room-card__btn',
      title: 'Edit room',
      'aria-label': 'Edit room',
    });
    editBtn.appendChild(createSvgIcon(ICON_PATHS.edit));
    editBtn.addEventListener('click', () => this.showRoomForm(room));
    actions.appendChild(editBtn);

    if (this.config?.defaultRoomId !== room.id) {
      const defaultBtn = createElement('button', {
        className: 'room-card__btn',
        title: 'Set as default',
        'aria-label': 'Set as default',
      });
      defaultBtn.appendChild(createSvgIcon(ICON_PATHS.star));
      defaultBtn.addEventListener('click', () => this.setDefaultRoom(room.id));
      actions.appendChild(defaultBtn);
    }

    const deleteBtn = createElement('button', {
      className: 'room-card__btn room-card__btn--danger',
      title: 'Delete room',
      'aria-label': 'Delete room',
    });
    deleteBtn.appendChild(createSvgIcon(ICON_PATHS.trash));
    deleteBtn.addEventListener('click', () => this.confirmDeleteRoom(room));
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

  // ============================================================================
  // ROOM FORM MODAL
  // ============================================================================

  private showRoomForm(room?: SpotifyRoom): void {
    this.editingRoom = room || null;
    this.selectedDevices = new Set(room?.deviceIds || []);

    // Create form modal
    this.formModal = createElement('div', { className: 'room-form-modal' });

    const modalContent = createElement('div', { className: 'room-form-modal__content' });

    // Header
    const header = createElement('div', { className: 'room-form-modal__header' });
    header.appendChild(
      createElement('h3', {}, [room ? 'Edit Room' : 'Add Room'])
    );
    const closeBtn = createElement('button', {
      className: 'room-form-modal__close',
      'aria-label': 'Close',
    });
    closeBtn.appendChild(createSvgIcon(ICON_PATHS.close));
    closeBtn.addEventListener('click', () => this.hideFormModal());
    header.appendChild(closeBtn);
    modalContent.appendChild(header);

    // Form
    const form = createElement('form', { className: 'room-form' });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitRoomForm(form);
    });

    // Room name input
    const nameGroup = createElement('div', { className: 'room-form__group' });
    const nameLabel = createElement('label', { className: 'room-form__label', for: 'room-name' }, ['Room Name']);
    const nameInput = createElement('input', {
      className: 'room-form__input',
      type: 'text',
      id: 'room-name',
      name: 'name',
      placeholder: 'e.g., Living Room',
      required: 'true',
    });
    if (room) {
      nameInput.value = room.name;
    }
    nameGroup.appendChild(nameLabel);
    nameGroup.appendChild(nameInput);
    form.appendChild(nameGroup);

    // Volume input
    const volumeGroup = createElement('div', { className: 'room-form__group' });
    const volumeLabel = createElement('label', { className: 'room-form__label', for: 'room-volume' }, ['Default Volume']);
    const volumeRow = createElement('div', { className: 'room-form__volume-row' });
    const volumeInput = createElement('input', {
      className: 'room-form__range',
      type: 'range',
      id: 'room-volume',
      name: 'volume',
      min: '0',
      max: '100',
      value: room?.defaultVolume?.toString() || '50',
    });
    const volumeValue = createElement('span', { className: 'room-form__volume-value' }, [
      `${room?.defaultVolume || 50}%`,
    ]);
    volumeInput.addEventListener('input', () => {
      volumeValue.textContent = `${volumeInput.value}%`;
    });
    volumeRow.appendChild(volumeInput);
    volumeRow.appendChild(volumeValue);
    volumeGroup.appendChild(volumeLabel);
    volumeGroup.appendChild(volumeRow);
    form.appendChild(volumeGroup);

    // Device selection
    const devicesGroup = createElement('div', { className: 'room-form__group' });
    const devicesLabel = createElement('label', { className: 'room-form__label' }, ['Select Devices']);

    // Filter out devices already assigned to other rooms
    const assignedToOtherRooms = new Set(
      this.config?.rooms
        .filter((r) => r.id !== room?.id)
        .flatMap((r) => r.deviceIds) ?? []
    );
    const availableDevices = this.devices.filter((d) => !assignedToOtherRooms.has(d.id));

    if (availableDevices.length === 0) {
      devicesGroup.appendChild(devicesLabel);
      devicesGroup.appendChild(
        createElement('div', { className: 'room-form__empty' }, [
          'No available devices. All devices are assigned to other rooms.',
        ])
      );
    } else {
      const devicesList = createElement('div', { className: 'room-form__devices' });

      for (const device of availableDevices) {
        const deviceItem = createElement('label', { className: 'room-form__device-item' });

        const checkbox = createElement('input', {
          type: 'checkbox',
          name: 'devices',
          value: device.id,
        }) as HTMLInputElement;

        if (this.selectedDevices.has(device.id)) {
          checkbox.checked = true;
        }

        checkbox.addEventListener('change', () => {
          if (checkbox.checked) {
            this.selectedDevices.add(device.id);
          } else {
            this.selectedDevices.delete(device.id);
          }
        });

        const deviceInfo = createElement('div', { className: 'room-form__device-info' });
        deviceInfo.appendChild(createElement('span', { className: 'room-form__device-name' }, [device.name]));
        deviceInfo.appendChild(
          createElement('span', { className: 'room-form__device-type' }, [
            `${device.type}${device.is_active ? ' • Active' : ''}`,
          ])
        );

        deviceItem.appendChild(checkbox);
        deviceItem.appendChild(deviceInfo);
        devicesList.appendChild(deviceItem);
      }

      devicesGroup.appendChild(devicesLabel);
      devicesGroup.appendChild(devicesList);
    }

    form.appendChild(devicesGroup);

    // Submit button
    const submitBtn = createElement('button', {
      className: 'room-form__submit',
      type: 'submit',
    }, [room ? 'Save Changes' : 'Create Room']);
    form.appendChild(submitBtn);

    modalContent.appendChild(form);
    this.formModal.appendChild(modalContent);

    // Close on backdrop click
    this.formModal.addEventListener('click', (e) => {
      if (e.target === this.formModal) {
        this.hideFormModal();
      }
    });

    document.body.appendChild(this.formModal);

    // Focus name input
    requestAnimationFrame(() => {
      nameInput.focus();
      this.formModal?.classList.add('room-form-modal--visible');
    });
  }

  private hideFormModal(): void {
    if (!this.formModal) return;

    this.formModal.classList.remove('room-form-modal--visible');

    setTimeout(() => {
      this.formModal?.remove();
      this.formModal = null;
      this.editingRoom = null;
      this.selectedDevices.clear();
    }, DURATION.NORMAL);
  }

  private async submitRoomForm(form: HTMLFormElement): Promise<void> {
    const formData = new FormData(form);
    const name = formData.get('name') as string;
    const volume = parseInt(formData.get('volume') as string, 10);
    const deviceIds = Array.from(this.selectedDevices);

    if (!name.trim()) {
      toast.warning('Enter a room name');
      return;
    }

    if (deviceIds.length === 0) {
      toast.warning('Select at least one device');
      return;
    }

    if (this.editingRoom) {
      await this.updateRoom(this.editingRoom.id, { name, deviceIds, defaultVolume: volume });
    } else {
      await this.createRoom({ name, deviceIds, defaultVolume: volume });
    }

    this.hideFormModal();
  }

  // ============================================================================
  // DELETE CONFIRMATION
  // ============================================================================

  private confirmDeleteRoom(room: SpotifyRoom): void {
    // Create confirmation modal
    const confirmModal = createElement('div', { className: 'confirm-modal' });

    const modalContent = createElement('div', { className: 'confirm-modal__content' });

    modalContent.appendChild(
      createElement('h3', { className: 'confirm-modal__title' }, ['Delete Room?'])
    );
    modalContent.appendChild(
      createElement('p', { className: 'confirm-modal__message' }, [
        `Are you sure you want to delete "${room.name}"? This action cannot be undone.`,
      ])
    );

    const actions = createElement('div', { className: 'confirm-modal__actions' });

    const cancelBtn = createElement('button', { className: 'confirm-modal__btn confirm-modal__btn--cancel' }, [
      'Cancel',
    ]);
    cancelBtn.addEventListener('click', () => {
      confirmModal.remove();
    });

    const deleteBtn = createElement('button', { className: 'confirm-modal__btn confirm-modal__btn--danger' }, [
      'Delete',
    ]);
    deleteBtn.addEventListener('click', async () => {
      confirmModal.remove();
      await this.deleteRoom(room.id);
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(deleteBtn);
    modalContent.appendChild(actions);

    confirmModal.appendChild(modalContent);

    // Close on backdrop click
    confirmModal.addEventListener('click', (e) => {
      if (e.target === confirmModal) {
        confirmModal.remove();
      }
    });

    document.body.appendChild(confirmModal);
    requestAnimationFrame(() => {
      confirmModal.classList.add('confirm-modal--visible');
    });
  }

  // ============================================================================
  // API METHODS
  // ============================================================================

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
      if (import.meta.env?.DEV) console.debug('Failed to create room:', error);
      toast.error("Couldn't create room");
    }
  }

  private async updateRoom(
    roomId: string,
    data: { name: string; deviceIds: string[]; defaultVolume: number }
  ): Promise<void> {
    try {
      const res = await apiPut<SpotifyRoom>(`/api/spotify/rooms/${roomId}`, data);

      if (res.ok) {
        if (this.config) {
          const index = this.config.rooms.findIndex((r) => r.id === roomId);
          if (index !== -1) {
            this.config.rooms[index] = { ...this.config.rooms[index], ...data };
          }
        }
        toast.success('Room updated');
        this.renderContent();
      } else {
        toast.error(res.error || "Couldn't update room");
      }
    } catch (error) {
      if (import.meta.env?.DEV) console.debug('Failed to update room:', error);
      toast.error("Couldn't update room");
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
      if (import.meta.env?.DEV) console.debug('Failed to set default room:', error);
      toast.error("Couldn't set default room");
    }
  }

  private async deleteRoom(roomId: string): Promise<void> {
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
      if (import.meta.env?.DEV) console.debug('Failed to delete room:', error);
      toast.error("Couldn't delete room");
    }
  }

  // ============================================================================
  // STYLES
  // ============================================================================

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
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--space-xl);
        color: var(--color-text-muted);
      }

      .spotify-rooms__loading svg {
        width: 32px;
        height: 32px;
        margin-bottom: var(--space-sm);
        animation: spotify-rooms-spin 1.5s linear infinite;
      }

      @keyframes spotify-rooms-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
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

      /* Room Form Modal */
      .room-form-modal {
        position: fixed;
        inset: 0;
        z-index: var(--z-modal-elevated);
        background: var(--backdrop-heavy);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--space-md);
        opacity: 0;
        transition: opacity ${DURATION.NORMAL}ms ${EASING.OUT_EXPO};
      }

      .room-form-modal--visible {
        opacity: 1;
      }

      .room-form-modal__content {
        background: var(--color-bg-elevated);
        border-radius: var(--radius-lg);
        width: 100%;
        max-width: 400px;
        max-height: 80vh;
        overflow-y: auto;
        transform: scale(0.95) translateY(10px);
        transition: transform ${DURATION.NORMAL}ms ${EASING.SPRING};
      }

      .room-form-modal--visible .room-form-modal__content {
        transform: scale(1) translateY(0);
      }

      .room-form-modal__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--space-md);
        border-bottom: 1px solid var(--color-border-subtle);
      }

      .room-form-modal__header h3 {
        margin: 0;
        font-size: 1.125rem;
        font-weight: 600;
        color: var(--color-text-primary);
      }

      .room-form-modal__close {
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: none;
        border: none;
        border-radius: var(--radius-sm);
        color: var(--color-text-muted);
        cursor: pointer;
        transition: background ${DURATION.FAST}ms, color ${DURATION.FAST}ms;
      }

      .room-form-modal__close:hover,
      .room-form-modal__close:focus-visible {
        background: var(--color-bg-tertiary);
        color: var(--color-text-primary);
      }

      .room-form-modal__close svg {
        width: 16px;
        height: 16px;
      }

      .room-form {
        padding: var(--space-md);
      }

      .room-form__group {
        margin-bottom: var(--space-md);
      }

      .room-form__label {
        display: block;
        margin-bottom: var(--space-xs);
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--color-text-secondary);
      }

      .room-form__input {
        width: 100%;
        padding: var(--space-sm) var(--space-md);
        background: var(--color-bg-secondary);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-md);
        color: var(--color-text-primary);
        font-size: 1rem;
        transition: border-color ${DURATION.FAST}ms;
      }

      .room-form__input:focus {
        outline: none;
        border-color: var(--color-accent-primary);
      }

      .room-form__input::placeholder {
        color: var(--color-text-muted);
      }

      .room-form__volume-row {
        display: flex;
        align-items: center;
        gap: var(--space-sm);
      }

      .room-form__range {
        flex: 1;
        height: 4px;
        background: var(--color-bg-tertiary);
        border-radius: var(--radius-full);
        appearance: none;
        cursor: pointer;
      }

      .room-form__range::-webkit-slider-thumb {
        appearance: none;
        width: 16px;
        height: 16px;
        background: var(--color-accent-primary);
        border-radius: var(--radius-full);
        cursor: grab;
      }

      .room-form__volume-value {
        min-width: 45px;
        text-align: right;
        font-size: 0.875rem;
        color: var(--color-text-secondary);
      }

      .room-form__devices {
        display: flex;
        flex-direction: column;
        gap: var(--space-xs);
        max-height: 200px;
        overflow-y: auto;
      }

      .room-form__device-item {
        display: flex;
        align-items: center;
        gap: var(--space-sm);
        padding: var(--space-sm);
        background: var(--color-bg-secondary);
        border-radius: var(--radius-md);
        cursor: pointer;
        transition: background ${DURATION.FAST}ms;
      }

      .room-form__device-item:hover {
        background: var(--color-bg-tertiary);
      }

      .room-form__device-item input[type="checkbox"] {
        width: 18px;
        height: 18px;
        accent-color: var(--color-accent-primary);
      }

      .room-form__device-info {
        flex: 1;
      }

      .room-form__device-name {
        display: block;
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--color-text-primary);
      }

      .room-form__device-type {
        display: block;
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }

      .room-form__empty {
        text-align: center;
        padding: var(--space-md);
        color: var(--color-text-muted);
        font-size: 0.875rem;
      }

      .room-form__submit {
        width: 100%;
        padding: var(--space-sm) var(--space-md);
        background: var(--color-accent-primary);
        border: none;
        border-radius: var(--radius-md);
        color: white;
        font-size: 1rem;
        font-weight: 500;
        cursor: pointer;
        transition: opacity ${DURATION.FAST}ms;
      }

      .room-form__submit:hover,
      .room-form__submit:focus-visible {
        opacity: 0.9;
      }

      /* Confirm Modal */
      .confirm-modal {
        position: fixed;
        inset: 0;
        z-index: var(--z-modal-elevated);
        background: var(--backdrop-heavy);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--space-md);
        opacity: 0;
        transition: opacity ${DURATION.NORMAL}ms ${EASING.OUT_EXPO};
      }

      .confirm-modal--visible {
        opacity: 1;
      }

      .confirm-modal__content {
        background: var(--color-bg-elevated);
        border-radius: var(--radius-lg);
        padding: var(--space-lg);
        width: 100%;
        max-width: 350px;
        text-align: center;
        transform: scale(0.95);
        transition: transform ${DURATION.NORMAL}ms ${EASING.SPRING};
      }

      .confirm-modal--visible .confirm-modal__content {
        transform: scale(1);
      }

      .confirm-modal__title {
        margin: 0 0 var(--space-sm);
        font-size: 1.125rem;
        font-weight: 600;
        color: var(--color-text-primary);
      }

      .confirm-modal__message {
        margin: 0 0 var(--space-lg);
        color: var(--color-text-secondary);
        font-size: 0.875rem;
      }

      .confirm-modal__actions {
        display: flex;
        gap: var(--space-sm);
        justify-content: center;
      }

      .confirm-modal__btn {
        padding: var(--space-sm) var(--space-lg);
        border-radius: var(--radius-md);
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        transition: all ${DURATION.FAST}ms;
      }

      .confirm-modal__btn--cancel {
        background: var(--color-bg-tertiary);
        border: 1px solid var(--color-border-subtle);
        color: var(--color-text-primary);
      }

      .confirm-modal__btn--cancel:hover,
      .confirm-modal__btn--cancel:focus-visible {
        background: var(--color-bg-secondary);
      }

      .confirm-modal__btn--danger {
        background: var(--color-semantic-error);
        border: none;
        color: white;
      }

      .confirm-modal__btn--danger:hover,
      .confirm-modal__btn--danger:focus-visible {
        opacity: 0.9;
      }

      @media (prefers-reduced-motion: reduce) {
        .spotify-rooms,
        .spotify-rooms__content,
        .spotify-rooms__loading svg,
        .room-form-modal,
        .room-form-modal__content,
        .confirm-modal,
        .confirm-modal__content {
          transition: none;
          animation: none;
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
