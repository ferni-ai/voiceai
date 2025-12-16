/**
 * Group Coaching UI
 *
 * UI for creating and joining group coaching sessions.
 * Supports family, couple, team, and peer support sessions.
 *
 * DESIGN PRINCIPLES:
 *   - Centered floating modal (brand-compliant)
 *   - Clear session type selection
 *   - Easy join flow with invite links
 */

import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants.js';
import { apiGet, apiPost } from '../utils/api.js';
import { t } from '../i18n/index.js';

// ============================================================================
// TYPES
// ============================================================================

type GroupSessionType = 'family' | 'couple' | 'team' | 'peer_support';
type GroupSessionStatus = 'waiting' | 'active' | 'paused' | 'ended';

interface GroupSession {
  id: string;
  type: GroupSessionType;
  hostUserId: string;
  status: GroupSessionStatus;
  participants: Array<{
    userId: string;
    displayName: string;
    role: string;
    isActive: boolean;
  }>;
  createdAt: string;
  startedAt?: string;
}

interface GroupCoachingCallbacks {
  onClose?: () => void;
  onSessionCreated?: (session: GroupSession) => void;
  onSessionJoined?: (session: GroupSession) => void;
}

// ============================================================================
// SESSION TYPE INFO
// ============================================================================

const SESSION_TYPES: Array<{
  id: GroupSessionType;
  name: string;
  icon: string;
  description: string;
  maxParticipants: number;
}> = [
  {
    id: 'couple',
    name: t('groupCoaching.sessionTypes.couple.name'),
    icon: '💑',
    description: t('groupCoaching.sessionTypes.couple.description'),
    maxParticipants: 2,
  },
  {
    id: 'family',
    name: t('groupCoaching.sessionTypes.family.name'),
    icon: '👨‍👩‍👧‍👦',
    description: t('groupCoaching.sessionTypes.family.description'),
    maxParticipants: 6,
  },
  {
    id: 'team',
    name: t('groupCoaching.sessionTypes.team.name'),
    icon: '👥',
    description: t('groupCoaching.sessionTypes.team.description'),
    maxParticipants: 10,
  },
  {
    id: 'peer_support',
    name: t('groupCoaching.sessionTypes.peer.name'),
    icon: '🤝',
    description: t('groupCoaching.sessionTypes.peer.description'),
    maxParticipants: 8,
  },
];

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  users: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="19" y2="12"/>
  </svg>`,
  link: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>`,
  play: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="5 3 19 12 5 21 5 3"/>
  </svg>`,
  copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
  </svg>`,
};

// ============================================================================
// GROUP COACHING UI CLASS
// ============================================================================

class GroupCoachingUI {
  private panel: HTMLElement | null = null;
  private wrapper: HTMLElement | null = null;
  private callbacks: GroupCoachingCallbacks = {};
  private styleElement: HTMLStyleElement | null = null;
  private isVisible = false;
  private sessions: GroupSession[] = [];
  private view: 'list' | 'create' | 'session' = 'list';
  private activeSession: GroupSession | null = null;

  initialize(): void {
    if (this.panel) return;

    document.querySelectorAll('.group-coaching').forEach((el) => el.remove());

    this.injectStyles();
    this.createPanel();
  }

  setCallbacks(callbacks: GroupCoachingCallbacks): void {
    this.callbacks = callbacks;
  }

  async show(): Promise<void> {
    this.initialize();
    if (!this.panel || !this.wrapper) return;

    this.view = 'list';
    this.renderLoading();
    this.panel.classList.add('group-coaching--visible');
    this.isVisible = true;

    await this.loadSessions();
  }

  hide(): void {
    if (!this.panel) return;

    this.panel.classList.remove('group-coaching--visible');
    this.isVisible = false;
    this.callbacks.onClose?.();
  }

  toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  private createPanel(): void {
    this.panel = document.createElement('div');
    this.panel.className = 'group-coaching';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', t('groupCoaching.title'));

    this.wrapper = document.createElement('div');
    this.wrapper.className = 'group-coaching__wrapper';
    this.panel.appendChild(this.wrapper);

    this.panel.addEventListener('click', (e) => {
      if (e.target === this.panel) this.hide();
    });

    document.body.appendChild(this.panel);
  }

  private async loadSessions(): Promise<void> {
    try {
      const response = await apiGet<{ success: boolean; sessions: GroupSession[] }>(
        '/api/group/sessions'
      );

      if (response.data?.success) {
        this.sessions = response.data.sessions;
        this.renderList();
      } else {
        this.renderError('Unable to load sessions');
      }
    } catch {
      this.sessions = [];
      this.renderList();
    }
  }

