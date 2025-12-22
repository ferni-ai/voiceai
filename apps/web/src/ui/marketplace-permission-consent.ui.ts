/**
 * Marketplace Permission Consent UI
 *
 * Modal for requesting user permission when installing marketplace tools/agents.
 * Shows required and optional permissions with clear explanations.
 *
 * DESIGN PRINCIPLES:
 *   - Clear, non-technical language
 *   - Required vs optional distinction
 *   - Easy to understand consequences
 *   - No dark patterns
 *
 * ACCESSIBILITY (WCAG AA):
 *   - Full keyboard navigation
 *   - Screen reader announcements
 *   - Focus management
 *   - Respects prefers-reduced-motion
 */

import { t } from '../i18n/index.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { soundUI } from './sound.ui.js';

const log = createLogger('PermissionConsentUI');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// LUCIDE ICONS (brand-compliant, no emoji)
// ============================================================================

const LUCIDE = {
  user: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  edit: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  brain:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-1.54"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-1.54"/></svg>',
  save: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>',
  trash:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  calendar:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  calendarPlus:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="12" y1="14" x2="12" y2="18"/><line x1="10" y1="16" x2="14" y2="16"/></svg>',
  contacts:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 18a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2"/><rect x="3" y="4" width="18" height="18" rx="2"/><circle cx="12" cy="10" r="2"/><line x1="8" y1="2" x2="8" y2="4"/><line x1="16" y1="2" x2="16" y2="4"/></svg>',
  userPlus:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>',
  barChart:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>',
  checkCircle:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  dollarSign:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
  creditCard:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>',
  heart:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
  activity:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
  mail: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>',
  messageSquare:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  bell: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
  globe:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
  upload:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>',
  webhook:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2"/><path d="m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06"/><path d="m12 6 3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8H12"/></svg>',
  tool: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
  users:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  receipt:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17V7"/></svg>',
  fileText:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
  filePlus:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>',
  database:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>',
  hardDrive:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="12" x2="2" y2="12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" y1="16" x2="6.01" y2="16"/><line x1="10" y1="16" x2="10.01" y2="16"/></svg>',
};

// ============================================================================
// TYPES
// ============================================================================

export type PermissionScope =
  | 'user:profile:read'
  | 'user:profile:write'
  | 'user:memory:read'
  | 'user:memory:write'
  | 'user:memory:delete'
  | 'user:calendar:read'
  | 'user:calendar:write'
  | 'user:contacts:read'
  | 'user:contacts:write'
  | 'user:habits:read'
  | 'user:habits:write'
  | 'user:finance:read'
  | 'user:finance:write'
  | 'user:health:read'
  | 'user:health:write'
  | 'communication:email:send'
  | 'communication:sms:send'
  | 'communication:notify'
  | 'external:http:read'
  | 'external:http:write'
  | 'external:webhook:receive'
  | 'platform:tools:invoke'
  | 'platform:agents:handoff'
  | 'platform:billing:read'
  | 'storage:files:read'
  | 'storage:files:write'
  | 'storage:blob:read'
  | 'storage:blob:write';

export interface PermissionRequest {
  scope: PermissionScope;
  reason: string;
  required: boolean;
  usageContext?: string;
}

export interface MarketplaceItem {
  id: string;
  name: string;
  type: 'tool' | 'agent';
  publisher: {
    name: string;
    verified: boolean;
  };
  trustLevel: 'platform' | 'verified' | 'community' | 'unverified';
  permissions: {
    required: PermissionRequest[];
    optional: PermissionRequest[];
  };
}

export interface ConsentResult {
  granted: boolean;
  permissions: PermissionScope[];
}

// ============================================================================
// PERMISSION DISPLAY CONFIG
// ============================================================================

const PERMISSION_DISPLAY: Record<
  PermissionScope,
  { icon: string; label: string; category: string; sensitivity: 'low' | 'medium' | 'high' }
