/**
 * 🃏 Share Cards UI
 *
 * UI components for generating and sharing Musical You cards.
 * Integrates with the card generation API.
 *
 * Features:
 * - Share Musical DNA button/modal
 * - Share Desert Island button/modal
 * - Share Game Victory (after games)
 * - Native share API + clipboard fallback
 *
 * @module ShareCardsUI
 */

import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { addTapListener, cleanupTapListeners } from '../utils/ios-touch.js';

const log = createLogger('ShareCardsUI');

// ============================================================================
// TYPES
// ============================================================================

type CardType = 'musical-dna' | 'desert-island' | 'game-victory' | 'weekly-recap';

interface ShareCardData {
  type: CardType;
  userId: string;
  data: Record<string, unknown>;
}

interface GeneratedCard {
  id: string;
  type: CardType;
  shareUrl: string;
  imageUrl: string;
  svgUrl: string;
}

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
  twitter: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
  facebook: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
};

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Generate a shareable card via API
 */
async function generateCard(cardData: ShareCardData): Promise<GeneratedCard | null> {
  try {
    const response = await fetch('/api/share/cards/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cardData),
    });

    const result = await response.json();

    if (result.success && result.card) {
      log.info({ cardId: result.card.id, type: cardData.type }, '🃏 Card generated');
      return result.card;
    }

    log.warn({ result }, '⚠️ Card generation failed');
    return null;
  } catch (error) {
    log.error({ error }, '❌ Card generation error');
    return null;
  }
}

// ============================================================================
// SHARE FUNCTIONS
// ============================================================================

/**
 * Share using native share API or fallback
 */
async function shareCard(card: GeneratedCard, title: string, text: string): Promise<boolean> {
  // Try native share API
  if (navigator.share) {
    try {
      await navigator.share({
        title,
        text,
        url: card.shareUrl,
      });
      log.info({ cardId: card.id }, '📤 Shared via native API');
      return true;
    } catch (error) {
      // User cancelled or share failed
      if ((error as Error).name !== 'AbortError') {
        log.debug({ error }, '⚠️ Native share failed, showing modal');
      }
    }
  }

  // Fallback: show share modal
  showShareModal(card, title);
  return true;
}

/**
 * Copy share URL to clipboard
 */
async function copyShareUrl(url: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = url;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  }
}

/**
 * Open share URL in social platform
 */
function shareToSocial(platform: 'twitter' | 'facebook', url: string, text: string): void {
  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(text);

  let shareUrl: string;

  switch (platform) {
    case 'twitter':
      shareUrl = `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`;
      break;
    case 'facebook':
      shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
      break;
  }

  window.open(shareUrl, '_blank', 'width=600,height=400');
}

// ============================================================================
// SHARE MODAL
// ============================================================================

let shareModal: HTMLElement | null = null;

function showShareModal(card: GeneratedCard, title: string): void {
  // Clean up existing modal
  if (shareModal) {
    shareModal.remove();
  }

  // Create modal
  shareModal = document.createElement('div');
  shareModal.className = 'share-modal';
  shareModal.innerHTML = `
    <div class="share-modal__backdrop"></div>
    <div class="share-modal__card">
      <header class="share-modal__header">
        <h2 class="share-modal__title">Share Your Card</h2>
        <button class="share-modal__close" aria-label="Close">${ICONS.close}</button>
      </header>
      
      <div class="share-modal__preview">
        <img src="${card.svgUrl}" alt="${title}" class="share-modal__image">
      </div>
      
      <div class="share-modal__actions">
        <button class="share-modal__button share-modal__button--primary" data-action="copy">
          <span class="share-modal__button-icon">${ICONS.copy}</span>
          <span class="share-modal__button-text">Copy Link</span>
        </button>
        
        <button class="share-modal__button" data-action="download">
          <span class="share-modal__button-icon">${ICONS.download}</span>
          <span class="share-modal__button-text">Save Image</span>
        </button>
      </div>
      
      <div class="share-modal__social">
        <button class="share-modal__social-btn" data-platform="twitter" aria-label="Share on X">
          ${ICONS.twitter}
        </button>
        <button class="share-modal__social-btn" data-platform="facebook" aria-label="Share on Facebook">
          ${ICONS.facebook}
        </button>
      </div>
      
      <div class="share-modal__url">
        <input type="text" value="${card.shareUrl}" readonly class="share-modal__url-input">
      </div>
    </div>
  `;

  // Inject styles
  injectShareModalStyles();

  // Add to DOM
  document.body.appendChild(shareModal);

  // Animate in
  requestAnimationFrame(() => {
    shareModal?.classList.add('share-modal--visible');
  });

  // Bind events
  const backdrop = shareModal.querySelector('.share-modal__backdrop');
  const closeBtn = shareModal.querySelector('.share-modal__close');
  const copyBtn = shareModal.querySelector('[data-action="copy"]');
  const downloadBtn = shareModal.querySelector('[data-action="download"]');
  const socialBtns = shareModal.querySelectorAll('[data-platform]');

  addTapListener(backdrop, hideShareModal);
  addTapListener(closeBtn, hideShareModal);

  addTapListener(copyBtn, async () => {
    const success = await copyShareUrl(card.shareUrl);
    if (success) {
      const textEl = copyBtn?.querySelector('.share-modal__button-text');
      const iconEl = copyBtn?.querySelector('.share-modal__button-icon');
      if (textEl) textEl.textContent = 'Copied!';
      if (iconEl) iconEl.innerHTML = ICONS.check;
      setTimeout(() => {
        if (textEl) textEl.textContent = 'Copy Link';
        if (iconEl) iconEl.innerHTML = ICONS.copy;
      }, 2000);
    }
  });

  addTapListener(downloadBtn, () => {
    // Open SVG in new tab for saving
    window.open(card.svgUrl, '_blank');
  });

  socialBtns.forEach((btn) => {
    const platform = btn.getAttribute('data-platform') as 'twitter' | 'facebook';
    addTapListener(btn, () => {
      shareToSocial(platform, card.shareUrl, title);
    });
  });
}