  private renderLoading(): void {
    if (!this.wrapper) return;

    this.wrapper.innerHTML = `
      <header class="group-coaching__header">
        <div class="group-coaching__icon">${ICONS.users}</div>
        <h2 class="group-coaching__title">${t('groupCoaching.title')}</h2>
        <button class="group-coaching__close" aria-label="${t('common.close')}">${ICONS.close}</button>
      </header>
      <div class="group-coaching__loading">
        <div class="group-coaching__spinner"></div>
        <p>${t('common.loading')}</p>
      </div>
    `;

    this.bindCloseButton();
  }

  private renderList(): void {
    if (!this.wrapper) return;

    const activeSessions = this.sessions.filter((s) => s.status !== 'ended');
    const sessionsList =
      activeSessions.length > 0
        ? activeSessions
            .map(
              (session) => `
          <div class="group-coaching__session" data-session-id="${session.id}">
            <div class="group-coaching__session-icon">${SESSION_TYPES.find((t) => t.id === session.type)?.icon || '👥'}</div>
            <div class="group-coaching__session-info">
              <span class="group-coaching__session-type">${SESSION_TYPES.find((t) => t.id === session.type)?.name || session.type}</span>
              <span class="group-coaching__session-status">${session.status} • ${session.participants.length} ${t('groupCoaching.participantsLabel')}</span>
            </div>
            <button class="group-coaching__session-join" data-session-id="${session.id}">
              ${session.status === 'waiting' ? t('groupCoaching.buttons.start') : t('groupCoaching.buttons.join')}
            </button>
          </div>
        `
            )
            .join('')
        : `<div class="group-coaching__empty">
          <p>${t('groupCoaching.empty.title')}</p>
          <p class="group-coaching__empty-hint">${t('groupCoaching.empty.hint')}</p>
        </div>`;

    this.wrapper.innerHTML = `
      <header class="group-coaching__header">
        <div class="group-coaching__icon">${ICONS.users}</div>
        <h2 class="group-coaching__title">${t('groupCoaching.title')}</h2>
        <button class="group-coaching__close" aria-label="${t('common.close')}">${ICONS.close}</button>
      </header>

      <div class="group-coaching__content">
        <div class="group-coaching__actions">
          <button class="group-coaching__create-btn" data-action="create">
            ${ICONS.plus}
            <span>New Session</span>
          </button>
          <button class="group-coaching__join-btn" data-action="join-link">
            ${ICONS.link}
            <span>Join with Link</span>
          </button>
        </div>

        <div class="group-coaching__sessions">
          <h3>Your Sessions</h3>
          ${sessionsList}
        </div>
      </div>
    `;

    this.bindCloseButton();
    this.bindListActions();
  }

  private renderCreate(): void {
    if (!this.wrapper) return;

    const typeOptions = SESSION_TYPES.map(
      (type) => `
      <button class="group-coaching__type" data-type="${type.id}">
        <div class="group-coaching__type-icon">${type.icon}</div>
        <div class="group-coaching__type-info">
          <span class="group-coaching__type-name">${type.name}</span>
          <span class="group-coaching__type-desc">${type.description}</span>
        </div>
        <span class="group-coaching__type-max">Up to ${type.maxParticipants}</span>
      </button>
    `
    ).join('');

    this.wrapper.innerHTML = `
      <header class="group-coaching__header">
        <button class="group-coaching__back" data-action="back">←</button>
        <h2 class="group-coaching__title">New Session</h2>
        <button class="group-coaching__close" aria-label="${t('common.close')}">${ICONS.close}</button>
      </header>

      <div class="group-coaching__content">
        <div class="group-coaching__create-intro">
          <p>Choose a session type:</p>
        </div>

        <div class="group-coaching__types">
          ${typeOptions}
        </div>
      </div>
    `;

    this.bindCloseButton();
    this.bindCreateActions();
  }

