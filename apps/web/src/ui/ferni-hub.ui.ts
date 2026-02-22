/**
 * Ferni Hub - "Your Day with Ferni"
 *
 * A warm, non-voice interface to see what your AI team has been up to.
 * Feels like checking in with friends, not opening a dashboard.
 *
 * "Better Than Human" - Your team works for you even when you're away.
 *
 * Sections:
 * 1. While You Were Away - Background task results
 * 2. Open Threads - Ongoing conversations to continue
 * 3. On Your Mind - Things the team is tracking for you
 * 4. Quick Connections - Start a conversation with any team member
 */

import { createLogger } from '../utils/logger.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { apiGet } from '../utils/api.js';
import { soundUI } from './sound.ui.js';
import { messageUI } from './message.ui.js';
import { getAuthState } from '../services/firebase-auth.service.js';
import {
  PERSONA_ICONS,
  SECTION_ICONS,
  getResultIcon,
  getTrackedIcon,
} from './icons/hub-icons.js';

const log = createLogger('FerniHub');

// ============================================================================
// TYPES
// ============================================================================

interface BackgroundResult {
  id: string;
  type: string;
  summary: string;
  status: 'success' | 'partial_success' | 'failed' | 'requires_action';
  priority: 'urgent' | 'high' | 'normal' | 'low';
  contactName?: string;
  capturedAt: string;
  initiatedBy: string;
  actionItems?: string[];
  requiresCallback?: boolean;
}

interface OpenThread {
  id: string;
  topic: string;
  lastMessage: string;
  personaId: string;
  personaName: string;
  updatedAt: string;
  isActive: boolean;
}

interface TrackedItem {
  id: string;
  type: 'commitment' | 'goal' | 'reminder' | 'follow_up';
  description: string;
  dueDate?: string;
  personaId: string;
  status: 'pending' | 'in_progress' | 'completed';
}

interface HubData {
  backgroundResults: BackgroundResult[];
  openThreads: OpenThread[];
  trackedItems: TrackedItem[];
  lastUpdated: string;
}

// ============================================================================
// STATE
// ============================================================================

let container: HTMLElement | null = null;
let isVisible = false;
let hubData: HubData | null = null;

// ============================================================================
// PERSONA METADATA
// ============================================================================

// BRAND COMPLIANT: Using Lucide SVG icons, NOT emoji
interface PersonaInfo {
  name: string;
  icon: string;
  color: string;
  role: string;
}

const DEFAULT_PERSONA: PersonaInfo = { name: 'Ferni', icon: PERSONA_ICONS.ferni, color: 'var(--color-ferni)', role: 'Life Coach' };

const PERSONAS: Record<string, PersonaInfo> = {
  ferni: DEFAULT_PERSONA,
  peter: { name: 'Peter', icon: PERSONA_ICONS.peter, color: 'var(--color-peter, #3a6b73)', role: 'Research' },
  alex: { name: 'Alex', icon: PERSONA_ICONS.alex, color: 'var(--color-alex, #5a6b8a)', role: 'Communications' },
  maya: { name: 'Maya', icon: PERSONA_ICONS.maya, color: 'var(--color-maya, #a67a6a)', role: 'Habits & Routines' },
  jordan: { name: 'Jordan', icon: PERSONA_ICONS.jordan, color: 'var(--color-jordan, #c4856a)', role: 'Events & Planning' },
  nayan: { name: 'Nayan', icon: PERSONA_ICONS.nayan, color: 'var(--color-nayan, #b8956a)', role: 'Wisdom' },
};

/** Get persona info with guaranteed fallback */
function getPersona(id: string): PersonaInfo {
  return PERSONAS[id] ?? DEFAULT_PERSONA;
}

// ============================================================================
// DATA FETCHING
// ============================================================================

