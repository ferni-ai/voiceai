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
 * - Mood trends visualization
 * - AI-generated insights from entries
 *
 * @module voice-journal.ui
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { soundUI } from './sound.ui.js';
import {
  type CustomAgent,
  type CustomAgentMemory,
  getCustomAgent,
  addMemory,
  listMemories,
} from '../services/custom-agent.service.js';

const log = createLogger('VoiceJournalUI');

// ============================================================================
// TYPES
// ============================================================================

type JournalTab = 'record' | 'history' | 'insights';

interface JournalPrompt {
  id: string;
  category: string;
  prompt: string;
  followUp?: string;
  difficulty: 'gentle' | 'moderate' | 'deep';
  estimatedMinutes: number;
}

interface MoodTrend {
  date: string;
  mood: string;
  moodScore: number;
}

interface JournalStats {
  totalEntries: number;
  currentStreak: number;
  longestStreak: number;
  avgMoodScore: number;
  topMoods: Array<{ mood: string; count: number }>;
  entriesByWeek: number[];
}

// ============================================================================
// STATE
// ============================================================================

let journalModal: HTMLElement | null = null;
let currentAgent: CustomAgent | null = null;
let entries: CustomAgentMemory[] = [];
let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];
let isRecording = false;
let recordingStartTime: number | null = null;
let recordingDuration = 0;
let animationFrameId: number | null = null;
let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let currentTab: JournalTab = 'record';
let currentPrompt: JournalPrompt | null = null;
let calendarMonth: Date = new Date();

// ============================================================================
// PROMPT TEMPLATES (local fallback when backend unavailable)
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
// MOOD UTILITIES
// ============================================================================

const MOODS = [
  { id: 'happy', emoji: '😊', label: 'Happy', score: 8 },
  { id: 'calm', emoji: '😌', label: 'Calm', score: 7 },
  { id: 'anxious', emoji: '😰', label: 'Anxious', score: 3 },
  { id: 'sad', emoji: '😢', label: 'Sad', score: 2 },
  { id: 'angry', emoji: '😤', label: 'Frustrated', score: 3 },
  { id: 'grateful', emoji: '🙏', label: 'Grateful', score: 9 },
  { id: 'tired', emoji: '😴', label: 'Tired', score: 4 },
  { id: 'excited', emoji: '🎉', label: 'Excited', score: 9 },
];

function getMoodEmoji(moodId: string): string {
  return MOODS.find((m) => m.id === moodId)?.emoji || '🙂';
}

function getMoodScore(moodId: string): number {
  return MOODS.find((m) => m.id === moodId)?.score || 5;
}

function getMoodLabel(moodId: string): string {
  return MOODS.find((m) => m.id === moodId)?.label || 'Neutral';
}

// ============================================================================
// STATS CALCULATION
// ============================================================================