  private renderSession(session: GroupSession, joinLink?: string): void {
    if (!this.wrapper) return;

    const typeInfo = SESSION_TYPES.find((t) => t.id === session.type);
    const participantsList = session.participants
      .map(
        (p) => `
      <div class="group-coaching__participant ${p.isActive ? 'group-coaching__participant--active' : ''}">
        <span class="group-coaching__participant-name">${p.displayName}</span>
        <span class="group-coaching__participant-role">${p.role}</span>
      </div>
    `
      )
      .join('');

    this.wrapper.innerHTML = `
      <header class="group-coaching__header">
        <button class="group-coaching__back" data-action="back">←</button>
        <h2 class="group-coaching__title">${typeInfo?.name || 'Session'}</h2>
        <button class="group-coaching__close" aria-label="${t('common.close')}">${ICONS.close}</button>
      </header>

      <div class="group-coaching__content">
        <div class="group-coaching__session-header">
          <div class="group-coaching__session-icon-lg">${typeInfo?.icon || '👥'}</div>
          <div class="group-coaching__session-meta">
            <span class="group-coaching__session-status-badge group-coaching__session-status-badge--${session.status}">
              ${session.status}
            </span>
            <span class="group-coaching__session-id">ID: ${session.id.slice(-8)}</span>
          </div>
        </div>

        ${
          joinLink
            ? `
          <div class="group-coaching__invite">
            <h3>Invite Link</h3>
            <div class="group-coaching__invite-link">
              <input type="text" value="${joinLink}" readonly>
              <button class="group-coaching__copy-btn" data-action="copy" data-link="${joinLink}">
                ${ICONS.copy}
              </button>
            </div>
          </div>
        `
            : ''
        }

        <div class="group-coaching__participants">
          <h3>${t('groupCoaching.participantsLabel')} (${session.participants.length})</h3>
          ${participantsList}
        </div>

        <div class="group-coaching__session-actions">
          ${
            session.status === 'waiting'
              ? `
            <button class="group-coaching__start-btn" data-action="start" data-session-id="${session.id}">
              ${ICONS.play}
              <span>Start Session</span>
            </button>
          `
              : ''
          }
        </div>
      </div>
    `;

    this.bindCloseButton();
    this.bindSessionActions();
  }

  private renderError(message: string): void {
    if (!this.wrapper) return;

    this.wrapper.innerHTML = `
      <header class="group-coaching__header">
        <div class="group-coaching__icon">${ICONS.users}</div>
        <h2 class="group-coaching__title">${t('groupCoaching.title')}</h2>
        <button class="group-coaching__close" aria-label="${t('common.close')}">${ICONS.close}</button>
      </header>
      <div class="group-coaching__error">
        <p>${message}</p>
        <button class="group-coaching__retry">Try Again</button>
      </div>
    `;

    this.bindCloseButton();
    this.wrapper.querySelector('.group-coaching__retry')?.addEventListener('click', () => {
      this.renderLoading();
      this.loadSessions();
    });
  }

  private bindCloseButton(): void {
    this.wrapper?.querySelector('.group-coaching__close')?.addEventListener('click', () => {
      this.hide();
    });
  }

