/**
 * Conversation Memory Browser UI
 *
 * Browse past conversations, see what Ferni remembers about you,
 * and explore topics discussed over time.
 *
 * Design: Follows Ferni's warm, Apple-inspired aesthetic with
 * timeline visualization and searchable conversation history.
 */

import { t } from '../i18n/index.js';
import { createLogger } from '../utils/logger.js';
import { apiGet } from '../utils/api.js';
import { trapFocus } from '../utils/accessibility.js';
// Animation constants imported but not currently used - DURATION will be used for transitions
import '../config/animation-constants.js';

const log = createLogger('ConversationMemory');

// Debounce utility
function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  ms: number
): (...args: Args) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  };
}

// ============================================================================
// TYPES
// ============================================================================

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface Conversation {
  id: string;
  startedAt: string;
  endedAt?: string;
  summary?: string;
  topics: string[];
  turnCount: number;
  voiceVerified: boolean;
  turns?: ConversationTurn[];
}

export interface ConversationMemory {
  hasMemory: boolean;
  totalConversations: number;
  totalDuration?: number;
  firstConversation?: string;
  topics?: string[];
  rememberedDetails?: string[];
}

export interface ConversationContext {
  recentTopics: string[];
  unfinishedThreads: string[];
  rememberedDetails: string[];
  suggestedFollowUps: string[];
}

export interface ConversationMemoryCallbacks {
  onConversationSelect?: (conversation: Conversation) => void;
  onTopicSelect?: (topic: string) => void;
}

// ============================================================================
// STATE
// ============================================================================

let modal: HTMLElement | null = null;
let conversations: Conversation[] = [];
let memory: ConversationMemory | null = null;
let context: ConversationContext | null = null;
let selectedConversation: Conversation | null = null;
let callbacks: ConversationMemoryCallbacks = {};
let isLoading = false;
let hasError = false;
let errorMessage = '';
let searchQuery = '';
let focusTrapCleanup: (() => void) | null = null;
let previousActiveElement: HTMLElement | null = null;
let activeTab = 'conversations';

// ============================================================================
// STYLES
// ============================================================================

