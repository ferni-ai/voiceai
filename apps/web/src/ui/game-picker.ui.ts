/**
 * 🎮 Game Picker Modal
 * 
 * A beautiful modal for selecting music games to play.
 * Integrates with the voice agent to start games.
 */

import { t } from '../i18n/index.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { toast } from './whisper.ui.js';
import { apiGet } from '../utils/api.js';

const log = createLogger('GamePicker');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

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
  category: 'music' | 'text' | 'library' | 'reflection';
  requiresSpotify?: boolean;
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
  // New icons for additional games
  mic: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>`,
  clock: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  grid: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>`,
  helpCircle: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>`,
  link: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  scale: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/></svg>`,
  book: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>`,
  spotify: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 11.973c2.5-1.473 5.5-.973 7.5.527"/><path d="M9 15c1.5-1 3.5-.5 4.5.5"/><path d="M7 8.959c3.5-2 7-1.5 9.5 1.041"/></svg>`,
  // Reflection game icons
  heart: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
  smile: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" x2="9.01" y1="9" y2="9"/><line x1="15" x2="15.01" y1="9" y2="9"/></svg>`,
  target: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
  newspaper: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/></svg>`,
  compass: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>`,
  star: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  cookie: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5"/><path d="M8.5 8.5v.01"/><path d="M16 15.5v.01"/><path d="M12 12v.01"/><path d="M11 17v.01"/><path d="M7 14v.01"/></svg>`,
  sparkles: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>`,
};

// Music Games - Main category
const MUSIC_GAMES: GameOption[] = [
  {
    id: 'name-that-tune',
    name: 'Name That Tune',
    description: 'Guess the song from a short clip! Classic music trivia.',
    icon: ICONS.music,
    difficulty: 'medium',
    duration: '3-5 min',
    category: 'music',
  },
  {
    id: 'one-word-song',
    name: 'One Word Song',
    description: 'I say a word, you think of a song with that word in the title.',
    icon: ICONS.messageCircle,
    difficulty: 'easy',
    duration: '2-3 min',
    category: 'music',
  },
  {
    id: 'desert-island-discs',
    name: 'Desert Island Discs',
    description: 'Pick 5 songs to take to a desert island. Share your story.',
    icon: ICONS.palmtree,
    difficulty: 'easy',
    duration: '5-10 min',
    category: 'music',
  },
  {
    id: 'this-or-that',
    name: 'This or That',
    description: 'Quick-fire choices between two songs. Which speaks to you?',
    icon: ICONS.zap,
    difficulty: 'easy',
    duration: '2-3 min',
    category: 'music',
  },
  {
    id: 'mood-dj-challenge',
    name: 'Mood DJ Challenge',
    description: 'I give you a mood, you pick the perfect song for it.',
    icon: ICONS.headphones,
    difficulty: 'medium',
    duration: '3-5 min',
    category: 'music',
  },
  {
    id: 'finish-the-lyric',
    name: 'Finish the Lyric',
    description: 'Complete famous song lyrics. Test your music knowledge!',
    icon: ICONS.mic,
    difficulty: 'medium',
    duration: '3-5 min',
    category: 'music',
  },
  {
    id: 'decade-challenge',
    name: 'Decade Challenge',
    description: 'Guess the decade from the sound. 60s, 70s, 80s, 90s, or 2000s?',
    icon: ICONS.clock,
    difficulty: 'medium',
    duration: '3-5 min',
    category: 'music',
  },
];

// Text Games - Fun non-music games
const TEXT_GAMES: GameOption[] = [
  {
    id: 'tic-tac-toe',
    name: 'Tic-Tac-Toe',
    description: 'Classic 3x3 game! Say positions like "center" or "top left".',
    icon: ICONS.grid,
    difficulty: 'easy',
    duration: '2-3 min',
    category: 'text',
  },
  {
    id: '20-questions',
    name: '20 Questions',
    description: 'Think of something. I have 20 yes/no questions to guess it!',
    icon: ICONS.helpCircle,
    difficulty: 'medium',
    duration: '5-10 min',
    category: 'text',
  },
  {
    id: 'word-association',
    name: 'Word Association',
    description: 'Quick word chains! Say the first word that comes to mind.',
    icon: ICONS.link,
    difficulty: 'easy',
    duration: '2-3 min',
    category: 'text',
  },
  {
    id: 'would-you-rather',
    name: 'Would You Rather',
    description: 'Fun dilemmas! Pick between two hypothetical scenarios.',
    icon: ICONS.scale,
    difficulty: 'easy',
    duration: '3-5 min',
    category: 'text',
  },
  {
    id: 'story-builder',
    name: 'Story Builder',
    description: "Let's create a story together, one sentence at a time!",
    icon: ICONS.book,
    difficulty: 'easy',
    duration: '5-10 min',
    category: 'text',
  },
];

// Reflection Games - Mindfulness and self-discovery
const REFLECTION_GAMES: GameOption[] = [
  {
    id: 'one-word-checkin',
    name: 'One Word Check-in',
    description: "One word. Right now. What is it? A quick, powerful reflection.",
    icon: ICONS.target,
    difficulty: 'easy',
    duration: '1-2 min',
    category: 'reflection',
  },
  {
    id: 'three-word-day',
    name: 'Three Word Day',
    description: "Describe your day in just three words. Let's explore each one.",
    icon: ICONS.sparkles,
    difficulty: 'easy',
    duration: '3-5 min',
    category: 'reflection',
  },
  {
    id: 'tiny-win-tracker',
    name: 'Tiny Win Tracker',
    description: "Celebrate small victories! Every win counts, no matter how small.",
    icon: ICONS.star,
    difficulty: 'easy',
    duration: '2-3 min',
    category: 'reflection',
  },
  {
    id: 'emoji-story',
    name: 'Emoji Story',
    description: "Express your feelings through emojis. I'll help decode them.",
    icon: ICONS.smile,
    difficulty: 'easy',
    duration: '2-3 min',
    category: 'reflection',
  },
  {
    id: 'fortune-cookie',
    name: 'Fortune Cookie',
    description: "Crack open a fortune. Reflect on what it means for you today.",
    icon: ICONS.cookie,
    difficulty: 'easy',
    duration: '2-3 min',
    category: 'reflection',
  },
  {
    id: 'headline-writer',
    name: 'Headline Writer',
    description: "If today had a newspaper headline, what would it say?",
    icon: ICONS.newspaper,
    difficulty: 'easy',
    duration: '3-5 min',
    category: 'reflection',
  },
  {
    id: 'values-card-sort',
    name: 'Values Card Sort',
    description: "Discover your core values by sorting cards. Deep self-discovery.",
    icon: ICONS.compass,
    difficulty: 'medium',
    duration: '10-15 min',
    category: 'reflection',
  },
];

// Library Games - Spotify integration required
const LIBRARY_GAMES: GameOption[] = [
  {
    id: 'library-name-that-tune',
    name: 'Your Library Mix',
    description: 'Name songs from YOUR Spotify library. Personal challenge!',
    icon: ICONS.spotify,
    difficulty: 'medium',
    duration: '3-5 min',
    category: 'library',
    requiresSpotify: true,
  },
  {
    id: 'library-deep-cuts',
    name: 'Deep Cuts Challenge',
    description: 'Remember those songs you saved ages ago? Time to prove it!',
    icon: ICONS.spotify,
    difficulty: 'hard',
    duration: '5-7 min',
    category: 'library',
    requiresSpotify: true,
  },
];

// All games combined for backward compatibility
const GAMES: GameOption[] = [...MUSIC_GAMES, ...TEXT_GAMES, ...REFLECTION_GAMES, ...LIBRARY_GAMES];

// ============================================================================
// GAME PICKER UI CLASS
// ============================================================================

class GamePickerUI {
  private container: HTMLElement | null = null;
  private isVisible = false;
  private styleElement: HTMLStyleElement | null = null;
  /** Stored escape key handler for cleanup - prevents memory leak */
  private escapeHandler: ((e: KeyboardEvent) => void) | null = null;

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

    // Remove escape key listener to prevent memory leak
    if (this.escapeHandler) {
      document.removeEventListener('keydown', this.escapeHandler);
      this.escapeHandler = null;
    }

    this.container.classList.remove('game-picker--visible');

    trackedTimeout(() => {
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
          <h2 class="game-picker__title">Games</h2>
          <p class="game-picker__subtitle">Pick a game to play together</p>
          <button class="game-picker__close" aria-label="${t('common.close')}">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </header>
        
        <!-- Category Tabs -->
        <div class="game-picker__tabs">
          <button aria-label="${t('accessibility.music')}" class="game-picker__tab game-picker__tab--active" data-category="music">
            ${ICONS.music}
            <span>Music</span>
          </button>
          <button aria-label="${t('accessibility.fun')}" class="game-picker__tab" data-category="text">
            ${ICONS.gamepad}
            <span>Fun</span>
          </button>
          <button aria-label="${t('accessibility.reflect')}" class="game-picker__tab" data-category="reflection">
            ${ICONS.heart}
            <span>Reflect</span>
          </button>
          <button aria-label="${t('accessibility.yourLibrary')}" class="game-picker__tab" data-category="library">
            ${ICONS.spotify}
            <span>Your Library</span>
          </button>
        </div>
        
        <div class="game-picker__games">
          <!-- Music Games Section -->
          <div class="game-picker__section game-picker__section--active" data-section="music">
            ${MUSIC_GAMES.map((game, index) => this.renderGameCard(game, index)).join('')}
          </div>
          
          <!-- Text Games Section -->
          <div class="game-picker__section" data-section="text">
            ${TEXT_GAMES.map((game, index) => this.renderGameCard(game, index)).join('')}
          </div>

          <!-- Reflection Games Section -->
          <div class="game-picker__section" data-section="reflection">
            <div class="game-picker__reflection-notice">
              <p>Mindful moments with Ferni. Quick reflections to check in with yourself.</p>
            </div>
            ${REFLECTION_GAMES.map((game, index) => this.renderGameCard(game, index)).join('')}
          </div>

          <!-- Library Games Section -->
          <div class="game-picker__section" data-section="library">
            <div class="game-picker__library-notice">
              <p>Play games using YOUR Spotify library!</p>
              <p class="game-picker__library-hint">Connect Spotify to unlock these personalized games.</p>
            </div>
            ${LIBRARY_GAMES.map((game, index) => this.renderGameCard(game, index)).join('')}
          </div>
        </div>
        
        <footer class="game-picker__footer">
          <p>Or just say "Let's play a game" to Ferni!</p>
          <button class="game-picker__help-btn" aria-label="${t('accessibility.howToPlay')}">
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
    
    const spotifyBadge = game.requiresSpotify 
      ? `<span class="game-card__badge game-card__badge--spotify">Spotify</span>` 
      : '';
    
    const isNewReflectionGame = game.category === 'reflection';
    const newBadge = (game.id === 'finish-the-lyric' || game.id === 'decade-challenge' || isNewReflectionGame)
      ? `<span class="game-card__badge game-card__badge--new">New</span>`
      : '';
    
    return `
      <button aria-label="${t('accessibility.moreInformation')}" class="game-card" data-game="${game.id}" data-category="${game.category}" style="animation-delay: ${index * 50}ms">
        <div class="game-card__icon">${game.icon}</div>
        <div class="game-card__info">
          <h3 class="game-card__name">${game.name}${newBadge}${spotifyBadge}</h3>
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
    
    // Tab switching
    modal.querySelectorAll('.game-picker__tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const category = (tab as HTMLElement).dataset.category;
        if (category) {
          this.switchCategory(modal, category);
        }
      });
    });
    
    // Game cards
    modal.querySelectorAll('.game-card').forEach(card => {
      card.addEventListener('click', () => {
        const gameId = (card as HTMLElement).dataset.game;
        const gameCategory = (card as HTMLElement).dataset.category;
        if (gameId) {
          void this.startGame(gameId, gameCategory);
        }
      });
    });
    
    // Help button
    modal.querySelector('.game-picker__help-btn')?.addEventListener('click', () => {
      this.showHelpModal();
    });

    // Escape key - store reference for cleanup in hide()
    this.escapeHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.hide(); // hide() now handles removing the listener
      }
    };
    document.addEventListener('keydown', this.escapeHandler);
  }
  
  /**
   * Switch between game categories
   */
  private switchCategory(modal: HTMLElement, category: string): void {
    // Update tabs
    modal.querySelectorAll('.game-picker__tab').forEach(tab => {
      tab.classList.toggle('game-picker__tab--active', (tab as HTMLElement).dataset.category === category);
    });
    
    // Update sections
    modal.querySelectorAll('.game-picker__section').forEach(section => {
      section.classList.toggle('game-picker__section--active', (section as HTMLElement).dataset.section === category);
    });
    
    log.debug({ category }, '🎮 Switched game category');
  }

  /**
   * Show help modal with game instructions
   */
  private showHelpModal(): void {
    const helpContent = `
      <div class="game-help-modal">
        <div class="game-help-modal__backdrop"></div>
        <div class="game-help-modal__content">
          <button class="game-help-modal__close" aria-label="${t('common.close')}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
          <h2 class="game-help-modal__title">
            <span class="game-help-modal__icon">${ICONS.gamepad}</span>
            How to Play Games
          </h2>
          
          <h3 class="game-help-category">🎵 Music Games</h3>
          
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
            <h3><span class="game-help-section__icon">${ICONS.mic}</span> Finish the Lyric</h3>
            <p>Complete famous song lyrics. I'll give you the start, you finish it!</p>
            <ul>
              <li>Say the word or phrase that completes the lyric</li>
              <li>Hints available if you're stuck</li>
            </ul>
          </section>
          
          <section class="game-help-section">
            <h3><span class="game-help-section__icon">${ICONS.clock}</span> Decade Challenge</h3>
            <p>Guess what decade a song is from - 60s, 70s, 80s, 90s, or 2000s?</p>
            <ul>
              <li>Listen to the production style and sound</li>
              <li>Partial credit for being one decade off!</li>
            </ul>
          </section>
          
          <section class="game-help-section">
            <h3><span class="game-help-section__icon">${ICONS.messageCircle}</span> One Word Song</h3>
            <p>I give you a word, you think of a song with that word in the title.</p>
          </section>
          
          <section class="game-help-section">
            <h3><span class="game-help-section__icon">${ICONS.palmtree}</span> Desert Island Discs</h3>
            <p>Pick 5 songs to take with you to a desert island. Tell me why each one matters.</p>
          </section>
          
          <h3 class="game-help-category">🎮 Fun Games</h3>
          
          <section class="game-help-section">
            <h3><span class="game-help-section__icon">${ICONS.grid}</span> Tic-Tac-Toe</h3>
            <p>Classic 3x3 game! Just say positions like "center", "top left", or "bottom right".</p>
            <ul>
              <li>You're X, I'm O</li>
              <li>Choose difficulty: easy, medium, or hard</li>
            </ul>
          </section>
          
          <section class="game-help-section">
            <h3><span class="game-help-section__icon">${ICONS.helpCircle}</span> 20 Questions</h3>
            <p>Think of something. I have 20 yes/no questions to guess what it is!</p>
          </section>
          
          <section class="game-help-section">
            <h3><span class="game-help-section__icon">${ICONS.link}</span> Word Association</h3>
            <p>Quick word chains! I say a word, you say the first thing that comes to mind.</p>
          </section>
          
          <section class="game-help-section">
            <h3><span class="game-help-section__icon">${ICONS.scale}</span> Would You Rather</h3>
            <p>Fun dilemmas! Pick between two hypothetical scenarios and tell me why.</p>
          </section>
          
          <section class="game-help-section">
            <h3><span class="game-help-section__icon">${ICONS.book}</span> Story Builder</h3>
            <p>Let's create a story together! We take turns adding one sentence at a time.</p>
          </section>

          <h3 class="game-help-category">Reflection Games</h3>

          <section class="game-help-section">
            <h3><span class="game-help-section__icon">${ICONS.target}</span> One Word Check-in</h3>
            <p>Give me just one word that captures where you are right now. I'll explore it with you.</p>
          </section>

          <section class="game-help-section">
            <h3><span class="game-help-section__icon">${ICONS.sparkles}</span> Three Word Day</h3>
            <p>Describe your day, mood, or week in exactly three words. We'll unpack each one.</p>
          </section>

          <section class="game-help-section">
            <h3><span class="game-help-section__icon">${ICONS.star}</span> Tiny Win Tracker</h3>
            <p>Celebrate small victories! Tell me wins from your day - even "I got out of bed" counts.</p>
          </section>

          <section class="game-help-section">
            <h3><span class="game-help-section__icon">${ICONS.smile}</span> Emoji Story</h3>
            <p>Express how you're feeling through emojis. I'll help decode what they mean.</p>
          </section>

          <section class="game-help-section">
            <h3><span class="game-help-section__icon">${ICONS.cookie}</span> Fortune Cookie</h3>
            <p>Receive a piece of wisdom and reflect on what it means for your life right now.</p>
          </section>

          <section class="game-help-section">
            <h3><span class="game-help-section__icon">${ICONS.newspaper}</span> Headline Writer</h3>
            <p>Write newspaper headlines about your life - today, this week, or your dreams.</p>
          </section>

          <section class="game-help-section">
            <h3><span class="game-help-section__icon">${ICONS.compass}</span> Values Card Sort</h3>
            <p>A deeper exercise to discover your core values by sorting cards. Takes 10-15 minutes.</p>
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
   * Check if Spotify library is available for library games
   */
  private async checkLibraryAvailability(): Promise<{ available: boolean; reason?: string }> {
    try {
      const { getFirebaseUid } = await import('../services/firebase-auth.service.js');
      const userId = getFirebaseUid();
      
      if (!userId) {
        return { available: false, reason: 'Sign in to unlock library games' };
      }

      const response = await apiGet<{ success?: boolean; available?: boolean; reason?: string }>(`/api/games/library/availability?userId=${userId}`);

      if (response.ok && response.data?.success && response.data?.available) {
        return { available: true };
      }

      return {
        available: false,
        reason: response.data?.reason || 'Connect Spotify to play from your library'
      };
    } catch (error) {
      log.warn({ error }, '🎮 Failed to check library availability');
      return { available: false, reason: 'Connect Spotify to unlock library games' };
    }
  }

  /**
   * Start a game via the voice agent
   */
  private async startGame(gameId: string, category?: string): Promise<void> {
    const game = GAMES.find(g => g.id === gameId);
    if (!game) return;
    
    log.info({ gameId, category }, '🎮 Starting game');
    
    // Show loading state
    const card = this.container?.querySelector(`[data-game="${gameId}"]`);
    if (card) {
      card.classList.add('game-card--loading');
    }
    
    try {
      // For library games, check availability first
      const isLibraryGame = game.requiresSpotify || category === 'library' || game.category === 'library';
      
      if (isLibraryGame) {
        const availability = await this.checkLibraryAvailability();
        if (!availability.available) {
          log.warn({ gameId, reason: availability.reason }, '🎮 Library not available');
          this.showError(availability.reason || 'Connect Spotify to play library games');
          if (card) {
            card.classList.remove('game-card--loading');
          }
          return;
        }
      }

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

      // Determine the correct message type based on category
      // Reflection games are text-based, so treat them the same as text games
      const isTextGame = category === 'text' || game.category === 'text' ||
                         category === 'reflection' || game.category === 'reflection';
      
      // Map library game IDs to actual game types
      let actualGameType = gameId;
      if (isLibraryGame) {
        if (gameId === 'library-name-that-tune') {
          actualGameType = 'name-that-tune';
        } else if (gameId === 'library-deep-cuts') {
          actualGameType = 'name-that-tune'; // Same game, harder mode
        }
      }

      // Send game start request via data channel
      const message = JSON.stringify({
        type: isTextGame ? 'text_game_start_request' : 'game_start_request',
        gameType: actualGameType,
        gameCategory: game.category,
        isLibraryMode: isLibraryGame,
        libraryMode: isLibraryGame ? (gameId === 'library-deep-cuts' ? 'challenge' : 'library') : undefined,
        timestamp: Date.now(),
      });

      log.info({ gameId, actualGameType, isTextGame, isLibraryGame, message }, '🎮 Sending game start request');
      
      await room.localParticipant.publishData(
        new TextEncoder().encode(message),
        { reliable: true }
      );
      
      log.info({ gameId }, '🎮 Game start request sent successfully');
      
      // 🤲 Sidekick: Dispatch game started event for avatar sidekick
      document.dispatchEvent(new CustomEvent('ferni:game-started', {
        detail: { gameId, gameType: actualGameType, gameName: game.name, category: game.category }
      }));
      
      // 🤲 Sidekick: For reflection games, also dispatch meditation event
      if (game.category === 'reflection') {
        document.dispatchEvent(new CustomEvent('ferni:meditation-started', {
          detail: { gameId, gameName: game.name }
        }));
      }
      
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
    log.debug({ message }, '🎮 Toast: success');
    toast.success(message);
  }

  /**
   * Show error toast
   */
  private showError(message: string): void {
    log.debug({ message }, '🎮 Toast: error');
    toast.error(message);
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
        z-index: var(--z-tooltip);
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
        background: rgba(44, 37, 32, 0.75);
      }

      .game-picker__content {
        position: relative;
        width: 90%;
        max-width: clamp(350px, 90vw, 500px);
        max-height: 85vh;
        background: var(--color-bg-elevated, #FFFDFB);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
        border-radius: var(--radius-xl, 20px);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
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
      
      /* Category Tabs */
      .game-picker__tabs {
        display: flex;
        gap: var(--space-2, 8px);
        padding: 0 var(--space-4, 16px);
        margin-bottom: var(--space-3, 12px);
        border-bottom: 1px solid var(--color-border, #E8E2DA);
        padding-bottom: var(--space-3, 12px);
      }
      
      .game-picker__tab {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
        padding: var(--space-2, 8px) var(--space-4, 16px);
        background: transparent;
        border: 1px solid transparent;
        border-radius: var(--radius-full, 50px);
        font-size: 13px;
        font-weight: 500;
        color: var(--color-text-secondary, #6B5D52);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }
      
      .game-picker__tab svg {
        width: 16px;
        height: 16px;
      }
      
      .game-picker__tab:hover {
        background: var(--color-background-subtle, #F5F1E8);
        color: var(--color-text-primary, #2C2520);
      }
      
      .game-picker__tab--active {
        background: var(--persona-primary, #4a6741);
        color: white;
        border-color: var(--persona-primary, #4a6741);
      }
      
      .game-picker__tab--active:hover {
        background: var(--persona-primary, #4a6741);
        color: white;
      }
      
      /* Games List */
      .game-picker__games {
        flex: 1;
        overflow-y: auto;
        padding: 0 var(--space-4, 16px);
      }
      
      .game-picker__section {
        display: none;
        flex-direction: column;
        gap: var(--space-3, 12px);
      }
      
      .game-picker__section--active {
        display: flex;
      }
      
      .game-picker__library-notice {
        background: var(--color-background-subtle, #F5F1E8);
        border-radius: var(--radius-lg, 12px);
        padding: var(--space-4, 16px);
        margin-bottom: var(--space-3, 12px);
        text-align: center;
      }
      
      .game-picker__library-notice p {
        margin: 0;
        font-size: 14px;
        color: var(--color-text-secondary, #6B5D52);
      }
      
      .game-picker__library-hint {
        font-size: 12px !important;
        color: var(--color-text-muted, #9A8B7A) !important;
        margin-top: var(--space-2, 8px) !important;
      }

      .game-picker__reflection-notice {
        background: linear-gradient(135deg, var(--color-background-subtle, #F5F1E8), rgba(74, 103, 65, 0.08));
        border-radius: var(--radius-lg, 12px);
        padding: var(--space-4, 16px);
        margin-bottom: var(--space-3, 12px);
        text-align: center;
        border: 1px solid rgba(74, 103, 65, 0.15);
      }

      .game-picker__reflection-notice p {
        margin: 0;
        font-size: 14px;
        color: var(--color-text-secondary, #6B5D52);
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
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
        flex-wrap: wrap;
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: 16px;
        font-weight: 600;
        color: var(--color-text-primary, #2C2520);
        margin: 0 0 var(--space-1, 4px);
      }
      
      .game-card__badge {
        display: inline-flex;
        padding: 2px 6px;
        border-radius: var(--radius-sm, 4px);
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      
      .game-card__badge--new {
        background: var(--color-warning, #E8A838);
        color: white;
      }
      
      .game-card__badge--spotify {
        background: #1DB954;
        color: white;
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
        z-index: var(--z-tooltip);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .game-help-modal__backdrop {
        position: absolute;
        inset: 0;
        background: rgba(44, 37, 32, 0.75);
      }
      
      .game-help-modal__content {
        position: relative;
        width: 90%;
        max-width: clamp(336px, 90vw, 480px);
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
      
      .game-help-category {
        font-size: 14px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--color-text-muted, #9A8B7A);
        margin: var(--space-5, 20px) 0 var(--space-3, 12px);
        padding-top: var(--space-3, 12px);
        border-top: 1px solid var(--color-border, #E8E2DA);
      }

      .game-help-category:first-of-type {
        margin-top: 0;
        padding-top: 0;
        border-top: none;
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

