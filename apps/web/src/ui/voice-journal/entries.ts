/**
 * Entries List
 *
 * Render journal entry history with delete functionality.
 *
 * @module voice-journal/entries
 */

import { createLogger } from '../../utils/logger.js';
import { getModal, getEntries, setEntries, getCurrentAgent, getFilteredEntries, getFilterDate, getSearchQuery } from './state.js';
import { getMoodIcon } from './mood-icons.js';
import { deleteMemory, listMemories } from '../../services/custom-agent.service.js';
import { renderStats } from './render-stats.js';
import { renderCalendar } from './calendar.js';
import { renderInsights } from './insights.js';
import { formatDate as formatLocaleDate, t } from '../../i18n/index.js';
import { tp } from '../../i18n/plural.js';

const log = createLogger('VoiceJournalEntries');

// ============================================================================
// DATE FORMATTING
// ============================================================================

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const time = formatLocaleDate(date, { hour: 'numeric', minute: '2-digit' });

  if (date.toDateString() === today.toDateString()) {
    return t('voiceJournal.todayAt', { time });
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return t('voiceJournal.yesterdayAt', { time });
  }
  return formatLocaleDate(date, {
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
  const labelKeys: Record<string, string> = {
    breakthrough: 'voiceJournal.moments.breakthrough',
    decision: 'voiceJournal.moments.decision',
    gratitude: 'voiceJournal.moments.gratitude',
    struggle: 'voiceJournal.moments.struggle',
    joy: 'voiceJournal.moments.joy',
    reflection: 'voiceJournal.moments.reflection',
    goal: 'voiceJournal.moments.goal',
    connection: 'voiceJournal.moments.connection',
    lesson: 'voiceJournal.moments.lesson',
    vulnerability: 'voiceJournal.moments.vulnerability',
  };
  return t(labelKeys[momentType] ?? 'voiceJournal.moments.default');
}

// ============================================================================
// DELETE ENTRY
// ============================================================================

/**
 * Delete a journal entry after confirmation
 */
export async function deleteEntry(entryId: string): Promise<boolean> {
  const currentAgent = getCurrentAgent();
  if (!currentAgent) {
    log.error('No current agent for deletion');
    return false;
  }

  const { toast } = await import('../whisper.ui.js');

  // Confirm deletion
  const confirmed = confirm(t('voiceJournal.confirmDelete'));
  if (!confirmed) {
    return false;
  }

  try {
    await deleteMemory(currentAgent.id, entryId);

    // Reload entries
    const entries = (await listMemories(currentAgent.id, 'journalEntry')) || [];
    setEntries(entries);

    // Re-render all sections
    renderStats();
    renderCalendar();
    renderEntries();
    renderInsights();

    toast.success(t('toasts.entryDeleted'));
    log.info({ entryId, agentId: currentAgent.id }, 'Journal entry deleted');
    return true;
  } catch (error) {
    log.error('Failed to delete entry:', error);
    toast.error(t('toasts.couldNotDeleteEntry'));
    return false;
  }
}

// ============================================================================
// ENTRIES RENDERING
// ============================================================================

export function renderEntries(): void {
  const modal = getModal();
  const allEntries = getEntries();
  const filteredEntries = getFilteredEntries();
  const filterDate = getFilterDate();
  const searchQuery = getSearchQuery();
  const list = modal?.querySelector('#entries-list');
  if (!list) return;

  if (allEntries.length === 0) {
    list.innerHTML = `
      <div class="entries-empty">
        <p class="entries-empty-text">${t('voiceJournal.empty')}</p>
        <p class="entries-empty-hint">${t('voiceJournal.emptyHint')}</p>
      </div>
    `;
    return;
  }

  // No results for filters/search
  if (filteredEntries.length === 0) {
    const filterMessage = filterDate 
      ? t('voiceJournal.noEntriesForDate')
      : searchQuery
        ? t('voiceJournal.noEntriesMatching', { query: searchQuery })
        : t('voiceJournal.noEntriesFound');
    
    list.innerHTML = `
      <div class="entries-empty">
        <p class="entries-empty-text">${filterMessage}</p>
        <button class="entries-clear-filter" data-action="clear-filter">${t('voiceJournal.showAll')}</button>
      </div>
    `;
    return;
  }

  const sortedEntries = [...filteredEntries].sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  
  // Show filter indicator if active
  const filterIndicator = (filterDate || searchQuery) 
    ? `<div class="entries-filter-indicator">
         <span>${tp('voiceJournal.showingCount', allEntries.length, { shown: filteredEntries.length })}</span>
         <button class="entries-filter-clear-btn" data-action="clear-filter">${t('voiceJournal.clearFilters')}</button>
       </div>`
    : '';

  const entriesHtml = sortedEntries
    .slice(0, 10)
    .map(
      (entry) => {
        const isAutoCaptured = entry.source === 'auto-capture';
        const entryClass = isAutoCaptured ? 'journal-entry journal-entry--auto' : 'journal-entry';
        const sourceLabel = isAutoCaptured && entry.momentType 
          ? `<span class="entry-source">${getMomentLabel(entry.momentType)}</span>` 
          : '';
        
        // Highlight search matches
        let displayContent = entry.content;
        if (searchQuery) {
          const regex = new RegExp(`(${escapeRegExp(searchQuery)})`, 'gi');
          displayContent = entry.content.replace(regex, '<mark class="search-highlight">$1</mark>');
        }
        
        return `
    <article class="${entryClass}" data-entry-id="${entry.id}">
      <header class="entry-header">
        <time class="entry-date">${formatDate(entry.createdAt)}</time>
        ${sourceLabel}
        ${entry.mood ? `<span class="entry-mood">${getMoodIcon(entry.mood)}</span>` : ''}
        <button class="entry-delete" data-action="delete-entry" data-entry-id="${entry.id}" aria-label="${t('accessibility.deleteEntry')}" title="${t('accessibility.deleteEntry')}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </header>
      <p class="entry-content">${displayContent}</p>
      ${
        entry.audioUrl
          ? `<audio class="entry-audio" controls src="${entry.audioUrl}" preload="metadata"></audio>`
          : ''
      }
    </article>
  `;
      }
    )
    .join('');
    
  list.innerHTML = filterIndicator + entriesHtml;
}

/**
 * Escape special regex characters in string
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

