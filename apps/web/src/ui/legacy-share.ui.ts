/**
 * Legacy Share UI
 * 
 * Allows users to share a Legacy agent (preserved memories of a loved one)
 * with family members via invite links.
 * 
 * @module legacy-share.ui
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { getCustomAgent, type CustomAgent } from '../services/custom-agent.service.js';
import { soundUI } from './sound.ui.js';

const log = createLogger('LegacyShare');

let shareModal: HTMLElement | null = null;
let currentAgent: CustomAgent | null = null;

// ============================================================================
// STYLES
// ============================================================================

const STYLES = `
  .legacy-share-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-tooltip);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4);
  }

  .legacy-share-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(44, 37, 32, 0.75);
  }

  .legacy-share-modal {
    position: relative;
    width: 100%;
    max-width: clamp(336px, 90vw, 480px);
    background: var(--color-background-elevated);
    border-radius: var(--radius-2xl);
    box-shadow: var(--shadow-2xl);
    overflow: hidden;
    transform: scale(0.95);
    opacity: 0;
    transition: transform ${DURATION.SLOW}ms ${EASING.SPRING}, 
                opacity ${DURATION.SLOW}ms ${EASING.GENTLE};
  }

  .legacy-share-modal.visible {
    transform: scale(1);
    opacity: 1;
  }

  .legacy-share-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--color-border);
    background: linear-gradient(135deg, var(--color-accent-light), transparent);
  }

  .legacy-share-title {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .legacy-share-eyebrow {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-text-muted);
    font-weight: 600;
  }

  .legacy-share-name {
    font-family: var(--font-display);
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0;
  }

  .legacy-share-close {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-full);
    background: transparent;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-muted);
    transition: all ${DURATION.FAST}ms ease;
  }

  .legacy-share-close:hover {
    background: var(--color-background-hover);
    color: var(--color-text-primary);
  }

  .legacy-share-content {
    padding: var(--space-5);
  }

  .legacy-share-intro {
    text-align: center;
    margin-bottom: var(--space-5);
  }

  .legacy-share-icon {
    width: 64px;
    height: 64px;
    margin: 0 auto var(--space-3);
    background: var(--color-accent-light);
    border-radius: var(--radius-full);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-accent);
  }

  .legacy-share-intro-title {
    font-family: var(--font-display);
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0 0 var(--space-2);
  }

  .legacy-share-intro-text {
    font-size: 0.9rem;
    color: var(--color-text-muted);
    line-height: 1.6;
    margin: 0;
  }

  .legacy-share-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .legacy-share-input-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .legacy-share-label {
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--color-text-primary);
  }

  .legacy-share-input {
    width: 100%;
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-background-subtle);
    color: var(--color-text-primary);
    font-size: 0.95rem;
    transition: all ${DURATION.FAST}ms ease;
  }

  .legacy-share-input:focus {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px var(--color-accent-light);
  }

  .legacy-share-input::placeholder {
    color: var(--color-text-muted);
  }

  .legacy-share-textarea {
    resize: vertical;
    min-height: 80px;
  }

  .legacy-share-hint {
    font-size: 0.8rem;
    color: var(--color-text-muted);
  }

  .legacy-share-divider {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin: var(--space-4) 0;
  }

  .legacy-share-divider::before,
  .legacy-share-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--color-border);
  }

  .legacy-share-divider-text {
    font-size: 0.8rem;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .legacy-share-link-section {
    background: var(--color-background-subtle);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
  }

  .legacy-share-link-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0 0 var(--space-2);
  }

  .legacy-share-link-row {
    display: flex;
    gap: var(--space-2);
  }

  .legacy-share-link-input {
    flex: 1;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-background-elevated);
    color: var(--color-text-secondary);
    font-size: 0.85rem;
    font-family: monospace;
  }

  .legacy-share-copy-btn {
    padding: var(--space-2) var(--space-3);
    border: none;
    border-radius: var(--radius-md);
    background: var(--color-accent);
    color: white;
    font-size: 0.85rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: var(--space-1);
    transition: all ${DURATION.FAST}ms ease;
  }

  .legacy-share-copy-btn:hover {
    background: var(--color-accent-hover);
  }

  .legacy-share-actions {
    display: flex;
    gap: var(--space-3);
    margin-top: var(--space-4);
  }

  .legacy-share-btn {
    flex: 1;
    padding: var(--space-3);
    border-radius: var(--radius-lg);
    font-weight: 500;
    cursor: pointer;
    transition: all ${DURATION.FAST}ms ease;
  }

  .legacy-share-btn--secondary {
    background: var(--color-background-subtle);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
  }

  .legacy-share-btn--secondary:hover {
    background: var(--color-background-hover);
  }

  .legacy-share-btn--primary {
    background: var(--color-accent);
    border: none;
    color: white;
  }

  .legacy-share-btn--primary:hover {
    background: var(--color-accent-hover);
    transform: translateY(-1px);
  }

  .legacy-share-members {
    margin-top: var(--space-5);
    padding-top: var(--space-4);
    border-top: 1px solid var(--color-border);
  }

  .legacy-share-members-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0 0 var(--space-3);
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .legacy-share-members-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .legacy-share-member {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3);
    background: var(--color-background-subtle);
    border-radius: var(--radius-lg);
  }

  .legacy-share-member-avatar {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-full);
    background: var(--color-accent-light);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-accent);
    font-weight: 600;
    font-size: 0.9rem;
  }

  .legacy-share-member-info {
    flex: 1;
  }

  .legacy-share-member-name {
    font-weight: 500;
    color: var(--color-text-primary);
    margin: 0;
    font-size: 0.9rem;
  }

  .legacy-share-member-status {
    font-size: 0.8rem;
    color: var(--color-text-muted);
  }

  .legacy-share-empty-members {
    text-align: center;
    padding: var(--space-4);
    color: var(--color-text-muted);
    font-size: 0.9rem;
  }
`;

// ============================================================================
// RENDER
// ============================================================================

function render(): string {
  if (!currentAgent) return '';

  const agent = currentAgent as unknown as Record<string, unknown>;
  const sharedWith = (agent.sharedWith || []) as Array<{ email: string; name?: string; status: string }>;
  const shareLink = generateShareLink(currentAgent.id);

  return `
    <div class="legacy-share-overlay">
      <div class="legacy-share-backdrop"></div>
      <div class="legacy-share-modal" role="dialog" aria-labelledby="share-title">
        <header class="legacy-share-header">
          <div class="legacy-share-title">
            <span class="legacy-share-eyebrow">Share Their Memory</span>
            <h2 class="legacy-share-name" id="share-title">Invite Family</h2>
          </div>
          <button class="legacy-share-close" aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </header>
        
        <div class="legacy-share-content">
          <div class="legacy-share-intro">
            <div class="legacy-share-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <h3 class="legacy-share-intro-title">Keep Their Memory Alive Together</h3>
            <p class="legacy-share-intro-text">
              Invite family members to access ${currentAgent.displayName || currentAgent.name}'s stories, 
              wisdom, and memories. They'll be able to talk with them and add their own stories.
            </p>
          </div>

          <form class="legacy-share-form" id="share-form">
            <div class="legacy-share-input-group">
              <label class="legacy-share-label" for="invite-email">Email Address</label>
              <input 
                type="email" 
                id="invite-email" 
                class="legacy-share-input" 
                placeholder="family.member@example.com"
                required
              />
            </div>
            <div class="legacy-share-input-group">
              <label class="legacy-share-label" for="invite-name">Their Name (optional)</label>
              <input 
                type="text" 
                id="invite-name" 
                class="legacy-share-input" 
                placeholder="e.g., Aunt Sarah"
              />
            </div>
            <div class="legacy-share-input-group">
              <label class="legacy-share-label" for="invite-message">Personal Message (optional)</label>
              <textarea 
                id="invite-message" 
                class="legacy-share-input legacy-share-textarea" 
                placeholder="I wanted to share ${currentAgent.displayName || currentAgent.name}'s memories with you..."
              ></textarea>
            </div>
          </form>

          <div class="legacy-share-divider">
            <span class="legacy-share-divider-text">or share a link</span>
          </div>

          <div class="legacy-share-link-section">
            <h4 class="legacy-share-link-title">Share Link</h4>
            <div class="legacy-share-link-row">
              <input 
                type="text" 
                class="legacy-share-link-input" 
                value="${shareLink}" 
                readonly 
                id="share-link"
              />
              <button aria-label="Copy" class="legacy-share-copy-btn" data-action="copy-link">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                Copy
              </button>
            </div>
            <p class="legacy-share-hint">Anyone with this link can access ${currentAgent.displayName || currentAgent.name}'s memories.</p>
          </div>

          <div class="legacy-share-actions" role="button" tabindex="0">
            <button aria-label="Cancel" class="legacy-share-btn legacy-share-btn--secondary" data-action="cancel">
              Cancel
            </button>
            <button aria-label="Send Invite" class="legacy-share-btn legacy-share-btn--primary" data-action="send-invite">
              Send Invite
            </button>
          </div>

          ${sharedWith.length > 0 ? `
            <div class="legacy-share-members">
              <h4 class="legacy-share-members-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                </svg>
                Shared With (${sharedWith.length})
              </h4>
              <div class="legacy-share-members-list">
                ${sharedWith.map(member => `
                  <div class="legacy-share-member">
                    <div class="legacy-share-member-avatar">
                      ${(member.name || member.email)[0].toUpperCase()}
                    </div>
                    <div class="legacy-share-member-info">
                      <p class="legacy-share-member-name">${member.name || member.email}</p>
                      <span class="legacy-share-member-status">${member.status === 'accepted' ? 'Joined' : 'Pending invite'}</span>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

function generateShareLink(agentId: string): string {
  // Generate a shareable link - in production this would be a proper invite system
  const baseUrl = window.location.origin;
  return `${baseUrl}/legacy/invite/${agentId}`;
}

// ============================================================================
// PUBLIC API
// ============================================================================

export async function openLegacyShare(agentId: string): Promise<void> {
  log.debug('Opening Legacy Share for agent:', agentId);

  closeLegacyShare();

  currentAgent = await getCustomAgent(agentId);
  if (!currentAgent) {
    log.error('Agent not found:', agentId);
    const { toast } = await import('./toast.ui.js');
    toast.error("Couldn't find this legacy");
    return;
  }

  if (!document.querySelector('#legacy-share-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'legacy-share-styles';
    styleEl.textContent = STYLES;
    document.head.appendChild(styleEl);
  }

  shareModal = document.createElement('div');
  shareModal.innerHTML = render();
  document.body.appendChild(shareModal);

  requestAnimationFrame(() => {
    const modal = shareModal?.querySelector('.legacy-share-modal');
    modal?.classList.add('visible');
  });

  attachListeners();
  soundUI.play('open');
}

export function closeLegacyShare(): void {
  if (!shareModal) return;

  const modal = shareModal.querySelector('.legacy-share-modal');
  modal?.classList.remove('visible');

  setTimeout(() => {
    shareModal?.remove();
    shareModal = null;
    currentAgent = null;
  }, DURATION.SLOW);

  soundUI.play('close');
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function attachListeners(): void {
  if (!shareModal) return;

  shareModal.querySelector('.legacy-share-close')?.addEventListener('click', closeLegacyShare);
  shareModal.querySelector('.legacy-share-backdrop')?.addEventListener('click', closeLegacyShare);
  shareModal.querySelector('[data-action="cancel"]')?.addEventListener('click', closeLegacyShare);

  const escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeLegacyShare();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  shareModal.querySelector('[data-action="copy-link"]')?.addEventListener('click', handleCopyLink);
  shareModal.querySelector('[data-action="send-invite"]')?.addEventListener('click', handleSendInvite);
}

async function handleCopyLink(): Promise<void> {
  const { toast } = await import('./toast.ui.js');
  const linkInput = shareModal?.querySelector('#share-link') as HTMLInputElement;
  
  if (linkInput) {
    try {
      await navigator.clipboard.writeText(linkInput.value);
      toast.success('Link copied!');
    } catch {
      linkInput.select();
      document.execCommand('copy');
      toast.success('Link copied!');
    }
  }
}

async function handleSendInvite(): Promise<void> {
  const { toast } = await import('./toast.ui.js');
  
  const emailInput = shareModal?.querySelector('#invite-email') as HTMLInputElement;
  const nameInput = shareModal?.querySelector('#invite-name') as HTMLInputElement;
  const messageInput = shareModal?.querySelector('#invite-message') as HTMLTextAreaElement;

  const email = emailInput?.value?.trim();
  if (!email) {
    toast.warning('Enter an email address');
    emailInput?.focus();
    return;
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    toast.warning('Enter a valid email');
    emailInput?.focus();
    return;
  }

  // In production, this would call an API to send the invite
  // For now, we'll simulate the success
  log.info('Sending invite to:', email, nameInput?.value, messageInput?.value);

  toast.success(`Invite sent to ${email}!`);
  closeLegacyShare();
}