function hideShareModal(): void {
  if (!shareModal) return;

  shareModal.classList.remove('share-modal--visible');

  setTimeout(() => {
    cleanupTapListeners(shareModal!);
    shareModal?.remove();
    shareModal = null;
  }, DURATION.SLOW);
}

// ============================================================================
// SHARE BUTTON COMPONENT
// ============================================================================

/**
 * Create a share button element
 */
export function createShareButton(
  cardType: CardType,
  getData: () => Promise<ShareCardData | null>,
  options?: {
    label?: string;
    className?: string;
    onShare?: (card: GeneratedCard) => void;
  }
): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = `share-button ${options?.className || ''}`;
  button.innerHTML = `
    <span class="share-button__icon">${ICONS.share}</span>
    <span class="share-button__label">${options?.label || 'Share'}</span>
  `;
  button.setAttribute('aria-label', options?.label || 'Share');

  let isLoading = false;

  addTapListener(button, async () => {
    if (isLoading) return;

    isLoading = true;
    button.classList.add('share-button--loading');

    try {
      const cardData = await getData();
      if (!cardData) {
        log.warn('No card data available');
        return;
      }

      const card = await generateCard(cardData);
      if (!card) {
        log.warn('Failed to generate card');
        return;
      }

      const titles: Record<CardType, string> = {
        'musical-dna': 'My Musical DNA',
        'desert-island': 'My Desert Island Discs',
        'game-victory': 'I Just Won!',
        'weekly-recap': 'My Week in Music',
      };

      const texts: Record<CardType, string> = {
        'musical-dna': 'Check out my musical personality on Ferni!',
        'desert-island': 'The 5 songs I would take to a desert island',
        'game-victory': 'Think you can beat my score? Try it!',
        'weekly-recap': 'My musical journey this week',
      };

      await shareCard(card, titles[cardType], texts[cardType]);
      options?.onShare?.(card);
    } finally {
      isLoading = false;
      button.classList.remove('share-button--loading');
    }
  });

  return button;
}

// ============================================================================
// INTEGRATION HELPERS
// ============================================================================

/**
 * Add share button to Musical You dashboard
 */
export function addShareToDashboard(
  container: HTMLElement,
  userId: string,
  insights: {
    personality?: { label: string; description: string; traits: Array<{ trait: string; displayName: string; confidence: number; explanation: string }> };
    journeyStats?: { totalGames: number; currentStreak: number };
    strengths?: Array<{ displayName: string; affinityScore: number }>;
  }
): void {
  // Add Musical DNA share button after personality section
  const personalitySection = container.querySelector('.music-dashboard__personality');
  if (personalitySection && insights.personality) {
    const shareBtn = createShareButton('musical-dna', async () => ({
      type: 'musical-dna',
      userId,
      data: {
        type: 'musical-dna',
        personalityLabel: insights.personality!.label,
        personalityDescription: insights.personality!.description,
        topGenres: (insights.strengths || []).slice(0, 4).map((s) => ({
          name: s.displayName,
          score: s.affinityScore,
        })),
        totalGames: insights.journeyStats?.totalGames || 0,
        currentStreak: insights.journeyStats?.currentStreak || 0,
      },
    }), { label: 'Share DNA', className: 'share-button--small' });

    personalitySection.appendChild(shareBtn);
  }
}