  private bindListActions(): void {
    this.wrapper?.querySelector('[data-action="create"]')?.addEventListener('click', () => {
      this.view = 'create';
      this.renderCreate();
    });

    this.wrapper?.querySelector('[data-action="join-link"]')?.addEventListener('click', () => {
      const link = prompt('Enter the session join link:');
      if (link) {
        const sessionId = link.split('/').pop();
        if (sessionId) {
          this.joinSession(sessionId);
        }
      }
    });

    this.wrapper?.querySelectorAll('.group-coaching__session-join').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const sessionId = (btn as HTMLElement).dataset.sessionId;
        if (sessionId) {
          const session = this.sessions.find((s) => s.id === sessionId);
          if (session) {
            this.activeSession = session;
            this.view = 'session';
            this.renderSession(session, `${window.location.origin}/join/${sessionId}`);
          }
        }
      });
    });
  }

  private bindCreateActions(): void {
    this.wrapper?.querySelector('[data-action="back"]')?.addEventListener('click', () => {
      this.view = 'list';
      this.renderList();
    });

    this.wrapper?.querySelectorAll('[data-type]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const type = (btn as HTMLElement).dataset.type as GroupSessionType;
        await this.createSession(type);
      });
    });
  }

  private bindSessionActions(): void {
    this.wrapper?.querySelector('[data-action="back"]')?.addEventListener('click', () => {
      this.view = 'list';
      this.renderList();
    });

    this.wrapper?.querySelector('[data-action="copy"]')?.addEventListener('click', async () => {
      const link = (this.wrapper?.querySelector('[data-action="copy"]') as HTMLElement)?.dataset
        .link;
      if (link) {
        await navigator.clipboard.writeText(link);
        // Show toast
      }
    });

    this.wrapper?.querySelector('[data-action="start"]')?.addEventListener('click', async () => {
      const sessionId = (this.wrapper?.querySelector('[data-action="start"]') as HTMLElement)
        ?.dataset.sessionId;
      if (sessionId) {
        await this.startSession(sessionId);
      }
    });
  }

  private async createSession(type: GroupSessionType): Promise<void> {
    try {
      const response = await apiPost<{ success: boolean; session: GroupSession; joinLink: string }>(
        '/api/group/sessions',
        { type }
      );

      if (response.data?.success) {
        this.activeSession = response.data.session;
        this.callbacks.onSessionCreated?.(response.data.session);
        this.view = 'session';
        this.renderSession(response.data.session, response.data.joinLink);
      }
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  }

  private async joinSession(sessionId: string): Promise<void> {
    try {
      const displayName = prompt('Enter your name:') || 'Guest';
      const response = await apiPost<{ success: boolean; session?: GroupSession }>(
        `/api/group/sessions/${sessionId}/join`,
        { displayName }
      );

      if (response.data?.success && response.data.session) {
        this.activeSession = response.data.session;
        this.callbacks.onSessionJoined?.(response.data.session);
        this.view = 'session';
        this.renderSession(response.data.session);
      }
    } catch (error) {
      console.error('Failed to join session:', error);
    }
  }

  private async startSession(sessionId: string): Promise<void> {
    try {
      const response = await apiPost<{ success: boolean; session: GroupSession }>(
        `/api/group/sessions/${sessionId}/start`,
        {}
      );

      if (response.data?.success) {
        this.activeSession = response.data.session;
        this.renderSession(response.data.session);
      }
    } catch (error) {
      console.error('Failed to start session:', error);
    }
  }

  private injectStyles(): void {
    if (this.styleElement) return;

    this.styleElement = document.createElement('style');
    this.styleElement.textContent = `
      .group-coaching {
        position: fixed;
        inset: 0;
        z-index: var(--z-modal, 1400);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--ma-rest, 21px);
        background: var(--backdrop-page, rgba(44, 37, 32, 0.4));
        backdrop-filter: blur(var(--glass-blur-subtle, 8px));
        opacity: 0;
        visibility: hidden;
        transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD}, visibility ${DURATION.SLOW}ms;
      }

      .group-coaching--visible {
        opacity: 1;
        visibility: visible;
      }

      .group-coaching__wrapper {
        width: 100%;
        max-width: 480px;
        max-height: 90vh;
        overflow-y: auto;
        background: var(--color-background-elevated, #fffdfb);
        border-radius: var(--radius-xl, 1.5rem);
        box-shadow: var(--shadow-2xl);
        transform: ${prefersReducedMotion() ? 'none' : 'scale(0.95)'};
        transition: transform ${DURATION.SLOW}ms ${EASING.SPRING};
      }

      .group-coaching--visible .group-coaching__wrapper {
        transform: scale(1);
      }

      .group-coaching__header {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        padding: var(--ma-rest, 21px) var(--ma-silence, 34px);
        border-bottom: 1px solid var(--color-border-subtle);
      }

      .group-coaching__icon {
        width: 24px;
        height: 24px;
        color: var(--color-accent-primary, #2d5a3d);
      }

      .group-coaching__icon svg { width: 100%; height: 100%; }

      .group-coaching__back {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        background: none;
        border: none;
        font-size: 1.25rem;
        color: var(--color-text-secondary);
        cursor: pointer;
      }

      .group-coaching__title {
        flex: 1;
        font-family: var(--font-display);
        font-size: var(--text-lg, 1.125rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary);
        margin: 0;
      }

      .group-coaching__close {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        padding: 0;
        background: var(--color-background-tertiary);
        border: none;
        border-radius: var(--radius-full);
        color: var(--color-text-secondary);
        cursor: pointer;
      }

      .group-coaching__close:hover {
        background: var(--color-background-secondary);
        color: var(--color-text-primary);
      }

      .group-coaching__close svg { width: 16px; height: 16px; }

      .group-coaching__content {
        padding: var(--ma-rest, 21px) var(--ma-silence, 34px);
      }

      .group-coaching__actions {
        display: flex;
        gap: var(--space-2, 8px);
        margin-bottom: var(--ma-rest, 21px);
      }

      .group-coaching__create-btn,
      .group-coaching__join-btn {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-2, 8px);
        padding: var(--space-3, 12px);
        font-family: var(--font-body);
        font-size: var(--text-sm);
        font-weight: var(--font-weight-medium, 500);
        border: none;
        border-radius: var(--radius-lg);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .group-coaching__create-btn {
        background: var(--color-accent-primary, #2d5a3d);
        color: white;
      }

      .group-coaching__create-btn:hover {
        background: var(--color-accent-secondary, #3d7a52);
      }

      .group-coaching__join-btn {
        background: var(--color-background-secondary);
        color: var(--color-text-primary);
      }

      .group-coaching__join-btn:hover {
        background: var(--color-background-tertiary);
      }

      .group-coaching__create-btn svg,
      .group-coaching__join-btn svg {
        width: 16px;
        height: 16px;
      }

      .group-coaching__sessions h3,
      .group-coaching__participants h3,
      .group-coaching__invite h3 {
        font-family: var(--font-body);
        font-size: var(--text-xs);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin: 0 0 var(--space-3, 12px) 0;
      }

      .group-coaching__session {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        padding: var(--space-3, 12px);
        background: var(--color-background-secondary);
        border-radius: var(--radius-lg);
        margin-bottom: var(--space-2, 8px);
      }

      .group-coaching__session-icon {
        font-size: 1.5rem;
      }

      .group-coaching__session-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .group-coaching__session-type {
        font-family: var(--font-body);
        font-size: var(--text-sm);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-primary);
      }

      .group-coaching__session-status {
        font-family: var(--font-body);
        font-size: var(--text-xs);
        color: var(--color-text-muted);
        text-transform: capitalize;
      }

      .group-coaching__session-join {
        padding: var(--space-2, 8px) var(--space-3, 12px);
        font-family: var(--font-body);
        font-size: var(--text-xs);
        font-weight: var(--font-weight-medium, 500);
        background: var(--color-accent-primary);
        color: white;
        border: none;
        border-radius: var(--radius-md);
        cursor: pointer;
      }

      .group-coaching__empty {
        text-align: center;
        padding: var(--ma-rest, 21px);
      }

      .group-coaching__empty p {
        font-family: var(--font-body);
        font-size: var(--text-sm);
        color: var(--color-text-secondary);
        margin: 0;
      }

      .group-coaching__empty-hint {
        font-size: var(--text-xs) !important;
        color: var(--color-text-muted) !important;
        margin-top: var(--space-1, 4px) !important;
      }

      .group-coaching__types {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 8px);
      }

      .group-coaching__type {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        padding: var(--space-3, 12px);
        background: var(--color-background-secondary);
        border: 2px solid transparent;
        border-radius: var(--radius-lg);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
        text-align: left;
      }

      .group-coaching__type:hover {
        background: var(--color-background-tertiary);
        border-color: var(--color-accent-primary);
      }

      .group-coaching__type-icon {
        font-size: 1.5rem;
      }

      .group-coaching__type-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .group-coaching__type-name {
        font-family: var(--font-body);
        font-size: var(--text-sm);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-primary);
      }

      .group-coaching__type-desc {
        font-family: var(--font-body);
        font-size: var(--text-xs);
        color: var(--color-text-muted);
      }

      .group-coaching__type-max {
        font-family: var(--font-body);
        font-size: var(--text-xs);
        color: var(--color-text-muted);
      }

      .group-coaching__session-header {
        display: flex;
        align-items: center;
        gap: var(--space-4, 16px);
        margin-bottom: var(--ma-rest, 21px);
      }

      .group-coaching__session-icon-lg {
        font-size: 3rem;
      }

      .group-coaching__session-meta {
        display: flex;
        flex-direction: column;
        gap: var(--space-1, 4px);
      }

      .group-coaching__session-status-badge {
        display: inline-block;
        padding: var(--space-1, 4px) var(--space-2, 8px);
        font-family: var(--font-body);
        font-size: var(--text-xs);
        font-weight: var(--font-weight-medium, 500);
        text-transform: capitalize;
        border-radius: var(--radius-full);
      }

      .group-coaching__session-status-badge--waiting {
        background: var(--color-semantic-warning, #a67c35);
        color: white;
      }

      .group-coaching__session-status-badge--active {
        background: var(--color-semantic-success, #3d7a52);
        color: white;
      }

      .group-coaching__session-id {
        font-family: var(--font-body);
        font-size: var(--text-xs);
        color: var(--color-text-muted);
      }

      .group-coaching__invite {
        margin-bottom: var(--ma-rest, 21px);
      }

      .group-coaching__invite-link {
        display: flex;
        gap: var(--space-2, 8px);
      }

      .group-coaching__invite-link input {
        flex: 1;
        padding: var(--space-2, 8px) var(--space-3, 12px);
        font-family: var(--font-body);
        font-size: var(--text-sm);
        background: var(--color-background-secondary);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-md);
        color: var(--color-text-primary);
      }

      .group-coaching__copy-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        background: var(--color-accent-primary);
        color: white;
        border: none;
        border-radius: var(--radius-md);
        cursor: pointer;
      }

      .group-coaching__copy-btn svg {
        width: 16px;
        height: 16px;
      }

      .group-coaching__participant {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--space-2, 8px) var(--space-3, 12px);
        background: var(--color-background-secondary);
        border-radius: var(--radius-md);
        margin-bottom: var(--space-1, 4px);
      }

      .group-coaching__participant--active {
        border-left: 3px solid var(--color-semantic-success);
      }

      .group-coaching__participant-name {
        font-family: var(--font-body);
        font-size: var(--text-sm);
        color: var(--color-text-primary);
      }

      .group-coaching__participant-role {
        font-family: var(--font-body);
        font-size: var(--text-xs);
        color: var(--color-text-muted);
        text-transform: capitalize;
      }

      .group-coaching__session-actions {
        margin-top: var(--ma-rest, 21px);
      }

      .group-coaching__start-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-2, 8px);
        width: 100%;
        padding: var(--space-3, 12px);
        font-family: var(--font-body);
        font-size: var(--text-sm);
        font-weight: var(--font-weight-medium, 500);
        background: var(--color-accent-primary);
        color: white;
        border: none;
        border-radius: var(--radius-lg);
        cursor: pointer;
      }

      .group-coaching__start-btn svg {
        width: 16px;
        height: 16px;
      }

      .group-coaching__loading,
      .group-coaching__error {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: var(--ma-vastness, 89px) var(--ma-rest, 21px);
      }

      .group-coaching__spinner {
        width: 32px;
        height: 32px;
        border: 3px solid var(--color-border-subtle);
        border-top-color: var(--color-accent-primary);
        border-radius: 50%;
        animation: group-spin 0.8s linear infinite;
        margin-bottom: var(--ma-breath, 13px);
      }

      @keyframes group-spin {
        to { transform: rotate(360deg); }
      }

      .group-coaching__loading p,
      .group-coaching__error p {
        font-family: var(--font-body);
        font-size: var(--text-sm);
        color: var(--color-text-muted);
        margin: 0 0 var(--ma-breath, 13px) 0;
      }

      .group-coaching__retry {
        padding: var(--space-2, 8px) var(--space-4, 16px);
        background: var(--color-background-tertiary);
        color: var(--color-text-primary);
        border: none;
        border-radius: var(--radius-md);
        cursor: pointer;
      }

      /* Dark Theme */
      [data-theme="midnight"] .group-coaching__wrapper {
        background: var(--color-background-elevated, #70605a);
      }

      [data-theme="midnight"] .group-coaching__title,
      [data-theme="midnight"] .group-coaching__session-type,
      [data-theme="midnight"] .group-coaching__type-name,
      [data-theme="midnight"] .group-coaching__participant-name {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .group-coaching__session,
      [data-theme="midnight"] .group-coaching__type,
      [data-theme="midnight"] .group-coaching__participant {
        background: var(--color-background-secondary, #60504a);
      }

      @media (max-width: 480px) {
        .group-coaching__wrapper {
          max-width: 100%;
          border-radius: var(--radius-xl) var(--radius-xl) 0 0;
          margin-top: auto;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .group-coaching,
        .group-coaching__wrapper,
        .group-coaching__type,
        .group-coaching__session {
          transition: none !important;
        }

        .group-coaching__spinner {
          animation: none;
        }
      }
    `;
    document.head.appendChild(this.styleElement);
  }

  destroy(): void {
    this.hide();
    this.panel?.remove();
    this.styleElement?.remove();
    this.panel = null;
    this.wrapper = null;
    this.styleElement = null;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let instance: GroupCoachingUI | null = null;

export function getGroupCoachingUI(): GroupCoachingUI {
  if (!instance) {
    instance = new GroupCoachingUI();
  }
  return instance;
}

export function showGroupCoaching(): void {
  getGroupCoachingUI().show();
}

export function hideGroupCoaching(): void {
  getGroupCoachingUI().hide();
}

export default GroupCoachingUI;