async function fetchHubData(): Promise<HubData> {
  const authState = getAuthState();
  const userId = authState?.uid;

  if (!userId) {
    return {
      backgroundResults: [],
      openThreads: [],
      trackedItems: [],
      lastUpdated: new Date().toISOString(),
    };
  }

  try {
    // Fetch background results
    const resultsResponse = await apiGet<{ results?: unknown[] }>(`/api/background-results/pending?userId=${userId}&limit=10`);
    const resultsData = resultsResponse.ok && resultsResponse.data ? resultsResponse.data : { results: [] };

    // Fetch open threads (conversation threads API)
    const threadsResponse = await apiGet<{ threads?: unknown[] }>(`/api/conversations/threads?userId=${userId}&status=open&limit=5`);
    const threadsData = threadsResponse.ok && threadsResponse.data ? threadsResponse.data : { threads: [] };

    // Fetch tracked items (commitments, goals)
    const trackedResponse = await apiGet<{ items?: unknown[] }>(`/api/commitments?userId=${userId}&status=pending&limit=8`);
    const trackedData = trackedResponse.ok && trackedResponse.data ? trackedResponse.data : { items: [] };

    return {
      backgroundResults: (resultsData.results || []) as BackgroundResult[],
      openThreads: (threadsData.threads || []) as OpenThread[],
      trackedItems: (trackedData.items || []) as TrackedItem[],
      lastUpdated: new Date().toISOString(),
    };
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to fetch hub data');
    return {
      backgroundResults: [],
      openThreads: [],
      trackedItems: [],
      lastUpdated: new Date().toISOString(),
    };
  }
}

// ============================================================================
// RENDERING
// ============================================================================

function createContainer(): HTMLElement {
  // Clean up existing
  document.querySelectorAll('.ferni-hub-overlay').forEach((el) => el.remove());

  const overlay = document.createElement('div');
  overlay.className = 'ferni-hub-overlay';
  overlay.innerHTML = `
    <div class="ferni-hub-backdrop"></div>
    <div class="ferni-hub-panel">
      <header class="ferni-hub-header">
        <div class="ferni-hub-greeting">
          <span class="ferni-hub-wave">${SECTION_ICONS.hand}</span>
          <div>
            <h1>Your Day with Ferni</h1>
            <p class="ferni-hub-subtitle">Here's what your team has been up to</p>
          </div>
        </div>
        <button class="ferni-hub-close" aria-label="Close">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </header>

      <div class="ferni-hub-content">
        <div class="ferni-hub-loading">
          <div class="ferni-hub-loading-dots">
            <span></span><span></span><span></span>
          </div>
          <p>Checking in with your team...</p>
        </div>
      </div>

      <footer class="ferni-hub-footer">
        <button class="ferni-hub-talk-btn">
          <span class="ferni-hub-talk-icon">${SECTION_ICONS.mic}</span>
          Start a Conversation
        </button>
      </footer>
    </div>
  `;

  // Event listeners
  overlay.querySelector('.ferni-hub-backdrop')?.addEventListener('click', hide);
  overlay.querySelector('.ferni-hub-close')?.addEventListener('click', hide);
  overlay.querySelector('.ferni-hub-talk-btn')?.addEventListener('click', () => {
    hide();
    // Trigger voice connection
    window.dispatchEvent(new CustomEvent('ferni:start-conversation'));
  });

  document.body.appendChild(overlay);
  addStyles();

  return overlay;
}

function renderContent(data: HubData): void {
  const content = container?.querySelector('.ferni-hub-content');
  if (!content) return;

  const sections: string[] = [];

  // 1. While You Were Away
  if (data.backgroundResults.length > 0) {
    sections.push(renderWhileYouWereAway(data.backgroundResults));
  }

  // 2. Open Threads
  if (data.openThreads.length > 0) {
    sections.push(renderOpenThreads(data.openThreads));
  }

  // 3. On Your Mind (tracked items)
  if (data.trackedItems.length > 0) {
    sections.push(renderTrackedItems(data.trackedItems));
  }

  // 4. Quick Connections (always show)
  sections.push(renderQuickConnections());

  // Empty state
  if (data.backgroundResults.length === 0 && data.openThreads.length === 0 && data.trackedItems.length === 0) {
    sections.unshift(renderEmptyState());
  }

  content.innerHTML = sections.join('');

  // Add event listeners to cards
  attachCardListeners();
}