/**
 * Share a game victory
 */
export async function shareGameVictory(
  userId: string,
  gameType: string,
  gameDisplayName: string,
  score: number,
  guessTimeMs?: number,
  trackName?: string,
  artistName?: string,
  isPersonalBest?: boolean
): Promise<void> {
  const cardData: ShareCardData = {
    type: 'game-victory',
    userId,
    data: {
      type: 'game-victory',
      gameType,
      gameDisplayName,
      score,
      guessTimeMs,
      trackName,
      artistName,
      isPersonalBest: isPersonalBest || false,
    },
  };

  const card = await generateCard(cardData);
  if (card) {
    await shareCard(card, 'I Just Won!', `Beat my ${gameDisplayName} score on Ferni!`);
  }
}

// ============================================================================
// STYLES
// ============================================================================

let stylesInjected = false;

function injectShareModalStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;

  const style = document.createElement('style');
  style.textContent = `
    /* Share Modal */
    .share-modal {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal, 2100);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      visibility: hidden;
      transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD},
                  visibility ${DURATION.SLOW}ms ${EASING.STANDARD};
    }

    .share-modal--visible {
      opacity: 1;
      visibility: visible;
    }

    .share-modal__backdrop {
      position: absolute;
      inset: 0;
      background: rgba(44, 37, 32, 0.5);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
    }

    .share-modal__card {
      position: relative;
      width: 90%;
      max-width: 400px;
      background: var(--color-background-elevated, #fffdfb);
      border-radius: var(--radius-2xl, 20px);
      box-shadow: var(--shadow-2xl, 0 25px 50px -12px rgba(0, 0, 0, 0.25));
      overflow: hidden;
      transform: scale(0.95);
      transition: transform ${DURATION.SLOW}ms ${EASING.SPRING};
    }

    .share-modal--visible .share-modal__card {
      transform: scale(1);
    }

    .share-modal__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-4, 16px) var(--space-5, 20px);
      border-bottom: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.08));
    }

    .share-modal__title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: 1.125rem;
      font-weight: 700;
      color: var(--color-text-primary, #2c2520);
      margin: 0;
    }

    .share-modal__close {
      width: 32px;
      height: 32px;
      border: none;
      background: transparent;
      border-radius: var(--radius-full, 50%);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-secondary, #5c5248);
      transition: background ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .share-modal__close:hover,
    .share-modal__close:focus-visible {
      background: var(--color-background-hover, rgba(0, 0, 0, 0.05));
    }

    .share-modal__close svg {
      width: 18px;
      height: 18px;
    }

    .share-modal__preview {
      padding: var(--space-4, 16px);
      background: var(--color-background-subtle, #f5f2ed);
      display: flex;
      justify-content: center;
    }

    .share-modal__image {
      max-width: 100%;
      max-height: 300px;
      border-radius: var(--radius-lg, 12px);
      box-shadow: var(--shadow-md, 0 4px 12px rgba(0, 0, 0, 0.1));
    }

    .share-modal__actions {
      display: flex;
      gap: var(--space-3, 12px);
      padding: var(--space-4, 16px) var(--space-5, 20px);
    }

    .share-modal__button {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2, 8px);
      padding: var(--space-3, 12px);
      border: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.08));
      background: var(--color-background-elevated, #fffdfb);
      border-radius: var(--radius-lg, 12px);
      cursor: pointer;
      font-weight: 600;
      font-size: 0.875rem;
      color: var(--color-text-primary, #2c2520);
      transition: background ${DURATION.FAST}ms ${EASING.STANDARD},
                  transform ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .share-modal__button:hover,
    .share-modal__button:focus-visible {
      background: var(--color-background-subtle, #f5f2ed);
    }

    .share-modal__button:active {
      transform: scale(0.98);
    }

    .share-modal__button--primary {
      background: var(--persona-primary, #4a6741);
      border-color: var(--persona-primary, #4a6741);
      color: white;
    }

    .share-modal__button--primary:hover,
    .share-modal__button--primary:focus-visible {
      background: var(--persona-secondary, #3d5a35);
    }

    .share-modal__button-icon {
      width: 18px;
      height: 18px;
      display: flex;
    }

    .share-modal__button-icon svg {
      width: 100%;
      height: 100%;
    }

    .share-modal__social {
      display: flex;
      justify-content: center;
      gap: var(--space-3, 12px);
      padding: 0 var(--space-5, 20px) var(--space-4, 16px);
    }

    .share-modal__social-btn {
      width: 44px;
      height: 44px;
      border: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.08));
      background: var(--color-background-elevated, #fffdfb);
      border-radius: var(--radius-full, 50%);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-secondary, #5c5248);
      transition: background ${DURATION.FAST}ms ${EASING.STANDARD},
                  color ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .share-modal__social-btn:hover,
    .share-modal__social-btn:focus-visible {
      background: var(--color-background-subtle, #f5f2ed);
      color: var(--color-text-primary, #2c2520);
    }

    .share-modal__social-btn svg {
      width: 20px;
      height: 20px;
    }

    .share-modal__url {
      padding: 0 var(--space-5, 20px) var(--space-5, 20px);
    }

    .share-modal__url-input {
      width: 100%;
      padding: var(--space-3, 12px);
      border: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.08));
      border-radius: var(--radius-md, 8px);
      background: var(--color-background-subtle, #f5f2ed);
      font-size: 0.8rem;
      color: var(--color-text-muted, #7a6f63);
      font-family: monospace;
    }

    /* Share Button */
    .share-button {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2, 8px);
      padding: var(--space-2, 8px) var(--space-3, 12px);
      border: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.08));
      background: var(--color-background-elevated, #fffdfb);
      border-radius: var(--radius-full, 50px);
      cursor: pointer;
      font-weight: 600;
      font-size: 0.875rem;
      color: var(--color-text-secondary, #5c5248);
      transition: background ${DURATION.FAST}ms ${EASING.STANDARD},
                  color ${DURATION.FAST}ms ${EASING.STANDARD},
                  transform ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .share-button:hover,
    .share-button:focus-visible {
      background: var(--color-background-subtle, #f5f2ed);
      color: var(--color-text-primary, #2c2520);
    }

    .share-button:active {
      transform: scale(0.98);
    }

    .share-button--small {
      padding: var(--space-1, 4px) var(--space-2, 8px);
      font-size: 0.75rem;
    }

    .share-button--loading {
      opacity: 0.6;
      pointer-events: none;
    }

    .share-button__icon {
      width: 16px;
      height: 16px;
      display: flex;
    }

    .share-button__icon svg {
      width: 100%;
      height: 100%;
    }

    .share-button--small .share-button__icon {
      width: 14px;
      height: 14px;
    }

    /* Dark theme */
    @media (prefers-color-scheme: dark) {
      .share-modal__card {
        background: var(--color-background-elevated, #3a3530);
      }

      .share-modal__preview {
        background: var(--color-background-subtle, #2c2825);
      }

      .share-modal__url-input {
        background: var(--color-background-subtle, #2c2825);
      }
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .share-modal,
      .share-modal__card,
      .share-modal__button,
      .share-modal__social-btn,
      .share-button {
        transition: none !important;
      }
    }
  `;

  document.head.appendChild(style);
}

