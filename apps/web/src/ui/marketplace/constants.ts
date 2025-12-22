/**
 * Marketplace Constants
 *
 * Centralized constants and CSS variable helpers for the marketplace.
 * Uses design system tokens - no hardcoded colors.
 *
 * @module marketplace/constants
 */

import { DURATION, EASING } from '../../config/animation-constants.js';
import type { CategoryId, ExternalBrandId } from './types.js';

// Re-export animation constants for convenience
export { DURATION, EASING };

// ============================================================================
// CATEGORY LABELS
// ============================================================================

/**
 * Human-readable labels for marketplace categories
 */
export const CATEGORY_LABELS: Record<CategoryId | string, string> = {
  mentorship: 'Mentorship',
  finance: 'Finance',
  health: 'Health & Wellness',
  productivity: 'Productivity',
  lifestyle: 'Lifestyle',
  education: 'Learning',
  entertainment: 'Entertainment',
  custom: 'Custom',
};

/**
 * Get human-readable label for a category
 */
export function getCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] || category.charAt(0).toUpperCase() + category.slice(1);
}

// ============================================================================
// CSS VARIABLE HELPERS
// ============================================================================

/**
 * External AI brands that have special gradient handling
 */
const EXTERNAL_BRANDS: ExternalBrandId[] = ['claude', 'gemini', 'gpt'];

/**
 * Check if a persona ID is an external AI brand
 */
export function isExternalBrand(personaId: string): boolean {
  return EXTERNAL_BRANDS.includes(personaId as ExternalBrandId);
}

/**
 * Get gradient for a persona using CSS variables.
 * Applies via data-persona attribute which sets --persona-primary and --persona-secondary.
 */
export function getPersonaGradient(personaId: string): string {
  if (isExternalBrand(personaId)) {
    // External brands use pre-generated gradient from design tokens
    return `var(--external-${personaId}-gradient)`;
  }
  return 'linear-gradient(135deg, var(--persona-secondary), var(--persona-primary))';
}

/**
 * Get glow color for avatar shadows using CSS variables.
 * External AI company brand colors are defined in design-system/tokens/colors.json
 */
export function getPersonaGlow(personaId: string): string {
  if (isExternalBrand(personaId)) {
    return `var(--external-${personaId}-glow)`;
  }
  return 'var(--persona-glow)';
}

/**
 * Get gradient for a category (marketplace agents)
 * Uses CSS variables defined in design-system/tokens/colors.json
 */
export function getCategoryGradient(category: string): string {
  return `var(--category-${category}-gradient, linear-gradient(135deg, var(--category-${category}-secondary), var(--category-${category}-primary)))`;
}

/**
 * Get glow color for a category (marketplace agents)
 * Uses CSS variables defined in design-system/tokens/colors.json
 */
export function getCategoryGlow(category: string): string {
  return `var(--category-${category}-glow)`;
}

/**
 * Get text color for a category label
 */
export function getCategoryTextColor(category: string): string {
  return `var(--category-${category}-text)`;
}

/**
 * Get background tint for a category
 */
export function getCategoryTint(category: string): string {
  return `var(--category-${category}-tint)`;
}

// ============================================================================
// ICONS (Lucide-style SVG)
// ============================================================================

export const ICONS = {
  close: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>`,

  search: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="11" cy="11" r="8"></circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
  </svg>`,

  plus: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"></line>
    <line x1="5" y1="12" x2="19" y2="12"></line>
  </svg>`,

  lock: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
  </svg>`,

  check: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>`,

  minus: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"></line>
  </svg>`,

  star: `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" class="star-icon">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>`,

  emptyCircle: `<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" opacity="0.4">
    <circle cx="12" cy="12" r="10"></circle>
    <path d="M8 12h8"></path>
    <path d="M12 8v8"></path>
  </svg>`,

  sparkle: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z"/>
    <path d="M5 3v4"/><path d="M3 5h4"/>
    <path d="M19 17v4"/><path d="M17 19h4"/>
  </svg>`,

  thumbsUp: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
  </svg>`,

  trash: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
  </svg>`,

  mic: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
    <line x1="12" y1="19" x2="12" y2="23"></line>
    <line x1="8" y1="23" x2="16" y2="23"></line>
  </svg>`,

  chat: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>`,

  user: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="8" r="5"/>
    <path d="M20 21a8 8 0 0 0-16 0"/>
  </svg>`,

  book: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
  </svg>`,

  heart: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
  </svg>`,
} as const;

// ============================================================================
// ANIMATION PRESETS
// ============================================================================

/**
 * Animation presets for marketplace UI
 */
export const ANIMATION_PRESETS = {
  modalOpen: {
    duration: DURATION.SLOW,
    easing: EASING.SPRING,
  },
  cardHover: {
    duration: DURATION.FAST,
    easing: EASING.STANDARD,
  },
  staggerDelay: 50, // ms between staggered items
  maxStaggerItems: 6,
} as const;

/**
 * Get stagger delay for an item at a given index
 */
export function getStaggerDelay(index: number): number {
  return Math.min(index, ANIMATION_PRESETS.maxStaggerItems) * ANIMATION_PRESETS.staggerDelay;
}

// ============================================================================
// DOM IDs AND SELECTORS
// ============================================================================

export const DOM_IDS = {
  modal: 'marketplaceModal',
  title: 'marketplace-title',
  detailStyles: 'marketplace-detail-styles',
  mainStyles: 'marketplace-styles',
} as const;

export const CSS_CLASSES = {
  modal: 'marketplace-modal',
  modalOpen: 'open',
  tab: 'marketplace-tab',
  tabActive: 'active',
  agent: 'marketplace-agent',
  agentLocked: 'marketplace-agent--locked',
  installed: 'installed',
} as const;
