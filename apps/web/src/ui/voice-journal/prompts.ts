/**
 * Journal Prompts
 *
 * Prompt fetching and rendering for journaling with offline caching.
 *
 * @module voice-journal/prompts
 */

import { createLogger } from '../../utils/logger.js';
import type { JournalPrompt } from './types.js';
import { getModal, getCurrentPrompt, setCurrentPrompt, getCurrentAgent } from './state.js';
import { t } from '../../i18n/index.js';

const log = createLogger('VoiceJournalPrompts');

// Default prompt fallback (built on use: translations load after this module does)
function defaultPrompt(): JournalPrompt {
  return {
    id: 'default-reflection',
    category: 'reflection',
    prompt: t('voiceJournal.prompts.default'),
    difficulty: 'gentle',
    estimatedMinutes: 3,
  };
}

// ============================================================================
// PROMPT CACHE FOR OFFLINE USE
// ============================================================================

const CACHE_KEY = 'ferni_journal_prompts_cache';
const CACHE_SIZE = 10; // Pre-fetch 10 prompts
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface PromptCache {
  prompts: JournalPrompt[];
  timestamp: number;
  agentId?: string;
}

/**
 * Load cached prompts from localStorage
 */
function loadCachedPrompts(): PromptCache | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    
    const data = JSON.parse(cached) as PromptCache;
    
    // Check if cache is expired
    if (Date.now() - data.timestamp > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    
    return data;
  } catch (err) {
    log.debug('Failed to load prompt cache:', err);
    return null;
  }
}

/**
 * Save prompts to cache
 */
function saveCachedPrompts(prompts: JournalPrompt[], agentId?: string): void {
  try {
    const cache: PromptCache = {
      prompts,
      timestamp: Date.now(),
      agentId,
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    log.debug(`Cached ${prompts.length} prompts for offline use`);
  } catch (err) {
    log.debug('Failed to save prompt cache:', err);
  }
}

/**
 * Get a prompt from cache (different from current prompt)
 */
function getPromptFromCache(excludeId?: string): JournalPrompt | null {
  const cache = loadCachedPrompts();
  if (!cache || cache.prompts.length === 0) return null;
  
  // Filter out current prompt if provided
  const available = excludeId 
    ? cache.prompts.filter(p => p.id !== excludeId)
    : cache.prompts;
    
  if (available.length === 0) return null;
  
  // Get a random prompt from cache
  const index = Math.floor(Math.random() * available.length);
  return available[index] ?? null;
}

/**
 * Pre-fetch multiple prompts for offline use
 * Call this when opening the journal to ensure prompts are available offline
 */
export async function prefetchPrompts(): Promise<void> {
  const currentAgent = getCurrentAgent();
  const agentId = currentAgent?.id;
  
  // Check if we already have fresh cache
  const existingCache = loadCachedPrompts();
  if (existingCache && existingCache.prompts.length >= CACHE_SIZE / 2) {
    log.debug('Prompt cache still valid, skipping prefetch');
    return;
  }
  
  try {
    const response = await fetch('/api/journal/prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        count: CACHE_SIZE,
        timeOfDay: getTimeOfDay(),
        agentId,
      }),
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.prompts && Array.isArray(data.prompts)) {
        saveCachedPrompts(data.prompts as JournalPrompt[], agentId);
        log.info(`Pre-fetched ${data.prompts.length} prompts for offline use`);
      }
    }
  } catch (err) {
    log.debug('Failed to prefetch prompts (offline?):', err);
  }
}

// ============================================================================
// FALLBACK PROMPTS
// ============================================================================

function fallbackPrompts(): JournalPrompt[] {
  return [
    {
      id: 'reflect-1',
      category: 'reflection',
      prompt: t('voiceJournal.prompts.reflect1'),
      difficulty: 'gentle',
      estimatedMinutes: 5,
    },
    {
      id: 'gratitude-1',
      category: 'gratitude',
      prompt: t('voiceJournal.prompts.gratitude1'),
      difficulty: 'gentle',
      estimatedMinutes: 5,
    },
    {
      id: 'growth-1',
      category: 'growth',
      prompt: t('voiceJournal.prompts.growth1'),
      difficulty: 'moderate',
      estimatedMinutes: 8,
    },
    {
      id: 'exploration-1',
      category: 'exploration',
      prompt: t('voiceJournal.prompts.exploration1'),
      difficulty: 'moderate',
      estimatedMinutes: 10,
    },
    {
      id: 'future-1',
      category: 'future',
      prompt: t('voiceJournal.prompts.future1'),
      difficulty: 'moderate',
      estimatedMinutes: 10,
    },
    {
      id: 'challenge-1',
      category: 'challenge',
      prompt: t('voiceJournal.prompts.challenge1'),
      followUp: t('voiceJournal.prompts.challenge1FollowUp'),
      difficulty: 'deep',
      estimatedMinutes: 15,
    },
  ];
}

