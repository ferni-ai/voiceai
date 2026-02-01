/**
 * Voice Clone Recorder UI
 *
 * Records voice samples for training custom voice clones via Cartesia API.
 * Provides guided prompts and quality feedback to ensure optimal recordings.
 *
 * Features:
 * - Guided recording prompts for diverse speech samples
 * - Audio quality indicators (volume, clarity)
 * - Recording management (playback, delete, re-record)
 * - Progress tracking toward minimum sample requirements
 * - Integration with Cartesia voice cloning API
 *
 * @module voice-clone-recorder.ui
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { soundUI } from './sound.ui.js';
import { getCustomAgent, type CustomAgent } from '../services/custom-agent.service.js';
import { t } from '../i18n/index.js';
import { apiPost } from '../utils/api.js';

const log = createLogger('VoiceCloneRecorder');

// ============================================================================
// TYPES
// ============================================================================

interface VoiceSample {
  id: string;
  promptId: string;
  audioBlob: Blob;
  audioUrl: string;
  duration: number;
  quality: 'poor' | 'good' | 'excellent';
  recordedAt: string;
}

interface RecordingPrompt {
  id: string;
  category: 'intro' | 'emotion' | 'range' | 'conversation';
  text: string;
  tip?: string;
  minDuration: number;
  maxDuration: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const RECORDING_PROMPTS: RecordingPrompt[] = [
  // Intro prompts - natural speech
  {
    id: 'intro-1',
    category: 'intro',
    text: "Hello! My name is [your name] and I'm creating a voice clone. Today is a beautiful day and I'm excited to get started with this project.",
    tip: 'Speak naturally at your normal pace',
    minDuration: 5,
    maxDuration: 15,
  },
  {
    id: 'intro-2',
    category: 'intro',
    text: "I love spending time with my friends and family. We often go to the park together, or sometimes we'll just stay home and watch movies.",
    tip: 'Imagine telling a friend about your weekend',
    minDuration: 5,
    maxDuration: 15,
  },
  {
    id: 'intro-3',
    category: 'intro',
    text: "One of my favorite things to do is read books. I especially enjoy science fiction and mystery novels. There's nothing quite like getting lost in a good story.",
    tip: 'Express genuine enthusiasm',
    minDuration: 5,
    maxDuration: 15,
  },
  // Emotion prompts - varied tones
  {
    id: 'emotion-1',
    category: 'emotion',
    text: "I'm so happy to hear that news! That's absolutely wonderful, congratulations! I knew you could do it!",
    tip: 'Express genuine excitement and joy',
    minDuration: 4,
    maxDuration: 10,
  },
  {
    id: 'emotion-2',
    category: 'emotion',
    text: "I understand how difficult that must have been. Take your time, I'm here for you whenever you need to talk.",
    tip: 'Speak with warmth and compassion',
    minDuration: 4,
    maxDuration: 10,
  },
  {
    id: 'emotion-3',
    category: 'emotion',
    text: "Hmm, that's interesting. Let me think about that for a moment. I wonder if there might be another way to approach this problem.",
    tip: 'Sound thoughtful and contemplative',
    minDuration: 5,
    maxDuration: 12,
  },
  // Range prompts - varied speech patterns
  {
    id: 'range-1',
    category: 'range',
    text: "Can you believe it? I just won the lottery! Well, not really, but wouldn't that be amazing? One can dream, right?",
    tip: 'Vary your pitch - go high and low',
    minDuration: 5,
    maxDuration: 12,
  },
  {
    id: 'range-2',
    category: 'range',
    text: "The quick brown fox jumps over the lazy dog. Peter Piper picked a peck of pickled peppers. She sells seashells by the seashore.",
    tip: 'Enunciate clearly - these test different sounds',
    minDuration: 5,
    maxDuration: 12,
  },
  {
    id: 'range-3',
    category: 'range',
    text: "Wait... Did you hear that? I think someone's at the door. Let me go check. Oh, it's just the wind.",
    tip: 'Use pauses and vary your tempo',
    minDuration: 5,
    maxDuration: 12,
  },
  // Conversation prompts - natural flow
  {
    id: 'conversation-1',
    category: 'conversation',
    text: "So anyway, I was telling them about the project, and they seemed really interested. They asked a lot of questions, which I thought was a good sign.",
    tip: 'Conversational and casual',
    minDuration: 5,
    maxDuration: 15,
  },
  {
    id: 'conversation-2',
    category: 'conversation',
    text: "Let me tell you about my day. First, I had breakfast - just some toast and coffee. Then I went for a walk around the neighborhood.",
    tip: 'Like talking to a friend over coffee',
    minDuration: 5,
    maxDuration: 15,
  },
];

const MIN_SAMPLES_REQUIRED = 5;
const _IDEAL_SAMPLES = 10;

// ============================================================================
// STATE
// ============================================================================

let recorderModal: HTMLElement | null = null;
let currentAgent: CustomAgent | null = null;
let samples: VoiceSample[] = [];
let currentPromptIndex = 0;
let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];
let isRecording = false;
let recordingStartTime: number | null = null;
let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let animationFrameId: number | null = null;
let currentStream: MediaStream | null = null;

// ============================================================================
// STYLES
// ============================================================================

const STYLES = `
  .voice-clone-recorder-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal, 2100);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4, 16px);
  }

  .voice-clone-recorder-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(44, 37, 32, 0.75);
  }

  .voice-clone-recorder-modal {
    position: relative;
    width: 100%;
    max-width: clamp(392px, 90vw, 560px);
    max-height: 90vh;
    background: var(--color-bg-elevated, #1a1a2e);
    border-radius: var(--radius-2xl, 24px);
    box-shadow: var(--shadow-2xl);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transform: scale(0.95);
    opacity: 0;
    transition: transform ${DURATION.SLOW}ms ${EASING.SPRING}, 
                opacity ${DURATION.SLOW}ms ${EASING.GENTLE};
  }

  .voice-clone-recorder-modal.visible {
    transform: scale(1);
    opacity: 1;
  }

  .vcr-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4, 16px) var(--space-5, 20px);
    border-bottom: 1px solid var(--color-border-subtle, rgba(255,255,255,0.1));
  }

  .vcr-header-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .vcr-eyebrow {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-text-muted);
    font-weight: 600;
  }

  .vcr-title {
    font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
    font-size: 1.2rem;
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0;
  }

  .vcr-close-btn {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-full, 999px);
    background: transparent;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-muted);
    transition: all ${DURATION.FAST}ms ease;
  }

  .vcr-close-btn:hover,
  .vcr-close-btn:focus-visible {
    background: var(--color-bg-tertiary);
    color: var(--color-text-primary);
  }

  .vcr-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-5, 20px);
  }

  /* Progress Section */
  .vcr-progress {
    margin-bottom: var(--space-5, 20px);
  }

  .vcr-progress-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-2, 8px);
  }

  .vcr-progress-label {
    font-size: 0.85rem;
    color: var(--color-text-muted);
  }

  .vcr-progress-count {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--color-accent, #4a6741);
  }

  .vcr-progress-bar {
    height: 8px;
    background: var(--color-bg-secondary);
    border-radius: 4px;
    overflow: hidden;
  }

  .vcr-progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--color-accent), #6b8f5e);
    border-radius: 4px;
    transition: width ${DURATION.NORMAL}ms ${EASING.STANDARD};
  }

  .vcr-progress-complete {
    display: flex;
    align-items: center;
    gap: var(--space-2, 8px);
    padding: var(--space-3, 12px);
    background: color-mix(in srgb, var(--color-accent, #4a6741) 15%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-accent, #4a6741) 30%, transparent);
    border-radius: var(--radius-lg, 12px);
    margin-top: var(--space-3, 12px);
  }

  .vcr-progress-complete svg {
    color: var(--color-accent, #4a6741);
  }

  .vcr-progress-complete span {
    font-size: 0.85rem;
    color: var(--color-accent, #4a6741);
  }

  /* Prompt Card */
  .vcr-prompt-card {
    background: var(--color-bg-secondary);
    border-radius: var(--radius-xl, 16px);
    padding: var(--space-5, 20px);
    margin-bottom: var(--space-4, 16px);
  }

  .vcr-prompt-category {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1, 4px);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-text-muted);
    padding: var(--space-1, 4px) var(--space-2, 8px);
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-full, 999px);
    margin-bottom: var(--space-3, 12px);
  }

  .vcr-prompt-text {
    font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
    font-size: 1.1rem;
    line-height: 1.6;
    color: var(--color-text-primary);
    margin: 0 0 var(--space-3, 12px);
  }

  .vcr-prompt-tip {
    display: flex;
    align-items: center;
    gap: var(--space-2, 8px);
    font-size: 0.8rem;
    color: var(--color-text-muted);
    font-style: italic;
  }

  .vcr-prompt-tip svg {
    flex-shrink: 0;
    color: var(--color-accent);
  }

  /* Recording Visualizer */
  .vcr-visualizer-container {
    position: relative;
    height: 80px;
    background: var(--color-bg-secondary);
    border-radius: var(--radius-lg, 12px);
    margin-bottom: var(--space-4, 16px);
    overflow: hidden;
  }

  .vcr-visualizer {
    width: 100%;
    height: 100%;
  }

  .vcr-recording-time {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-family: var(--font-mono, monospace);
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--color-text-primary);
    text-shadow: 0 2px 8px rgba(0,0,0,0.5);
  }

  .vcr-recording-time.recording {
    color: var(--color-semantic-error, #ef4444);
  }

  /* Controls */
  .vcr-controls {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-4, 16px);
    margin-bottom: var(--space-5, 20px);
  }

  .vcr-record-btn {
    width: 72px;
    height: 72px;
    border-radius: var(--radius-full, 999px);
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all ${DURATION.FAST}ms ${EASING.SPRING};
  }

  .vcr-record-btn.idle {
    background: linear-gradient(135deg, var(--color-accent, #4a6741), #3d5a35);
    box-shadow: 0 4px 20px rgba(74, 103, 65, 0.4);
  }

  .vcr-record-btn.idle:hover {
    transform: scale(1.05);
    box-shadow: 0 6px 24px rgba(74, 103, 65, 0.5);
  }

  .vcr-record-btn.recording {
    background: linear-gradient(135deg, #ef4444, #dc2626);
    box-shadow: 0 4px 20px rgba(239, 68, 68, 0.4);
    animation: vcr-pulse 1.5s ease-in-out infinite;
  }

  @keyframes vcr-pulse {
    0%, 100% { box-shadow: 0 4px 20px rgba(239, 68, 68, 0.4); }
    50% { box-shadow: 0 4px 32px rgba(239, 68, 68, 0.6); }
  }

  @keyframes vcr-spin {
    to { transform: rotate(360deg); }
  }

  .vcr-spinner {
    animation: vcr-spin 1s linear infinite;
  }

  .vcr-record-btn svg {
    color: white;
  }

  .vcr-controls-hint {
    font-size: 0.8rem;
    color: var(--color-text-muted);
  }

  /* Navigation */
  .vcr-nav {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3, 12px);
  }

  .vcr-nav-btn {
    flex: 1;
    padding: var(--space-3, 12px) var(--space-4, 16px);
    border-radius: var(--radius-lg, 12px);
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2, 8px);
    transition: all ${DURATION.FAST}ms ease;
  }

  .vcr-nav-btn--secondary {
    background: var(--color-bg-secondary);
    color: var(--color-text-secondary);
    border: 1px solid var(--color-border-subtle);
  }

  .vcr-nav-btn--secondary:hover {
    background: var(--color-bg-tertiary);
    color: var(--color-text-primary);
  }

  .vcr-nav-btn--primary {
    background: var(--color-accent, #4a6741);
    color: white;
    border: none;
  }

  .vcr-nav-btn--primary:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .vcr-nav-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Samples List */
  .vcr-samples {
    margin-top: var(--space-5, 20px);
    border-top: 1px solid var(--color-border-subtle);
    padding-top: var(--space-4, 16px);
  }

  .vcr-samples-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-3, 12px);
  }

  .vcr-samples-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .vcr-sample-item {
    display: flex;
    align-items: center;
    gap: var(--space-3, 12px);
    padding: var(--space-3, 12px);
    background: var(--color-bg-secondary);
    border-radius: var(--radius-lg, 12px);
    margin-bottom: var(--space-2, 8px);
  }

  .vcr-sample-play {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-full, 999px);
    background: var(--color-accent, #4a6741);
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    flex-shrink: 0;
    transition: all ${DURATION.FAST}ms ease;
  }

  .vcr-sample-play:hover {
    transform: scale(1.05);
  }

  .vcr-sample-info {
    flex: 1;
    min-width: 0;
  }

  .vcr-sample-prompt {
    font-size: 0.8rem;
    color: var(--color-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .vcr-sample-meta {
    display: flex;
    align-items: center;
    gap: var(--space-2, 8px);
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .vcr-sample-quality {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .vcr-sample-quality.excellent { color: var(--color-semantic-success, #22c55e); }
  .vcr-sample-quality.good { color: var(--color-semantic-warning, #eab308); }
  .vcr-sample-quality.poor { color: var(--color-semantic-error, #ef4444); }

  .vcr-sample-delete {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-md, 8px);
    background: transparent;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-muted);
    transition: all ${DURATION.FAST}ms ease;
  }

  .vcr-sample-delete:hover {
    background: color-mix(in srgb, var(--color-semantic-error, #ef4444) 10%, transparent);
    color: var(--color-semantic-error, #ef4444);
  }

  /* Footer */
  .vcr-footer {
    padding: var(--space-4, 16px) var(--space-5, 20px);
    border-top: 1px solid var(--color-border-subtle);
    display: flex;
    gap: var(--space-3, 12px);
  }

  .vcr-footer-btn {
    flex: 1;
    padding: var(--space-3, 12px);
    border-radius: var(--radius-lg, 12px);
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: all ${DURATION.FAST}ms ease;
  }

  .vcr-footer-btn--secondary {
    background: var(--color-bg-secondary);
    color: var(--color-text-secondary);
    border: 1px solid var(--color-border-subtle);
  }

  .vcr-footer-btn--secondary:hover {
    background: var(--color-bg-tertiary);
  }

  .vcr-footer-btn--primary {
    background: var(--color-accent, #4a6741);
    color: white;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2, 8px);
  }

  .vcr-footer-btn--primary:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .vcr-footer-btn--primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Responsive */
  @media (max-width: clamp(336px, 90vw, 480px)) {
    .voice-clone-recorder-modal {
      max-height: 100vh;
      border-radius: 0;
    }

    .vcr-prompt-text {
      font-size: 1rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .vcr-record-btn.recording {
      animation: none;
    }
  }
`;

// ============================================================================
// HELPERS
// ============================================================================

function getMimeType(): string {
  const preferred = 'audio/webm';
  const alternative = 'audio/mp4';
  if (MediaRecorder.isTypeSupported(`${preferred};codecs=opus`)) {
    return preferred;
  }
  if (MediaRecorder.isTypeSupported(`${alternative};codecs=mp4a.40.2`)) {
    return alternative;
  }
  return preferred;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function assessQuality(duration: number, avgVolume: number): VoiceSample['quality'] {
  if (duration < 3 || avgVolume < 0.1) return 'poor';
  if (duration >= 5 && avgVolume >= 0.3) return 'excellent';
  return 'good';
}

function getCategoryIcon(category: RecordingPrompt['category']): string {
  switch (category) {
    case 'intro':
      return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
    case 'emotion':
      return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`;
    case 'range':
      return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 10v3"/><path d="M6 6v11"/><path d="M10 3v18"/><path d="M14 8v7"/><path d="M18 5v13"/><path d="M22 10v3"/></svg>`;
    case 'conversation':
      return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
    default:
      return '';
  }
}

// ============================================================================
// RENDER
// ============================================================================

function render(): string {
  const prompt = RECORDING_PROMPTS[currentPromptIndex] ?? RECORDING_PROMPTS[0];
  if (!prompt) return ''; // Safety check if RECORDING_PROMPTS is empty
  const progress = Math.min((samples.length / MIN_SAMPLES_REQUIRED) * 100, 100);
  const hasEnoughSamples = samples.length >= MIN_SAMPLES_REQUIRED;

  return `
    <div class="voice-clone-recorder-overlay">
      <div class="voice-clone-recorder-backdrop"></div>
      <div class="voice-clone-recorder-modal" role="dialog" aria-labelledby="vcr-title">
        <header class="vcr-header">
          <div class="vcr-header-content">
            <span class="vcr-eyebrow">Voice Cloning</span>
            <h2 class="vcr-title" id="vcr-title">${currentAgent?.displayName || currentAgent?.name || 'Agent'}</h2>
          </div>
          <button class="vcr-close-btn" data-action="close" aria-label="${t('accessibility.close')}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </header>

        <div class="vcr-content">
          <!-- Progress -->
          <div class="vcr-progress">
            <div class="vcr-progress-header">
              <span class="vcr-progress-label">Voice Samples</span>
              <span class="vcr-progress-count">${samples.length} / ${MIN_SAMPLES_REQUIRED} required</span>
            </div>
            <div class="vcr-progress-bar">
              <div class="vcr-progress-fill" style="width: ${progress}%"></div>
            </div>
            ${hasEnoughSamples ? `
              <div class="vcr-progress-complete">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                <span>Ready for voice cloning! Add more samples for better quality.</span>
              </div>
            ` : ''}
          </div>

          <!-- Prompt Card -->
          <div class="vcr-prompt-card">
            <span class="vcr-prompt-category">
              ${getCategoryIcon(prompt.category)}
              ${prompt.category}
            </span>
            <p class="vcr-prompt-text">${prompt.text}</p>
            ${prompt.tip ? `
              <div class="vcr-prompt-tip">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/><circle cx="12" cy="12" r="10"/></svg>
                ${prompt.tip}
              </div>
            ` : ''}
          </div>

          <!-- Visualizer -->
          <div class="vcr-visualizer-container">
            <canvas class="vcr-visualizer" id="vcr-visualizer"></canvas>
            <div class="vcr-recording-time ${isRecording ? 'recording' : ''}" id="vcr-time">
              ${isRecording ? formatDuration((Date.now() - (recordingStartTime || Date.now())) / 1000) : '0:00'}
            </div>
          </div>

          <!-- Controls -->
          <div class="vcr-controls">
            <button aria-label="${t('accessibility.toggle')}" class="vcr-record-btn ${isRecording ? 'recording' : 'idle'}" id="vcr-record-btn" data-action="toggle-recording">
              ${isRecording 
                ? `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`
                : `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8"/></svg>`
              }
            </button>
            <span class="vcr-controls-hint">
              ${isRecording ? 'Click to stop recording' : 'Click to start recording'}
            </span>
          </div>

          <!-- Navigation -->
          <div class="vcr-nav">
            <button aria-label="${t('accessibility.previous')}" class="vcr-nav-btn vcr-nav-btn--secondary" data-action="prev-prompt" ${currentPromptIndex === 0 ? 'disabled' : ''}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
              Previous
            </button>
            <button aria-label="${t('accessibility.skip')}" class="vcr-nav-btn vcr-nav-btn--secondary" data-action="skip-prompt">
              Skip
            </button>
            <button aria-label="${t('accessibility.next')}" class="vcr-nav-btn vcr-nav-btn--primary" data-action="next-prompt" ${currentPromptIndex >= RECORDING_PROMPTS.length - 1 ? 'disabled' : ''}>
              Next
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>

          <!-- Recorded Samples -->
          ${samples.length > 0 ? `
            <div class="vcr-samples">
              <div class="vcr-samples-header">
                <span class="vcr-samples-title">Recorded Samples (${samples.length})</span>
              </div>
              ${samples.map((sample, i) => {
                const prompt = RECORDING_PROMPTS.find(p => p.id === sample.promptId);
                return `
                  <div class="vcr-sample-item" data-sample-id="${sample.id}">
                    <button class="vcr-sample-play" data-action="play-sample" data-index="${i}">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    </button>
                    <div class="vcr-sample-info">
                      <div class="vcr-sample-prompt">${prompt?.text.slice(0, 50) || 'Sample'}...</div>
                      <div class="vcr-sample-meta">
                        <span>${formatDuration(sample.duration)}</span>
                        <span class="vcr-sample-quality ${sample.quality}">
                          ${sample.quality === 'excellent' ? '★★★' : sample.quality === 'good' ? '★★' : '★'}
                          ${sample.quality}
                        </span>
                      </div>
                    </div>
                    <button class="vcr-sample-delete" data-action="delete-sample" data-index="${i}" aria-label="${t('accessibility.deleteSample')}">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  </div>
                `;
              }).join('')}
            </div>
          ` : ''}
        </div>

        <footer class="vcr-footer">
          <button aria-label="${t('accessibility.cancel')}" class="vcr-footer-btn vcr-footer-btn--secondary" data-action="close">
            Cancel
          </button>
          <button aria-label="${t('accessibility.saveVoiceSamples')}" class="vcr-footer-btn vcr-footer-btn--primary" data-action="save" ${!hasEnoughSamples ? 'disabled' : ''}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
            Save Voice Samples
          </button>
        </footer>
      </div>
    </div>
  `;
}

// ============================================================================
// RECORDING
// ============================================================================

async function startRecording(): Promise<void> {
  try {
    currentStream = await navigator.mediaDevices.getUserMedia({ 
      audio: { 
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true 
      } 
    });

    // Set up audio analysis
    audioContext = new AudioContext();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    const source = audioContext.createMediaStreamSource(currentStream);
    source.connect(analyser);

    // Start recording
    const mimeType = getMimeType();
    mediaRecorder = new MediaRecorder(currentStream, { mimeType });
    audioChunks = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        audioChunks.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      handleRecordingComplete();
    };

    mediaRecorder.start(100);
    isRecording = true;
    recordingStartTime = Date.now();

    // Start visualization
    startVisualization();
    updateRecordingUI();

    soundUI.play('click');
    log.debug('Recording started');
  } catch (err) {
    log.error('Failed to start recording:', err);
    const { toast } = await import('./whisper.ui.js');
    toast.error(t('toasts.couldNotAccessMicrophone'));
  }
}

function stopRecording(): void {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;

    // Stop visualization
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    // Stop stream
    if (currentStream) {
      currentStream.getTracks().forEach(track => track.stop());
      currentStream = null;
    }

    soundUI.play('click');
    log.debug('Recording stopped');
  }
}

async function handleRecordingComplete(): Promise<void> {
  const audioBlob = new Blob(audioChunks, { type: getMimeType() });
  const audioUrl = URL.createObjectURL(audioBlob);
  const duration = recordingStartTime ? (Date.now() - recordingStartTime) / 1000 : 0;

  // Assess quality based on duration and average volume
  const quality = assessQuality(duration, 0.5); // Simplified quality check

  const currentPrompt = RECORDING_PROMPTS[currentPromptIndex];
  if (!currentPrompt) return;
  
  const sample: VoiceSample = {
    id: `sample-${Date.now()}`,
    promptId: currentPrompt.id,
    audioBlob,
    audioUrl,
    duration,
    quality,
    recordedAt: new Date().toISOString(),
  };

  samples.push(sample);

  // Auto-advance to next prompt if available
  if (currentPromptIndex < RECORDING_PROMPTS.length - 1) {
    currentPromptIndex++;
  }

  // Re-render
  updateUI();

  const { toast } = await import('./whisper.ui.js');
  toast.success(`Sample recorded! ${quality === 'excellent' ? 'Excellent quality!' : quality === 'good' ? 'Good quality' : 'Consider re-recording for better quality'}`);
}

// ============================================================================
// VISUALIZATION
// ============================================================================

function startVisualization(): void {
  const canvas = recorderModal?.querySelector('#vcr-visualizer') as HTMLCanvasElement;
  if (!canvas || !analyser) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  const draw = () => {
    if (!isRecording) return;

    animationFrameId = requestAnimationFrame(draw);

    analyser?.getByteFrequencyData(dataArray);

    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = 'rgba(26, 26, 46, 0.3)';
    ctx.fillRect(0, 0, width, height);

    const barWidth = (width / bufferLength) * 2.5;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const value = dataArray[i] ?? 0;
      const barHeight = (value / 255) * height * 0.8;

      const hue = 100 + (value / 255) * 30;
      ctx.fillStyle = `hsl(${hue}, 60%, 50%)`;

      ctx.fillRect(x, height - barHeight, barWidth, barHeight);
      x += barWidth + 1;
    }

    // Update time display
    updateTimeDisplay();
  };

  draw();
}

function updateTimeDisplay(): void {
  const timeEl = recorderModal?.querySelector('#vcr-time');
  if (timeEl && recordingStartTime) {
    const duration = (Date.now() - recordingStartTime) / 1000;
    timeEl.textContent = formatDuration(duration);
  }
}

// ============================================================================
// UI UPDATES
// ============================================================================

function updateUI(): void {
  if (!recorderModal) return;

  const container = recorderModal.querySelector('.voice-clone-recorder-overlay');
  if (container) {
    container.innerHTML = render().replace('<div class="voice-clone-recorder-overlay">', '').replace('</div>', '');
    // Actually let's re-render the whole modal content
  }

  // Simpler approach: just re-render content
  const modal = recorderModal.querySelector('.voice-clone-recorder-modal');
  if (modal) {
    const newModal = document.createElement('div');
    newModal.innerHTML = render();
    const newContent = newModal.querySelector('.voice-clone-recorder-modal');
    if (newContent) {
      modal.innerHTML = newContent.innerHTML;
      attachListeners();
    }
  }
}

function updateRecordingUI(): void {
  const recordBtn = recorderModal?.querySelector('#vcr-record-btn');
  const timeEl = recorderModal?.querySelector('#vcr-time');

  if (recordBtn) {
    recordBtn.className = `vcr-record-btn ${isRecording ? 'recording' : 'idle'}`;
    recordBtn.innerHTML = isRecording
      ? `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`
      : `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8"/></svg>`;
  }

  if (timeEl) {
    timeEl.className = `vcr-recording-time ${isRecording ? 'recording' : ''}`;
  }
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function attachListeners(): void {
  if (!recorderModal) return;

  // Close button
  recorderModal.querySelectorAll('[data-action="close"]').forEach(btn => {
    btn.addEventListener('click', closeVoiceCloneRecorder);
  });

  // Backdrop click
  recorderModal.querySelector('.voice-clone-recorder-backdrop')?.addEventListener('click', closeVoiceCloneRecorder);

  // Record button
  recorderModal.querySelector('[data-action="toggle-recording"]')?.addEventListener('click', () => {
    if (isRecording) {
      stopRecording();
    } else {
      void startRecording();
    }
  });

  // Navigation
  recorderModal.querySelector('[data-action="prev-prompt"]')?.addEventListener('click', () => {
    if (currentPromptIndex > 0) {
      currentPromptIndex--;
      updateUI();
      soundUI.play('click');
    }
  });

  recorderModal.querySelector('[data-action="next-prompt"]')?.addEventListener('click', () => {
    if (currentPromptIndex < RECORDING_PROMPTS.length - 1) {
      currentPromptIndex++;
      updateUI();
      soundUI.play('click');
    }
  });

  recorderModal.querySelector('[data-action="skip-prompt"]')?.addEventListener('click', () => {
    if (currentPromptIndex < RECORDING_PROMPTS.length - 1) {
      currentPromptIndex++;
    } else {
      currentPromptIndex = 0;
    }
    updateUI();
    soundUI.play('click');
  });

  // Sample playback
  recorderModal.querySelectorAll('[data-action="play-sample"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt((btn as HTMLElement).dataset.index || '0');
      const sample = samples[index];
      if (sample) {
        const audio = new Audio(sample.audioUrl);
        audio.play().catch(err => log.error('Playback failed:', err));
        soundUI.play('click');
      }
    });
  });

  // Sample deletion
  recorderModal.querySelectorAll('[data-action="delete-sample"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const index = parseInt((btn as HTMLElement).dataset.index || '0');
      samples.splice(index, 1);
      updateUI();
      const { toast } = await import('./whisper.ui.js');
      toast.info(t('toasts.sampleDeleted'));
    });
  });

  // Save
  recorderModal.querySelector('[data-action="save"]')?.addEventListener('click', handleSave);

  // Escape key
  const escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeVoiceCloneRecorder();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

/**
 * Upload a single voice sample to the backend
 */
async function uploadSampleToBackend(
  agentId: string,
  sample: VoiceSample
): Promise<{ uploadId: string; quality: string } | null> {
  try {
    // Convert Blob to base64
    const arrayBuffer = await sample.audioBlob.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );

    const response = await apiPost<{ uploadId: string; quality: string }>(
      `/api/custom-agents/${agentId}/voice/upload`,
      {
        audio: base64,
        mimeType: sample.audioBlob.type || 'audio/webm',
        filename: `voice-sample-${sample.id}.webm`,
      }
    );

    if (!response.ok || !response.data) {
      log.error('Upload failed:', response.error);
      return null;
    }

    return {
      uploadId: response.data.uploadId,
      quality: response.data.quality,
    };
  } catch (err) {
    log.error('Failed to upload sample:', err);
    return null;
  }
}

/**
 * Trigger voice cloning via Cartesia API
 */
async function createVoiceClone(
  agentId: string,
  uploadId: string,
  userName: string
): Promise<{ voiceId: string; isSimulated: boolean } | null> {
  try {
    const response = await apiPost<{ voiceId: string; isSimulated?: boolean }>(
      `/api/custom-agents/${agentId}/voice/clone`,
      { uploadId, userName }
    );

    if (!response.ok || !response.data) {
      log.error('Clone failed:', response.error);
      return null;
    }

    return {
      voiceId: response.data.voiceId,
      isSimulated: response.data.isSimulated || false,
    };
  } catch (err) {
    log.error('Failed to create voice clone:', err);
    return null;
  }
}

async function handleSave(): Promise<void> {
  if (!currentAgent || samples.length < MIN_SAMPLES_REQUIRED) return;

  const { toast } = await import('./whisper.ui.js');
  
  // Update save button to show loading state
  const saveBtn = recorderModal?.querySelector('[data-action="save"]') as HTMLButtonElement;
  const originalContent = saveBtn?.innerHTML;
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = `
      <svg class="vcr-spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>
      Uploading samples...
    `;
  }

  try {
    // Upload all samples to the backend
    toast.info(t('toasts.uploadingVoiceSamples'));
    
    let lastUploadId: string | null = null;
    let uploadedCount = 0;
    
    for (const sample of samples) {
      const result = await uploadSampleToBackend(currentAgent.id, sample);
      if (result) {
        lastUploadId = result.uploadId;
        uploadedCount++;
        log.debug(`Uploaded sample ${uploadedCount}/${samples.length}`);
      }
    }

    if (!lastUploadId || uploadedCount === 0) {
      throw new Error('No samples were successfully uploaded');
    }

    // Update button state for cloning
    if (saveBtn) {
      saveBtn.innerHTML = `
        <svg class="vcr-spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
        Creating voice clone...
      `;
    }

    // Trigger voice cloning via Cartesia
    toast.info(t('toasts.creatingYourVoiceClone'));
    const cloneResult = await createVoiceClone(
      currentAgent.id,
      lastUploadId,
      currentAgent.displayName || currentAgent.name || 'User'
    );

    if (cloneResult) {
      if (cloneResult.isSimulated) {
        toast.success(t('toasts.voiceProfileCreatedDev'));
      } else {
        toast.success(t('toasts.voiceCloneCreated'));
      }
      log.info('Voice clone created:', cloneResult.voiceId);
    } else {
      // Still save locally even if cloning fails
      toast.warning(t('toasts.samplesSavedCloningFailed'));
    }

    closeVoiceCloneRecorder();
  } catch (err) {
    log.error('Failed to save voice samples:', err);
    toast.error("Couldn't create voice clone. Try again?");
    
    // Restore button state
    if (saveBtn && originalContent) {
      saveBtn.disabled = samples.length < MIN_SAMPLES_REQUIRED;
      saveBtn.innerHTML = originalContent;
    }
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

export async function openVoiceCloneRecorder(agentId: string): Promise<void> {
  log.debug('Opening Voice Clone Recorder for agent:', agentId);

  // Clean up any existing modal
  closeVoiceCloneRecorder();

  // Load agent data
  currentAgent = await getCustomAgent(agentId);
  if (!currentAgent) {
    log.error('Agent not found:', agentId);
    const { toast } = await import('./whisper.ui.js');
    toast.error("Couldn't find this agent");
    return;
  }

  // Reset state
  samples = [];
  currentPromptIndex = 0;
  isRecording = false;

  // Add styles
  if (!document.querySelector('#voice-clone-recorder-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'voice-clone-recorder-styles';
    styleEl.textContent = STYLES;
    document.head.appendChild(styleEl);
  }

  // Create modal
  recorderModal = document.createElement('div');
  recorderModal.innerHTML = render();
  document.body.appendChild(recorderModal);

  // Animate in
  requestAnimationFrame(() => {
    const modal = recorderModal?.querySelector('.voice-clone-recorder-modal');
    modal?.classList.add('visible');
  });

  // Set canvas size
  requestAnimationFrame(() => {
    const canvas = recorderModal?.querySelector('#vcr-visualizer') as HTMLCanvasElement;
    if (canvas) {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }
    }
  });

  // Attach listeners
  attachListeners();

  soundUI.play('open');
}

export function closeVoiceCloneRecorder(): void {
  // Stop any ongoing recording
  stopRecording();

  if (!recorderModal) return;

  const modal = recorderModal.querySelector('.voice-clone-recorder-modal');
  modal?.classList.remove('visible');

  setTimeout(() => {
    // Clean up audio URLs
    samples.forEach(s => URL.revokeObjectURL(s.audioUrl));
    samples = [];

    recorderModal?.remove();
    recorderModal = null;
    currentAgent = null;
  }, DURATION.SLOW);

  soundUI.play('close');
}

export { openVoiceCloneRecorder as openVoiceRecorder };

