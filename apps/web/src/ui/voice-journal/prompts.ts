/**
 * Journal Prompts
 *
 * Prompt fetching and rendering for journaling.
 *
 * @module voice-journal/prompts
 */

import { createLogger } from '../../utils/logger.js';
import type { JournalPrompt } from './types.js';
import { getModal, getCurrentPrompt, setCurrentPrompt } from './state.js';

const log = createLogger('VoiceJournalPrompts');

// ============================================================================
// FALLBACK PROMPTS
// ============================================================================

const FALLBACK_PROMPTS: JournalPrompt[] = [
  {
    id: 'reflect-1',
    category: 'reflection',
    prompt: "What's been taking up the most space in your mind this week?",
    difficulty: 'gentle',
    estimatedMinutes: 5,
  },
  {
    id: 'gratitude-1',
    category: 'gratitude',
    prompt: 'What small thing brought you unexpected joy recently?',
    difficulty: 'gentle',
    estimatedMinutes: 5,
  },
  {
    id: 'growth-1',
    category: 'growth',
    prompt: 'How have you surprised yourself lately?',
    difficulty: 'moderate',
    estimatedMinutes: 8,
  },
  {
    id: 'exploration-1',
    category: 'exploration',
    prompt: 'When do you feel most like yourself?',
    difficulty: 'moderate',
    estimatedMinutes: 10,
  },
  {
    id: 'future-1',
    category: 'future',
    prompt: 'What seeds are you planting for your future self?',
    difficulty: 'moderate',
    estimatedMinutes: 10,
  },
  {
    id: 'challenge-1',
    category: 'challenge',
    prompt: 'What uncomfortable truth are you ready to face?',
    followUp: 'What becomes possible when you do?',
    difficulty: 'deep',
    estimatedMinutes: 15,
  },
];

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
  const prompts = [...FALLBACK_PROMPTS];

  // Add time-specific prompts
  if (timeOfDay === 'morning') {
    prompts.unshift({
      id: 'morning-intention',
      category: 'future',
      prompt: 'What intention do you want to set for today? What would make today feel successful?',
      difficulty: 'gentle',
      estimatedMinutes: 5,
    });
  } else if (timeOfDay === 'evening' || timeOfDay === 'night') {
    prompts.unshift({
      id: 'evening-reflection',
      category: 'reflection',
      prompt:
        "What are three things that went well today? What's one thing you'd do differently?",
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
        return data.prompt as JournalPrompt;
      }
    }
  } catch (error) {
    log.debug('Backend prompt fetch failed, using local prompts:', error);
  }

  // Fallback to local prompts
  const timeBasedPrompts = getTimeBasedPrompts();
  return timeBasedPrompts[Math.floor(Math.random() * timeBasedPrompts.length)];
}

export function shufflePrompt(): void {
  const currentPrompt = getCurrentPrompt();
  const prompts = getTimeBasedPrompts();
  const filtered = prompts.filter((p) => p.id !== currentPrompt?.id);
  const newPrompt = filtered[Math.floor(Math.random() * filtered.length)];
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
        <span class="prompt-category">${currentPrompt.category}</span>
        <span class="prompt-difficulty prompt-difficulty--${currentPrompt.difficulty}">
          ${currentPrompt.estimatedMinutes} min
        </span>
      </div>
      <p class="prompt-text">${currentPrompt.prompt}</p>
      ${currentPrompt.followUp ? `<p class="prompt-followup">${currentPrompt.followUp}</p>` : ''}
      <button class="prompt-shuffle" data-action="shuffle-prompt" aria-label="Get new prompt">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="16 3 21 3 21 8"></polyline>
          <line x1="4" y1="20" x2="21" y2="3"></line>
          <polyline points="21 16 21 21 16 21"></polyline>
          <line x1="15" y1="15" x2="21" y2="21"></line>
          <line x1="4" y1="4" x2="9" y2="9"></line>
        </svg>
        New prompt
      </button>
    </div>
  `;
}