> = {
  'user:profile:read': {
    icon: LUCIDE.user,
    label: 'See your profile',
    category: 'Profile',
    sensitivity: 'low',
  },
  'user:profile:write': {
    icon: LUCIDE.edit,
    label: 'Update your profile',
    category: 'Profile',
    sensitivity: 'medium',
  },
  'user:memory:read': {
    icon: LUCIDE.brain,
    label: 'Remember what you share',
    category: 'Memories',
    sensitivity: 'medium',
  },
  'user:memory:write': {
    icon: LUCIDE.save,
    label: 'Save new memories',
    category: 'Memories',
    sensitivity: 'medium',
  },
  'user:memory:delete': {
    icon: LUCIDE.trash,
    label: 'Remove memories',
    category: 'Memories',
    sensitivity: 'high',
  },
  'user:calendar:read': {
    icon: LUCIDE.calendar,
    label: 'See your schedule',
    category: 'Calendar',
    sensitivity: 'medium',
  },
  'user:calendar:write': {
    icon: LUCIDE.calendarPlus,
    label: 'Add to your calendar',
    category: 'Calendar',
    sensitivity: 'medium',
  },
  'user:contacts:read': {
    icon: LUCIDE.contacts,
    label: 'See your contacts',
    category: 'Contacts',
    sensitivity: 'medium',
  },
  'user:contacts:write': {
    icon: LUCIDE.userPlus,
    label: 'Add or update contacts',
    category: 'Contacts',
    sensitivity: 'medium',
  },
  'user:habits:read': {
    icon: LUCIDE.barChart,
    label: 'See your habits',
    category: 'Habits',
    sensitivity: 'low',
  },
  'user:habits:write': {
    icon: LUCIDE.checkCircle,
    label: 'Track your habits',
    category: 'Habits',
    sensitivity: 'low',
  },
  'user:finance:read': {
    icon: LUCIDE.dollarSign,
    label: 'See financial info',
    category: 'Finance',
    sensitivity: 'high',
  },
  'user:finance:write': {
    icon: LUCIDE.creditCard,
    label: 'Manage finances',
    category: 'Finance',
    sensitivity: 'high',
  },
  'user:health:read': {
    icon: LUCIDE.heart,
    label: 'See health info',
    category: 'Health',
    sensitivity: 'high',
  },
  'user:health:write': {
    icon: LUCIDE.activity,
    label: 'Track health data',
    category: 'Health',
    sensitivity: 'high',
  },
  'communication:email:send': {
    icon: LUCIDE.mail,
    label: 'Send emails on your behalf',
    category: 'Communication',
    sensitivity: 'medium',
  },
  'communication:sms:send': {
    icon: LUCIDE.messageSquare,
    label: 'Send text messages',
    category: 'Communication',
    sensitivity: 'medium',
  },
  'communication:notify': {
    icon: LUCIDE.bell,
    label: 'Send you notifications',
    category: 'Communication',
    sensitivity: 'low',
  },
  'external:http:read': {
    icon: LUCIDE.globe,
    label: 'Look up info online',
    category: 'External',
    sensitivity: 'low',
  },
  'external:http:write': {
    icon: LUCIDE.upload,
    label: 'Send info to the web',
    category: 'External',
    sensitivity: 'medium',
  },
  'external:webhook:receive': {
    icon: LUCIDE.webhook,
    label: 'Receive updates from services',
    category: 'External',
    sensitivity: 'low',
  },
  'platform:tools:invoke': {
    icon: LUCIDE.tool,
    label: 'Work with other capabilities',
    category: 'Platform',
    sensitivity: 'medium',
  },
  'platform:agents:handoff': {
    icon: LUCIDE.users,
    label: 'Connect you with other coaches',
    category: 'Platform',
    sensitivity: 'low',
  },
  'platform:billing:read': {
    icon: LUCIDE.receipt,
    label: 'See your subscription',
    category: 'Platform',
    sensitivity: 'low',
  },
  'storage:files:read': {
    icon: LUCIDE.fileText,
    label: 'Read your files',
    category: 'Storage',
    sensitivity: 'medium',
  },
  'storage:files:write': {
    icon: LUCIDE.filePlus,
    label: 'Save files for you',
    category: 'Storage',
    sensitivity: 'medium',
  },
  'storage:blob:read': {
    icon: LUCIDE.database,
    label: 'Access saved data',
    category: 'Storage',
    sensitivity: 'low',
  },
  'storage:blob:write': {
    icon: LUCIDE.hardDrive,
    label: 'Store data for you',
    category: 'Storage',
    sensitivity: 'low',
  },
};

