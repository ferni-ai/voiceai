/**
 * Voice Journal UI
 *
 * A dedicated interface for Voice Twin agents to record daily journal entries.
 * Users can record voice notes that are transcribed and stored as memories,
 * creating a personal voice diary that the agent can reference.
 *
 * Features:
 * - Voice recording with visualizer
 * - AI-powered journaling prompts (connected to backend prompt system)
 * - Playback of past entries
 * - Calendar view of journal history with streak tracking
 * - Mood trends visualization (using SVG icons, not emoji)
 * - AI-generated insights from entries
 *
 * @module voice-journal
 */

import { createLogger } from '../../utils/logger.js';
import { soundUI } from '../sound.ui.js';
import { getCustomAgent, listMemories } from '../../services/custom-agent.service.js';
import { 
  startJournalSync, 
  stopJournalSync, 
  subscribeToJournalSync,
  type JournalSyncEvent 
} from '../../services/journal-sync.service.js';
import { getUserId } from '../../utils/api.js';
import type { JournalTab } from './types.js';

// State management
import {
  getModal,
  setModal,
  getCurrentTab,
  setCurrentTab,
  getCurrentAgent,
  setCurrentAgent,
  setEntries,
  setCurrentPrompt,
  setCalendarMonth,
  setSearchQuery,
  resetState,
} from './state.js';

// Sub-modules
import { renderMoodOptions } from './mood-icons.js';
import { fetchPrompt, renderPromptSection, shufflePrompt, prefetchPrompts } from './prompts.js';
import { toggleRecording, stopRecording, stopVisualization } from './recording.js';
import { renderStats } from './render-stats.js';
import { renderCalendar, navigatePrevMonth, navigateNextMonth, filterEntriesByDate } from './calendar.js';
import { renderEntries, deleteEntry } from './entries.js';
import { renderInsights } from './insights.js';
import { exportJournal, shareJournal } from './export.js';
import { getJournalStyles } from './styles.js';

const log = createLogger('VoiceJournalUI');

// Real-time sync unsubscribe function
let syncUnsubscribe: (() => void) | null = null;

// ============================================================================
// MODAL INITIALIZATION
// ============================================================================

function ensureModalExists(): HTMLElement {
  const existingModal = getModal();
  if (existingModal) {
    return existingModal;
  }

  // Clean up orphaned elements (HMR protection)
  document.querySelectorAll('.voice-journal-overlay').forEach((el) => el.remove());

  const modal = document.createElement('div');
  modal.className = 'voice-journal-overlay';
  modal.innerHTML = `
    <div class="journal-backdrop" data-action="close" role="button" tabindex="0" aria-label="Close journal"></div>
    <div class="journal-container" role="dialog" aria-modal="true" aria-labelledby="journal-title">
      <header class="journal-header">
        <div class="journal-header-content">
          <h2 class="journal-title" id="journal-title">Voice Journal</h2>
          <p class="journal-subtitle">Record your thoughts and feelings</p>
        </div>
        <div class="journal-header-actions">
          <button class="journal-action-btn" data-action="export" aria-label="Export journal">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </button>
          <button class="journal-action-btn" data-action="share" aria-label="Share entry">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="18" cy="5" r="3"/>
              <circle cx="6" cy="12" r="3"/>
              <circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
          </button>
          <button class="journal-close" data-action="close" aria-label="Close journal">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </header>

      <!-- Tabs -->
      <nav class="journal-tabs" role="tablist">
        <button aria-label="Record" class="journal-tab journal-tab--active" data-tab="record" role="tab" aria-selected="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
          </svg>
          Record
        </button>
        <button aria-label="History" class="journal-tab" data-tab="history" role="tab" aria-selected="false">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
          History
        </button>
        <button aria-label="Insights" class="journal-tab" data-tab="insights" role="tab" aria-selected="false">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
          </svg>
          Insights
        </button>
      </nav>

      <main class="journal-content">
        <!-- Record Tab -->
        <section class="journal-tab-content journal-tab-content--active" data-content="record">
          <!-- Prompt Section -->
          <div class="journal-prompt-section" id="prompt-section">
            <!-- Rendered dynamically -->
          </div>

          <div class="journal-recorder">
            <div class="recorder-visualizer">
              <canvas id="journal-visualizer" width="200" height="200"></canvas>
              <div class="recorder-time" id="recorder-time">0:00</div>
            </div>
            
            <div class="recorder-controls">
              <button aria-label="Start Recording" class="recorder-btn" id="record-btn">
                <svg class="record-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                  <line x1="12" y1="19" x2="12" y2="23"></line>
                  <line x1="8" y1="23" x2="16" y2="23"></line>
                </svg>
                <span class="btn-label">Start Recording</span>
              </button>
            </div>

            <div class="mood-selector">
              <label class="mood-label">How are you feeling?</label>
              <div class="mood-options">
                ${renderMoodOptions()}
              </div>
            </div>
          </div>
        </section>

        <!-- History Tab -->
        <section class="journal-tab-content" data-content="history">
          <!-- Search Box -->
          <div class="journal-search">
            <svg class="journal-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input type="text" 
                   id="journal-search-input" 
                   class="journal-search-input" 
                   placeholder="Search entries..." 
                   aria-label="Search journal entries">
          </div>

          <!-- Stats Bar -->
          <div class="journal-stats" id="journal-stats">
            <!-- Rendered dynamically -->
          </div>

          <!-- Calendar -->
          <div class="journal-calendar" id="journal-calendar">
            <!-- Rendered dynamically -->
          </div>

          <!-- Entries List -->
          <div class="journal-entries">
            <h3 class="entries-title">Recent Entries</h3>
            <div class="entries-list" id="entries-list">
              <!-- Entries render here -->
            </div>
          </div>
        </section>

        <!-- Insights Tab -->
        <section class="journal-tab-content" data-content="insights">
          <div class="journal-insights" id="journal-insights">
            <!-- Rendered dynamically -->
          </div>
        </section>
      </main>
    </div>
  `;

  // Add event listeners
  modal.addEventListener('click', handleModalClick);
  modal.addEventListener('keydown', handleModalKeydown);
  
  // Add search input listener
  const searchInput = modal.querySelector('#journal-search-input') as HTMLInputElement;
  if (searchInput) {
    let searchTimeout: ReturnType<typeof setTimeout> | null = null;
    searchInput.addEventListener('input', () => {
      // Debounce search
      if (searchTimeout) clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        setSearchQuery(searchInput.value);
        renderEntries();
      }, 300);
    });
  }

  // Add styles
  if (!document.getElementById('voice-journal-styles')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'voice-journal-styles';
    styleSheet.textContent = getJournalStyles();
    document.head.appendChild(styleSheet);
  }

  document.body.appendChild(modal);
  setModal(modal);
  return modal;
}