function renderWhileYouWereAway(results: BackgroundResult[]): string {
  const cards = results.map((result) => {
    const persona = getPersona(result.initiatedBy);
    const icon = getResultIcon(result.type);
    const timeAgo = formatTimeAgo(result.capturedAt);
    const statusClass = result.status === 'success' ? 'success' : result.status === 'failed' ? 'failed' : 'pending';

    return `
      <div class="ferni-hub-card ferni-hub-result-card ${statusClass}" data-result-id="${result.id}" role="button" tabindex="0">
        <div class="ferni-hub-card-icon" style="background: ${persona.color}20; color: ${persona.color}">
          ${icon}
        </div>
        <div class="ferni-hub-card-content">
          <div class="ferni-hub-card-meta">
            <span class="ferni-hub-card-persona">${persona.name}</span>
            <span class="ferni-hub-card-time">${timeAgo}</span>
          </div>
          <p class="ferni-hub-card-summary">${result.summary}</p>
          ${result.actionItems && result.actionItems.length > 0 ? `
            <div class="ferni-hub-card-actions">
              ${result.actionItems.slice(0, 2).map((item) => `<span class="ferni-hub-action-chip"><span class="ferni-hub-action-icon">${SECTION_ICONS.fileText}</span> ${item}</span>`).join('')}
            </div>
          ` : ''}
        </div>
        ${result.requiresCallback ? '<span class="ferni-hub-card-badge">Needs follow-up</span>' : ''}
      </div>
    `;
  }).join('');

  return `
    <section class="ferni-hub-section">
      <h2 class="ferni-hub-section-title">
        <span class="ferni-hub-section-icon">${SECTION_ICONS.sparkles}</span>
        While You Were Away
      </h2>
      <div class="ferni-hub-cards">
        ${cards}
      </div>
    </section>
  `;
}

function renderOpenThreads(threads: OpenThread[]): string {
  const cards = threads.map((thread) => {
    const persona = getPersona(thread.personaId);
    const timeAgo = formatTimeAgo(thread.updatedAt);

    return `
      <div class="ferni-hub-card ferni-hub-thread-card" data-thread-id="${thread.id}" data-persona="${thread.personaId}" role="button" tabindex="0">
        <div class="ferni-hub-card-avatar" style="background: ${persona.color}">
          ${persona.icon}
        </div>
        <div class="ferni-hub-card-content">
          <div class="ferni-hub-card-meta">
            <span class="ferni-hub-card-persona">${persona.name}</span>
            <span class="ferni-hub-card-time">${timeAgo}</span>
          </div>
          <p class="ferni-hub-card-topic">${thread.topic}</p>
          <p class="ferni-hub-card-preview">${truncate(thread.lastMessage, 80)}</p>
        </div>
        <span class="ferni-hub-continue-btn">Continue →</span>
      </div>
    `;
  }).join('');

  return `
    <section class="ferni-hub-section">
      <h2 class="ferni-hub-section-title">
        <span class="ferni-hub-section-icon">${SECTION_ICONS.messageCircle}</span>
        Open Conversations
      </h2>
      <div class="ferni-hub-cards">
        ${cards}
      </div>
    </section>
  `;
}