// Trust badges use simple text characters (brand compliant)
const TRUST_BADGES: Record<string, { label: string; color: string; icon: string }> = {
  platform: { label: 'By Ferni', color: 'var(--persona-primary)', icon: '✓' },
  verified: { label: 'Verified', color: 'var(--color-semantic-success)', icon: '✓' },
  community: { label: 'Community', color: 'var(--color-semantic-warning)', icon: '●' },
  unverified: { label: 'Review pending', color: 'var(--color-semantic-error)', icon: '○' },
};

// ============================================================================
// STATE
// ============================================================================

let modal: HTMLElement | null = null;
let resolvePromise: ((result: ConsentResult) => void) | null = null;
let selectedOptionalPermissions: Set<PermissionScope> = new Set();

// ============================================================================
// ICONS (Lucide-style)
// ============================================================================

const ICONS = {
  close:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  shield:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  check:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  alertTriangle:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
};

// ============================================================================
// HMR CLEANUP
// ============================================================================

function cleanupOrphanedElements(): void {
  document.querySelectorAll('.permission-consent-modal').forEach((el) => el.remove());
  document.querySelectorAll('#permission-consent-styles').forEach((el) => el.remove());
}

// ============================================================================
// ACCESSIBILITY HELPERS
// ============================================================================

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function announceToScreenReader(message: string): void {
  const announcer = document.createElement('div');
  announcer.setAttribute('role', 'status');
  announcer.setAttribute('aria-live', 'polite');
  announcer.setAttribute('aria-atomic', 'true');
  announcer.className = 'sr-only';
  announcer.textContent = message;
  document.body.appendChild(announcer);
  trackedTimeout(() => announcer.remove(), 1000);
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Show permission consent modal for installing a marketplace item
 * Returns a promise that resolves with the user's decision
 */
export function requestPermissionConsent(item: MarketplaceItem): Promise<ConsentResult> {
  return new Promise((resolve) => {
    cleanupOrphanedElements();
    injectStyles();

    resolvePromise = resolve;
    selectedOptionalPermissions = new Set();

    // Pre-select all optional permissions by default
    item.permissions.optional.forEach((p) => selectedOptionalPermissions.add(p.scope));

    modal = createModal(item);
    document.body.appendChild(modal);

    requestAnimationFrame(() => {
      modal?.classList.add('visible');
    });

    announceToScreenReader(`Permission request for ${item.name}`);
    soundUI.play('switch');

    // Focus first interactive element
    const firstButton = modal.querySelector('button, input') as HTMLElement;
    firstButton?.focus();
  });
}

// ============================================================================
// MODAL CREATION
// ============================================================================

function createModal(item: MarketplaceItem): HTMLElement {
  const el = document.createElement('div');
  el.className = 'permission-consent-modal';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'consent-title');

  const trustBadge = TRUST_BADGES[item.trustLevel] || TRUST_BADGES.community;
  const hasHighSensitivity = [...item.permissions.required, ...item.permissions.optional].some(
    (p) => PERMISSION_DISPLAY[p.scope]?.sensitivity === 'high'
  );

  el.innerHTML = `
    <div class="consent-backdrop" aria-hidden="true"></div>
    <div class="consent-panel">
      <button class="consent-close" aria-label="${t('accessibility.cancelInstallation')}">
        ${ICONS.close}
      </button>

      <header class="consent-header">
        <div class="consent-icon" aria-hidden="true">
          ${ICONS.shield}
        </div>
        <h2 id="consent-title" class="consent-title">Add ${item.name}?</h2>
        <p class="consent-publisher">
          by ${item.publisher.name}
          <span class="trust-badge" style="--badge-color: ${trustBadge.color}">
            <span class="trust-badge-icon">${trustBadge.icon}</span>
            ${trustBadge.label}
          </span>
        </p>
      </header>

      ${
        hasHighSensitivity
          ? `
        <div class="consent-warning" role="alert">
          <span class="warning-icon">${ICONS.alertTriangle}</span>
          <span>This ${item.type} requests access to sensitive data</span>
        </div>
      `
          : ''
      }

      <div class="consent-content">
        ${
          item.permissions.required.length > 0
            ? `
          <section class="permission-section">
            <h3 class="section-label">Required permissions</h3>
            <ul class="permission-list" role="list">
              ${item.permissions.required.map((p) => renderPermissionItem(p, true)).join('')}
            </ul>
          </section>
        `
            : ''
        }

        ${
          item.permissions.optional.length > 0
            ? `
          <section class="permission-section">
            <h3 class="section-label">Optional permissions</h3>
            <p class="section-hint">You can change these later in settings</p>
            <ul class="permission-list" role="list">
              ${item.permissions.optional.map((p) => renderPermissionItem(p, false)).join('')}
            </ul>
          </section>
        `
            : ''
        }

        ${
          item.permissions.required.length === 0 && item.permissions.optional.length === 0
            ? `
          <div class="no-permissions">
            <span class="no-permissions-icon">${ICONS.check}</span>
            <p>This ${item.type} doesn't need any special permissions</p>
          </div>
        `
            : ''
        }
      </div>

      <footer class="consent-footer">
        <button aria-label="Cancel" class="consent-btn consent-btn--secondary" data-action="cancel">
          Cancel
        </button>
        <button aria-label="Add" class="consent-btn consent-btn--primary" data-action="confirm">
          Add ${item.type === 'agent' ? 'to Team' : 'Tool'}
        </button>
      </footer>
    </div>
  `;

  // Event listeners
  el.querySelector('.consent-backdrop')?.addEventListener('click', handleCancel);
  el.querySelector('.consent-close')?.addEventListener('click', handleCancel);
  el.querySelector('[data-action="cancel"]')?.addEventListener('click', handleCancel);
  el.querySelector('[data-action="confirm"]')?.addEventListener('click', () => handleConfirm(item));

  // Optional permission checkboxes
  el.querySelectorAll('.permission-checkbox').forEach((checkbox) => {
    checkbox.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      const scope = target.dataset.scope as PermissionScope;
      if (target.checked) {
        selectedOptionalPermissions.add(scope);
      } else {
        selectedOptionalPermissions.delete(scope);
      }
    });
  });

  el.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') handleCancel();
  });

  return el;
}

