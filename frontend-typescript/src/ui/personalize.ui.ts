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
// STYLES
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
  border-bottom: 1px solid var(--color-border);
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
  background: rgba(0, 0, 0, 0.05);
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
  border-bottom: 1px solid var(--color-border);
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
  background: rgba(0, 0, 0, 0.03);
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

/* Item Card */
.personalize-item {
  background: white;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg, 12px);
  padding: var(--space-4, 16px);
  cursor: pointer;
  transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
  position: relative;
}

.personalize-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.personalize-item.owned {
  border-color: var(--persona-primary, #4a6741);
}

.personalize-item.equipped {
  border-width: 2px;
  border-color: var(--persona-primary, #4a6741);
  background: linear-gradient(135deg, rgba(74, 103, 65, 0.03), transparent);
}

/* Preview */
.personalize-preview {
  width: 64px;
  height: 64px;
  margin: 0 auto var(--space-3, 12px);
  background: var(--color-border);
  border-radius: var(--radius-md, 8px);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  color: var(--color-text-muted);
  position: relative;
}

.personalize-item.equipped .personalize-preview::after {
  content: '';
  position: absolute;
  bottom: -4px;
  right: -4px;
  width: 18px;
  height: 18px;
  background: var(--persona-primary, #4a6741);
  border-radius: 50%;
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
  background: var(--color-border);
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

// Simple text-based icons (brand compliant - no emojis)
const TYPE_ICONS: Record<CosmeticType, string> = {
  'avatar-skin': '◯',
  'ui-theme': '◐',
  'voice-pack': '♪',
  'sound-pack': '♫',
  emote: '~',
};

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

  document.querySelectorAll('.personalize-overlay').forEach((el) => el.remove());

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
      <button class="personalize-close">${CLOSE_ICON}</button>
      <p class="personalize-eyebrow">Make It Yours</p>
      <h2 class="personalize-title">Personalize</h2>
      <p class="personalize-subtitle">Choose how Ferni looks and sounds</p>
    </div>
  `;
}

function renderCategories(): string {
  const categories: Array<CosmeticType | 'all'> = [
    'all',
    'avatar-skin',
    'ui-theme',
    'sound-pack',
    'emote',
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
            <div class="personalize-preview">${TYPE_ICONS[item.type]}</div>
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
  if (item.priceInCoins === null) {
    return `<div class="personalize-item-status available">Default</div>`;
  }
  return `<div class="personalize-item-status available">${item.priceInCoins} coins</div>`;
}

function renderItemAction(
  item: CosmeticItem,
  isOwned: boolean,
  isEquipped: boolean,
  canBuy: boolean
): string {
  if (isEquipped) {
    return `
      <button class="personalize-item-action equipped" disabled>
        Active
      </button>
    `;
  }

  if (isOwned) {
    return `
      <button class="personalize-item-action" data-action="equip" data-item-id="${item.id}">
        Use This
      </button>
    `;
  }

  if (item.priceInCoins === null) {
    return `
      <button class="personalize-item-action" data-action="equip" data-item-id="${item.id}">
        Use This
      </button>
    `;
  }

  if (!canBuy) {
    return `
      <button class="personalize-item-action" disabled>
        Not enough coins
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
    const actionBtn = target.closest('[data-action]') as HTMLElement | null;
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

function showToast(message: string, type: 'success' | 'error' = 'success'): void {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 100px;
    left: 50%;
    transform: translateX(-50%);
    background: ${type === 'error' ? '#e74c3c' : 'var(--persona-primary, #4a6741)'};
    color: white;
    padding: 12px 24px;
    border-radius: 999px;
    z-index: 10001;
    font-size: 0.9rem;
    font-weight: 500;
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