// ============================================================================
// INITIALIZE STYLES ON IMPORT
// ============================================================================

// Inject button styles immediately (modal styles are lazy)
const buttonStyle = document.createElement('style');
buttonStyle.textContent = `
  .share-button {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2, 8px);
    padding: var(--space-2, 8px) var(--space-3, 12px);
    border: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.08));
    background: var(--color-background-elevated, #fffdfb);
    border-radius: var(--radius-full, 50px);
    cursor: pointer;
    font-weight: 600;
    font-size: 0.875rem;
    color: var(--color-text-secondary, #5c5248);
    transition: background ${DURATION.FAST}ms ${EASING.STANDARD},
                color ${DURATION.FAST}ms ${EASING.STANDARD};
  }

  .share-button:hover,
  .share-button:focus-visible {
    background: var(--color-background-subtle, #f5f2ed);
    color: var(--color-text-primary, #2c2520);
  }

  .share-button--small {
    padding: var(--space-1, 4px) var(--space-2, 8px);
    font-size: 0.75rem;
  }

  .share-button--loading {
    opacity: 0.6;
    pointer-events: none;
  }

  .share-button__icon {
    width: 16px;
    height: 16px;
    display: flex;
  }

  .share-button__icon svg {
    width: 100%;
    height: 100%;
  }
`;
document.head.appendChild(buttonStyle);

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  createShareButton,
  addShareToDashboard,
  shareGameVictory,
};