/** i18n keys for the prompt categories this module (and the server) uses. */
const CATEGORY_KEYS: Record<string, string> = {
  reflection: 'voiceJournal.prompts.categoryReflection',
  gratitude: 'voiceJournal.prompts.categoryGratitude',
  growth: 'voiceJournal.prompts.categoryGrowth',
  exploration: 'voiceJournal.prompts.categoryExploration',
  future: 'voiceJournal.prompts.categoryFuture',
  challenge: 'voiceJournal.prompts.categoryChallenge',
};

/** The category's display name; an unknown category is shown as it came. */
function categoryLabel(category: string): string {
  const key = CATEGORY_KEYS[category];
  return key ? t(key) : category;
}

// ============================================================================
// TIME UTILITIES
// ============================================================================

export function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

function getTimeBasedPrompts(): JournalPrompt[] {
  const timeOfDay = getTimeOfDay();
  const prompts = fallbackPrompts();

  // Add time-specific prompts
  if (timeOfDay === 'morning') {
    prompts.unshift({
      id: 'morning-intention',
      category: 'future',
      prompt: t('voiceJournal.prompts.morningIntention'),
      difficulty: 'gentle',
      estimatedMinutes: 5,
    });
  } else if (timeOfDay === 'evening' || timeOfDay === 'night') {
    prompts.unshift({
      id: 'evening-reflection',
      category: 'reflection',
      prompt: t('voiceJournal.prompts.eveningReflection'),
      difficulty: 'gentle',
      estimatedMinutes: 5,
    });
  }

  return prompts;
}

// ============================================================================
// PROMPT FETCHING
// ============================================================================

export async function fetchPrompt(selectedMood?: string): Promise<JournalPrompt> {
  // Try to get from backend first
  try {
    const response = await fetch('/api/journal/prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timeOfDay: getTimeOfDay(),
        mood: selectedMood,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.prompt) {
        // Also trigger background prefetch for next time
        void prefetchPrompts();
        return data.prompt as JournalPrompt;
      }
    }
  } catch (error) {
    log.debug('Backend prompt fetch failed, trying cache:', error);
  }

  // Try cached prompts (for offline use)
  const cachedPrompt = getPromptFromCache();
  if (cachedPrompt) {
    log.debug('Using cached prompt (offline mode)');
    return cachedPrompt;
  }

  // Final fallback to local prompts
  const timeBasedPrompts = getTimeBasedPrompts();
  const fallbackIndex = Math.floor(Math.random() * timeBasedPrompts.length);
  return timeBasedPrompts[fallbackIndex] ?? timeBasedPrompts[0] ?? defaultPrompt();
}

export function shufflePrompt(): void {
  const currentPrompt = getCurrentPrompt();
  
  // First try cached prompts
  const cachedPrompt = getPromptFromCache(currentPrompt?.id);
  if (cachedPrompt) {
    setCurrentPrompt(cachedPrompt);
    renderPromptSection();
    return;
  }
  
  // Fall back to local prompts
  const prompts = getTimeBasedPrompts();
  const filtered = prompts.filter((p) => p.id !== currentPrompt?.id);
  const newPromptIndex = Math.floor(Math.random() * filtered.length);
  const newPrompt = filtered[newPromptIndex] ?? prompts[0] ?? defaultPrompt();
  setCurrentPrompt(newPrompt);
  renderPromptSection();
}

// ============================================================================
// PROMPT RENDERING
// ============================================================================

export function renderPromptSection(): void {
  const modal = getModal();
  const currentPrompt = getCurrentPrompt();
  const section = modal?.querySelector('#prompt-section');
  if (!section || !currentPrompt) return;

  section.innerHTML = `
    <div class="prompt-card">
      <div class="prompt-header">
        <span class="prompt-category">${categoryLabel(currentPrompt.category)}</span>
        <span class="prompt-difficulty prompt-difficulty--${currentPrompt.difficulty}">
          ${t('voiceJournal.prompts.minutes', { minutes: currentPrompt.estimatedMinutes })}
        </span>
      </div>
      <p class="prompt-text">${currentPrompt.prompt}</p>
      ${currentPrompt.followUp ? `<p class="prompt-followup">${currentPrompt.followUp}</p>` : ''}
      <button class="prompt-shuffle" data-action="shuffle-prompt" aria-label="${t('accessibility.getNewPrompt')}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="16 3 21 3 21 8"></polyline>
          <line x1="4" y1="20" x2="21" y2="3"></line>
          <polyline points="21 16 21 21 16 21"></polyline>
          <line x1="15" y1="15" x2="21" y2="21"></line>
          <line x1="4" y1="4" x2="9" y2="9"></line>
        </svg>
        ${t('voiceJournal.prompts.newPrompt')}
      </button>
    </div>
  `;
}