function renderTrackedItems(items: TrackedItem[]): string {
  const cards = items.map((item) => {
    const persona = getPersona(item.personaId);
    const icon = getTrackedIcon(item.type);
    const dueText = item.dueDate ? `Due ${formatDate(item.dueDate)}` : '';

    return `
      <div class="ferni-hub-card ferni-hub-tracked-card" data-item-id="${item.id}">
        <div class="ferni-hub-card-icon" style="background: ${persona.color}20; color: ${persona.color}">
          ${icon}
        </div>
        <div class="ferni-hub-card-content">
          <p class="ferni-hub-card-description">${item.description}</p>
          <div class="ferni-hub-card-meta">
            <span class="ferni-hub-card-persona">${persona.name} is tracking</span>
            ${dueText ? `<span class="ferni-hub-card-due">${dueText}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <section class="ferni-hub-section">
      <h2 class="ferni-hub-section-title">
        <span class="ferni-hub-section-icon">${SECTION_ICONS.clipboardList}</span>
        On Your Mind
      </h2>
      <p class="ferni-hub-section-subtitle">Things your team is keeping track of for you</p>
      <div class="ferni-hub-cards ferni-hub-cards-compact">
        ${cards}
      </div>
    </section>
  `;
}

function renderQuickConnections(): string {
  const personaCards = Object.entries(PERSONAS).map(([id, persona]) => `
    <button class="ferni-hub-persona-btn" data-persona="${id}" style="--persona-color: ${persona.color}">
      <span class="ferni-hub-persona-icon">${persona.icon}</span>
      <span class="ferni-hub-persona-name">${persona.name}</span>
      <span class="ferni-hub-persona-role">${persona.role}</span>
    </button>
  `).join('');

  return `
    <section class="ferni-hub-section ferni-hub-section-connections">
      <h2 class="ferni-hub-section-title">
        <span class="ferni-hub-section-icon">${SECTION_ICONS.users}</span>
        Quick Connections
      </h2>
      <p class="ferni-hub-section-subtitle">Start a conversation with anyone on your team</p>
      <div class="ferni-hub-persona-grid">
        ${personaCards}
      </div>
    </section>
  `;
}

function renderEmptyState(): string {
  return `
    <div class="ferni-hub-empty">
      <div class="ferni-hub-empty-icon">${SECTION_ICONS.star}</div>
      <h3>All caught up!</h3>
      <p>Your team is here whenever you need them. Start a conversation or check back later.</p>
    </div>
  `;
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function attachCardListeners(): void {
  // Thread cards - continue conversation
  container?.querySelectorAll('.ferni-hub-thread-card').forEach((card) => {
    card.addEventListener('click', () => {
      const personaId = card.getAttribute('data-persona');
      const threadId = card.getAttribute('data-thread-id');
      if (personaId) {
        hide();
        // Start conversation with context
        window.dispatchEvent(new CustomEvent('ferni:start-conversation', {
          detail: { personaId, threadId },
        }));
      }
    });
  });

  // Persona quick connect buttons
  container?.querySelectorAll('.ferni-hub-persona-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const personaId = btn.getAttribute('data-persona');
      if (personaId) {
        soundUI.play('click');
        hide();
        window.dispatchEvent(new CustomEvent('ferni:start-conversation', {
          detail: { personaId },
        }));
      }
    });
  });

  // Result cards - show details
  container?.querySelectorAll('.ferni-hub-result-card').forEach((card) => {
    card.addEventListener('click', () => {
      const resultId = card.getAttribute('data-result-id');
      log.debug({ resultId }, 'Result card clicked');
      // Could expand to show more details
    });
  });
}

// ============================================================================
// HELPERS
// ============================================================================
// NOTE: getResultIcon and getTrackedIcon are imported from ./icons/hub-icons.js

function formatTimeAgo(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

// ============================================================================
// PUBLIC API
// ============================================================================

export async function show(): Promise<void> {
  if (isVisible) return;

  log.info('Opening Ferni Hub');
  soundUI.play('open');

  container = createContainer();
  isVisible = true;

  // Animate in
  requestAnimationFrame(() => {
    container?.classList.add('visible');
  });

  // Fetch and render data
  hubData = await fetchHubData();
  renderContent(hubData);
}

export function hide(): void {
  if (!isVisible || !container) return;

  log.info('Closing Ferni Hub');
  soundUI.play('close');

  container.classList.remove('visible');

  setTimeout(() => {
    container?.remove();
    container = null;
    isVisible = false;
  }, DURATION.SLOW);
}

export function toggle(): void {
  if (isVisible) {
    hide();
  } else {
    void show();
  }
}

export async function refresh(): Promise<void> {
  if (!isVisible) return;
  hubData = await fetchHubData();
  renderContent(hubData);
}

// ============================================================================
// STYLES
// ============================================================================

function addStyles(): void {
  if (document.getElementById('ferni-hub-styles')) return;

  const style = document.createElement('style');
  style.id = 'ferni-hub-styles';
  style.textContent = `
    .ferni-hub-overlay {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal, 9999);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD};
    }

    .ferni-hub-overlay.visible {
      opacity: 1;
    }

    .ferni-hub-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(44, 37, 32, 0.6);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
    }

    .ferni-hub-panel {
      position: relative;
      width: 90%;
      max-width: 560px;
      max-height: 85vh;
      background: var(--color-background-elevated, #FFFDFB);
      border-radius: var(--radius-2xl, 24px);
      box-shadow: var(--shadow-2xl);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transform: scale(0.95) translateY(10px);
      transition: transform ${DURATION.SLOW}ms ${EASING.SPRING};
    }

    .ferni-hub-overlay.visible .ferni-hub-panel {
      transform: scale(1) translateY(0);
    }

    /* Header */
    .ferni-hub-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-6, 24px);
      border-bottom: 1px solid var(--color-border-subtle, rgba(0,0,0,0.06));
    }

    .ferni-hub-greeting {
      display: flex;
      align-items: center;
      gap: var(--space-4, 16px);
    }

    .ferni-hub-wave {
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-ferni, #4a6741);
      animation: wave 1.5s ease-in-out infinite;
    }

    .ferni-hub-wave svg {
      width: 100%;
      height: 100%;
    }

    @keyframes wave {
      0%, 100% { transform: rotate(0deg); }
      25% { transform: rotate(20deg); }
      75% { transform: rotate(-10deg); }
    }

    .ferni-hub-greeting h1 {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
      margin: 0;
    }

    .ferni-hub-subtitle {
      font-size: 0.875rem;
      color: var(--color-text-secondary, #6B5E54);
      margin: 4px 0 0;
    }

    .ferni-hub-close {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      border: none;
      background: var(--color-background-subtle, #f5f0eb);
      color: var(--color-text-secondary);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background ${DURATION.FAST}ms, transform ${DURATION.FAST}ms;
    }

    .ferni-hub-close:hover {
      background: var(--color-background-muted, #ebe5df);
      transform: scale(1.05);
    }

    /* Content */
    .ferni-hub-content {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-4, 16px) var(--space-6, 24px);
    }

    /* Loading */
    .ferni-hub-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--space-12, 48px);
      color: var(--color-text-secondary);
    }

    .ferni-hub-loading-dots {
      display: flex;
      gap: 6px;
      margin-bottom: var(--space-4);
    }

    .ferni-hub-loading-dots span {
      width: 8px;
      height: 8px;
      background: var(--color-ferni, #4a6741);
      border-radius: 50%;
      animation: bounce 1.4s ease-in-out infinite;
    }

    .ferni-hub-loading-dots span:nth-child(2) { animation-delay: 0.2s; }
    .ferni-hub-loading-dots span:nth-child(3) { animation-delay: 0.4s; }

    @keyframes bounce {
      0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
      40% { transform: scale(1); opacity: 1; }
    }

    /* Sections */
    .ferni-hub-section {
      margin-bottom: var(--space-6, 24px);
    }

    .ferni-hub-section-title {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      font-size: 1rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-2, 8px);
    }

    .ferni-hub-section-icon {
      width: 20px;
      height: 20px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--color-ferni, #4a6741);
    }

    .ferni-hub-section-icon svg {
      width: 100%;
      height: 100%;
    }

    .ferni-hub-section-subtitle {
      font-size: 0.8125rem;
      color: var(--color-text-muted);
      margin: 0 0 var(--space-3, 12px);
    }

    /* Cards */
    .ferni-hub-cards {
      display: flex;
      flex-direction: column;
      gap: var(--space-3, 12px);
    }

    .ferni-hub-cards-compact {
      gap: var(--space-2, 8px);
    }

    .ferni-hub-card {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3, 12px);
      padding: var(--space-4, 16px);
      background: var(--color-background-subtle, #faf7f4);
      border-radius: var(--radius-lg, 12px);
      cursor: pointer;
      transition: background ${DURATION.FAST}ms, transform ${DURATION.FAST}ms;
      position: relative;
    }

    .ferni-hub-card:hover {
      background: var(--color-background-muted, #f0ebe5);
      transform: translateX(2px);
    }

    .ferni-hub-card-icon {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.25rem;
      flex-shrink: 0;
    }

    .ferni-hub-card-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      color: white;
      padding: 8px;
      box-sizing: border-box;
    }

    .ferni-hub-card-avatar svg {
      width: 100%;
      height: 100%;
    }

    .ferni-hub-card-content {
      flex: 1;
      min-width: 0;
    }

    .ferni-hub-card-meta {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      margin-bottom: 4px;
    }

    .ferni-hub-card-persona {
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--color-text-primary);
    }

    .ferni-hub-card-time {
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }

    .ferni-hub-card-summary,
    .ferni-hub-card-topic {
      font-size: 0.9375rem;
      color: var(--color-text-primary);
      margin: 0;
      line-height: 1.4;
    }

    .ferni-hub-card-preview,
    .ferni-hub-card-description {
      font-size: 0.8125rem;
      color: var(--color-text-secondary);
      margin: 4px 0 0;
      line-height: 1.4;
    }

    .ferni-hub-card-actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2, 8px);
      margin-top: var(--space-2, 8px);
    }

    .ferni-hub-action-chip {
      font-size: 0.75rem;
      padding: 4px 8px;
      background: var(--color-ferni-tint, rgba(74, 103, 65, 0.1));
      color: var(--color-ferni);
      border-radius: var(--radius-full, 100px);
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .ferni-hub-action-icon {
      width: 12px;
      height: 12px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .ferni-hub-action-icon svg {
      width: 100%;
      height: 100%;
    }

    .ferni-hub-card-badge {
      position: absolute;
      top: var(--space-3);
      right: var(--space-3);
      font-size: 0.6875rem;
      padding: 4px 8px;
      background: var(--color-warning-subtle, #fff3cd);
      color: var(--color-warning-text, #856404);
      border-radius: var(--radius-full);
      font-weight: 500;
    }

    .ferni-hub-card-due {
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }

    .ferni-hub-continue-btn {
      font-size: 0.8125rem;
      color: var(--color-ferni);
      font-weight: 500;
      opacity: 0;
      transition: opacity ${DURATION.FAST}ms;
    }

    .ferni-hub-card:hover .ferni-hub-continue-btn {
      opacity: 1;
    }

    /* Result status */
    .ferni-hub-result-card.success .ferni-hub-card-icon {
      background: var(--color-success-subtle, #d4edda) !important;
      color: var(--color-success, #28a745) !important;
    }

    .ferni-hub-result-card.failed .ferni-hub-card-icon {
      background: var(--color-error-subtle, #f8d7da) !important;
      color: var(--color-error, #dc3545) !important;
    }

    /* Persona grid */
    .ferni-hub-section-connections {
      padding-top: var(--space-4);
      border-top: 1px solid var(--color-border-subtle);
    }

    .ferni-hub-persona-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--space-3, 12px);
    }

    .ferni-hub-persona-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-1, 4px);
      padding: var(--space-4, 16px) var(--space-2, 8px);
      background: var(--color-background-subtle);
      border: 2px solid transparent;
      border-radius: var(--radius-lg, 12px);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .ferni-hub-persona-btn:hover {
      background: var(--color-background-muted);
      border-color: var(--persona-color);
      transform: translateY(-2px);
    }

    .ferni-hub-persona-icon {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .ferni-hub-persona-icon svg {
      width: 100%;
      height: 100%;
    }

    .ferni-hub-persona-name {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--color-text-primary);
    }

    .ferni-hub-persona-role {
      font-size: 0.6875rem;
      color: var(--color-text-muted);
    }

    /* Empty state */
    .ferni-hub-empty {
      text-align: center;
      padding: var(--space-8, 32px);
    }

    .ferni-hub-empty-icon {
      width: 64px;
      height: 64px;
      margin: 0 auto var(--space-4);
      color: var(--color-ferni, #4a6741);
    }

    .ferni-hub-empty-icon svg {
      width: 100%;
      height: 100%;
    }

    .ferni-hub-empty h3 {
      font-size: 1.25rem;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-2);
    }

    .ferni-hub-empty p {
      font-size: 0.9375rem;
      color: var(--color-text-secondary);
      margin: 0;
    }

    /* Footer */
    .ferni-hub-footer {
      padding: var(--space-4, 16px) var(--space-6, 24px);
      border-top: 1px solid var(--color-border-subtle);
    }

    .ferni-hub-talk-btn {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2, 8px);
      padding: var(--space-4, 16px);
      background: var(--color-ferni, #4a6741);
      color: white;
      border: none;
      border-radius: var(--radius-lg, 12px);
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .ferni-hub-talk-btn:hover {
      background: var(--color-ferni-hover, #3d5a35);
      transform: scale(1.02);
    }

    .ferni-hub-talk-icon {
      width: 24px;
      height: 24px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .ferni-hub-talk-icon svg {
      width: 100%;
      height: 100%;
    }

    /* Dark mode */
    @media (prefers-color-scheme: dark) {
      .ferni-hub-panel {
        background: var(--color-background-elevated-dark, #2a2520);
      }

      .ferni-hub-greeting h1,
      .ferni-hub-section-title,
      .ferni-hub-card-persona,
      .ferni-hub-card-summary,
      .ferni-hub-card-topic,
      .ferni-hub-persona-name,
      .ferni-hub-empty h3 {
        color: var(--color-text-primary-dark, #faf6f0);
      }

      .ferni-hub-subtitle,
      .ferni-hub-section-subtitle,
      .ferni-hub-card-preview,
      .ferni-hub-card-description,
      .ferni-hub-empty p {
        color: var(--color-text-secondary-dark, #c9bfb4);
      }

      .ferni-hub-card,
      .ferni-hub-persona-btn {
        background: var(--color-background-subtle-dark, #352f2a);
      }

      .ferni-hub-card:hover,
      .ferni-hub-persona-btn:hover {
        background: var(--color-background-muted-dark, #403833);
      }
    }

    /* Mobile */
    @media (max-width: 480px) {
      .ferni-hub-panel {
        width: 100%;
        max-width: none;
        max-height: 100vh;
        border-radius: 0;
      }

      .ferni-hub-persona-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }
  `;

  document.head.appendChild(style);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

export function init(): void {
  log.info('Ferni Hub initialized');

  // Listen for keyboard shortcut
  window.addEventListener('keydown', (e) => {
    // Cmd/Ctrl + H to toggle hub
    if ((e.metaKey || e.ctrlKey) && e.key === 'h') {
      e.preventDefault();
      toggle();
    }
  });
}

// Export for app.ts
export const ferniHubUI = {
  init,
  show,
  hide,
  toggle,
  refresh,
};