const styles = `
  .memory-modal-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-tooltip);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--duration-normal, 200ms) ease-out;
  }
  
  .memory-modal-overlay.visible {
    opacity: 1;
    pointer-events: auto;
  }
  
  .memory-modal-backdrop {
    position: absolute;
    inset: 0;
    background: var(--glass-backdrop-bg, rgba(44, 37, 32, 0.4));
    backdrop-filter: blur(var(--glass-blur-thick, 24px));
    -webkit-backdrop-filter: blur(var(--glass-blur-thick, 24px));
  }

  .memory-modal {
    position: relative;
    width: 95%;
    max-width: clamp(448px, 90vw, 640px);
    max-height: 90vh;
    /* Glass modal styling */
    background: var(--glass-thick-bg, rgba(255, 255, 255, 0.12));
    backdrop-filter: blur(var(--glass-blur-thick, 24px));
    -webkit-backdrop-filter: blur(var(--glass-blur-thick, 24px));
    border: 1px solid var(--glass-thick-border, rgba(255, 255, 255, 0.14));
    border-radius: var(--radius-xl, 20px);
    box-shadow: var(--glass-shadow-thick, 0 8px 12px rgba(0, 0, 0, 0.10), 0 16px 32px rgba(0, 0, 0, 0.08));
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transform: scale(0.95);
    transition: transform var(--duration-slow, 300ms) var(--ease-spring);
  }

  @supports not (backdrop-filter: blur(1px)) {
    .memory-modal {
      background: var(--color-background-elevated, #fffdfb);
    }
  }
  
  .memory-modal-overlay.visible .memory-modal {
    transform: scale(1);
  }
  
  .memory-modal__header {
    padding: var(--space-6, 24px) var(--space-6, 24px) var(--space-4, 16px);
    border-bottom: 1px solid var(--color-border-subtle, rgba(112, 96, 90, 0.1));
    flex-shrink: 0;
  }
  
  .memory-modal__eyebrow {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-peter, #3a6b73);
    margin-bottom: var(--space-1, 4px);
  }
  
  .memory-modal__title {
    font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
    font-size: 24px;
    font-weight: 700;
    color: var(--color-text-primary, #2c2520);
    margin: 0;
  }
  
  .memory-modal__subtitle {
    font-size: 14px;
    color: var(--color-text-secondary, #70605a);
    margin-top: var(--space-1, 4px);
  }
  
  .memory-modal__close {
    position: absolute;
    top: var(--space-4, 16px);
    right: var(--space-4, 16px);
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: var(--color-background-subtle, rgba(112, 96, 90, 0.05));
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-secondary, #70605a);
    transition: all var(--duration-fast, 100ms) ease;
  }
  
  .memory-modal__close:hover {
    background: var(--color-background-hover, rgba(112, 96, 90, 0.1));
    color: var(--color-text-primary, #2c2520);
  }
  
  /* Stats Bar */
  .memory-stats {
    display: flex;
    gap: var(--space-4, 16px);
    padding: var(--space-4, 16px) var(--space-6, 24px);
    background: var(--color-background-subtle, rgba(112, 96, 90, 0.03));
    border-bottom: 1px solid var(--color-border-subtle, rgba(112, 96, 90, 0.1));
    flex-shrink: 0;
  }
  
  .memory-stat {
    flex: 1;
    text-align: center;
  }
  
  .memory-stat__value {
    font-size: 24px;
    font-weight: 700;
    color: var(--color-text-primary, #2c2520);
    font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
  }
  
  .memory-stat__label {
    font-size: 12px;
    color: var(--color-text-secondary, #70605a);
    margin-top: 2px;
  }
  
  /* Search */
  .memory-search {
    padding: var(--space-3, 12px) var(--space-6, 24px);
    border-bottom: 1px solid var(--color-border-subtle, rgba(112, 96, 90, 0.1));
    flex-shrink: 0;
  }
  
  .memory-search__input {
    width: 100%;
    padding: var(--space-3, 12px) var(--space-4, 16px);
    padding-left: 40px;
    border: 1px solid var(--color-border-subtle, rgba(112, 96, 90, 0.15));
    border-radius: var(--radius-full, 9999px);
    font-size: 15px;
    background: var(--color-background-elevated, #fffdfb);
    color: var(--color-text-primary, #2c2520);
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='%2370605a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cline x1='21' y1='21' x2='16.65' y2='16.65'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: 14px center;
  }
  
  .memory-search__input:focus {
    outline: none;
    border-color: var(--color-peter, #3a6b73);
    box-shadow: 0 0 0 3px rgba(58, 107, 115, 0.1);
  }
  
  .memory-search__input::placeholder {
    color: var(--color-text-muted, #a89a94);
  }
  
  /* Tabs */
  .memory-tabs {
    display: flex;
    padding: 0 var(--space-6, 24px);
    gap: var(--space-1, 4px);
    border-bottom: 1px solid var(--color-border-subtle, rgba(112, 96, 90, 0.1));
    flex-shrink: 0;
  }
  
  .memory-tab {
    padding: var(--space-3, 12px) var(--space-4, 16px);
    background: none;
    border: none;
    font-size: 14px;
    font-weight: 500;
    color: var(--color-text-secondary, #70605a);
    cursor: pointer;
    position: relative;
    transition: color var(--duration-fast, 100ms) ease;
  }
  
  .memory-tab:hover {
    color: var(--color-text-primary, #2c2520);
  }
  
  .memory-tab.active {
    color: var(--color-peter, #3a6b73);
  }
  
  .memory-tab.active::after {
    content: '';
    position: absolute;
    bottom: -1px;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--color-peter, #3a6b73);
    border-radius: 2px 2px 0 0;
  }
  
  /* Content */
  .memory-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-4, 16px) var(--space-6, 24px);
  }
  
  /* Conversation List */
  .memory-conversations {
    display: flex;
    flex-direction: column;
    gap: var(--space-3, 12px);
  }
  
  .memory-conversation {
    display: flex;
    gap: var(--space-3, 12px);
    padding: var(--space-4, 16px);
    background: var(--color-background-subtle, rgba(112, 96, 90, 0.03));
    border-radius: var(--radius-lg, 12px);
    border: 1px solid transparent;
    cursor: pointer;
    transition: all var(--duration-fast, 100ms) ease;
  }
  
  .memory-conversation:hover {
    background: var(--color-background-hover, rgba(112, 96, 90, 0.06));
    border-color: var(--color-border-subtle, rgba(112, 96, 90, 0.1));
  }
  
  .memory-conversation.selected {
    background: rgba(58, 107, 115, 0.08);
    border-color: var(--color-peter, #3a6b73);
  }
  
  .memory-conversation__timeline {
    width: 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
    flex-shrink: 0;
  }
  
  .memory-conversation__dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--color-peter, #3a6b73);
    margin-bottom: var(--space-1, 4px);
  }
  
  .memory-conversation__line {
    flex: 1;
    width: 2px;
    background: var(--color-border-subtle, rgba(112, 96, 90, 0.1));
    min-height: 20px;
  }
  
  .memory-conversation__content {
    flex: 1;
    min-width: 0;
  }
  
  .memory-conversation__date {
    font-size: 12px;
    font-weight: 500;
    color: var(--color-text-muted, #a89a94);
    margin-bottom: var(--space-1, 4px);
  }
  
  .memory-conversation__summary {
    font-size: 15px;
    color: var(--color-text-primary, #2c2520);
    margin-bottom: var(--space-2, 8px);
    line-height: 1.4;
  }
  
  .memory-conversation__topics {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1, 4px);
  }
  
  .memory-topic-tag {
    display: inline-block;
    padding: 2px 8px;
    background: var(--persona-tint, rgba(58, 107, 115, 0.1));
    color: var(--color-peter, #3a6b73);
    border-radius: var(--radius-full, 9999px);
    font-size: 11px;
    font-weight: 500;
  }
  
  .memory-conversation__meta {
    display: flex;
    gap: var(--space-3, 12px);
    font-size: 12px;
    color: var(--color-text-muted, #a89a94);
    margin-top: var(--space-2, 8px);
  }
  
  .memory-conversation__verified {
    color: var(--color-ferni, #4a6741);
  }
  
  /* Remembered Details */
  .memory-details {
    display: flex;
    flex-direction: column;
    gap: var(--space-3, 12px);
  }
  
  .memory-detail {
    display: flex;
    gap: var(--space-3, 12px);
    padding: var(--space-3, 12px);
    background: var(--color-background-subtle, rgba(112, 96, 90, 0.03));
    border-radius: var(--radius-lg, 12px);
  }
  
  .memory-detail__icon {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: rgba(74, 103, 65, 0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--color-ferni, #4a6741);
  }
  
  .memory-detail__content {
    flex: 1;
  }
  
  .memory-detail__text {
    font-size: 15px;
    color: var(--color-text-primary, #2c2520);
    line-height: 1.4;
  }
  
  .memory-detail__source {
    font-size: 12px;
    color: var(--color-text-muted, #a89a94);
    margin-top: var(--space-1, 4px);
  }
  
  /* Topics View */
  .memory-topics-grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2, 8px);
  }
  
  .memory-topic-pill {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1, 4px);
    padding: var(--space-2, 8px) var(--space-3, 12px);
    background: var(--color-background-subtle, rgba(112, 96, 90, 0.05));
    border: 1px solid var(--color-border-subtle, rgba(112, 96, 90, 0.1));
    border-radius: var(--radius-full, 9999px);
    cursor: pointer;
    transition: all var(--duration-fast, 100ms) ease;
    font-size: 14px;
    color: var(--color-text-primary, #2c2520);
  }
  
  .memory-topic-pill:hover {
    background: var(--color-background-hover, rgba(112, 96, 90, 0.1));
    border-color: var(--color-peter, #3a6b73);
  }
  
  .memory-topic-pill__count {
    font-size: 12px;
    color: var(--color-text-muted, #a89a94);
  }
  
  /* Empty State */
  .memory-empty {
    text-align: center;
    padding: var(--space-12, 48px) var(--space-4, 16px);
    color: var(--color-text-secondary, #70605a);
  }
  
  .memory-empty__icon {
    font-size: 48px;
    margin-bottom: var(--space-3, 12px);
    opacity: 0.5;
  }
  
  .memory-empty__text {
    font-size: 15px;
    max-width: min(280px, 100%);
    margin: 0 auto;
  }
  
  /* Loading */
  .memory-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-12, 48px);
  }
  
  .memory-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--color-border-subtle, rgba(112, 96, 90, 0.1));
    border-top-color: var(--color-peter, #3a6b73);
    border-radius: 50%;
    animation: memory-spin 1s linear infinite;
  }
  
  @keyframes memory-spin {
    to { transform: rotate(360deg); }
  }
  
  /* Footer */
  .memory-modal__footer {
    padding: var(--space-4, 16px) var(--space-6, 24px);
    border-top: 1px solid var(--color-border-subtle, rgba(112, 96, 90, 0.1));
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
  }
  
  .memory-modal__footer-info {
    font-size: 13px;
    color: var(--color-text-muted, #a89a94);
  }
  
  .memory-btn {
    padding: var(--space-3, 12px) var(--space-5, 20px);
    border-radius: var(--radius-full, 9999px);
    font-size: 15px;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast, 100ms) ease;
    border: none;
    background: var(--color-background-subtle, rgba(112, 96, 90, 0.05));
    color: var(--color-text-primary, #2c2520);
  }
  
  .memory-btn:hover {
    background: var(--color-background-hover, rgba(112, 96, 90, 0.1));
  }
  
  /* Loading Skeleton */
  .memory-stats-loading {
    display: flex;
    gap: var(--space-4, 16px);
  }
  
  .memory-stat-skeleton {
    flex: 1;
    text-align: center;
    padding: var(--space-2, 8px);
  }
  
  .memory-skeleton {
    background: linear-gradient(90deg, 
      var(--color-background-subtle, rgba(112, 96, 90, 0.08)) 25%,
      var(--color-background-hover, rgba(112, 96, 90, 0.12)) 50%,
      var(--color-background-subtle, rgba(112, 96, 90, 0.08)) 75%
    );
    background-size: 200% 100%;
    animation: memory-shimmer 1.5s infinite;
    border-radius: var(--radius-sm, 4px);
  }
  
  .memory-skeleton--value {
    height: 28px;
    width: 40px;
    margin: 0 auto var(--space-1, 4px);
    border-radius: var(--radius-md, 8px);
  }
  
  .memory-skeleton--label {
    height: 14px;
    width: 70px;
    margin: 0 auto;
  }
  
  @keyframes memory-shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
  
  /* Error State */
  .memory-error {
    text-align: center;
    padding: var(--space-8, 32px) var(--space-4, 16px);
    color: var(--color-text-secondary, #70605a);
  }
  
  .memory-error__icon {
    font-size: 48px;
    margin-bottom: var(--space-3, 12px);
    opacity: 0.5;
  }
  
  .memory-error__title {
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text-primary, #2c2520);
    margin-bottom: var(--space-2, 8px);
  }
  
  .memory-error__text {
    font-size: 14px;
    margin-bottom: var(--space-4, 16px);
  }
  
  .memory-error__retry {
    padding: var(--space-2, 8px) var(--space-4, 16px);
    background: var(--persona-primary, #4a6741);
    color: white;
    border: none;
    border-radius: var(--radius-full, 9999px);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background var(--duration-fast, 100ms) ease;
  }
  
  .memory-error__retry:hover {
    background: var(--persona-secondary, #3d5a35);
  }
  
  .memory-error__retry:focus-visible {
    outline: 2px solid var(--persona-primary, #4a6741);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .memory-modal-overlay,
    .memory-modal,
    .memory-tab,
    .memory-conversation,
    .memory-topic-pill,
    .memory-btn,
    .memory-search__input,
    .memory-modal__close,
    .memory-error__retry {
      transition: none;
    }
    .memory-spinner,
    .memory-skeleton {
      animation: none;
    }
  }
`;


// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  close: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  brain: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.54"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.54"/></svg>`,
  heart: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
  verified: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>`,
  alertCircle: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
};

// ============================================================================
// API
// ============================================================================

async function fetchMemory(): Promise<ConversationMemory | null> {
  try {
    const response = await apiGet<ConversationMemory>('/api/voice/memory');
    if (!response.ok || !response.data) return null;
    return response.data;
  } catch (error) {
    log.error('Failed to fetch memory:', error);
    return null;
  }
}

async function fetchConversations(limit = 20): Promise<Conversation[]> {
  try {
    const response = await apiGet<{ conversations?: Conversation[] }>(
      `/api/voice/memory/conversations?limit=${limit}`
    );
    if (!response.ok || !response.data) return [];
    return response.data.conversations || [];
  } catch (error) {
    log.error('Failed to fetch conversations:', error);
    return [];
  }
}

async function fetchContext(): Promise<ConversationContext | null> {
  try {
    const response = await apiGet<ConversationContext>('/api/voice/memory/context');
    if (!response.ok || !response.data) return null;
    return response.data;
  } catch (error) {
    log.error('Failed to fetch context:', error);
    return null;
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the conversation memory browser.
 */
export function initConversationMemory(): void {
  // HMR protection
  cleanupConversationMemory();

  // Inject styles
  const styleEl = document.createElement('style');
  styleEl.id = 'conversation-memory-styles';
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);

  log.debug('Conversation memory browser initialized');
}

/**
 * Cleanup the conversation memory browser.
 */
export function cleanupConversationMemory(): void {
  // HMR protection - remove ALL instances
  document.getElementById('conversation-memory-styles')?.remove();
  document.querySelectorAll('.memory-modal-overlay').forEach((el) => el.remove());
  
  // Clean up focus trap
  if (focusTrapCleanup) {
    focusTrapCleanup();
    focusTrapCleanup = null;
  }
  
  modal = null;
  conversations = [];
  memory = null;
  context = null;
  selectedConversation = null;
  hasError = false;
  errorMessage = '';
  activeTab = 'conversations';
}

// ============================================================================
// MODAL
// ============================================================================

/**
 * Show the conversation memory browser.
 */
export async function showConversationMemory(options?: ConversationMemoryCallbacks): Promise<void> {
  callbacks = options || {};
  
  // Store previous focus for restoration
  previousActiveElement = document.activeElement as HTMLElement;

  if (!modal) {
    createModal();
  }

  modal?.classList.add('visible');
  document.body.style.overflow = 'hidden';
  
  // Set up focus trap
  if (modal) {
    focusTrapCleanup = trapFocus(modal);
  }

  await loadData();
}

/**
 * Hide the conversation memory browser.
 */
export function hideConversationMemory(): void {
  // Clean up focus trap
  if (focusTrapCleanup) {
    focusTrapCleanup();
    focusTrapCleanup = null;
  }
  
  modal?.classList.remove('visible');
  document.body.style.overflow = '';
  
  // Restore focus to previous element
  if (previousActiveElement && previousActiveElement.focus) {
    previousActiveElement.focus();
    previousActiveElement = null;
  }
}

function createModal(): void {
  modal = document.createElement('div');
  modal.className = 'memory-modal-overlay';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-labelledby', 'memory-title');
  modal.setAttribute('aria-describedby', 'memory-subtitle');
  modal.setAttribute('aria-modal', 'true');

  modal.innerHTML = `
    <div class="memory-modal-backdrop"></div>
    <div class="memory-modal">
      <header class="memory-modal__header">
        <p class="memory-modal__eyebrow">${t('memoryBrowser.eyebrow')}</p>
        <h2 id="memory-title" class="memory-modal__title">${t('memoryBrowser.title')}</h2>
        <p id="memory-subtitle" class="memory-modal__subtitle">${t('memoryBrowser.subtitle')}</p>
        <button class="memory-modal__close" aria-label="${t('common.close')}">${ICONS.close}</button>
      </header>
      
      <div id="memory-stats" class="memory-stats" aria-live="polite">
        ${renderStatsLoading()}
      </div>
      
      <div class="memory-search">
        <input 
          type="search" 
          class="memory-search__input" 
          placeholder="${t('placeholders.searchConversations')}"
          id="memory-search-input"
          aria-label="${t('placeholders.searchConversations')}"
        />
      </div>
      
      <div class="memory-tabs" role="tablist" aria-label="${t('memoryBrowser.title')}">
        <button 
          role="tab" 
          aria-selected="true" 
          aria-controls="memory-panel-conversations"
          id="memory-tab-conversations"
          class="memory-tab active" 
          data-tab="conversations"
        >${t('memoryBrowser.tabs.conversations')}</button>
        <button 
          role="tab" 
          aria-selected="false" 
          aria-controls="memory-panel-remembered"
          id="memory-tab-remembered"
          class="memory-tab" 
          data-tab="remembered"
        >${t('memoryBrowser.tabs.remembered')}</button>
        <button 
          role="tab" 
          aria-selected="false" 
          aria-controls="memory-panel-topics"
          id="memory-tab-topics"
          class="memory-tab" 
          data-tab="topics"
        >${t('memoryBrowser.tabs.topics')}</button>
      </div>
      
      <div 
        class="memory-content" 
        id="memory-content" 
        role="tabpanel" 
        aria-labelledby="memory-tab-conversations"
        aria-live="polite"
      >
        <div class="memory-loading" aria-label="${t('memoryBrowser.loading')}">
          <div class="memory-spinner" aria-hidden="true"></div>
        </div>
      </div>
      
      <footer class="memory-modal__footer">
        <span class="memory-modal__footer-info" id="memory-footer-info" aria-live="polite"></span>
        <button class="memory-btn" data-action="close">${t('common.done')}</button>
      </footer>
    </div>
  `;

  // Event listeners
  modal.querySelector('.memory-modal-backdrop')?.addEventListener('click', hideConversationMemory);
  modal.querySelector('.memory-modal__close')?.addEventListener('click', hideConversationMemory);
  modal.querySelector('[data-action="close"]')?.addEventListener('click', hideConversationMemory);

  modal.querySelectorAll('.memory-tab').forEach((tab) => {
    tab.addEventListener('click', (e) => {
      const tabName = (e.currentTarget as HTMLElement).dataset.tab;
      if (tabName) switchTab(tabName);
    });
    
    // Keyboard navigation for tabs
    tab.addEventListener('keydown', (e) => {
      const key = (e as KeyboardEvent).key;
      const tabs = Array.from(modal!.querySelectorAll('.memory-tab'));
      const currentIndex = tabs.indexOf(e.currentTarget as Element);
      
      if (key === 'ArrowRight' || key === 'ArrowLeft') {
        e.preventDefault();
        const nextIndex = key === 'ArrowRight' 
          ? (currentIndex + 1) % tabs.length 
          : (currentIndex - 1 + tabs.length) % tabs.length;
        (tabs[nextIndex] as HTMLElement).focus();
        (tabs[nextIndex] as HTMLElement).click();
      }
    });
  });

  // Debounced search
  const handleSearch = debounce((value: string) => {
    searchQuery = value.toLowerCase();
    renderContent(activeTab);
  }, 200);
  
  modal.querySelector('#memory-search-input')?.addEventListener('input', (e) => {
    handleSearch((e.target as HTMLInputElement).value);
  });

  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideConversationMemory();
  });

  document.body.appendChild(modal);
}

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadData(): Promise<void> {
  isLoading = true;
  hasError = false;
  errorMessage = '';
  renderContent(activeTab);

  try {
    // Load all data in parallel
    const [memoryData, conversationsData, contextData] = await Promise.all([
      fetchMemory(),
      fetchConversations(),
      fetchContext(),
    ]);

    memory = memoryData;
    conversations = conversationsData;
    context = contextData;
    isLoading = false;

    // Check if all requests failed (indicates a real problem)
    if (!memoryData && conversationsData.length === 0 && !contextData) {
      // Check if user might not be logged in
      const userId = localStorage.getItem('ferni_user_id');
      if (!userId) {
        hasError = true;
        errorMessage = 'notLoggedIn';
      }
    }

    renderStats();
    renderContent(activeTab);
    renderFooter();
  } catch (error) {
    log.error('Failed to load memory data:', error);
    isLoading = false;
    hasError = true;
    errorMessage = 'generic';
    renderStats();
    renderContent(activeTab);
  }
}

/**
 * Retry loading data after an error
 */
function retryLoad(): void {
  void loadData();
}

// ============================================================================
// RENDERING
// ============================================================================

/**
 * Render loading skeleton for stats
 */
function renderStatsLoading(): string {
  return `
    <div class="memory-stats-loading">
      <div class="memory-stat-skeleton">
        <div class="memory-skeleton memory-skeleton--value"></div>
        <div class="memory-skeleton memory-skeleton--label"></div>
      </div>
      <div class="memory-stat-skeleton">
        <div class="memory-skeleton memory-skeleton--value"></div>
        <div class="memory-skeleton memory-skeleton--label"></div>
      </div>
      <div class="memory-stat-skeleton">
        <div class="memory-skeleton memory-skeleton--value"></div>
        <div class="memory-skeleton memory-skeleton--label"></div>
      </div>
      <div class="memory-stat-skeleton">
        <div class="memory-skeleton memory-skeleton--value"></div>
        <div class="memory-skeleton memory-skeleton--label"></div>
      </div>
    </div>
  `;
}

function renderStats(): void {
  const statsEl = document.getElementById('memory-stats');
  if (!statsEl) return;
  
  // Show loading state if still loading
  if (isLoading) {
    statsEl.innerHTML = renderStatsLoading();
    return;
  }
  
  // Show empty state if no memory data
  if (!memory) {
    statsEl.innerHTML = `
      <div class="memory-stat">
        <div class="memory-stat__value">0</div>
        <div class="memory-stat__label">${t('memoryBrowser.stats.conversations')}</div>
      </div>
      <div class="memory-stat">
        <div class="memory-stat__value">—</div>
        <div class="memory-stat__label">${t('memoryBrowser.stats.timeTogether')}</div>
      </div>
      <div class="memory-stat">
        <div class="memory-stat__value">0</div>
        <div class="memory-stat__label">${t('memoryBrowser.stats.thingsRemembered')}</div>
      </div>
      <div class="memory-stat">
        <div class="memory-stat__value">—</div>
        <div class="memory-stat__label">${t('memoryBrowser.stats.since')}</div>
      </div>
    `;
    return;
  }

  const durationText = memory.totalDuration ? formatDuration(memory.totalDuration) : '—';

  const firstConvDate = memory.firstConversation
    ? new Date(memory.firstConversation).toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
      })
    : '—';

  statsEl.innerHTML = `
    <div class="memory-stat">
      <div class="memory-stat__value">${memory.totalConversations}</div>
      <div class="memory-stat__label">${t('memoryBrowser.stats.conversations')}</div>
    </div>
    <div class="memory-stat">
      <div class="memory-stat__value">${durationText}</div>
      <div class="memory-stat__label">${t('memoryBrowser.stats.timeTogether')}</div>
    </div>
    <div class="memory-stat">
      <div class="memory-stat__value">${context?.rememberedDetails?.length || 0}</div>
      <div class="memory-stat__label">${t('memoryBrowser.stats.thingsRemembered')}</div>
    </div>
    <div class="memory-stat">
      <div class="memory-stat__value">${firstConvDate}</div>
      <div class="memory-stat__label">${t('memoryBrowser.stats.since')}</div>
    </div>
  `;
}

function renderContent(tab: string): void {
  const contentEl = document.getElementById('memory-content');
  if (!contentEl) return;
  
  // Update ARIA attributes for tab panel
  contentEl.setAttribute('aria-labelledby', `memory-tab-${tab}`);

  if (isLoading) {
    contentEl.innerHTML = `
      <div class="memory-loading" role="status" aria-label="${t('memoryBrowser.loading')}">
        <div class="memory-spinner" aria-hidden="true"></div>
      </div>
    `;
    return;
  }
  
  // Show error state if there was an error
  if (hasError) {
    contentEl.innerHTML = renderErrorState();
    
    // Attach retry handler
    contentEl.querySelector('.memory-error__retry')?.addEventListener('click', retryLoad);
    return;
  }

  switch (tab) {
    case 'conversations':
      renderConversations(contentEl);
      break;
    case 'remembered':
      renderRemembered(contentEl);
      break;
    case 'topics':
      renderTopics(contentEl);
      break;
  }
}

/**
 * Render error state
 */
function renderErrorState(): string {
  const _errorKey = errorMessage || 'generic';
  const title = t(`memoryBrowser.error.title`);
  const message = t(`memoryBrowser.error.message`);
  
  return `
    <div class="memory-error" role="alert">
      <div class="memory-error__icon" aria-hidden="true">${ICONS.alertCircle}</div>
      <h3 class="memory-error__title">${title}</h3>
      <p class="memory-error__text">${message}</p>
      <button class="memory-error__retry">${t('memoryBrowser.error.retry')}</button>
    </div>
  `;
}

function renderConversations(container: HTMLElement): void {
  let filtered = conversations;

  if (searchQuery) {
    filtered = conversations.filter(
      (c) =>
        c.summary?.toLowerCase().includes(searchQuery) ||
        c.topics.some((topic) => topic.toLowerCase().includes(searchQuery))
    );
  }

  if (filtered.length === 0) {
    const emptyMessage = searchQuery 
      ? t('memoryBrowser.empty.noResults')
      : t('memoryBrowser.empty.conversations');
    
    container.innerHTML = `
      <div class="memory-empty" role="status">
        <div class="memory-empty__icon" aria-hidden="true">${ICONS.brain}</div>
        <p class="memory-empty__text">${emptyMessage}</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="memory-conversations">
      ${filtered.map((conv, i) => renderConversationItem(conv, i === filtered.length - 1)).join('')}
    </div>
  `;

  container.querySelectorAll('.memory-conversation').forEach((el, i) => {
    el.addEventListener('click', () => {
      const conv = filtered[i];
      if (conv) {
        selectedConversation = conv;
        callbacks.onConversationSelect?.(conv);
      }

      // Toggle selection
      container
        .querySelectorAll('.memory-conversation')
        .forEach((c) => c.classList.remove('selected'));
      el.classList.add('selected');
    });
  });
}

function renderConversationItem(conv: Conversation, isLast: boolean): string {
  const date = new Date(conv.startedAt);
  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  return `
    <div class="memory-conversation" data-id="${conv.id}">
      <div class="memory-conversation__timeline">
        <div class="memory-conversation__dot"></div>
        ${!isLast ? '<div class="memory-conversation__line"></div>' : ''}
      </div>
      <div class="memory-conversation__content">
        <div class="memory-conversation__date">${dateStr} at ${timeStr}</div>
        <div class="memory-conversation__summary">${conv.summary || 'Conversation'}</div>
        ${
          conv.topics.length > 0
            ? `
          <div class="memory-conversation__topics">
            ${conv.topics
              .slice(0, 3)
              .map((t) => `<span class="memory-topic-tag">${t}</span>`)
              .join('')}
            ${conv.topics.length > 3 ? `<span class="memory-topic-tag">+${conv.topics.length - 3}</span>` : ''}
          </div>
        `
            : ''
        }
        <div class="memory-conversation__meta">
          <span>${t('memoryBrowser.turnCount', { count: conv.turnCount })}</span>
        </div>
      </div>
    </div>
  `;
}

function renderRemembered(container: HTMLElement): void {
  const details = context?.rememberedDetails || [];

  if (details.length === 0) {
    container.innerHTML = `
      <div class="memory-empty" role="status">
        <div class="memory-empty__icon" aria-hidden="true">${ICONS.heart}</div>
        <p class="memory-empty__text">${t('memoryBrowser.empty.remembered')}</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="memory-details">
      ${details
        .map(
          (detail) => `
        <div class="memory-detail">
          <div class="memory-detail__icon" aria-hidden="true">${ICONS.heart}</div>
          <div class="memory-detail__content">
            <div class="memory-detail__text">${escapeHtml(detail)}</div>
            <div class="memory-detail__source">${t('memoryBrowser.learnedFrom')}</div>
          </div>
        </div>
      `
        )
        .join('')}
    </div>
  `;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderTopics(container: HTMLElement): void {
  // Aggregate topics from all conversations
  const topicCounts = new Map<string, number>();
  for (const conv of conversations) {
    for (const topic of conv.topics) {
      topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
    }
  }

  const sortedTopics = Array.from(topicCounts.entries()).sort((a, b) => b[1] - a[1]);

  if (sortedTopics.length === 0) {
    container.innerHTML = `
      <div class="memory-empty" role="status">
        <div class="memory-empty__icon" aria-hidden="true">${ICONS.brain}</div>
        <p class="memory-empty__text">${t('memoryBrowser.empty.topics')}</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="memory-topics-grid">
      ${sortedTopics
        .map(
          ([topic, count]) => `
        <button class="memory-topic-pill" data-topic="${topic}">
          ${topic}
          <span class="memory-topic-pill__count">${count}</span>
        </button>
      `
        )
        .join('')}
    </div>
  `;

  container.querySelectorAll('.memory-topic-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      const topic = (pill as HTMLElement).dataset.topic;
      if (topic) {
        callbacks.onTopicSelect?.(topic);
        // Filter conversations by topic
        searchQuery = topic.toLowerCase();
        (document.getElementById('memory-search-input') as HTMLInputElement).value = topic;
        switchTab('conversations');
      }
    });
  });
}

function renderFooter(): void {
  const footerInfo = document.getElementById('memory-footer-info');
  if (!footerInfo) return;
  
  if (!memory?.firstConversation) {
    footerInfo.textContent = '';
    return;
  }

  const firstDate = new Date(memory.firstConversation).toLocaleDateString();
  footerInfo.textContent = t('memoryBrowser.footer', { date: firstDate });
}

function switchTab(tabName: string): void {
  activeTab = tabName;
  
  modal?.querySelectorAll('.memory-tab').forEach((tab) => {
    const isActive = tab.getAttribute('data-tab') === tabName;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
    tab.setAttribute('tabindex', isActive ? '0' : '-1');
  });

  renderContent(tabName);
}

// ============================================================================
// UTILITIES
// ============================================================================

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

// ============================================================================
// EXPORTS
// ============================================================================

/**
 * Get the currently selected conversation.
 */
export function getSelectedConversation(): Conversation | null {
  return selectedConversation;
}

export const conversationMemory = {
  init: initConversationMemory,
  cleanup: cleanupConversationMemory,
  show: showConversationMemory,
  hide: hideConversationMemory,
  getSelected: getSelectedConversation,
};

export default conversationMemory;
