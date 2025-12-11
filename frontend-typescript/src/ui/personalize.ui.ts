/**
 * Personalize UI Component
 *
 * Express yourself with themes, sounds, and styles.
 * Not about "collecting rare items" - about making Ferni yours.
 *
 * Design principles:
 * - Focus on self-expression, not collection
 * - Warm, inviting language
 * - No rarity system or gamification
 * - Simple, beautiful browsing experience
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import {
  canPurchase,
  COSMETICS_CATALOG,
  equipCosmetic,
  getEquippedCosmetics,
  getOwnedCosmetics,
  onCosmeticsChange,
  purchaseCosmetic,
  type CosmeticItem,
  type CosmeticType,
} from '../services/cosmetics.service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('PersonalizeUI');

// ============================================================================
// STATE
// ============================================================================

let isOpen = false;
let container: HTMLElement | null = null;
let selectedCategory: CosmeticType | 'all' = 'all';
let cosmeticsUnsubscribe: (() => void) | null = null;

// ============================================================================
// STYLES - Brand compliant, dark mode ready
// ============================================================================

const styles = `
.personalize-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  opacity: 0;
  pointer-events: none;
  transition: opacity ${DURATION.MODERATE}ms ${EASING.STANDARD};
}

.personalize-overlay.open {
  opacity: 1;
  pointer-events: auto;
}

.personalize-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(44, 37, 32, 0.4);
  backdrop-filter: blur(20px);
}

.personalize-card {
  position: relative;
  background: var(--color-background-elevated, #FFFDFB);
  border-radius: var(--radius-2xl, 24px);
  width: calc(100% - 32px);
  max-width: 700px;
  max-height: 90vh;
  box-shadow: var(--shadow-2xl);
  transform: scale(0.95);
  transition: transform ${DURATION.MODERATE}ms ${EASING.SPRING};
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.personalize-overlay.open .personalize-card {
  transform: scale(1);
}

/* Header */
.personalize-header {
  padding: var(--space-6, 24px);
  border-bottom: 1px solid var(--color-border-subtle, rgba(0,0,0,0.08));
  text-align: center;
  position: relative;
}

.personalize-close {
  position: absolute;
  top: 16px;
  right: 16px;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 8px;
  border-radius: 50%;
  color: var(--color-text-muted);
  transition: background ${DURATION.FAST}ms;
}

.personalize-close:hover {
  background: var(--color-background-tertiary, rgba(0, 0, 0, 0.05));
}

.personalize-eyebrow {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  margin-bottom: var(--space-2, 8px);
}

.personalize-title {
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 4px 0;
}

.personalize-subtitle {
  font-size: 0.95rem;
  color: var(--color-text-secondary);
  margin: 0;
}

/* Categories */
.personalize-categories {
  display: flex;
  gap: var(--space-2, 8px);
  padding: var(--space-3, 12px) var(--space-5, 20px);
  border-bottom: 1px solid var(--color-border-subtle, rgba(0,0,0,0.08));
  overflow-x: auto;
  justify-content: center;
}

.personalize-category-btn {
  padding: var(--space-2, 8px) var(--space-4, 16px);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-full, 9999px);
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all ${DURATION.FAST}ms;
  white-space: nowrap;
}

.personalize-category-btn:hover {
  color: var(--color-text-primary);
  background: var(--color-background-tertiary, rgba(0, 0, 0, 0.03));
}

.personalize-category-btn.active {
  background: var(--persona-primary, #4a6741);
  color: white;
}

/* Content Grid */
.personalize-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-5, 20px);
}

.personalize-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: var(--space-4, 16px);
}