// ============================================================================
// TAB SWITCHING
// ============================================================================

function switchTab(tab: JournalTab): void {
  const currentTab = getCurrentTab();
  const modal = getModal();
  if (currentTab === tab || !modal) return;
  setCurrentTab(tab);

  // Update tab buttons
  modal.querySelectorAll('.journal-tab').forEach((btn) => {
    const btnTab = (btn as HTMLElement).dataset.tab;
    btn.classList.toggle('journal-tab--active', btnTab === tab);
    btn.setAttribute('aria-selected', btnTab === tab ? 'true' : 'false');
  });

  // Update content sections
  modal.querySelectorAll('.journal-tab-content').forEach((section) => {
    const sectionTab = (section as HTMLElement).dataset.content;
    section.classList.toggle('journal-tab-content--active', sectionTab === tab);
  });

  soundUI.play('click');
}

// ============================================================================
// EVENT HANDLING
// ============================================================================

function handleModalClick(e: Event): void {
  const target = e.target as HTMLElement;
  const modal = getModal();

  // Close button or backdrop
  if (target.closest('[data-action="close"]')) {
    closeVoiceJournal();
    return;
  }

  // Export journal
  if (target.closest('[data-action="export"]')) {
    void exportJournal();
    return;
  }

  // Share entry
  if (target.closest('[data-action="share"]')) {
    void shareJournal();
    return;
  }

  // Tab switching
  const tabBtn = target.closest('.journal-tab') as HTMLElement;
  if (tabBtn) {
    const tab = tabBtn.dataset.tab as JournalTab;
    if (tab) switchTab(tab);
    return;
  }

  // Record button
  if (target.closest('#record-btn')) {
    void toggleRecording();
    return;
  }

  // Shuffle prompt
  if (target.closest('[data-action="shuffle-prompt"]')) {
    shufflePrompt();
    return;
  }

  // Calendar navigation
  if (target.closest('[data-action="prev-month"]')) {
    navigatePrevMonth();
    return;
  }
  if (target.closest('[data-action="next-month"]')) {
    navigateNextMonth();
    return;
  }

  // Go to record (from insights)
  if (target.closest('[data-action="go-to-record"]')) {
    switchTab('record');
    return;
  }

  // Delete entry
  const deleteBtn = target.closest('[data-action="delete-entry"]') as HTMLElement;
  if (deleteBtn) {
    const entryId = deleteBtn.dataset.entryId;
    if (entryId) {
      void deleteEntry(entryId);
    }
    return;
  }

  // Calendar date click (filter entries)
  const calendarDay = target.closest('.calendar-day[data-date]') as HTMLElement;
  if (calendarDay && calendarDay.classList.contains('calendar-day--has-entry')) {
    const dateStr = calendarDay.dataset.date;
    if (dateStr) {
      filterEntriesByDate(dateStr);
      switchTab('history');
    }
    return;
  }

  // Clear all filters (date + search)
  if (target.closest('[data-action="clear-filter"]')) {
    filterEntriesByDate(null);
    setSearchQuery('');
    // Also clear the search input
    const searchInput = modal?.querySelector('#journal-search-input') as HTMLInputElement;
    if (searchInput) {
      searchInput.value = '';
    }
    renderEntries();
    return;
  }

  // Mood selection
  const moodBtn = target.closest('.mood-option') as HTMLElement;
  if (moodBtn) {
    selectMood(moodBtn);
    return;
  }
}

function handleModalKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    closeVoiceJournal();
  }
}

function selectMood(btn: HTMLElement): void {
  const modal = getModal();
  modal?.querySelectorAll('.mood-option').forEach((opt) => {
    opt.classList.remove('mood-option--selected');
  });
  btn.classList.add('mood-option--selected');
  soundUI.play('click');
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Open the voice journal for a specific agent
 */
export async function openVoiceJournal(agentId: string): Promise<void> {
  const modal = ensureModalExists();

  try {
    const agent = await getCustomAgent(agentId);
    if (!agent) {
      log.error('Agent not found:', agentId);
      const { toast } = await import('../toast.ui.js');
      toast.error('Agent not found');
      return;
    }

    if (agent.type !== 'twin') {
      log.warn('Voice journal is only for Digital Twin agents');
      const { toast } = await import('../toast.ui.js');
      toast.warning('Voice journal is only available for Digital Twin agents');
      return;
    }

    setCurrentAgent(agent);

    // Load existing entries
    const entries = (await listMemories(agentId, 'journalEntry')) || [];
    setEntries(entries);

    // Update title with agent name
    const title = modal.querySelector('.journal-title');
    if (title) {
      title.textContent = `${agent.displayName || agent.name}'s Journal`;
    }

    // Load initial prompt
    const prompt = await fetchPrompt();
    setCurrentPrompt(prompt);
    
    // Pre-fetch prompts for offline use (background)
    void prefetchPrompts();

    // Reset calendar to current month
    setCalendarMonth(new Date());

    // Render all sections
    renderPromptSection();
    renderStats();
    renderCalendar();
    renderEntries();
    renderInsights();

    // Start real-time sync
    const userId = getUserId();
    if (userId) {
      startJournalSync(userId, agent.id);
      
      // Subscribe to sync events
      syncUnsubscribe = subscribeToJournalSync((event: JournalSyncEvent) => {
        handleSyncEvent(event);
      });
    }

    // Show modal
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    soundUI.play('switch');
  } catch (error) {
    log.error('Failed to open voice journal:', error);
    const { toast } = await import('../toast.ui.js');
    toast.error('Could not open journal');
  }
}

/**
 * Handle real-time sync events from other devices
 */
async function handleSyncEvent(event: JournalSyncEvent): Promise<void> {
  const currentAgent = getCurrentAgent();
  if (!currentAgent || event.agentId !== currentAgent.id) return;
  
  log.debug('Received sync event:', event.type);
  
  if (event.type === 'entry_added' || event.type === 'entry_deleted' || event.type === 'entry_updated') {
    // Reload entries from server
    const entries = (await listMemories(currentAgent.id, 'journalEntry')) || [];
    setEntries(entries);
    
    // Re-render all sections
    renderStats();
    renderCalendar();
    renderEntries();
    renderInsights();
    
    // Show toast notification
    const { toast } = await import('../toast.ui.js');
    if (event.type === 'entry_added') {
      toast.info('New entry synced');
    } else if (event.type === 'entry_deleted') {
      toast.info('Entry removed');
    }
  }
}


/**
 * Close the voice journal
 */
export function closeVoiceJournal(): void {
  const modal = getModal();
  if (!modal) return;

  stopRecording();
  stopVisualization();
  
  // Stop real-time sync
  if (syncUnsubscribe) {
    syncUnsubscribe();
    syncUnsubscribe = null;
  }
  stopJournalSync();

  modal.classList.remove('open');
  document.body.style.overflow = '';

  resetState();

  soundUI.play('switch');
}

// ============================================================================
// RE-EXPORTS (for backward compatibility)
// ============================================================================

export type { JournalTab, JournalPrompt, JournalStats, MoodOption } from './types.js';

