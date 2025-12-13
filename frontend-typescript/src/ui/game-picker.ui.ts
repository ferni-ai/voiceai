/**
 * 🎮 Game Picker Modal
 * 
 * A beautiful modal for selecting music games to play.
 * Integrates with the voice agent to start games.
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { toast } from './toast.ui.js';

const log = createLogger('GamePicker');

// ============================================================================
// TYPES
// ============================================================================

interface GameOption {
  id: string;
  name: string;
  description: string;
  icon: string;
  difficulty: 'easy' | 'medium' | 'hard';
  duration: string;
}

// ============================================================================
// GAME OPTIONS
// ============================================================================

// Lucide SVG icons (2px stroke, rounded corners)
const ICONS = {
  music: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
  messageCircle: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>`,
  palmtree: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 8c0-2.76-2.46-5-5.5-5S2 5.24 2 8h2l1-1 1 1h4"/><path d="M13 7.14A5.82 5.82 0 0 1 16.5 6c3.04 0 5.5 2.24 5.5 5h-3l-1-1-1 1h-3"/><path d="M5.89 9.71c-2.15 2.15-2.3 5.47-.35 7.43l4.24-4.25.7-.7.71-.71 2.12-2.12c-1.95-1.96-5.27-1.8-7.42.35z"/><path d="M11 15.5c.5 2.5-.17 4.5-1 6.5h4c2-5.5-.5-12-1-14"/></svg>`,
  zap: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  headphones: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/></svg>`,
  gamepad: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="15" y1="13" x2="15.01" y2="13"/><line x1="18" y1="11" x2="18.01" y2="11"/><rect x="2" y="6" width="20" height="12" rx="2"/></svg>`,
  lightbulb: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>`,
};

const GAMES: GameOption[] = [
  {
    id: 'name-that-tune',
    name: 'Name That Tune',
    description: 'Guess the song from a short clip! Classic music trivia.',
    icon: ICONS.music,
    difficulty: 'medium',
    duration: '3-5 min',
  },
  {
    id: 'one-word-song',
    name: 'One Word Song',
    description: 'I say a word, you think of a song with that word in the title.',
    icon: ICONS.messageCircle,
    difficulty: 'easy',
    duration: '2-3 min',
  },
  {
    id: 'desert-island-discs',
    name: 'Desert Island Discs',
    description: 'Pick 5 songs to take to a desert island. Share your story.',
    icon: ICONS.palmtree,
    difficulty: 'easy',
    duration: '5-10 min',
  },
  {
    id: 'this-or-that',
    name: 'This or That',
    description: 'Quick-fire choices between two songs. Which speaks to you?',
    icon: ICONS.zap,
    difficulty: 'easy',
    duration: '2-3 min',
  },
  {
    id: 'mood-dj-challenge',
    name: 'Mood DJ Challenge',
    description: 'I give you a mood, you pick the perfect song for it.',
    icon: ICONS.headphones,
    difficulty: 'medium',
    duration: '3-5 min',
  },
];

// ============================================================================
// GAME PICKER UI CLASS
// ============================================================================

class GamePickerUI {
  private container: HTMLElement | null = null;
  private isVisible = false;
  private styleElement: HTMLStyleElement | null = null;

  constructor() {
    this.injectStyles();
  }

  /**
   * Show the game picker modal
   */
  show(): void {
    if (this.isVisible) return;
    
    this.cleanup();
    this.container = this.createModal();
    document.body.appendChild(this.container);
    
    // Animate in
    requestAnimationFrame(() => {
      this.container?.classList.add('game-picker--visible');
    });
    
    this.isVisible = true;
    log.info('🎮 Game picker opened');
  }

  /**
   * Hide the game picker modal
   */
  hide(): void {
    if (!this.isVisible || !this.container) return;
    
    this.container.classList.remove('game-picker--visible');
    
    setTimeout(() => {
      this.container?.remove();
      this.container = null;
      this.isVisible = false;
    }, DURATION.SLOW);
    
    log.info('🎮 Game picker closed');
  }

  /**
   * Cleanup any existing instances
   */
  private cleanup(): void {
    document.querySelectorAll('.game-picker').forEach(el => el.remove());
  }

  /**
   * Create the modal DOM
   */
  private createModal(): HTMLElement {
    const modal = document.createElement('div');
    modal.className = 'game-picker';
    
    modal.innerHTML = `
      <div class="game-picker__backdrop"></div>
      <div class="game-picker__content">
        <header class="game-picker__header">
          <span class="game-picker__eyebrow">LET'S PLAY</span>
          <h2 class="game-picker__title">Music Games</h2>
          <p class="game-picker__subtitle">Pick a game to play together</p>
          <button class="game-picker__close" aria-label="Close">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </header>
        
        <div class="game-picker__games">
          ${GAMES.map((game, index) => this.renderGameCard(game, index)).join('')}
        </div>
        
        <footer class="game-picker__footer">
          <p>Or just say "Let's play a game" to Ferni!</p>
          <button class="game-picker__help-btn" aria-label="How to play">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            How to play
          </button>
        </footer>
      </div>
    `;
    
    this.bindEvents(modal);
    return modal;
  }

  /**
   * Render a single game card
   */
  private renderGameCard(game: GameOption, index: number): string {
    const difficultyColors: Record<string, string> = {
      easy: 'var(--color-success)',
      medium: 'var(--persona-primary)',
      hard: 'var(--color-warning)',
    };
    
    return `
      <button class="game-card" data-game="${game.id}" style="animation-delay: ${index * 50}ms">
        <div class="game-card__icon">${game.icon}</div>
        <div class="game-card__info">
          <h3 class="game-card__name">${game.name}</h3>
          <p class="game-card__description">${game.description}</p>
          <div class="game-card__meta">
            <span class="game-card__difficulty" style="color: ${difficultyColors[game.difficulty]}">
              ${game.difficulty}
            </span>
            <span class="game-card__duration">${game.duration}</span>
          </div>
        </div>
        <div class="game-card__arrow">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </div>
      </button>
    `;
  }

  /**
   * Bind event handlers
   */
  private bindEvents(modal: HTMLElement): void {
    // Close button
    modal.querySelector('.game-picker__close')?.addEventListener('click', () => {
      this.hide();
    });
    
    // Backdrop click
    modal.querySelector('.game-picker__backdrop')?.addEventListener('click', () => {
      this.hide();
    });
    
    // Game cards
    modal.querySelectorAll('.game-card').forEach(card => {
      card.addEventListener('click', () => {
        const gameId = (card as HTMLElement).dataset.game;
        if (gameId) {
          this.startGame(gameId);
        }
      });
    });
    
    // Help button
    modal.querySelector('.game-picker__help-btn')?.addEventListener('click', () => {
      this.showHelpModal();
    });
    
    // Escape key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.hide();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);
  }

  /**
   * Show help modal with game instructions
   */
  private showHelpModal(): void {
    const helpContent = `
      <div class="game-help-modal">
        <div class="game-help-modal__backdrop"></div>
        <div class="game-help-modal__content">
          <button class="game-help-modal__close" aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
          <h2 class="game-help-modal__title">
            <span class="game-help-modal__icon">${ICONS.gamepad}</span>
            How to Play Music Games
          </h2>
          
          <section class="game-help-section">
            <h3><span class="game-help-section__icon">${ICONS.music}</span> Name That Tune</h3>
            <p>Listen to a short music clip and guess the song or artist. The faster you guess, the more points!</p>
            <ul>
              <li>Just say your guess out loud</li>
              <li>Partial answers count (artist OR song title)</li>
              <li>Say "skip" or "next" to move on</li>
            </ul>
          </section>
          
          <section class="game-help-section">
            <h3><span class="game-help-section__icon">${ICONS.messageCircle}</span> One Word Song</h3>
            <p>I give you a word, you think of a song with that word in the title.</p>
            <ul>
              <li>Any song with the word counts!</li>
              <li>Bonus points for creative picks</li>
            </ul>
          </section>
          
          <section class="game-help-section">
            <h3><span class="game-help-section__icon">${ICONS.palmtree}</span> Desert Island Discs</h3>
            <p>Pick 5 songs to take with you to a desert island. Tell me why each one matters.</p>
            <ul>
              <li>No wrong answers - it's about your story</li>
              <li>We'll play each song together</li>
            </ul>
          </section>
          
          <section class="game-help-section">
            <h3><span class="game-help-section__icon">${ICONS.zap}</span> This or That</h3>
            <p>Quick choices between two songs. Which speaks to you more?</p>
            <ul>
              <li>Fast-paced and fun</li>
              <li>Helps me learn your taste!</li>
            </ul>
          </section>
          
          <section class="game-help-section">
            <h3><span class="game-help-section__icon">${ICONS.headphones}</span> Mood DJ Challenge</h3>
            <p>I give you a mood, you pick the perfect song for it.</p>
            <ul>
              <li>Be creative with your picks</li>
              <li>Explain your choice for bonus fun</li>
            </ul>
          </section>
          
          <div class="game-help-tip">
            <span class="game-help-tip__icon">${ICONS.lightbulb}</span>
            <strong>Tip:</strong> Say "stop" or "end game" anytime to finish early. Your progress is always saved!
          </div>
        </div>
      </div>
    `;
    
    const helpModal = document.createElement('div');
    helpModal.innerHTML = helpContent;
    document.body.appendChild(helpModal.firstElementChild as HTMLElement);
    
    // Bind close events
    const modalEl = document.querySelector('.game-help-modal');
    modalEl?.querySelector('.game-help-modal__close')?.addEventListener('click', () => {
      modalEl.remove();
    });
    modalEl?.querySelector('.game-help-modal__backdrop')?.addEventListener('click', () => {
      modalEl.remove();
    });
  }

  /**
   * Start a game via the voice agent
   */
  private async startGame(gameId: string): Promise<void> {
    const game = GAMES.find(g => g.id === gameId);
    if (!game) return;
    
    log.info({ gameId }, '🎮 Starting game');
    
    // Show loading state
    const card = this.container?.querySelector(`[data-game="${gameId}"]`);
    if (card) {
      card.classList.add('game-card--loading');
    }
    
    try {
      const { connectionService } = await import('../services/connection.service.js');
      const roomState = connectionService.getRoomState();
      const room = connectionService.getRoom();
      
      log.info({ 
        isConnected: roomState.isConnected, 
        hasRoom: !!room, 
        hasLocalParticipant: !!room?.localParticipant 
      }, '🎮 Connection state check');
      
      if (!roomState.isConnected || !room?.localParticipant) {
        log.warn('🎮 Not connected - showing error');
        this.showError('Connect to Ferni first to play games');
        if (card) {
          card.classList.remove('game-card--loading');
        }
        return;
      }

      // Send game start request via data channel
      const message = JSON.stringify({
        type: 'game_start_request',
        gameType: gameId,
        timestamp: Date.now(),
      });

      log.info({ gameId, message }, '🎮 Sending game start request');
      
      await room.localParticipant.publishData(
        new TextEncoder().encode(message),
        { reliable: true }
      );
      
      log.info({ gameId }, '🎮 Game start request sent successfully');
      
      // Close picker and show success
      this.hide();
      this.showSuccess(`Starting ${game.name}...`);
      
    } catch (error) {
      log.error({ error, gameId }, '🎮 Failed to start game');
      this.showError('Failed to start game. Try asking Ferni directly!');
      
      if (card) {
        card.classList.remove('game-card--loading');
      }
    }
  }

  /**
   * Show success toast
   */
  private showSuccess(message: string): void {
    this.showToast(message, 'success');
  }

  /**
   * Show error toast
   */
  private showError(message: string): void {
    this.showToast(message, 'error');
  }

  /**
   * Show a toast notification
   */
  private showToast(message: string, type: 'success' | 'error'): void {
    log.info({ message, type }, '🎮 Showing toast');
    if (type === 'success') {
      toast.success(message);
    } else {
      toast.error(message);
    }
  }

  /**
   * Inject styles
   */
  private injectStyles(): void {
    if (this.styleElement) return;
    
    this.styleElement = document.createElement('style');
    this.styleElement.textContent = `
      /* Game Picker Modal */
      .game-picker {
        position: fixed;
        inset: 0;
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        pointer-events: none;
        transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD};
      }
      
      .game-picker--visible {
        opacity: 1;
        pointer-events: auto;
      }
      
      .game-picker__backdrop {
        position: absolute;
        inset: 0;
        background: rgba(44, 37, 32, 0.6);
        backdrop-filter: blur(var(--glass-blur-strong, 24px));
      }
      
      .game-picker__content {
        position: relative;
        width: 90%;
        max-width: 500px;
        max-height: 85vh;
        background: var(--color-background-elevated, #FFFDFB);
        border-radius: var(--radius-2xl, 24px);
        box-shadow: var(--shadow-2xl);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        transform: scale(0.95) translateY(10px);
        transition: transform ${DURATION.SLOW}ms ${EASING.SPRING};
      }
      
      .game-picker--visible .game-picker__content {
        transform: scale(1) translateY(0);
      }
      
      /* Header */
      .game-picker__header {
        padding: var(--space-6, 24px);
        padding-bottom: var(--space-4, 16px);
        text-align: center;
        position: relative;
      }
      
      .game-picker__eyebrow {
        display: block;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--color-text-secondary);
        margin-bottom: var(--space-2, 8px);
      }
      
      .game-picker__title {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: 28px;
        font-weight: 700;
        color: var(--color-text-primary, #2C2520);
        margin: 0 0 var(--space-1, 4px);
      }
      
      .game-picker__subtitle {
        font-size: 15px;
        color: var(--color-text-secondary, #6B5D52);
        margin: 0;
      }
      
      .game-picker__close {
        position: absolute;
        top: var(--space-4, 16px);
        right: var(--space-4, 16px);
        width: 36px;
        height: 36px;
        border: none;
        background: var(--color-background-subtle, #F5F1E8);
        border-radius: var(--radius-full, 50%);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--color-text-secondary, #6B5D52);
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }
      
      .game-picker__close:hover {
        background: var(--color-background-hover, #E8E2DA);
        color: var(--color-text-primary, #2C2520);
      }
      
      /* Games List */
      .game-picker__games {
        flex: 1;
        overflow-y: auto;
        padding: 0 var(--space-4, 16px);
        display: flex;
        flex-direction: column;
        gap: var(--space-3, 12px);
      }
      
      /* Game Card */
      .game-card {
        display: flex;
        align-items: center;
        gap: var(--space-4, 16px);
        padding: var(--space-4, 16px);
        background: var(--color-background-subtle, #F5F1E8);
        border: 2px solid transparent;
        border-radius: var(--radius-xl, 16px);
        cursor: pointer;
        text-align: left;
        transition: all ${DURATION.NORMAL}ms ${EASING.STANDARD};
        animation: game-card-in ${DURATION.SLOW}ms ${EASING.SPRING} backwards;
      }
      
      @keyframes game-card-in {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
      }
      
      .game-card:hover {
        background: var(--color-background-hover, #E8E2DA);
        border-color: var(--color-text-secondary);
        transform: translateX(4px);
      }
      
      .game-card:active {
        transform: scale(0.98);
      }
      
      .game-card--loading {
        opacity: 0.6;
        pointer-events: none;
      }
      
      .game-card__icon {
        width: 48px;
        height: 48px;
        background: var(--color-background-elevated, white);
        border-radius: var(--radius-lg, 12px);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        color: var(--color-text-secondary);
      }
      
      .game-card__icon svg {
        width: 24px;
        height: 24px;
      }
      
      .game-card__info {
        flex: 1;
        min-width: 0;
      }
      
      .game-card__name {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: 16px;
        font-weight: 600;
        color: var(--color-text-primary, #2C2520);
        margin: 0 0 var(--space-1, 4px);
      }
      
      .game-card__description {
        font-size: 13px;
        color: var(--color-text-secondary, #6B5D52);
        margin: 0 0 var(--space-2, 8px);
        line-height: 1.4;
      }
      
      .game-card__meta {
        display: flex;
        gap: var(--space-3, 12px);
        font-size: 11px;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      
      .game-card__difficulty {
        font-weight: 600;
      }
      
      .game-card__duration {
        color: var(--color-text-muted, #9A8B7A);
      }
      
      .game-card__arrow {
        color: var(--color-text-muted, #9A8B7A);
        transition: transform ${DURATION.FAST}ms ${EASING.STANDARD};
      }
      
      .game-card:hover .game-card__arrow {
        transform: translateX(4px);
        color: var(--color-text-secondary);
      }
      
      /* Footer */
      .game-picker__footer {
        padding: var(--space-4, 16px) var(--space-6, 24px);
        text-align: center;
        border-top: 1px solid var(--color-border, #E8E2DA);
      }
      
      .game-picker__footer p {
        font-size: 13px;
        color: var(--color-text-muted, #9A8B7A);
        margin: 0;
      }
      
      /* Dark theme */
      [data-theme="dark"] .game-picker__backdrop {
        background: rgba(0, 0, 0, 0.7);
      }
      
      [data-theme="dark"] .game-picker__content {
        background: var(--color-background-elevated, #3a3330);
      }
      
      [data-theme="dark"] .game-card {
        background: var(--color-background-subtle, #2a2520);
      }
      
      [data-theme="dark"] .game-card:hover {
        background: var(--color-background-hover, #4a4540);
      }
      
      [data-theme="dark"] .game-card__icon {
        background: var(--color-background-elevated, #3a3330);
      }
      
      /* Help button */
      .game-picker__help-btn {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2, 8px);
        margin-top: var(--space-2, 8px);
        padding: var(--space-2, 8px) var(--space-4, 16px);
        background: transparent;
        border: 1px solid var(--color-border, #E8E2DA);
        border-radius: var(--radius-full, 50px);
        font-size: 13px;
        color: var(--color-text-secondary, #6B5D52);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }
      
      .game-picker__help-btn:hover {
        background: var(--color-background-subtle, #F5F1E8);
        color: var(--color-text-secondary);
        border-color: var(--color-text-secondary);
      }
      
      /* Help Modal */
      .game-help-modal {
        position: fixed;
        inset: 0;
        z-index: 10001;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .game-help-modal__backdrop {
        position: absolute;
        inset: 0;
        background: rgba(44, 37, 32, 0.8);
        backdrop-filter: blur(var(--glass-blur-medium, 16px));
      }
      
      .game-help-modal__content {
        position: relative;
        width: 90%;
        max-width: 480px;
        max-height: 80vh;
        overflow-y: auto;
        background: var(--color-background-elevated, #FFFDFB);
        border-radius: var(--radius-2xl, 24px);
        padding: var(--space-6, 24px);
        box-shadow: var(--shadow-2xl);
      }
      
      .game-help-modal__close {
        position: absolute;
        top: var(--space-4, 16px);
        right: var(--space-4, 16px);
        width: 32px;
        height: 32px;
        border: none;
        background: var(--color-background-subtle, #F5F1E8);
        border-radius: var(--radius-full, 50%);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--color-text-secondary, #6B5D52);
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }
      
      .game-help-modal__close:hover {
        background: var(--color-background-hover, #E8E2DA);
        color: var(--color-text-primary, #2C2520);
      }
      
      .game-help-modal__title {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: 24px;
        margin: 0 0 var(--space-4, 16px);
        color: var(--color-text-primary, #2C2520);
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
      }
      
      .game-help-modal__icon {
        color: var(--color-text-secondary);
      }
      
      .game-help-modal__icon svg {
        width: 28px;
        height: 28px;
      }
      
      .game-help-section {
        margin-bottom: var(--space-4, 16px);
        padding-bottom: var(--space-4, 16px);
        border-bottom: 1px solid var(--color-border, #E8E2DA);
      }
      
      .game-help-section:last-of-type {
        border-bottom: none;
      }
      
      .game-help-section h3 {
        font-size: 16px;
        font-weight: 600;
        margin: 0 0 var(--space-2, 8px);
        color: var(--color-text-primary, #2C2520);
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
      }
      
      .game-help-section__icon {
        color: var(--color-text-secondary);
        display: flex;
        align-items: center;
      }
      
      .game-help-section__icon svg {
        width: 18px;
        height: 18px;
      }
      
      .game-help-section p {
        font-size: 14px;
        color: var(--color-text-secondary, #6B5D52);
        margin: 0 0 var(--space-2, 8px);
        line-height: 1.5;
      }
      
      .game-help-section ul {
        margin: 0;
        padding-left: var(--space-5, 20px);
        font-size: 13px;
        color: var(--color-text-muted, #9A8B7A);
      }
      
      .game-help-section li {
        margin-bottom: var(--space-1, 4px);
      }
      
      .game-help-tip {
        background: var(--color-background-subtle, #F5F1E8);
        padding: var(--space-4, 16px);
        border-radius: var(--radius-lg, 12px);
        font-size: 14px;
        color: var(--color-text-secondary, #6B5D52);
        display: flex;
        align-items: flex-start;
        gap: var(--space-3, 12px);
      }
      
      .game-help-tip__icon {
        color: var(--color-text-secondary);
        flex-shrink: 0;
        display: flex;
      }
      
      .game-help-tip__icon svg {
        width: 20px;
        height: 20px;
      }
    `;
    
    document.head.appendChild(this.styleElement);
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const gamePicker = new GamePickerUI();

/**
 * Show the game picker modal
 */
export function showGamePicker(): void {
  gamePicker.show();
}

/**
 * Hide the game picker modal
 */
export function hideGamePicker(): void {
  gamePicker.hide();
}