/* Item Card - dark mode ready */
.personalize-item {
  background: var(--color-background-elevated, #FFFDFB);
  border: 1px solid var(--color-border-subtle, rgba(0,0,0,0.08));
  border-radius: var(--radius-lg, 12px);
  padding: var(--space-4, 16px);
  cursor: pointer;
  transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
  position: relative;
}

.personalize-item:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.personalize-item.owned {
  border-color: var(--persona-primary, #4a6741);
}

.personalize-item.equipped {
  border-width: 2px;
  border-color: var(--persona-primary, #4a6741);
  background: var(--persona-tint, rgba(74, 103, 65, 0.03));
}

/* Preview - visual representation of cosmetic */
.personalize-preview {
  width: 64px;
  height: 64px;
  margin: 0 auto var(--space-3, 12px);
  border-radius: var(--radius-md, 8px);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

/* Skin preview - show the actual color */
.personalize-preview.preview-skin {
  border-radius: 50%;
  box-shadow: 0 4px 12px var(--preview-glow, rgba(0,0,0,0.1));
}

/* Theme preview - show a mini UI mockup */
.personalize-preview.preview-theme {
  background: var(--color-background-tertiary, #f0f0f0);
  flex-direction: column;
  gap: 4px;
  padding: 8px;
}

.personalize-preview.preview-theme .theme-bar {
  width: 100%;
  height: 8px;
  border-radius: 4px;
  background: var(--preview-color, var(--color-text-muted));
  opacity: 0.6;
}

.personalize-preview.preview-theme .theme-bar:first-child {
  width: 80%;
  opacity: 0.8;
}

/* Sound preview - waveform icon */
.personalize-preview.preview-sound {
  background: var(--color-background-tertiary, #f0f0f0);
  color: var(--color-text-muted);
}

.personalize-preview.preview-sound svg {
  width: 32px;
  height: 32px;
}

/* Emote preview */
.personalize-preview.preview-emote {
  background: var(--color-background-tertiary, #f0f0f0);
  font-size: 1.5rem;
  color: var(--color-text-secondary);
}

/* Equipped badge */
.personalize-item.equipped .personalize-preview::after {
  content: '';
  position: absolute;
  bottom: -4px;
  right: -4px;
  width: 20px;
  height: 20px;
  background: var(--persona-primary, #4a6741);
  border-radius: 50%;
  border: 2px solid var(--color-background-elevated, #FFFDFB);
}

/* Info */
.personalize-item-name {
  font-weight: 500;
  color: var(--color-text-primary);
  text-align: center;
  margin-bottom: 2px;
  font-size: 0.9rem;
}

.personalize-item-type {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  text-align: center;
  margin-bottom: var(--space-3, 12px);
}

/* Status */
.personalize-item-status {
  text-align: center;
  font-size: 0.8rem;
  font-weight: 500;
}

.personalize-item-status.equipped {
  color: var(--persona-primary, #4a6741);
}

.personalize-item-status.owned {
  color: var(--color-text-muted);
}

.personalize-item-status.available {
  color: var(--color-text-secondary);
}

/* Action Button */
.personalize-item-action {
  width: 100%;
  margin-top: var(--space-2, 8px);
  padding: var(--space-2, 8px);
  background: var(--persona-primary, #4a6741);
  color: white;
  border: none;
  border-radius: var(--radius-md, 8px);
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: all ${DURATION.FAST}ms;
}

.personalize-item-action:hover:not(:disabled) {
  background: var(--persona-secondary, #3d5a35);
}

.personalize-item-action:disabled {
  background: var(--color-border-medium, rgba(0,0,0,0.1));
  color: var(--color-text-muted);
  cursor: default;
}

.personalize-item-action.equipped {
  background: transparent;
  border: 1px solid var(--persona-primary, #4a6741);
  color: var(--persona-primary, #4a6741);
}

/* Empty State */
.personalize-empty {
  text-align: center;
  padding: var(--space-8, 32px);
  color: var(--color-text-muted);
}

/* Responsive */
@media (max-width: 500px) {
  .personalize-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
`;

// ============================================================================
// ICONS (Lucide-style SVG)
// ============================================================================

const CLOSE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

const SOUND_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 10v3"/><path d="M6 6v11"/><path d="M10 3v18"/><path d="M14 8v7"/><path d="M18 5v13"/><path d="M22 10v3"/></svg>`;

const VOICE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>`;

const TYPE_LABELS: Record<CosmeticType, string> = {
  'avatar-skin': 'Style',
  'ui-theme': 'Theme',
  'voice-pack': 'Voice',
  'sound-pack': 'Sounds',
  emote: 'Expression',
};

const CATEGORY_LABELS: Record<CosmeticType | 'all', string> = {
  all: 'All',
  'avatar-skin': 'Styles',
  'ui-theme': 'Themes',
  'voice-pack': 'Voices',
  'sound-pack': 'Sounds',
  emote: 'Expressions',
};

// ============================================================================
// HMR CLEANUP - Required per brand guidelines
// ============================================================================

/**
 * Clean up any orphaned elements from HMR reloads
 */
function cleanupOrphanedElements(): void {
  document.querySelectorAll('.personalize-overlay').forEach((el) => el.remove());
  document.querySelectorAll('.personalize-toast').forEach((el) => el.remove());
}

// ============================================================================
// COMPONENT
// ============================================================================

function initStyles(): void {
  if (document.getElementById('personalize-styles')) return;

  const styleEl = document.createElement('style');
  styleEl.id = 'personalize-styles';
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);
}

function createModal(): HTMLElement {
  initStyles();

  // HMR cleanup - remove any existing instances
  cleanupOrphanedElements();

  const overlay = document.createElement('div');
  overlay.className = 'personalize-overlay';
  overlay.innerHTML = `
    <div class="personalize-backdrop"></div>
    <div class="personalize-card">
      ${renderHeader()}
      ${renderCategories()}
      <div class="personalize-content">
        ${renderItems()}
      </div>
    </div>
  `;

  overlay.querySelector('.personalize-backdrop')?.addEventListener('click', close);
  overlay.querySelector('.personalize-close')?.addEventListener('click', close);

  setupEventListeners(overlay);

  document.body.appendChild(overlay);
  return overlay;
}

function renderHeader(): string {
  return `
    <div class="personalize-header">
      <button class="personalize-close" aria-label="Close">${CLOSE_ICON}</button>
      <p class="personalize-eyebrow">Make It Yours</p>
      <h2 class="personalize-title">Personalize</h2>
      <p class="personalize-subtitle">Choose how Ferni looks and sounds</p>
    </div>
  `;
}

function renderCategories(): string {
  // Include all categories that have items
  const categories: Array<CosmeticType | 'all'> = [
    'all',
    'avatar-skin',
    'ui-theme',
    'sound-pack',
    // 'voice-pack' - Currently no voice pack items, will add when available
    // 'emote' - Currently no emote items, will add when available
  ];

  return `
    <div class="personalize-categories">
      ${categories
        .map(
          (cat) => `
        <button 
          class="personalize-category-btn ${selectedCategory === cat ? 'active' : ''}"
          data-category="${cat}"
        >
          ${CATEGORY_LABELS[cat]}
        </button>
      `
        )
        .join('')}
    </div>
  `;
}

/**
 * Render a visual preview for a cosmetic item
 */
function renderPreview(item: CosmeticItem): string {
  switch (item.type) {
    case 'avatar-skin': {
      // Show actual skin color
      const primaryColor = item.config?.primaryColor || 'var(--persona-primary)';
      const glowColor = item.config?.glowColor || 'var(--persona-glow)';
      // Handle CSS variable references
      const bgColor = primaryColor.startsWith('var(') ? 'var(--persona-primary)' : primaryColor;
      return `
        <div class="personalize-preview preview-skin" 
             style="background: linear-gradient(145deg, ${bgColor}, ${item.config?.secondaryColor || bgColor}); 
                    --preview-glow: ${glowColor};">
        </div>
      `;
    }
    case 'ui-theme': {
      // Show mini UI mockup
      return `
        <div class="personalize-preview preview-theme">
          <div class="theme-bar"></div>
          <div class="theme-bar"></div>
          <div class="theme-bar"></div>
        </div>
      `;
    }
    case 'sound-pack': {
      return `
        <div class="personalize-preview preview-sound">
          ${SOUND_ICON}
        </div>
      `;
    }
    case 'voice-pack': {
      return `
        <div class="personalize-preview preview-sound">
          ${VOICE_ICON}
        </div>
      `;
    }
    case 'emote': {
      return `
        <div class="personalize-preview preview-emote">
          ~
        </div>
      `;
    }
    default:
      return `<div class="personalize-preview"></div>`;
  }
}

function renderItems(): string {
  const owned = getOwnedCosmetics();
  const ownedIds = new Set(owned.map((c) => c.id));
  const equipped = getEquippedCosmetics();

  let items = COSMETICS_CATALOG;
  if (selectedCategory !== 'all') {
    items = items.filter((item) => item.type === selectedCategory);
  }

  if (items.length === 0) {
    return `
      <div class="personalize-empty">
        <p>More options coming soon.</p>
      </div>
    `;
  }

  return `
    <div class="personalize-grid">
      ${items
        .map((item) => {
          const isOwned = ownedIds.has(item.id);
          const isEquipped = Object.values(equipped).includes(item.id);
          const { canBuy } = canPurchase(item.id);

          return `
          <div 
            class="personalize-item ${isOwned ? 'owned' : ''} ${isEquipped ? 'equipped' : ''}"
            data-item-id="${item.id}"
          >
            ${renderPreview(item)}
            <div class="personalize-item-name">${item.name}</div>
            <div class="personalize-item-type">${TYPE_LABELS[item.type]}</div>
            ${renderItemStatus(item, isOwned, isEquipped)}
            ${renderItemAction(item, isOwned, isEquipped, canBuy)}
          </div>
        `;
        })
        .join('')}
    </div>
  `;
}

function renderItemStatus(item: CosmeticItem, isOwned: boolean, isEquipped: boolean): string {
  if (isEquipped) {
    return `<div class="personalize-item-status equipped">Active</div>`;
  }
  if (isOwned) {
    return `<div class="personalize-item-status owned">Yours</div>`;
  }
  if (item.priceInSeeds === null) {
    return `<div class="personalize-item-status available">Default</div>`;
  }
  return `<div class="personalize-item-status available">${item.priceInSeeds} Seeds</div>`;
}

function renderItemAction(
  item: CosmeticItem,
  isOwned: boolean,
  isEquipped: boolean,
  canBuy: boolean
): string {
  // No button needed for already-active items - status badge is enough
  if (isEquipped) {
    return '';
  }

  if (isOwned) {
    return `
      <button class="personalize-item-action" data-action="equip" data-item-id="${item.id}">
        Use This
      </button>
    `;
  }

  if (item.priceInSeeds === null) {
    return `
      <button class="personalize-item-action" data-action="equip" data-item-id="${item.id}">
        Use This
      </button>
    `;
  }

  if (!canBuy) {
    return `
      <button class="personalize-item-action" disabled>
        Need more Seeds
      </button>
    `;
  }

  return `
    <button class="personalize-item-action" data-action="buy" data-item-id="${item.id}">
      Get This
    </button>
  `;
}

function setupEventListeners(overlay: HTMLElement): void {
  // Category buttons
  overlay.querySelectorAll('.personalize-category-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedCategory = (btn.getAttribute('data-category') as CosmeticType | 'all') || 'all';
      refreshUI();
    });
  });

  // Item actions
  overlay.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const actionBtn = target.closest('[data-action]');
    if (!actionBtn) return;

    const action = actionBtn.getAttribute('data-action');
    const itemId = actionBtn.getAttribute('data-item-id');
    if (!itemId) return;

    if (action === 'buy') {
      handlePurchase(itemId);
    } else if (action === 'equip') {
      handleEquip(itemId);
    }
  });

  // Subscribe to changes
  cosmeticsUnsubscribe = onCosmeticsChange(() => {
    refreshUI();
  });
}

function handlePurchase(itemId: string): void {
  const success = purchaseCosmetic(itemId);
  if (success) {
    showToast("It's yours!");
    equipCosmetic(itemId);
  } else {
    showToast('Could not complete', 'error');
  }
}

function handleEquip(itemId: string): void {
  const success = equipCosmetic(itemId);
  if (success) {
    showToast('Updated!');
  }
}

function refreshUI(): void {
  if (!container) return;

  // Update categories
  container.querySelectorAll('.personalize-category-btn').forEach((btn) => {
    const cat = btn.getAttribute('data-category');
    btn.classList.toggle('active', cat === selectedCategory);
  });

  // Update items
  const content = container.querySelector('.personalize-content');
  if (content) {
    content.innerHTML = renderItems();
  }
}

/**
 * Show a toast notification
 * Uses CSS variables for brand-compliant colors
 */
function showToast(message: string, type: 'success' | 'error' = 'success'): void {
  // Remove any existing toasts
  document.querySelectorAll('.personalize-toast').forEach((el) => el.remove());

  const toast = document.createElement('div');
  toast.className = 'personalize-toast';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 100px;
    left: 50%;
    transform: translateX(-50%);
    background: ${type === 'error' ? 'var(--color-semantic-error, #b5453a)' : 'var(--persona-primary, #4a6741)'};
    color: white;
    padding: 12px 24px;
    border-radius: var(--radius-full, 999px);
    z-index: 10001;
    font-size: 0.9rem;
    font-weight: 500;
    box-shadow: var(--shadow-lg);
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function open(): void {
  if (isOpen) return;

  selectedCategory = 'all';
  container = createModal();

  requestAnimationFrame(() => {
    container?.classList.add('open');
    isOpen = true;
  });

  log.debug('Personalize opened');
}

export function close(): void {
  if (!isOpen || !container) return;

  container.classList.remove('open');
  isOpen = false;

  if (cosmeticsUnsubscribe) {
    cosmeticsUnsubscribe();
    cosmeticsUnsubscribe = null;
  }

  setTimeout(() => {
    container?.remove();
    container = null;
  }, DURATION.MODERATE);

  log.debug('Personalize closed');
}

export function isModalOpen(): boolean {
  return isOpen;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const personalizeUI = {
  open,
  close,
  isOpen: isModalOpen,
};

export default personalizeUI;