function calculateStats(journalEntries: CustomAgentMemory[]): JournalStats {
  if (journalEntries.length === 0) {
    return {
      totalEntries: 0,
      currentStreak: 0,
      longestStreak: 0,
      avgMoodScore: 0,
      topMoods: [],
      entriesByWeek: [0, 0, 0, 0],
    };
  }

  // Sort by date
  const sorted = [...journalEntries].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // Calculate streak
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;
  let lastDate: Date | null = null;

  const entriesByDate = new Map<string, CustomAgentMemory[]>();
  sorted.forEach((entry) => {
    const dateKey = new Date(entry.createdAt).toDateString();
    if (!entriesByDate.has(dateKey)) {
      entriesByDate.set(dateKey, []);
    }
    entriesByDate.get(dateKey)!.push(entry);
  });

  // Calculate streaks
  const dates = Array.from(entriesByDate.keys()).map((d) => new Date(d));
  dates.sort((a, b) => b.getTime() - a.getTime());

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    if (i === 0) {
      const diffFromToday = Math.floor(
        (today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (diffFromToday <= 1) {
        tempStreak = 1;
      }
    } else {
      const prevDate = dates[i - 1];
      const diff = Math.floor(
        (prevDate.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (diff === 1) {
        tempStreak++;
      } else {
        longestStreak = Math.max(longestStreak, tempStreak);
        if (i === dates.length - 1 || tempStreak === 0) {
          break;
        }
        tempStreak = 1;
      }
    }
    if (i < 30) {
      // Only count recent for current streak
      currentStreak = tempStreak;
    }
  }
  longestStreak = Math.max(longestStreak, tempStreak);

  // Mood stats
  const moodCounts = new Map<string, number>();
  let totalMoodScore = 0;
  let moodCount = 0;

  sorted.forEach((entry) => {
    if (entry.mood) {
      moodCounts.set(entry.mood, (moodCounts.get(entry.mood) || 0) + 1);
      totalMoodScore += getMoodScore(entry.mood);
      moodCount++;
    }
  });

  const topMoods = Array.from(moodCounts.entries())
    .map(([mood, count]) => ({ mood, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  // Entries by week (last 4 weeks)
  const entriesByWeek: number[] = [0, 0, 0, 0];
  const now = Date.now();
  sorted.forEach((entry) => {
    const age = now - new Date(entry.createdAt).getTime();
    const weekIndex = Math.floor(age / (7 * 24 * 60 * 60 * 1000));
    if (weekIndex < 4) {
      entriesByWeek[weekIndex]++;
    }
  });

  return {
    totalEntries: journalEntries.length,
    currentStreak,
    longestStreak,
    avgMoodScore: moodCount > 0 ? totalMoodScore / moodCount : 0,
    topMoods,
    entriesByWeek,
  };
}

// ============================================================================
// PROMPTS
// ============================================================================

async function fetchPrompt(): Promise<JournalPrompt> {
  // Try to get from backend first
  try {
    const response = await fetch('/api/journal/prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timeOfDay: getTimeOfDay(),
        mood: getSelectedMood(),
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

function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
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

function shufflePrompt(): void {
  const prompts = getTimeBasedPrompts();
  const filtered = prompts.filter((p) => p.id !== currentPrompt?.id);
  currentPrompt = filtered[Math.floor(Math.random() * filtered.length)];
  renderPromptSection();
}

// ============================================================================
// INITIALIZATION
// ============================================================================

function ensureModalExists(): HTMLElement {
  if (journalModal) {
    return journalModal;
  }

  // Clean up orphaned elements (HMR protection)
  document.querySelectorAll('.voice-journal-overlay').forEach((el) => el.remove());

  journalModal = document.createElement('div');
  journalModal.className = 'voice-journal-overlay';
  journalModal.innerHTML = `
    <div class="journal-backdrop" data-action="close" role="button" tabindex="0"></div>
    <div class="journal-container" role="dialog" aria-modal="true" aria-labelledby="journal-title">
      <header class="journal-header">
        <div class="journal-header-content">
          <h2 class="journal-title" id="journal-title">Voice Journal</h2>
          <p class="journal-subtitle">Record your thoughts and feelings</p>
        </div>
        <div class="journal-header-actions" role="button" tabindex="0">
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
                <span class="btn-label" role="button" tabindex="0">Start Recording</span>
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
  journalModal.addEventListener('click', handleModalClick);
  journalModal.addEventListener('keydown', handleModalKeydown);

  // Add styles
  if (!document.getElementById('voice-journal-styles')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'voice-journal-styles';
    styleSheet.textContent = getJournalStyles();
    document.head.appendChild(styleSheet);
  }

  document.body.appendChild(journalModal);
  return journalModal;
}

function renderMoodOptions(): string {
  return MOODS.map(
    (mood) => `
    <button class="mood-option" data-mood="${mood.id}" title="${mood.label}">
      <span class="mood-emoji">${mood.emoji}</span>
    </button>
  `
  ).join('');
}

// ============================================================================
// MODAL CONTROLS
// ============================================================================

export async function openVoiceJournal(agentId: string): Promise<void> {
  const modal = ensureModalExists();

  try {
    const agent = await getCustomAgent(agentId);
    if (!agent) {
      log.error('Agent not found:', agentId);
      const { toast } = await import('./toast.ui.js');
      toast.error('Agent not found');
      return;
    }

    if (agent.type !== 'twin') {
      log.warn('Voice journal is only for Digital Twin agents');
      const { toast } = await import('./toast.ui.js');
      toast.warning('Voice journal is only available for Digital Twin agents');
      return;
    }

    currentAgent = agent;

    // Load existing entries
    entries = (await listMemories(agentId, 'journalEntry')) || [];

    // Update title with agent name
    const title = modal.querySelector('.journal-title');
    if (title) {
      title.textContent = `${agent.displayName || agent.name}'s Journal`;
    }

    // Load initial prompt
    currentPrompt = await fetchPrompt();

    // Render all sections
    renderPromptSection();
    renderStats();
    renderCalendar();
    renderEntries();
    renderInsights();

    // Show modal
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    soundUI.play('switch');
  } catch (error) {
    log.error('Failed to open voice journal:', error);
    const { toast } = await import('./toast.ui.js');
    toast.error('Could not open journal');
  }
}

export function closeVoiceJournal(): void {
  if (!journalModal) return;

  stopRecording();
  stopVisualization();

  journalModal.classList.remove('open');
  document.body.style.overflow = '';

  currentAgent = null;
  entries = [];
  currentTab = 'record';

  soundUI.play('switch');
}

// ============================================================================
// TAB SWITCHING
// ============================================================================

function switchTab(tab: JournalTab): void {
  if (currentTab === tab) return;
  currentTab = tab;

  // Update tab buttons
  journalModal?.querySelectorAll('.journal-tab').forEach((btn) => {
    const btnTab = (btn as HTMLElement).dataset.tab;
    btn.classList.toggle('journal-tab--active', btnTab === tab);
    btn.setAttribute('aria-selected', btnTab === tab ? 'true' : 'false');
  });

  // Update content sections
  journalModal?.querySelectorAll('.journal-tab-content').forEach((section) => {
    const sectionTab = (section as HTMLElement).dataset.content;
    section.classList.toggle('journal-tab-content--active', sectionTab === tab);
  });

  soundUI.play('click');
}

// ============================================================================
// RENDERING
// ============================================================================

function renderPromptSection(): void {
  const section = journalModal?.querySelector('#prompt-section');
  if (!section || !currentPrompt) return;

  const difficultyColors: Record<string, string> = {
    gentle: 'var(--color-semantic-success, #4a6741)',
    moderate: 'var(--color-semantic-warning, #c4856a)',
    deep: 'var(--color-accent, #4a6741)',
  };

  section.innerHTML = `
    <div class="prompt-card">
      <div class="prompt-header">
        <span class="prompt-category">${currentPrompt.category}</span>
        <span class="prompt-difficulty" style="color: ${difficultyColors[currentPrompt.difficulty]}">
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

function renderStats(): void {
  const container = journalModal?.querySelector('#journal-stats');
  if (!container) return;

  const stats = calculateStats(entries);

  container.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card stat-card--streak">
        <div class="stat-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path>
          </svg>
        </div>
        <div class="stat-value">${stats.currentStreak}</div>
        <div class="stat-label">Day${stats.currentStreak !== 1 ? 's' : ''} streak</div>
      </div>
      <div class="stat-card stat-card--entries">
        <div class="stat-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
          </svg>
        </div>
        <div class="stat-value">${stats.totalEntries}</div>
        <div class="stat-label">Total entries</div>
      </div>
      <div class="stat-card stat-card--mood">
        <div class="stat-icon">
          ${stats.topMoods.length > 0 ? getMoodEmoji(stats.topMoods[0].mood) : '🙂'}
        </div>
        <div class="stat-value">${stats.topMoods.length > 0 ? getMoodLabel(stats.topMoods[0].mood) : '-'}</div>
        <div class="stat-label">Top mood</div>
      </div>
    </div>
    ${
      stats.totalEntries > 0
        ? `
    <div class="stats-activity">
      <span class="activity-label">Last 4 weeks:</span>
      <div class="activity-bars">
        ${stats.entriesByWeek
          .map((count, i) => {
            const height = count > 0 ? Math.min(100, (count / Math.max(...stats.entriesByWeek)) * 100) : 10;
            return `<div class="activity-bar" style="height: ${height}%;" title="${count} entries"></div>`;
          })
          .reverse()
          .join('')}
      </div>
    </div>
    `
        : ''
    }
  `;
}

function renderCalendar(): void {
  const container = journalModal?.querySelector('#journal-calendar');
  if (!container) return;

  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDay = firstDay.getDay();

  // Get entries by date for this month
  const entriesByDate = new Map<string, number>();
  entries.forEach((entry) => {
    const date = new Date(entry.createdAt);
    if (date.getMonth() === month && date.getFullYear() === year) {
      const key = date.getDate().toString();
      entriesByDate.set(key, (entriesByDate.get(key) || 0) + 1);
    }
  });

  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  let calendarHtml = `
    <div class="calendar-header">
      <button class="calendar-nav" data-action="prev-month" aria-label="Previous month">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>
      <span class="calendar-title">${monthNames[month]} ${year}</span>
      <button class="calendar-nav" data-action="next-month" aria-label="Next month">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </button>
    </div>
    <div class="calendar-grid">
      <div class="calendar-day-name">S</div>
      <div class="calendar-day-name">M</div>
      <div class="calendar-day-name">T</div>
      <div class="calendar-day-name">W</div>
      <div class="calendar-day-name">T</div>
      <div class="calendar-day-name">F</div>
      <div class="calendar-day-name">S</div>
  `;

  // Empty cells before first day
  for (let i = 0; i < startDay; i++) {
    calendarHtml += '<div class="calendar-day calendar-day--empty"></div>';
  }

  // Days of month
  const today = new Date();
  for (let day = 1; day <= lastDay.getDate(); day++) {
    const hasEntry = entriesByDate.has(day.toString());
    const entryCount = entriesByDate.get(day.toString()) || 0;
    const isToday =
      day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

    calendarHtml += `
      <div class="calendar-day ${hasEntry ? 'calendar-day--has-entry' : ''} ${isToday ? 'calendar-day--today' : ''}" 
           data-date="${year}-${month + 1}-${day}"
           title="${entryCount} ${entryCount === 1 ? 'entry' : 'entries'}">
        ${day}
        ${hasEntry ? `<span class="calendar-dot"></span>` : ''}
      </div>
    `;
  }

  calendarHtml += '</div>';
  container.innerHTML = calendarHtml;
}

function renderEntries(): void {
  const list = journalModal?.querySelector('#entries-list');
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
        ${entry.mood ? `<span class="entry-mood">${getMoodEmoji(entry.mood)}</span>` : ''}
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

function renderInsights(): void {
  const container = journalModal?.querySelector('#journal-insights');
  if (!container) return;

  const stats = calculateStats(entries);

  if (entries.length < 3) {
    container.innerHTML = `
      <div class="insights-empty">
        <div class="insights-empty-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
        </div>
        <h3 class="insights-empty-title">More entries needed</h3>
        <p class="insights-empty-text">Record at least 3 journal entries to start seeing insights about your patterns.</p>
        <button aria-label="Start journaling" class="insights-cta" data-action="go-to-record">
          Start journaling
        </button>
      </div>
    `;
    return;
  }

  // Generate insights
  const insights: Array<{ icon: string; title: string; text: string }> = [];

  // Streak insight
  if (stats.currentStreak > 0) {
    insights.push({
      icon: '🔥',
      title: `${stats.currentStreak}-day streak!`,
      text:
        stats.currentStreak >= 7
          ? "Incredible consistency! You've built a powerful habit."
          : stats.currentStreak >= 3
            ? "You're building momentum. Keep it up!"
            : "Great start! Try to journal again tomorrow.",
    });
  }

  // Mood pattern insight
  if (stats.topMoods.length > 0) {
    const topMood = stats.topMoods[0];
    insights.push({
      icon: getMoodEmoji(topMood.mood),
      title: `Most common: ${getMoodLabel(topMood.mood)}`,
      text: `You've felt ${getMoodLabel(topMood.mood).toLowerCase()} ${topMood.count} times. ${
        getMoodScore(topMood.mood) >= 7
          ? "That's wonderful to see!"
          : 'Notice any patterns in when this comes up?'
      }`,
    });
  }

  // Activity insight
  const recentActivity = stats.entriesByWeek[0] + stats.entriesByWeek[1];
  const olderActivity = stats.entriesByWeek[2] + stats.entriesByWeek[3];
  if (entries.length >= 5) {
    if (recentActivity > olderActivity) {
      insights.push({
        icon: '📈',
        title: 'Journaling more lately',
        text: "Your journaling frequency has increased. You're developing a stronger reflection practice!",
      });
    } else if (recentActivity < olderActivity && olderActivity > 0) {
      insights.push({
        icon: '💭',
        title: 'Time for a check-in?',
        text: "You've been journaling less recently. Even a quick voice note can help you stay connected to yourself.",
      });
    }
  }

  // Mood average insight
  if (stats.avgMoodScore > 0) {
    insights.push({
      icon: stats.avgMoodScore >= 6 ? '✨' : '🌱',
      title: `Mood average: ${stats.avgMoodScore.toFixed(1)}/10`,
      text:
        stats.avgMoodScore >= 7
          ? "You're trending towards positive moods. Beautiful!"
          : stats.avgMoodScore >= 5
            ? 'A healthy mix of emotions. All feelings are valid.'
            : "You've been navigating some tough emotions. Be gentle with yourself.",
    });
  }

  container.innerHTML = `
    <div class="insights-header">
      <h3 class="insights-title">Your Journey So Far</h3>
      <p class="insights-subtitle">Patterns from ${stats.totalEntries} journal entries</p>
    </div>
    <div class="insights-grid">
      ${insights
        .map(
          (insight) => `
        <div class="insight-card">
          <span class="insight-icon">${insight.icon}</span>
          <h4 class="insight-title">${insight.title}</h4>
          <p class="insight-text">${insight.text}</p>
        </div>
      `
        )
        .join('')}
    </div>
  `;
}

function formatDate(dateStr: string): string {
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
// EVENT HANDLING
// ============================================================================

function handleModalClick(e: Event): void {
  const target = e.target as HTMLElement;

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
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
    renderCalendar();
    return;
  }
  if (target.closest('[data-action="next-month"]')) {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
    renderCalendar();
    return;
  }

  // Go to record (from insights)
  if (target.closest('[data-action="go-to-record"]')) {
    switchTab('record');
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
  journalModal?.querySelectorAll('.mood-option').forEach((opt) => {
    opt.classList.remove('mood-option--selected');
  });
  btn.classList.add('mood-option--selected');
  soundUI.play('click');
}

function getSelectedMood(): string | undefined {
  const selected = journalModal?.querySelector('.mood-option--selected') as HTMLElement;
  return selected?.dataset.mood;
}

// ============================================================================
// RECORDING
// ============================================================================

/**
 * Get the best supported audio MIME type for MediaRecorder.
 * Safari doesn't support audio/webm, so we fall back to audio/mp4.
 */
function getSupportedMimeType(): string {
  const mimeTypes = [
    'audio/webm;codecs=opus',  // Best quality, Chrome/Firefox
    'audio/webm',              // Chrome/Firefox fallback
    'audio/mp4',               // Safari
    'audio/ogg;codecs=opus',   // Firefox alternative
    'audio/wav',               // Universal fallback (larger files)
  ];

  for (const mimeType of mimeTypes) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }

  // Last resort - let browser choose
  return '';
}

async function toggleRecording(): Promise<void> {
  if (isRecording) {
    await stopRecording();
  } else {
    await startRecording();
  }
}

async function startRecording(): Promise<void> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    // Detect best supported audio format (Safari uses mp4, Chrome/Firefox use webm)
    const mimeType = getSupportedMimeType();
    log.debug('Using audio MIME type:', mimeType);

    mediaRecorder = new MediaRecorder(stream, { mimeType });
    audioChunks = [];

    mediaRecorder.ondataavailable = (e) => {
      audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: mimeType });
      await saveJournalEntry(audioBlob);
    };

    mediaRecorder.start();
    isRecording = true;
    recordingStartTime = Date.now();

    updateRecordingUI(true);
    startVisualization();

    soundUI.play('click');
  } catch (error) {
    log.error('Failed to start recording:', error);
    const { toast } = await import('./toast.ui.js');
    toast.error('Could not access microphone');
  }
}

async function stopRecording(): Promise<void> {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    return;
  }

  mediaRecorder.stop();
  mediaRecorder.stream.getTracks().forEach((track) => track.stop());

  isRecording = false;
  recordingStartTime = null;

  updateRecordingUI(false);
  stopVisualization();

  soundUI.play('success');
}

function updateRecordingUI(recording: boolean): void {
  const btn = journalModal?.querySelector('#record-btn');
  const label = btn?.querySelector('.btn-label');

  if (recording) {
    btn?.classList.add('recording');
    if (label) label.textContent = 'Stop Recording';
  } else {
    btn?.classList.remove('recording');
    if (label) label.textContent = 'Start Recording';
  }
}

// ============================================================================
// VISUALIZATION
// ============================================================================

function startVisualization(): void {
  const canvas = journalModal?.querySelector('#journal-visualizer') as HTMLCanvasElement;
  const ctx = canvas?.getContext('2d');
  const timeDisplay = journalModal?.querySelector('#recorder-time');

  if (!canvas || !ctx || !analyser) return;

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  function draw(): void {
    if (!isRecording || !analyser || !ctx) return;

    analyser.getByteFrequencyData(dataArray);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = 60;

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(74, 103, 65, 0.1)';
    ctx.fill();

    const barCount = 32;
    const step = Math.floor(bufferLength / barCount);

    for (let i = 0; i < barCount; i++) {
      const value = dataArray[i * step];
      const normalizedValue = value / 255;
      const barHeight = normalizedValue * 40;

      const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
      const x1 = centerX + Math.cos(angle) * radius;
      const y1 = centerY + Math.sin(angle) * radius;
      const x2 = centerX + Math.cos(angle) * (radius + barHeight);
      const y2 = centerY + Math.sin(angle) * (radius + barHeight);

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = `rgba(74, 103, 65, ${0.5 + normalizedValue * 0.5})`;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    if (recordingStartTime && timeDisplay) {
      recordingDuration = Math.floor((Date.now() - recordingStartTime) / 1000);
      const minutes = Math.floor(recordingDuration / 60);
      const seconds = recordingDuration % 60;
      timeDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    animationFrameId = requestAnimationFrame(draw);
  }

  draw();
}

function stopVisualization(): void {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  if (audioContext) {
    audioContext.close().catch((e) => {
      log.debug('AudioContext close error:', e);
    });
    audioContext = null;
    analyser = null;
  }

  const timeDisplay = journalModal?.querySelector('#recorder-time');
  if (timeDisplay) {
    timeDisplay.textContent = '0:00';
  }

  const canvas = journalModal?.querySelector('#journal-visualizer') as HTMLCanvasElement;
  const ctx = canvas?.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 60, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(74, 103, 65, 0.1)';
    ctx.fill();
  }
}

// ============================================================================
// SAVING ENTRIES
// ============================================================================

async function saveJournalEntry(audioBlob: Blob): Promise<void> {
  if (!currentAgent) {
    log.error('No current agent');
    return;
  }

  const { toast } = await import('./toast.ui.js');

  try {
    // Show transcribing state
    toast.info('Transcribing...');

    // Convert blob to base64 for API
    const audioBase64 = await blobToBase64(audioBlob);

    // Transcribe the audio
    let transcript = '';
    try {
      const response = await fetch('/api/journal/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64,
          mimeType: audioBlob.type || 'audio/webm',
        }),
      });

      if (response.ok) {
        const result = (await response.json()) as { transcript: string; success: boolean };
        if (result.success && result.transcript) {
          transcript = result.transcript;
        }
      }
    } catch (transcribeError) {
      log.warn('Transcription failed, saving without transcript:', transcribeError);
    }

    // Build entry content
    let content = '';

    // Include prompt if one was shown
    if (currentPrompt) {
      content += `Prompt: "${currentPrompt.prompt}"\n\n`;
    }

    // Add transcript or placeholder
    if (transcript) {
      content += transcript;
    } else {
      content += `[Voice recording - ${recordingDuration} seconds]`;
    }

    const mood = getSelectedMood();

    await addMemory(currentAgent.id, {
      type: 'journalEntry',
      content,
      mood,
      transcript, // Store transcript separately for analysis
      durationSeconds: recordingDuration,
      // audioUrl would be set after uploading to storage
    });

    // Reload entries
    entries = (await listMemories(currentAgent.id, 'journalEntry')) || [];

    // Re-render all sections
    renderStats();
    renderCalendar();
    renderEntries();
    renderInsights();

    // Clear mood selection
    journalModal?.querySelectorAll('.mood-option').forEach((opt) => {
      opt.classList.remove('mood-option--selected');
    });

    // Get new prompt for next entry
    currentPrompt = await fetchPrompt();
    renderPromptSection();

    toast.success('Entry saved!');
  } catch (error) {
    log.error('Failed to save entry:', error);
    toast.error('Could not save entry');
  }
}

/**
 * Convert Blob to base64 string
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      // Remove the data URL prefix (e.g., "data:audio/webm;base64,")
      const base64 = dataUrl.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ============================================================================
// EXPORT & SHARE
// ============================================================================

/**
 * Export entire journal as a text file or PDF
 */
async function exportJournal(): Promise<void> {
  if (!currentAgent || entries.length === 0) {
    const { toast } = await import('./toast.ui.js');
    toast.warning('No entries to export');
    return;
  }

  const { toast } = await import('./toast.ui.js');

  try {
    const stats = calculateStats(entries);
    const sortedEntries = [...entries].sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // Build export content
    let content = `# Voice Journal Export\n`;
    content += `## ${currentAgent.displayName || currentAgent.name}\n`;
    content += `Exported: ${new Date().toLocaleDateString()}\n\n`;
    content += `---\n\n`;
    content += `## Journal Statistics\n`;
    content += `- Total Entries: ${stats.totalEntries}\n`;
    content += `- Current Streak: ${stats.currentStreak} days\n`;
    content += `- Longest Streak: ${stats.longestStreak} days\n`;
    if (stats.topMoods.length > 0) {
      content += `- Top Moods: ${stats.topMoods.map((m) => `${m.mood} (${m.count})`).join(', ')}\n`;
    }
    content += `\n---\n\n`;
    content += `## Journal Entries\n\n`;

    for (const entry of sortedEntries) {
      const date = new Date(entry.createdAt).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      content += `### ${date}\n`;
      if (entry.mood) {
        content += `**Mood:** ${entry.mood}\n`;
      }
      content += `\n${entry.content}\n\n`;
      content += `---\n\n`;
    }

    // Create and download file
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `journal-${currentAgent.name.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success('Journal exported!');
  } catch (error) {
    log.error('Failed to export journal:', error);
    toast.error('Could not export journal');
  }
}

/**
 * Share journal or specific entry
 */
async function shareJournal(): Promise<void> {
  if (!currentAgent || entries.length === 0) {
    const { toast } = await import('./toast.ui.js');
    toast.warning('No entries to share');
    return;
  }

  const { toast } = await import('./toast.ui.js');

  // Build share content (recent entry summary)
  const recentEntry = entries.sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  })[0];

  if (!recentEntry) {
    toast.warning('No entries to share');
    return;
  }

  const date = new Date(recentEntry.createdAt).toLocaleDateString();
  const preview = recentEntry.content.slice(0, 200);
  const shareText = `My journal entry from ${date}:\n\n"${preview}${recentEntry.content.length > 200 ? '...' : ''}"\n\n— Written with Ferni`;

  // Use Web Share API if available
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'My Journal Entry',
        text: shareText,
      });
      toast.success('Shared!');
    } catch (error) {
      // User cancelled or share failed
      if ((error as Error).name !== 'AbortError') {
        log.error('Share failed:', error);
        fallbackCopyShare(shareText, toast);
      }
    }
  } else {
    // Fallback: copy to clipboard
    fallbackCopyShare(shareText, toast);
  }
}

function fallbackCopyShare(text: string, toast: { success: (msg: string) => void; error: (msg: string) => void }): void {
  navigator.clipboard
    .writeText(text)
    .then(() => {
      toast.success('Copied to clipboard!');
    })
    .catch(() => {
      toast.error('Could not share');
    });
}

// ============================================================================
// STYLES
// ============================================================================

function getJournalStyles(): string {
  return `
    /* Journal Overlay */
    .voice-journal-overlay {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal, 2100);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      pointer-events: none;
      transition: opacity ${DURATION.NORMAL}ms ${EASING.STANDARD};
    }
    
    .voice-journal-overlay.open {
      opacity: 1;
      pointer-events: auto;
    }
    
    .journal-backdrop {
      position: absolute;
      inset: 0;
      background: var(--backdrop-heavy, rgba(0, 0, 0, 0.6));
      backdrop-filter: blur(8px);
    }
    
    /* Journal Container */
    .journal-container {
      position: relative;
      width: 90vw;
      max-width: clamp(476px, 90vw, 680px);
      max-height: 90vh;
      background: var(--color-bg-elevated, #1a1a2e);
      border-radius: var(--radius-2xl, 24px);
      box-shadow: var(--shadow-2xl);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transform: scale(0.95);
      transition: transform ${DURATION.NORMAL}ms ${EASING.SPRING};
    }
    
    .voice-journal-overlay.open .journal-container {
      transform: scale(1);
    }
    
    /* Header */
    .journal-header {
      padding: var(--space-md, 16px) var(--space-lg, 24px);
      border-bottom: 1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.1));
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    
    .journal-title {
      font-family: 'Plus Jakarta Sans', var(--font-display, sans-serif);
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--color-text-primary, #fff);
      margin: 0;
    }
    
    .journal-subtitle {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.8rem;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
      margin: 2px 0 0;
    }
    
    .journal-header-actions {
      display: flex;
      align-items: center;
      gap: var(--space-xs, 4px);
    }
    
    .journal-action-btn {
      background: none;
      border: none;
      color: var(--color-text-muted);
      cursor: pointer;
      padding: var(--space-sm, 8px);
      border-radius: var(--radius-md, 8px);
      transition: all ${DURATION.FAST}ms;
    }
    
    .journal-action-btn:hover,
    .journal-action-btn:focus-visible {
      background: var(--color-bg-tertiary);
      color: var(--color-accent, #4a6741);
    }
    
    .journal-close {
      background: none;
      border: none;
      color: var(--color-text-muted);
      cursor: pointer;
      padding: var(--space-sm, 8px);
      border-radius: var(--radius-md, 8px);
      transition: all ${DURATION.FAST}ms;
    }
    
    .journal-close:hover,
    .journal-close:focus-visible {
      background: var(--color-bg-tertiary);
      color: var(--color-text-primary);
    }
    
    /* Tabs */
    .journal-tabs {
      display: flex;
      gap: var(--space-xs, 4px);
      padding: var(--space-sm, 8px) var(--space-lg, 24px);
      border-bottom: 1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.1));
    }
    
    .journal-tab {
      display: flex;
      align-items: center;
      gap: var(--space-xs, 6px);
      padding: var(--space-sm, 8px) var(--space-md, 16px);
      background: none;
      border: none;
      border-radius: var(--radius-full, 999px);
      color: var(--color-text-muted);
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }
    
    .journal-tab:hover,
    .journal-tab:focus-visible {
      background: var(--color-bg-secondary);
      color: var(--color-text-secondary);
    }
    
    .journal-tab--active {
      background: var(--color-accent, #4a6741);
      color: white;
    }
    
    .journal-tab--active:hover,
    .journal-tab--active:focus-visible {
      background: var(--color-accent, #4a6741);
      color: white;
      filter: brightness(1.1);
    }
    
    /* Tab Content */
    .journal-content {
      flex: 1;
      overflow-y: auto;
    }
    
    .journal-tab-content {
      display: none;
      padding: var(--space-lg, 24px);
    }
    
    .journal-tab-content--active {
      display: block;
    }
    
    /* Prompt Card */
    .journal-prompt-section {
      margin-bottom: var(--space-lg, 24px);
    }
    
    .prompt-card {
      background: linear-gradient(135deg, 
        rgba(74, 103, 65, 0.15), 
        rgba(74, 103, 65, 0.05));
      border: 1px solid rgba(74, 103, 65, 0.3);
      border-radius: var(--radius-xl, 16px);
      padding: var(--space-lg, 20px);
    }
    
    .prompt-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--space-sm, 8px);
    }
    
    .prompt-category {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--color-accent, #4a6741);
    }
    
    .prompt-difficulty {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.75rem;
    }
    
    .prompt-text {
      font-family: 'Plus Jakarta Sans', var(--font-display, sans-serif);
      font-size: 1.1rem;
      font-weight: 500;
      color: var(--color-text-primary);
      line-height: 1.5;
      margin: 0 0 var(--space-sm, 8px);
    }
    
    .prompt-followup {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.9rem;
      color: var(--color-text-secondary);
      font-style: italic;
      margin: 0 0 var(--space-md, 12px);
    }
    
    .prompt-shuffle {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs, 4px);
      padding: var(--space-xs, 6px) var(--space-sm, 12px);
      background: var(--color-bg-secondary);
      border: none;
      border-radius: var(--radius-md, 8px);
      color: var(--color-text-muted);
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.8rem;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }
    
    .prompt-shuffle:hover,
    .prompt-shuffle:focus-visible {
      background: var(--color-bg-tertiary);
      color: var(--color-text-primary);
    }
    
    /* Recorder Section */
    .journal-recorder {
      text-align: center;
    }
    
    .recorder-visualizer {
      position: relative;
      width: min(180px, 100%);
      height: 180px;
      margin: 0 auto var(--space-lg, 24px);
    }
    
    #journal-visualizer {
      width: 100%;
      height: 100%;
    }
    
    .recorder-time {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-family: 'Space Mono', monospace;
      font-size: 1.5rem;
      color: var(--color-text-primary, #fff);
    }
    
    .recorder-controls {
      margin-bottom: var(--space-lg, 24px);
    }
    
    .recorder-btn {
      display: inline-flex;
      align-items: center;
      gap: var(--space-sm, 8px);
      padding: var(--space-sm, 12px) var(--space-lg, 24px);
      background: var(--color-accent, #4a6741);
      border: none;
      border-radius: var(--radius-full, 999px);
      color: white;
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.95rem;
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.NORMAL}ms;
    }
    
    .recorder-btn:hover,
    .recorder-btn:focus-visible {
      filter: brightness(1.1);
    }
    
    .recorder-btn.recording {
      background: #ef4444;
      animation: pulse-recording 1.5s infinite;
    }
    
    @keyframes pulse-recording {
      0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
      50% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
    }
    
    /* Mood Selector */
    .mood-selector {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-sm, 8px);
    }
    
    .mood-label {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.85rem;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
    }
    
    .mood-options {
      display: flex;
      gap: var(--space-xs, 4px);
      flex-wrap: wrap;
      justify-content: center;
    }
    
    .mood-option {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      border: 2px solid transparent;
      background: var(--color-bg-secondary, rgba(255, 255, 255, 0.05));
      cursor: pointer;
      font-size: 1.2rem;
      transition: all ${DURATION.FAST}ms;
    }
    
    .mood-option:hover,
    .mood-option:focus-visible {
      background: var(--color-bg-tertiary);
      transform: scale(1.1);
    }
    
    .mood-option--selected {
      border-color: var(--color-accent, #4a6741);
      background: rgba(74, 103, 65, 0.2);
    }
    
    /* Stats Section */
    .journal-stats {
      margin-bottom: var(--space-lg, 24px);
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--space-sm, 8px);
      margin-bottom: var(--space-md, 16px);
    }
    
    .stat-card {
      background: var(--color-bg-secondary);
      border-radius: var(--radius-lg, 12px);
      padding: var(--space-md, 16px);
      text-align: center;
    }
    
    .stat-icon {
      font-size: 1.25rem;
      margin-bottom: var(--space-xs, 4px);
    }
    
    .stat-value {
      font-family: 'Plus Jakarta Sans', var(--font-display, sans-serif);
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--color-text-primary);
    }
    
    .stat-label {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.7rem;
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    
    .stats-activity {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 12px);
      padding: var(--space-sm, 12px);
      background: var(--color-bg-secondary);
      border-radius: var(--radius-md, 8px);
    }
    
    .activity-label {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }
    
    .activity-bars {
      display: flex;
      align-items: flex-end;
      gap: 4px;
      flex: 1;
      height: 30px;
    }
    
    .activity-bar {
      flex: 1;
      min-height: 4px;
      background: var(--color-accent, #4a6741);
      border-radius: 2px;
      transition: height ${DURATION.NORMAL}ms ${EASING.STANDARD};
    }
    
    /* Calendar */
    .journal-calendar {
      margin-bottom: var(--space-lg, 24px);
    }
    
    .calendar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-sm, 12px);
    }
    
    .calendar-title {
      font-family: 'Plus Jakarta Sans', var(--font-display, sans-serif);
      font-size: 1rem;
      font-weight: 600;
      color: var(--color-text-primary);
    }
    
    .calendar-nav {
      background: none;
      border: none;
      color: var(--color-text-muted);
      cursor: pointer;
      padding: var(--space-xs, 4px);
      border-radius: var(--radius-sm, 4px);
      transition: all ${DURATION.FAST}ms;
    }
    
    .calendar-nav:hover,
    .calendar-nav:focus-visible {
      background: var(--color-bg-secondary);
      color: var(--color-text-primary);
    }
    
    .calendar-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 2px;
    }
    
    .calendar-day-name {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.65rem;
      font-weight: 600;
      color: var(--color-text-muted);
      text-align: center;
      padding: var(--space-xs, 4px);
    }
    
    .calendar-day {
      position: relative;
      aspect-ratio: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.75rem;
      color: var(--color-text-secondary);
      background: var(--color-bg-secondary);
      border-radius: var(--radius-sm, 4px);
      cursor: default;
    }
    
    .calendar-day--empty {
      background: transparent;
    }
    
    .calendar-day--today {
      font-weight: 600;
      color: var(--color-accent, #4a6741);
    }
    
    .calendar-day--has-entry {
      background: rgba(74, 103, 65, 0.2);
      color: var(--color-text-primary);
    }
    
    .calendar-dot {
      position: absolute;
      bottom: 3px;
      width: 4px;
      height: 4px;
      background: var(--color-accent, #4a6741);
      border-radius: 50%;
    }
    
    /* Entries Section */
    .journal-entries {
      margin-top: var(--space-md, 16px);
    }
    
    .entries-title {
      font-family: 'Plus Jakarta Sans', var(--font-display, sans-serif);
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.6));
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin: 0 0 var(--space-md, 16px);
    }
    
    .entries-empty {
      text-align: center;
      padding: var(--space-xl, 32px);
      color: var(--color-text-muted);
    }
    
    .entries-empty-text {
      font-size: 0.95rem;
      margin: 0 0 var(--space-xs, 4px);
    }
    
    .entries-empty-hint {
      font-size: 0.85rem;
      opacity: 0.7;
      margin: 0;
    }
    
    .entries-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-sm, 10px);
    }
    
    .journal-entry {
      padding: var(--space-md, 14px);
      background: var(--color-bg-secondary, rgba(255, 255, 255, 0.05));
      border-radius: var(--radius-lg, 12px);
      border: 1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.08));
    }
    
    /* Auto-captured entries have a subtle accent */
    .journal-entry--auto {
      background: linear-gradient(135deg, 
        var(--color-accent-subtle, rgba(61, 90, 69, 0.08)), 
        var(--color-bg-secondary, rgba(255, 255, 255, 0.05))
      );
      border-left: 3px solid var(--color-accent, #3d5a45);
    }
    
    .entry-header {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 8px);
      margin-bottom: var(--space-xs, 6px);
    }
    
    .entry-source {
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-accent, #3d5a45);
      background: var(--color-accent-subtle, rgba(61, 90, 69, 0.15));
      padding: 2px 8px;
      border-radius: var(--radius-full, 9999px);
    }
    
    .entry-date {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.7rem;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
    }
    
    .entry-mood {
      font-size: 0.9rem;
    }
    
    .entry-content {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.85rem;
      color: var(--color-text-primary, #fff);
      margin: 0;
      line-height: 1.5;
    }
    
    .entry-audio {
      width: 100%;
      margin-top: var(--space-sm, 8px);
      height: 28px;
    }
    
    /* Insights Section */
    .journal-insights {
      /* Insights styles */
    }
    
    .insights-empty {
      text-align: center;
      padding: var(--space-2xl, 48px) var(--space-lg, 24px);
    }
    
    .insights-empty-icon {
      color: var(--color-text-muted);
      margin-bottom: var(--space-md, 16px);
    }
    
    .insights-empty-title {
      font-family: 'Plus Jakarta Sans', var(--font-display, sans-serif);
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-sm, 8px);
    }
    
    .insights-empty-text {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.9rem;
      color: var(--color-text-muted);
      margin: 0 0 var(--space-lg, 24px);
      max-width: min(280px, 100%);
      margin-inline: auto;
    }
    
    .insights-cta {
      display: inline-flex;
      align-items: center;
      gap: var(--space-sm, 8px);
      padding: var(--space-sm, 12px) var(--space-lg, 24px);
      background: var(--color-accent, #4a6741);
      border: none;
      border-radius: var(--radius-full, 999px);
      color: white;
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.9rem;
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.NORMAL}ms;
    }
    
    .insights-cta:hover,
    .insights-cta:focus-visible {
      filter: brightness(1.1);
    }
    
    .insights-header {
      margin-bottom: var(--space-lg, 24px);
    }
    
    .insights-title {
      font-family: 'Plus Jakarta Sans', var(--font-display, sans-serif);
      font-size: 1.2rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-xs, 4px);
    }
    
    .insights-subtitle {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.85rem;
      color: var(--color-text-muted);
      margin: 0;
    }
    
    .insights-grid {
      display: flex;
      flex-direction: column;
      gap: var(--space-md, 16px);
    }
    
    .insight-card {
      display: flex;
      align-items: flex-start;
      gap: var(--space-md, 16px);
      padding: var(--space-md, 16px);
      background: var(--color-bg-secondary);
      border-radius: var(--radius-lg, 12px);
    }
    
    .insight-icon {
      font-size: 1.5rem;
      flex-shrink: 0;
    }
    
    .insight-title {
      font-family: 'Plus Jakarta Sans', var(--font-display, sans-serif);
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-xs, 4px);
    }
    
    .insight-text {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.85rem;
      color: var(--color-text-secondary);
      margin: 0;
      line-height: 1.5;
    }
    
    /* Responsive */
    @media (max-width: clamp(448px, 90vw, 640px)) {
      .journal-container {
        width: 100vw;
        height: 100vh;
        max-height: 100vh;
        border-radius: 0;
      }
      
      .recorder-visualizer {
        width: min(150px, 100%);
        height: 150px;
      }
      
      .stats-grid {
        grid-template-columns: repeat(3, 1fr);
      }
      
      .stat-card {
        padding: var(--space-sm, 12px);
      }
      
      .stat-value {
        font-size: 1.25rem;
      }
    }
    
    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .voice-journal-overlay,
      .journal-container,
      .journal-tab,
      .prompt-shuffle,
      .mood-option,
      .recorder-btn {
        transition: none;
      }
      
      .recorder-btn.recording {
        animation: none;
      }
    }
  `;
}

// ============================================================================
// EXPORTS
// ============================================================================
// Note: openVoiceJournal and closeVoiceJournal are exported inline above