// Fallback icon for unknown permissions
const UNKNOWN_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';

function renderPermissionItem(permission: PermissionRequest, required: boolean): string {
  const display = PERMISSION_DISPLAY[permission.scope] || {
    icon: UNKNOWN_ICON,
    label: permission.scope,
    category: 'Other',
    sensitivity: 'medium',
  };

  const sensitivityClass = `sensitivity-${display.sensitivity}`;
  const checkboxId = `perm-${permission.scope.replace(/:/g, '-')}`;

  return `
    <li class="permission-item ${sensitivityClass}" role="listitem">
      ${
        !required
          ? `
        <input
          type="checkbox"
          class="permission-checkbox"
          id="${checkboxId}"
          data-scope="${permission.scope}"
          checked
        />
        <label for="${checkboxId}" class="permission-label">
      `
          : '<div class="permission-label">'
      }
        <span class="permission-icon" aria-hidden="true">${display.icon}</span>
        <div class="permission-info">
          <span class="permission-name">${display.label}</span>
          <span class="permission-reason">${permission.reason}</span>
        </div>
        ${required ? '<span class="required-badge">Required</span>' : ''}
      ${!required ? '</label>' : '</div>'}
    </li>
  `;
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function handleCancel(): void {
  closeModal();
  resolvePromise?.({ granted: false, permissions: [] });
  resolvePromise = null;
}

function handleConfirm(item: MarketplaceItem): void {
  const grantedPermissions: PermissionScope[] = [
    ...item.permissions.required.map((p) => p.scope),
    ...Array.from(selectedOptionalPermissions),
  ];

  closeModal();
  soundUI.play('success');
  resolvePromise?.({ granted: true, permissions: grantedPermissions });
  resolvePromise = null;
}

function closeModal(): void {
  if (!modal) return;

  modal.classList.remove('visible');
  trackedTimeout(
    () => {
      modal?.remove();
      modal = null;
    },
    prefersReducedMotion() ? 0 : DURATION.SLOW
  );
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('permission-consent-styles')) return;

  const style = document.createElement('style');
  style.id = 'permission-consent-styles';
  style.textContent = `
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    .permission-consent-modal {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal, 2100);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-4, 16px);
      opacity: 0;
      pointer-events: none;
      transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD};
    }

    .permission-consent-modal.visible {
      opacity: 1;
      pointer-events: auto;
    }

    .consent-backdrop {
      position: absolute;
      inset: 0;
      background: var(--backdrop-heavy, rgba(44, 37, 32, 0.7));
      backdrop-filter: blur(var(--glass-blur-modal, 20px));
    }

    .consent-panel {
      position: relative;
      background: var(--color-background-elevated, #FFFDFB);
      border-radius: var(--radius-2xl, 24px);
      box-shadow: var(--shadow-2xl);
      max-width: clamp(336px, 90vw, 480px);
      width: 100%;
      max-height: 85vh;
      overflow-y: auto;
      transform: scale(0.95) translateY(10px);
      transition: transform ${DURATION.MODERATE}ms ${EASING.SPRING};
    }

    .permission-consent-modal.visible .consent-panel {
      transform: scale(1) translateY(0);
    }

    .consent-close {
      position: absolute;
      top: var(--space-4, 16px);
      right: var(--space-4, 16px);
      width: 36px;
      height: 36px;
      border: none;
      background: var(--color-background-secondary);
      border-radius: var(--radius-full);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-secondary);
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .consent-close:hover {
      background: var(--color-background-tertiary);
      color: var(--color-text-primary);
    }

    .consent-close:focus-visible {
      outline: 2px solid var(--persona-primary);
      outline-offset: 2px;
    }

    .consent-close svg {
      width: 18px;
      height: 18px;
    }

    .consent-header {
      text-align: center;
      padding: var(--space-6, 24px) var(--space-6, 24px) var(--space-4, 16px);
    }

    .consent-icon {
      width: 56px;
      height: 56px;
      margin: 0 auto var(--space-3, 12px);
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--persona-tint);
      border-radius: var(--radius-xl);
      color: var(--persona-primary);
    }

    .consent-icon svg {
      width: 28px;
      height: 28px;
    }

    .consent-title {
      font-family: var(--font-display);
      font-size: 1.375rem;
      font-weight: 700;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-2, 8px);
    }

    .consent-publisher {
      font-size: 0.875rem;
      color: var(--color-text-secondary);
      margin: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2, 8px);
      flex-wrap: wrap;
    }

    .trust-badge {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1, 4px);
      padding: 2px 8px;
      background: color-mix(in srgb, var(--badge-color) 15%, transparent);
      color: var(--badge-color);
      border-radius: var(--radius-full);
      font-size: 0.75rem;
      font-weight: 600;
    }

    .trust-badge-icon {
      font-size: 0.65rem;
    }

    .consent-warning {
      display: flex;
      align-items: center;
      gap: var(--space-3, 12px);
      margin: 0 var(--space-6, 24px) var(--space-4, 16px);
      padding: var(--space-3, 12px) var(--space-4, 16px);
      background: color-mix(in srgb, var(--color-semantic-warning) 10%, transparent);
      border-radius: var(--radius-lg);
      font-size: 0.875rem;
      color: var(--color-semantic-warning);
    }

    .warning-icon {
      flex-shrink: 0;
    }

    .warning-icon svg {
      width: 20px;
      height: 20px;
    }

    .consent-content {
      padding: 0 var(--space-6, 24px);
    }

    .permission-section {
      margin-bottom: var(--space-5, 20px);
    }

    .section-label {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-muted);
      margin: 0 0 var(--space-2, 8px);
    }

    .section-hint {
      font-size: 0.75rem;
      color: var(--color-text-muted);
      margin: 0 0 var(--space-3, 12px);
    }

    .permission-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-2, 8px);
    }

    .permission-item {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3, 12px);
      padding: var(--space-3, 12px);
      background: var(--color-background-secondary);
      border-radius: var(--radius-lg);
      transition: background ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .permission-item.sensitivity-high {
      border-left: 3px solid var(--color-semantic-error);
    }

    .permission-item.sensitivity-medium {
      border-left: 3px solid var(--color-semantic-warning);
    }

    .permission-checkbox {
      width: 18px;
      height: 18px;
      margin-top: 2px;
      accent-color: var(--persona-primary);
      cursor: pointer;
    }

    .permission-label {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3, 12px);
      flex: 1;
      cursor: pointer;
    }

    .permission-icon {
      font-size: 1.25rem;
      line-height: 1;
      flex-shrink: 0;
    }

    .permission-info {
      flex: 1;
    }

    .permission-name {
      display: block;
      font-weight: 500;
      color: var(--color-text-primary);
      font-size: 0.9375rem;
    }

    .permission-reason {
      display: block;
      font-size: 0.8125rem;
      color: var(--color-text-secondary);
      margin-top: 2px;
    }

    .required-badge {
      font-size: 0.65rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 2px 6px;
      background: var(--color-background-tertiary);
      color: var(--color-text-muted);
      border-radius: var(--radius-sm);
      flex-shrink: 0;
    }

    .no-permissions {
      text-align: center;
      padding: var(--space-6, 24px);
    }

    .no-permissions-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      margin: 0 auto var(--space-3, 12px);
      background: var(--color-semantic-success-glow);
      border-radius: var(--radius-full);
      color: var(--color-semantic-success);
    }

    .no-permissions-icon svg {
      width: 24px;
      height: 24px;
    }

    .no-permissions p {
      font-size: 0.9375rem;
      color: var(--color-text-secondary);
      margin: 0;
    }

    .consent-footer {
      display: flex;
      gap: var(--space-3, 12px);
      padding: var(--space-5, 20px) var(--space-6, 24px);
      border-top: 1px solid var(--color-border-subtle);
    }

    .consent-btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      padding: var(--space-3, 12px) var(--space-5, 20px);
      border-radius: var(--radius-lg);
      font-size: 0.9375rem;
      font-weight: 600;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .consent-btn--primary {
      background: var(--persona-primary);
      color: white;
      border: none;
    }

    .consent-btn--primary:hover {
      background: var(--persona-secondary);
    }

    .consent-btn--primary:focus-visible {
      outline: 2px solid var(--persona-primary);
      outline-offset: 2px;
    }

    .consent-btn--secondary {
      background: transparent;
      color: var(--color-text-secondary);
      border: 2px solid var(--color-border-medium);
    }

    .consent-btn--secondary:hover {
      background: var(--color-background-secondary);
      border-color: var(--color-text-secondary);
    }

    /* Dark theme */
    @media (prefers-color-scheme: dark) {
      .consent-panel {
        background: var(--color-background-elevated);
      }

      .consent-title {
        color: var(--color-text-primary);
      }
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .permission-consent-modal,
      .consent-panel {
        transition: none;
      }
    }

    /* Mobile */
    @media (max-width: clamp(336px, 90vw, 480px)) {
      .consent-panel {
        max-height: 90vh;
        border-radius: var(--radius-xl) var(--radius-xl) 0 0;
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        max-width: none;
      }

      .permission-consent-modal.visible .consent-panel {
        transform: translateY(0);
      }

      .consent-panel {
        transform: translateY(100%);
      }
    }
  `;

  document.head.appendChild(style);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const permissionConsentUI = {
  request: requestPermissionConsent,
};

export default permissionConsentUI;
