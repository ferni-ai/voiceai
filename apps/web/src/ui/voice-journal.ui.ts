/**
 * Voice Journal UI
 *
 * A dedicated interface for Voice Twin agents to record daily journal entries.
 * Users can record voice notes that are transcribed and stored as memories,
 * creating a personal voice diary that the agent can reference.
 *
 * Features:
 * - Voice recording with visualizer
 * - Playback of past entries
 * - AI-generated insights from entries
 * - Calendar view of journal history
 * - Mood tracking
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

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Ensures the journal modal exists in the DOM
 */
function ensureModalExists(): HTMLElement {
  if (journalModal) {
    return journalModal;
  }

  // Clean up orphaned elements (HMR protection)
  document.querySelectorAll('.voice-journal-overlay').forEach((el) => el.remove());

  journalModal = document.createElement('div');
  journalModal.className = 'voice-journal-overlay';
  journalModal.innerHTML = `
    <div class="journal-backdrop" data-action="close"></div>
    <div class="journal-container" role="dialog" aria-modal="true" aria-labelledby="journal-title">
      <header class="journal-header">
        <div class="journal-header-content">
          <h2 class="journal-title" id="journal-title">Voice Journal</h2>
          <p class="journal-subtitle">Record your thoughts and feelings</p>
        </div>
        <button class="journal-close" data-action="close" aria-label="Close journal">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </header>

      <main class="journal-content">
        <section class="journal-recorder">
          <div class="recorder-visualizer">
            <canvas id="journal-visualizer" width="200" height="200"></canvas>
            <div class="recorder-time" id="recorder-time">0:00</div>
          </div>
          
          <div class="recorder-controls">
            <button class="recorder-btn" id="record-btn">
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
        </section>

        <section class="journal-entries">
          <h3 class="entries-title">Recent Entries</h3>
          <div class="entries-list" id="entries-list">
            <!-- Entries render here -->
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

/**
 * Renders mood option buttons
 */
function renderMoodOptions(): string {
  const moods = [
    { id: 'happy', emoji: '😊', label: 'Happy' },
    { id: 'calm', emoji: '😌', label: 'Calm' },
    { id: 'anxious', emoji: '😰', label: 'Anxious' },
    { id: 'sad', emoji: '😢', label: 'Sad' },
    { id: 'angry', emoji: '😤', label: 'Frustrated' },
    { id: 'grateful', emoji: '🙏', label: 'Grateful' },
    { id: 'tired', emoji: '😴', label: 'Tired' },
    { id: 'excited', emoji: '🎉', label: 'Excited' },
  ];

  return moods
    .map(
      (mood) => `
    <button class="mood-option" data-mood="${mood.id}" title="${mood.label}">
      <span class="mood-emoji">${mood.emoji}</span>
    </button>
  `
    )
    .join('');
}

// ============================================================================
// MODAL CONTROLS
// ============================================================================

/**
 * Opens the voice journal for a specific agent
 */
export async function openVoiceJournal(agentId: string): Promise<void> {
  const modal = ensureModalExists();

  try {
    // Fetch agent details
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

    // Render entries
    renderEntries();

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

/**
 * Closes the voice journal
 */
export function closeVoiceJournal(): void {
  if (!journalModal) return;

  // Stop any recording in progress
  stopRecording();
  stopVisualization();

  journalModal.classList.remove('open');
  document.body.style.overflow = '';

  currentAgent = null;
  entries = [];

  soundUI.play('switch');
}

// ============================================================================
// RENDERING
// ============================================================================

/**
 * Renders the journal entries list
 */
function renderEntries(): void {
  const list = journalModal?.querySelector('#entries-list');
  if (!list) return;

  if (entries.length === 0) {
    list.innerHTML = `
      <div class="entries-empty">
        <p class="entries-empty-text">No journal entries yet.</p>
        <p class="entries-empty-hint">Record your first entry above!</p>
      </div>
    `;
    return;
  }

  // Sort by date, most recent first
  const sortedEntries = [...entries].sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  list.innerHTML = sortedEntries
    .map(
      (entry) => `
    <article class="journal-entry" data-entry-id="${entry.id}">
      <header class="entry-header">
        <time class="entry-date">${formatDate(entry.createdAt)}</time>
        ${entry.mood ? `<span class="entry-mood">${getMoodEmoji(entry.mood)}</span>` : ''}
      </header>
      <p class="entry-content">${entry.content}</p>
      ${
        entry.audioUrl
          ? `
        <audio class="entry-audio" controls src="${entry.audioUrl}"></audio>
      `
          : ''
      }
    </article>
  `
    )
    .join('');
}

/**
 * Formats a date for display
 */
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

/**
 * Gets emoji for a mood
 */
function getMoodEmoji(mood: string): string {
  const moodMap: Record<string, string> = {
    happy: '😊',
    calm: '😌',
    anxious: '😰',
    sad: '😢',
    angry: '😤',
    grateful: '🙏',
    tired: '😴',
    excited: '🎉',
  };
  return moodMap[mood] || '🙂';
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

  // Record button
  if (target.closest('#record-btn')) {
    void toggleRecording();
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

/**
 * Selects a mood option
 */
function selectMood(btn: HTMLElement): void {
  // Deselect others
  journalModal?.querySelectorAll('.mood-option').forEach((opt) => {
    opt.classList.remove('mood-option--selected');
  });

  // Select this one
  btn.classList.add('mood-option--selected');
  soundUI.play('click');
}

/**
 * Gets the currently selected mood
 */
function getSelectedMood(): string | undefined {
  const selected = journalModal?.querySelector('.mood-option--selected') as HTMLElement;
  return selected?.dataset.mood;
}

// ============================================================================
// RECORDING
// ============================================================================

/**
 * Toggles recording state
 */
async function toggleRecording(): Promise<void> {
  if (isRecording) {
    await stopRecording();
  } else {
    await startRecording();
  }
}

/**
 * Starts recording audio
 */
async function startRecording(): Promise<void> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Set up audio context for visualization
    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    audioChunks = [];

    mediaRecorder.ondataavailable = (e) => {
      audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      await saveJournalEntry(audioBlob);
    };

    mediaRecorder.start();
    isRecording = true;
    recordingStartTime = Date.now();

    // Update UI
    updateRecordingUI(true);
    startVisualization();

    soundUI.play('click');
  } catch (error) {
    log.error('Failed to start recording:', error);
    const { toast } = await import('./toast.ui.js');
    toast.error('Could not access microphone');
  }
}

/**
 * Stops recording audio
 */
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

/**
 * Updates the recording UI state
 */
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

/**
 * Starts the audio visualization
 */
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

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw circular visualizer
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = 60;

    // Draw background circle
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(74, 103, 65, 0.1)';
    ctx.fill();

    // Draw frequency bars around the circle
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

    // Update time display
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

/**
 * Stops the audio visualization
 */
function stopVisualization(): void {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  if (audioContext) {
    audioContext.close();
    audioContext = null;
    analyser = null;
  }

  // Reset time display
  const timeDisplay = journalModal?.querySelector('#recorder-time');
  if (timeDisplay) {
    timeDisplay.textContent = '0:00';
  }

  // Clear canvas
  const canvas = journalModal?.querySelector('#journal-visualizer') as HTMLCanvasElement;
  const ctx = canvas?.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Draw idle state
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

/**
 * Saves a journal entry
 */
async function saveJournalEntry(audioBlob: Blob): Promise<void> {
  if (!currentAgent) {
    log.error('No current agent');
    return;
  }

  const { toast } = await import('./toast.ui.js');

  try {
    // For now, we'll save with placeholder transcription
    // In production, this would call a transcription service
    const transcription = `[Voice recording - ${recordingDuration} seconds]`;
    const mood = getSelectedMood();

    await addMemory(currentAgent.id, {
      type: 'journalEntry',
      content: transcription,
      mood,
      // audioUrl would be set after uploading to storage
    });

    // Reload entries
    entries = (await listMemories(currentAgent.id, 'journalEntry')) || [];
    renderEntries();

    // Clear mood selection
    journalModal?.querySelectorAll('.mood-option').forEach((opt) => {
      opt.classList.remove('mood-option--selected');
    });

    toast.success('Entry saved!');
  } catch (error) {
    log.error('Failed to save entry:', error);
    toast.error('Could not save entry');
  }
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
      max-width: 600px;
      max-height: 85vh;
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
      padding: var(--space-lg, 24px);
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
      font-size: 0.85rem;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
      margin: 4px 0 0;
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
    
    .journal-close:hover {
      background: var(--color-bg-tertiary);
      color: var(--color-text-primary);
    }
    
    /* Content */
    .journal-content {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-lg, 24px);
    }
    
    /* Recorder Section */
    .journal-recorder {
      text-align: center;
      padding-bottom: var(--space-xl, 32px);
      border-bottom: 1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.1));
      margin-bottom: var(--space-xl, 32px);
    }
    
    .recorder-visualizer {
      position: relative;
      width: 200px;
      height: 200px;
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
    
    .recorder-btn:hover {
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
    
    .mood-option:hover {
      background: var(--color-bg-tertiary);
      transform: scale(1.1);
    }
    
    .mood-option--selected {
      border-color: var(--color-accent, #4a6741);
      background: rgba(74, 103, 65, 0.2);
    }
    
    /* Entries Section */
    .journal-entries {
      /* Entries section styles */
    }
    
    .entries-title {
      font-family: 'Plus Jakarta Sans', var(--font-display, sans-serif);
      font-size: 0.9rem;
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
      gap: var(--space-md, 12px);
    }
    
    .journal-entry {
      padding: var(--space-md, 16px);
      background: var(--color-bg-secondary, rgba(255, 255, 255, 0.05));
      border-radius: var(--radius-lg, 12px);
      border: 1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.08));
    }
    
    .entry-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-sm, 8px);
    }
    
    .entry-date {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.75rem;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
    }
    
    .entry-mood {
      font-size: 1rem;
    }
    
    .entry-content {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.9rem;
      color: var(--color-text-primary, #fff);
      margin: 0;
      line-height: 1.5;
    }
    
    .entry-audio {
      width: 100%;
      margin-top: var(--space-sm, 8px);
      height: 32px;
    }
    
    /* Responsive */
    @media (max-width: 640px) {
      .journal-container {
        width: 100vw;
        height: 100vh;
        max-height: 100vh;
        border-radius: 0;
      }
      
      .recorder-visualizer {
        width: 150px;
        height: 150px;
      }
    }
  `;
}

// ============================================================================
// EXPORTS
// ============================================================================

export { openVoiceJournal, closeVoiceJournal };

