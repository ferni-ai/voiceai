/**
 * Entries List
 *
 * Render journal entry history.
 *
 * @module voice-journal/entries
 */

import { getModal, getEntries } from './state.js';
import { getMoodIcon } from './mood-icons.js';

// ============================================================================
// DATE FORMATTING
// ============================================================================

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return `Today at ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday at ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ============================================================================
// MOMENT TYPE LABELS
// ============================================================================

/**
 * Get human-readable label for auto-captured moment type
 */
function getMomentLabel(momentType: string): string {
  const labels: Record<string, string> = {
    breakthrough: 'Breakthrough',
    decision: 'Decision',
    gratitude: 'Gratitude',
    struggle: 'Processing',
    joy: 'Joy',
    reflection: 'Reflection',
    goal: 'Goal',
    connection: 'Connection',
    lesson: 'Lesson',
    vulnerability: 'Vulnerability',
  };
  return labels[momentType] || 'Captured moment';
}

// ============================================================================
// ENTRIES RENDERING
// ============================================================================

export function renderEntries(): void {
  const modal = getModal();
  const entries = getEntries();
  const list = modal?.querySelector('#entries-list');
  if (!list) return;

  if (entries.length === 0) {
    list.innerHTML = `
      <div class="entries-empty">
        <p class="entries-empty-text">No journal entries yet.</p>
        <p class="entries-empty-hint">Record your first entry to get started!</p>
      </div>
    `;
    return;
  }

  const sortedEntries = [...entries].sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  list.innerHTML = sortedEntries
    .slice(0, 10)
    .map(
      (entry) => {
        const isAutoCaptured = entry.source === 'auto-capture';
        const entryClass = isAutoCaptured ? 'journal-entry journal-entry--auto' : 'journal-entry';
        const sourceLabel = isAutoCaptured && entry.momentType 
          ? `<span class="entry-source">${getMomentLabel(entry.momentType)}</span>` 
          : '';
        
        return `
    <article class="${entryClass}" data-entry-id="${entry.id}">
      <header class="entry-header">
        <time class="entry-date">${formatDate(entry.createdAt)}</time>
        ${sourceLabel}
        ${entry.mood ? `<span class="entry-mood">${getMoodIcon(entry.mood)}</span>` : ''}
      </header>
      <p class="entry-content">${entry.content}</p>
      ${
        entry.audioUrl
          ? `<audio class="entry-audio" controls src="${entry.audioUrl}"></audio>`
          : ''
      }
    </article>
  `;
      }
    )
    .join('');
}

