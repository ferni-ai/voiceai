/**
 * Practice Experience UI - Self-directed guided practices with optional chat
 *
 * Philosophy: Empower users to engage with practices whether or not they're
 * connected to voice. When voice is available, seamlessly hand off. When not,
 * provide an immersive, guided journey with Ferni's wisdom via chat.
 *
 * "Better than human" - We're always here, always present, always ready to guide.
 */

import { t } from '../i18n/index.js';
import { tp } from '../i18n/plural.js';
import { createLogger } from '../utils/logger.js';
import { connectionService } from '../services/connection.service.js';
import { soundUI } from './sound.ui.js';
import { apiPost } from '../utils/api.js';

const log = createLogger('PracticeExperience');

// ============================================================================
// TYPES
// ============================================================================

export interface Practice {
  id: string;
  name: string;
  description: string;
  category: string;
  prompt?: string;
  icon?: string;
}

interface PracticeStep {
  id: string;
  type: 'intro' | 'prompt' | 'reflection' | 'chat' | 'breathing' | 'gratitude' | 'completion';
  titleKey: string;
  contentKey: string;
  placeholderKey?: string;
  duration?: number; // in seconds for timed steps
  ferniMessageKey?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'ferni';
  content: string;
  timestamp: Date;
}

interface PracticeState {
  isOpen: boolean;
  currentPractice: Practice | null;
  currentStepIndex: number;
  steps: PracticeStep[];
  userResponses: Map<string, string>;
  chatMessages: ChatMessage[];
  isThinking: boolean;
  isBreathing: boolean;
  breathPhase: 'inhale' | 'hold' | 'exhale' | 'rest';
}

// ============================================================================
// PRACTICE DEFINITIONS
// ============================================================================

const PRACTICE_STEPS: Record<string, PracticeStep[]> = {
  'daily-check-in': [
    {
      id: 'intro',
      type: 'intro', titleKey: 'practiceExperience.dailyCheckin.title', contentKey: 'practiceExperience.dailyCheckin.intro.content', ferniMessageKey: 'practiceExperience.dailyCheckin.intro.ferniMessage',
    },
    {
      id: 'body-scan',
      type: 'prompt', titleKey: 'practiceExperience.dailyCheckin.bodyAwareness.title', contentKey: 'practiceExperience.dailyCheckin.bodyAwareness.content', placeholderKey: 'practiceExperience.dailyCheckin.bodyAwareness.placeholder', ferniMessageKey: 'practiceExperience.dailyCheckin.bodyAwareness.ferniMessage',
    },
    {
      id: 'emotional-check',
      type: 'reflection', titleKey: 'practiceExperience.dailyCheckin.emotionalLandscape.title', contentKey: 'practiceExperience.dailyCheckin.emotionalLandscape.content', placeholderKey: 'practiceExperience.dailyCheckin.emotionalLandscape.placeholder', ferniMessageKey: 'practiceExperience.dailyCheckin.emotionalLandscape.ferniMessage',
    },
    {
      id: 'intention',
      type: 'chat', titleKey: 'practiceExperience.dailyCheckin.settingIntention.title', contentKey: 'practiceExperience.dailyCheckin.settingIntention.content', ferniMessageKey: 'practiceExperience.dailyCheckin.settingIntention.ferniMessage',
    },
    {
      id: 'complete',
      type: 'completion', titleKey: 'practiceExperience.dailyCheckin.complete.title', contentKey: 'practiceExperience.dailyCheckin.complete.content', ferniMessageKey: 'practiceExperience.dailyCheckin.complete.ferniMessage',
    },
  ],

  'gratitude-practice': [
    {
      id: 'intro',
      type: 'intro', titleKey: 'practiceExperience.gratitudePractice.title', contentKey: 'practiceExperience.gratitudePractice.intro.content', ferniMessageKey: 'practiceExperience.gratitudePractice.intro.ferniMessage',
    },
    {
      id: 'breath',
      type: 'breathing', titleKey: 'practiceExperience.gratitudePractice.centeringBreath.title', contentKey: 'practiceExperience.gratitudePractice.centeringBreath.content', duration: 30, ferniMessageKey: 'practiceExperience.gratitudePractice.centeringBreath.ferniMessage',
    },
    {
      id: 'gratitude-1',
      type: 'gratitude', titleKey: 'practiceExperience.gratitudePractice.somethingSmall.title', contentKey: 'practiceExperience.gratitudePractice.somethingSmall.content', placeholderKey: 'practiceExperience.gratitudePractice.somethingSmall.placeholder', ferniMessageKey: 'practiceExperience.gratitudePractice.somethingSmall.ferniMessage',
    },
    {
      id: 'gratitude-2',
      type: 'gratitude', titleKey: 'practiceExperience.gratitudePractice.someoneYouAppreciate.title', contentKey: 'practiceExperience.gratitudePractice.someoneYouAppreciate.content', placeholderKey: 'practiceExperience.gratitudePractice.someoneYouAppreciate.placeholder', ferniMessageKey: 'practiceExperience.gratitudePractice.someoneYouAppreciate.ferniMessage',
    },
    {
      id: 'gratitude-3',
      type: 'gratitude', titleKey: 'practiceExperience.gratitudePractice.yourOwnResilience.title', contentKey: 'practiceExperience.gratitudePractice.yourOwnResilience.content', placeholderKey: 'practiceExperience.gratitudePractice.yourOwnResilience.placeholder', ferniMessageKey: 'practiceExperience.gratitudePractice.yourOwnResilience.ferniMessage',
    },
    {
      id: 'complete',
      type: 'completion', titleKey: 'practiceExperience.gratitudePractice.complete.title', contentKey: 'practiceExperience.gratitudePractice.complete.content', ferniMessageKey: 'practiceExperience.gratitudePractice.complete.ferniMessage',
    },
  ],

  'wind-down': [
    {
      id: 'intro',
      type: 'intro', titleKey: 'practiceExperience.windDown.title', contentKey: 'practiceExperience.windDown.intro.content', ferniMessageKey: 'practiceExperience.windDown.intro.ferniMessage',
    },
    {
      id: 'breath',
      type: 'breathing', titleKey: 'practiceExperience.windDown.calmingBreath.title', contentKey: 'practiceExperience.windDown.calmingBreath.content', duration: 45, ferniMessageKey: 'practiceExperience.windDown.calmingBreath.ferniMessage',
    },
    {
      id: 'release',
      type: 'reflection', titleKey: 'practiceExperience.windDown.lettingGo.title', contentKey: 'practiceExperience.windDown.lettingGo.content', placeholderKey: 'practiceExperience.windDown.lettingGo.placeholder', ferniMessageKey: 'practiceExperience.windDown.lettingGo.ferniMessage',
    },
    {
      id: 'celebrate',
      type: 'prompt', titleKey: 'practiceExperience.windDown.oneGoodThing.title', contentKey: 'practiceExperience.windDown.oneGoodThing.content', placeholderKey: 'practiceExperience.windDown.oneGoodThing.placeholder', ferniMessageKey: 'practiceExperience.windDown.oneGoodThing.ferniMessage',
    },
    {
      id: 'chat',
      type: 'chat', titleKey: 'practiceExperience.windDown.anythingOnYourMind.title', contentKey: 'practiceExperience.windDown.anythingOnYourMind.content', ferniMessageKey: 'practiceExperience.windDown.anythingOnYourMind.ferniMessage',
    },
    {
      id: 'complete',
      type: 'completion', titleKey: 'practiceExperience.windDown.complete.title', contentKey: 'practiceExperience.windDown.complete.content', ferniMessageKey: 'practiceExperience.windDown.complete.ferniMessage',
    },
  ],

  'weekly-review': [
    {
      id: 'intro',
      type: 'intro', titleKey: 'practiceExperience.weeklyReview.title', contentKey: 'practiceExperience.weeklyReview.intro.content', ferniMessageKey: 'practiceExperience.weeklyReview.intro.ferniMessage',
    },
    {
      id: 'highlights',
      type: 'reflection', titleKey: 'practiceExperience.weeklyReview.weekHighlights.title', contentKey: 'practiceExperience.weeklyReview.weekHighlights.content', placeholderKey: 'practiceExperience.weeklyReview.weekHighlights.placeholder', ferniMessageKey: 'practiceExperience.weeklyReview.weekHighlights.ferniMessage',
    },
    {
      id: 'challenges',
      type: 'reflection', titleKey: 'practiceExperience.weeklyReview.challengesFaced.title', contentKey: 'practiceExperience.weeklyReview.challengesFaced.content', placeholderKey: 'practiceExperience.weeklyReview.challengesFaced.placeholder', ferniMessageKey: 'practiceExperience.weeklyReview.challengesFaced.ferniMessage',
    },
    {
      id: 'lessons',
      type: 'chat', titleKey: 'practiceExperience.weeklyReview.whatYouLearned.title', contentKey: 'practiceExperience.weeklyReview.whatYouLearned.content', ferniMessageKey: 'practiceExperience.weeklyReview.whatYouLearned.ferniMessage',
    },
    {
      id: 'next-week',
      type: 'prompt', titleKey: 'practiceExperience.weeklyReview.lookingAhead.title', contentKey: 'practiceExperience.weeklyReview.lookingAhead.content', placeholderKey: 'practiceExperience.weeklyReview.lookingAhead.placeholder', ferniMessageKey: 'practiceExperience.weeklyReview.lookingAhead.ferniMessage',
    },
    {
      id: 'complete',
      type: 'completion', titleKey: 'practiceExperience.weeklyReview.complete.title', contentKey: 'practiceExperience.weeklyReview.complete.content', ferniMessageKey: 'practiceExperience.weeklyReview.complete.ferniMessage',
    },
  ],

  'brainstorm-session': [
    {
      id: 'intro',
      type: 'intro', titleKey: 'practiceExperience.brainstormSession.title', contentKey: 'practiceExperience.brainstormSession.intro.content', ferniMessageKey: 'practiceExperience.brainstormSession.intro.ferniMessage',
    },
    {
      id: 'define',
      type: 'prompt', titleKey: 'practiceExperience.brainstormSession.defineTheChallenge.title', contentKey: 'practiceExperience.brainstormSession.defineTheChallenge.content', placeholderKey: 'practiceExperience.brainstormSession.defineTheChallenge.placeholder', ferniMessageKey: 'practiceExperience.brainstormSession.defineTheChallenge.ferniMessage',
    },
    {
      id: 'explore',
      type: 'chat', titleKey: 'practiceExperience.brainstormSession.exploringTogether.title', contentKey: 'practiceExperience.brainstormSession.exploringTogether.content', ferniMessageKey: 'practiceExperience.brainstormSession.exploringTogether.ferniMessage',
    },
    {
      id: 'options',
      type: 'reflection', titleKey: 'practiceExperience.brainstormSession.possiblePaths.title', contentKey: 'practiceExperience.brainstormSession.possiblePaths.content', placeholderKey: 'practiceExperience.brainstormSession.possiblePaths.placeholder', ferniMessageKey: 'practiceExperience.brainstormSession.possiblePaths.ferniMessage',
    },
    {
      id: 'next-step',
      type: 'prompt', titleKey: 'practiceExperience.brainstormSession.theNextStep.title', contentKey: 'practiceExperience.brainstormSession.theNextStep.content', placeholderKey: 'practiceExperience.brainstormSession.theNextStep.placeholder', ferniMessageKey: 'practiceExperience.brainstormSession.theNextStep.ferniMessage',
    },
    {
      id: 'complete',
      type: 'completion', titleKey: 'practiceExperience.brainstormSession.complete.title', contentKey: 'practiceExperience.brainstormSession.complete.content', ferniMessageKey: 'practiceExperience.brainstormSession.complete.ferniMessage',
    },
  ],
};

// Default steps for unknown practices
const DEFAULT_STEPS: PracticeStep[] = [
  {
    id: 'intro',
    type: 'intro', titleKey: 'practiceExperience.default.title', contentKey: 'practiceExperience.default.intro.content', ferniMessageKey: 'practiceExperience.default.intro.ferniMessage',
  },
  {
    id: 'chat',
    type: 'chat', titleKey: 'practiceExperience.default.chat.title', contentKey: 'practiceExperience.default.chat.content', ferniMessageKey: 'practiceExperience.default.chat.ferniMessage',
  },
  {
    id: 'complete',
    type: 'completion', titleKey: 'practiceExperience.default.complete.title', contentKey: 'practiceExperience.default.complete.content', ferniMessageKey: 'practiceExperience.default.complete.ferniMessage',
  },
];

// ============================================================================
// STATE
// ============================================================================

const state: PracticeState = {
  isOpen: false,
  currentPractice: null,
  currentStepIndex: 0,
  steps: [],
  userResponses: new Map(),
  chatMessages: [],
  isThinking: false,
  isBreathing: false,
  breathPhase: 'rest',
};

let container: HTMLElement | null = null;
let breathingInterval: number | null = null;

// ============================================================================
// ICONS (Lucide-style SVGs)
// ============================================================================

const ICONS = {
  close: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
  send: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>`,
  arrowRight: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`,
  arrowLeft: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>`,
  check: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20,6 9,17 4,12"/></svg>`,
  sparkles: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg>`,
  voice: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>`,
};

// ============================================================================
// STYLES
// ============================================================================

const styles = `
  .practice-experience-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-system, 10000);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.4s ease, visibility 0.4s ease;
  }

  .practice-experience-overlay.open {
    opacity: 1;
    visibility: visible;
  }

  .practice-experience-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(44, 37, 32, 0.6);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
  }

  .practice-experience-container {
    position: relative;
    width: 100%;
    max-width: 600px;
    max-height: 90vh;
    margin: var(--space-4);
    background: var(--color-background-elevated, #fffdfb);
    border-radius: var(--radius-2xl, 24px);
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    overflow: hidden;
    transform: scale(0.95) translateY(20px);
    transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    display: flex;
    flex-direction: column;
  }

  .practice-experience-overlay.open .practice-experience-container {
    transform: scale(1) translateY(0);
  }

  /* Header */
  .practice-experience-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-6);
    border-bottom: 1px solid var(--color-border-subtle, rgba(0,0,0,0.06));
  }

  .practice-experience-header h2 {
    font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--color-text-primary, #2c2520);
    margin: 0;
  }

  .practice-close-btn {
    width: 40px;
    height: 40px;
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: var(--radius-full, 9999px);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-muted, #9a8c7f);
    transition: all 0.2s ease;
  }

  .practice-close-btn:hover {
    background: var(--color-background-subtle, rgba(0,0,0,0.04));
    color: var(--color-text-primary, #2c2520);
  }

  /* Progress bar */
  .practice-progress {
    height: 4px;
    background: var(--color-background-subtle, rgba(0,0,0,0.04));
  }

  .practice-progress-bar {
    height: 100%;
    background: var(--color-accent, #3d5a45);
    transition: width 0.4s ease;
  }

  /* Content */
  .practice-experience-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-8) var(--space-6);
    display: flex;
    flex-direction: column;
    min-height: 400px;
  }

  /* Step container */
  .practice-step {
    flex: 1;
    display: flex;
    flex-direction: column;
    animation: fadeInUp 0.4s ease;
  }

  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Step title */
  .practice-step-title {
    font-family: var(--font-narrative, 'EB Garamond', Georgia, serif);
    font-size: 1.75rem;
    font-weight: 500;
    color: var(--color-text-primary, #2c2520);
    margin: 0 0 var(--space-3) 0;
    text-align: center;
  }

  /* Step content */
  .practice-step-content {
    font-family: var(--font-body, Inter, sans-serif);
    font-size: 1.1rem;
    line-height: 1.6;
    color: var(--color-text-secondary, #5a4a42);
    text-align: center;
    margin-bottom: var(--space-6);
  }

  /* Ferni message bubble */
  .ferni-message {
    background: linear-gradient(135deg, 
      var(--color-accent, #3d5a45) 0%, 
      var(--persona-ferni, #4a6741) 100%
    );
    color: white;
    padding: var(--space-4) var(--space-5);
    border-radius: var(--radius-xl, 16px);
    border-bottom-left-radius: var(--radius-sm, 4px);
    font-family: var(--font-body, Inter, sans-serif);
    font-size: 0.95rem;
    font-style: italic;
    line-height: 1.5;
    margin-bottom: var(--space-6);
    max-width: 85%;
    align-self: flex-start;
    box-shadow: 0 4px 12px rgba(74, 103, 65, 0.3);
  }

  /* Text input area */
  .practice-textarea {
    width: 100%;
    min-height: 120px;
    padding: var(--space-4);
    border: 2px solid var(--color-border-subtle, rgba(0,0,0,0.08));
    border-radius: var(--radius-lg, 12px);
    font-family: var(--font-body, Inter, sans-serif);
    font-size: 1rem;
    line-height: 1.6;
    color: var(--color-text-primary, #2c2520);
    background: var(--color-background-elevated, #fffdfb);
    resize: none;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .practice-textarea:focus {
    outline: none;
    border-color: var(--color-accent, #3d5a45);
    box-shadow: 0 0 0 4px rgba(61, 90, 69, 0.1);
  }

  .practice-textarea::placeholder {
    color: var(--color-text-muted, #9a8c7f);
  }

  /* Chat container */
  .practice-chat {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 300px;
  }

  .practice-chat-messages {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
    padding-right: var(--space-2);
  }

  .practice-chat-message {
    max-width: 85%;
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-lg, 12px);
    font-family: var(--font-body, Inter, sans-serif);
    font-size: 0.95rem;
    line-height: 1.5;
    animation: fadeIn 0.3s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .practice-chat-message.ferni {
    align-self: flex-start;
    background: linear-gradient(135deg, 
      var(--color-accent, #3d5a45) 0%, 
      var(--persona-ferni, #4a6741) 100%
    );
    color: white;
    border-bottom-left-radius: var(--radius-sm, 4px);
  }

  .practice-chat-message.user {
    align-self: flex-end;
    background: var(--color-background-subtle, rgba(0,0,0,0.04));
    color: var(--color-text-primary, #2c2520);
    border-bottom-right-radius: var(--radius-sm, 4px);
  }

  .practice-chat-message.thinking {
    background: var(--color-background-subtle, rgba(0,0,0,0.04));
    color: var(--color-text-muted, #9a8c7f);
  }

  .thinking-dots {
    display: flex;
    gap: 4px;
    padding: var(--space-2) 0;
  }

  .thinking-dots span {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: currentColor;
    animation: thinkingDot 1.4s infinite ease-in-out;
  }

  .thinking-dots span:nth-child(1) { animation-delay: 0s; }
  .thinking-dots span:nth-child(2) { animation-delay: 0.2s; }
  .thinking-dots span:nth-child(3) { animation-delay: 0.4s; }

  @keyframes thinkingDot {
    0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
    40% { transform: scale(1); opacity: 1; }
  }

  /* Chat input */
  .practice-chat-input-container {
    display: flex;
    gap: var(--space-2);
    align-items: flex-end;
  }

  .practice-chat-input {
    flex: 1;
    padding: var(--space-3) var(--space-4);
    border: 2px solid var(--color-border-subtle, rgba(0,0,0,0.08));
    border-radius: var(--radius-xl, 16px);
    font-family: var(--font-body, Inter, sans-serif);
    font-size: 1rem;
    color: var(--color-text-primary, #2c2520);
    background: var(--color-background-elevated, #fffdfb);
    resize: none;
    min-height: 48px;
    max-height: 120px;
    transition: border-color 0.2s ease;
  }

  .practice-chat-input:focus {
    outline: none;
    border-color: var(--color-accent, #3d5a45);
  }

  .practice-chat-send {
    width: 48px;
    height: 48px;
    border: none;
    background: var(--color-accent, #3d5a45);
    color: white;
    border-radius: var(--radius-full, 9999px);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    flex-shrink: 0;
  }

  .practice-chat-send:hover {
    background: var(--persona-ferni, #4a6741);
    transform: scale(1.05);
  }

  .practice-chat-send:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  /* Breathing exercise */
  .practice-breathing {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    padding: var(--space-8) 0;
  }

  .breathing-circle {
    width: 160px;
    height: 160px;
    border-radius: 50%;
    background: linear-gradient(135deg, 
      var(--color-accent, #3d5a45) 0%, 
      var(--persona-ferni, #4a6741) 100%
    );
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 4s ease-in-out;
    box-shadow: 0 0 60px rgba(74, 103, 65, 0.4);
  }

  .breathing-circle.inhale {
    transform: scale(1.3);
  }

  .breathing-circle.exhale {
    transform: scale(0.9);
  }

  .breathing-circle.hold {
    transform: scale(1.3);
  }

  .breathing-instruction {
    font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
    font-size: 1.25rem;
    font-weight: 500;
    color: white;
    text-transform: capitalize;
  }

  .breathing-timer {
    margin-top: var(--space-6);
    font-family: var(--font-body, Inter, sans-serif);
    font-size: 0.9rem;
    color: var(--color-text-muted, #9a8c7f);
  }

  /* Completion */
  .practice-completion {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    flex: 1;
    padding: var(--space-8) 0;
  }

  .completion-icon {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    background: linear-gradient(135deg, 
      var(--color-accent, #3d5a45) 0%, 
      var(--persona-ferni, #4a6741) 100%
    );
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    margin-bottom: var(--space-6);
    animation: completionPulse 2s ease infinite;
  }

  @keyframes completionPulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(74, 103, 65, 0.4); }
    50% { box-shadow: 0 0 0 20px rgba(74, 103, 65, 0); }
  }

  /* Navigation */
  .practice-navigation {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-4) var(--space-6);
    border-top: 1px solid var(--color-border-subtle, rgba(0,0,0,0.06));
    background: var(--color-background-elevated, #fffdfb);
  }

  .practice-nav-btn {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-5);
    border: none;
    border-radius: var(--radius-full, 9999px);
    font-family: var(--font-body, Inter, sans-serif);
    font-size: 0.95rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .practice-nav-btn.secondary {
    background: transparent;
    color: var(--color-text-muted, #9a8c7f);
  }

  .practice-nav-btn.secondary:hover {
    background: var(--color-background-subtle, rgba(0,0,0,0.04));
    color: var(--color-text-primary, #2c2520);
  }

  .practice-nav-btn.primary {
    background: var(--color-accent, #3d5a45);
    color: white;
  }

  .practice-nav-btn.primary:hover {
    background: var(--persona-ferni, #4a6741);
    transform: translateX(4px);
  }

  .practice-nav-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  /* Voice mode banner */
  .voice-mode-banner {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    background: linear-gradient(135deg, 
      var(--color-accent, #3d5a45) 0%, 
      var(--persona-ferni, #4a6741) 100%
    );
    color: white;
    font-family: var(--font-body, Inter, sans-serif);
    font-size: 0.9rem;
  }

  .voice-mode-banner button {
    background: rgba(255,255,255,0.2);
    border: none;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-full, 9999px);
    color: white;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    margin-left: var(--space-2);
    transition: background 0.2s ease;
  }

  .voice-mode-banner button:hover {
    background: rgba(255,255,255,0.3);
  }

  /* Skip to voice button */
  .skip-to-voice-btn {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    background: transparent;
    border: 1px solid var(--color-border-subtle, rgba(0,0,0,0.1));
    border-radius: var(--radius-full, 9999px);
    color: var(--color-text-muted, #9a8c7f);
    font-family: var(--font-body, Inter, sans-serif);
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.2s ease;
    margin-top: var(--space-4);
  }

  .skip-to-voice-btn:hover {
    border-color: var(--color-accent, #3d5a45);
    color: var(--color-accent, #3d5a45);
  }
`;

// ============================================================================
// INITIALIZATION
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('practice-experience-styles')) return;

  const styleEl = document.createElement('style');
  styleEl.id = 'practice-experience-styles';
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);
}

function createContainer(): HTMLElement {
  // Clean up existing
  document.querySelectorAll('.practice-experience-overlay').forEach((el) => el.remove());

  const overlay = document.createElement('div');
  overlay.className = 'practice-experience-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', t('practiceExperience.default.title'));

  overlay.innerHTML = `
    <div class="practice-experience-backdrop"></div>
    <div class="practice-experience-container">
      <header class="practice-experience-header">
        <h2 id="practice-title">${t('practiceExperience.practice')}</h2>
        <button class="practice-close-btn" aria-label="${t('common.close')}">
          ${ICONS.close}
        </button>
      </header>
      <div class="practice-progress">
        <div class="practice-progress-bar" style="width: 0%"></div>
      </div>
      <div class="practice-experience-content"></div>
      <nav class="practice-navigation"></nav>
    </div>
  `;

  document.body.appendChild(overlay);

  // Event listeners
  const backdrop = overlay.querySelector('.practice-experience-backdrop');
  const closeBtn = overlay.querySelector('.practice-close-btn');

  backdrop?.addEventListener('click', close);
  closeBtn?.addEventListener('click', close);

  // Escape key
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  return overlay;
}

// ============================================================================
// RENDERING
// ============================================================================

function render(): void {
  if (!container) return;

  const content = container.querySelector('.practice-experience-content');
  const nav = container.querySelector('.practice-navigation');
  const header = container.querySelector('.practice-experience-header h2') as HTMLElement;
  const progressBar = container.querySelector('.practice-progress-bar') as HTMLElement;

  if (!content || !nav || !header || !progressBar) return;

  const currentStep = state.steps[state.currentStepIndex];
  if (!currentStep) return;

  // Update header
  header.textContent = state.currentPractice?.name || t('practiceExperience.practice');

  // Update progress
  const progress = ((state.currentStepIndex + 1) / state.steps.length) * 100;
  progressBar.style.width = `${progress}%`;

  // Render step content
  content.innerHTML = renderStep(currentStep);

  // Render navigation
  nav.innerHTML = renderNavigation();

  // Set up step-specific event listeners
  setupStepListeners(currentStep);
}

function renderStep(step: PracticeStep): string {
  switch (step.type) {
    case 'intro':
      return renderIntroStep(step);
    case 'prompt':
    case 'reflection':
    case 'gratitude':
      return renderTextStep(step);
    case 'chat':
      return renderChatStep(step);
    case 'breathing':
      return renderBreathingStep(step);
    case 'completion':
      return renderCompletionStep(step);
    default:
      return renderTextStep(step);
  }
}

function renderIntroStep(step: PracticeStep): string {
  const isVoiceConnected = connectionService.getRoomState().isConnected;
  const title = t(step.titleKey);
  const content = t(step.contentKey);
  const ferniMessage = step.ferniMessageKey && t(step.ferniMessageKey);

  return `
    <div class="practice-step" data-step-id="${step.id}">
      <h3 class="practice-step-title">${title}</h3>
      <p class="practice-step-content">${content}</p>
      ${ferniMessage ? `<div class="ferni-message">${ferniMessage}</div>` : ''}

      ${
        isVoiceConnected
          ? `
        <button class="skip-to-voice-btn" id="continue-with-voice">
          ${ICONS.voice}
          ${t('practiceExperience.continueWithVoice')}
        </button>
      `
          : ''
      }
    </div>
  `;
}

function renderTextStep(step: PracticeStep): string {
  const savedValue = state.userResponses.get(step.id) || '';
  const title = t(step.titleKey);
  const content = t(step.contentKey);
  const ferniMessage = step.ferniMessageKey && t(step.ferniMessageKey);
  const placeholder = t(step.placeholderKey ?? 'practiceExperience.shareYourThoughts');

  return `
    <div class="practice-step" data-step-id="${step.id}">
      <h3 class="practice-step-title">${title}</h3>
      <p class="practice-step-content">${content}</p>
      ${ferniMessage ? `<div class="ferni-message">${ferniMessage}</div>` : ''}
      <textarea
        class="practice-textarea"
        id="step-input"
        placeholder="${placeholder}"
        rows="4"
      >${savedValue}</textarea>
    </div>
  `;
}

function renderChatStep(step: PracticeStep): string {
  const title = t(step.titleKey);
  const content = t(step.contentKey);

  return `
    <div class="practice-step" data-step-id="${step.id}">
      <h3 class="practice-step-title">${title}</h3>
      <p class="practice-step-content">${content}</p>

      <div class="practice-chat">
        <div class="practice-chat-messages" id="chat-messages">
          ${renderChatMessages(step)}
        </div>
        <div class="practice-chat-input-container">
          <textarea
            class="practice-chat-input"
            id="chat-input"
            placeholder="${t('practiceExperience.typeYourMessage')}"
            rows="1"
          ></textarea>
          <button class="practice-chat-send" id="chat-send" ${state.isThinking ? 'disabled' : ''}>
            ${ICONS.send}
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderChatMessages(step?: PracticeStep): string {
  // Add initial Ferni message if chat is empty
  const messages = [...state.chatMessages];
  const currentStep = step || state.steps[state.currentStepIndex];

  if (messages.length === 0 && currentStep) {
    const ferniMessage = currentStep.ferniMessageKey && t(currentStep.ferniMessageKey);
    if (ferniMessage) {
      messages.push({
        id: 'initial',
        role: 'ferni',
        content: ferniMessage,
        timestamp: new Date(),
      });
    }
  }

  let html = messages
    .map(
      (msg) => `
    <div class="practice-chat-message ${msg.role}">
      ${msg.content}
    </div>
  `
    )
    .join('');

  // Add thinking indicator
  if (state.isThinking) {
    html += `
      <div class="practice-chat-message thinking">
        <div class="thinking-dots">
          <span></span><span></span><span></span>
        </div>
      </div>
    `;
  }

  return html;
}

function renderBreathingStep(step: PracticeStep): string {
  const title = t(step.titleKey);
  const content = t(step.contentKey);

  return `
    <div class="practice-step" data-step-id="${step.id}">
      <h3 class="practice-step-title">${title}</h3>
      <p class="practice-step-content">${content}</p>

      <div class="practice-breathing">
        <div class="breathing-circle" id="breathing-circle">
          <span class="breathing-instruction" id="breathing-instruction">${t('practiceExperience.ready')}</span>
        </div>
        <div class="breathing-timer" id="breathing-timer">
          ${step.duration ? tp('practiceExperience.breathing.secondsLeft', step.duration) : ''}
        </div>
      </div>
    </div>
  `;
}

function renderCompletionStep(step: PracticeStep): string {
  const title = t(step.titleKey);
  const content = t(step.contentKey);
  const ferniMessage = step.ferniMessageKey && t(step.ferniMessageKey);

  return `
    <div class="practice-step" data-step-id="${step.id}">
      <div class="practice-completion">
        <div class="completion-icon">
          ${ICONS.sparkles}
        </div>
        <h3 class="practice-step-title">${title}</h3>
        <p class="practice-step-content">${content}</p>
        ${ferniMessage ? `<div class="ferni-message">${ferniMessage}</div>` : ''}
      </div>
    </div>
  `;
}

function renderNavigation(): string {
  const isFirstStep = state.currentStepIndex === 0;
  const isLastStep = state.currentStepIndex === state.steps.length - 1;
  const currentStep = state.steps[state.currentStepIndex];

  // Don't show back on completion
  const showBack = !isFirstStep && currentStep?.type !== 'completion';

  // Change label based on step type
  let nextLabel = t('common.continue');
  if (currentStep?.type === 'completion') {
    nextLabel = t('practiceExperience.close');
  } else if (isLastStep) {
    nextLabel = t('practiceExperience.finish');
  }

  return `
    ${
      showBack
        ? `
      <button class="practice-nav-btn secondary" id="nav-back">
        ${ICONS.arrowLeft}
        ${t('common.back')}
      </button>
    `
        : '<div></div>'
    }
    <button class="practice-nav-btn primary" id="nav-next">
      ${nextLabel}
      ${currentStep?.type !== 'completion' ? ICONS.arrowRight : ''}
    </button>
  `;
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function setupStepListeners(step: PracticeStep): void {
  // Navigation
  container?.querySelector('#nav-back')?.addEventListener('click', goBack);
  container?.querySelector('#nav-next')?.addEventListener('click', goNext);

  // Continue with voice
  container?.querySelector('#continue-with-voice')?.addEventListener('click', switchToVoice);

  // Text input auto-save
  const textInput = container?.querySelector('#step-input') as HTMLTextAreaElement;
  if (textInput) {
    textInput.addEventListener('input', () => {
      state.userResponses.set(step.id, textInput.value);
    });
    // Focus the input
    setTimeout(() => textInput.focus(), 100);
  }

  // Chat input
  const chatInput = container?.querySelector('#chat-input') as HTMLTextAreaElement;
  const chatSend = container?.querySelector('#chat-send');

  if (chatInput && chatSend) {
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void sendChatMessage();
      }
    });

    chatSend.addEventListener('click', () => void sendChatMessage());

    // Auto-resize
    chatInput.addEventListener('input', () => {
      chatInput.style.height = 'auto';
      chatInput.style.height = `${Math.min(chatInput.scrollHeight, 120)}px`;
    });

    // Focus
    setTimeout(() => chatInput.focus(), 100);
  }

  // Start breathing exercise
  if (step.type === 'breathing' && !state.isBreathing) {
    startBreathingExercise(step.duration || 30);
  }
}

function goBack(): void {
  if (state.currentStepIndex > 0) {
    state.currentStepIndex--;
    state.chatMessages = []; // Clear chat when going back
    stopBreathing();
    render();
    soundUI.play('click');
  }
}

function goNext(): void {
  const currentStep = state.steps[state.currentStepIndex];

  if (currentStep?.type === 'completion') {
    close();
    return;
  }

  if (state.currentStepIndex < state.steps.length - 1) {
    state.currentStepIndex++;
    state.chatMessages = []; // Clear chat for fresh conversation
    stopBreathing();
    render();
    soundUI.play('click');
  } else {
    // Reached the end
    close();
  }
}

function switchToVoice(): void {
  if (!state.currentPractice) return;

  const room = connectionService.getRoom();
  if (!room?.localParticipant) {
    log.warn('Cannot switch to voice - not connected');
    return;
  }

  // Send practice start request via data channel
  const message = JSON.stringify({
    type: 'practice_start_request',
    commandId: state.currentPractice.id,
    commandName: state.currentPractice.name,
    prompt: state.currentPractice.prompt || '',
    timestamp: Date.now(),
    userReflections: Object.fromEntries(state.userResponses),
  });

  try {
    void room.localParticipant.publishData(new TextEncoder().encode(message), {
      reliable: true,
    });
    log.info('Switched to voice mode', { practice: state.currentPractice.name });
    close();
    soundUI.play('connect');
  } catch (err) {
    log.error('Failed to switch to voice', err);
  }
}

// ============================================================================
// CHAT
// ============================================================================

async function sendChatMessage(): Promise<void> {
  if (state.isThinking) return;

  const chatInput = container?.querySelector('#chat-input') as HTMLTextAreaElement;
  const userMessage = chatInput?.value.trim();

  if (!userMessage) return;

  // Add user message
  state.chatMessages.push({
    id: `msg-${Date.now()}`,
    role: 'user',
    content: userMessage,
    timestamp: new Date(),
  });

  // Clear input
  chatInput.value = '';
  chatInput.style.height = 'auto';

  // Show thinking state
  state.isThinking = true;
  render();

  // Scroll to bottom
  scrollChatToBottom();

  try {
    // Call Ferni API for response
    const response = await generateFerniResponse(userMessage);

    state.chatMessages.push({
      id: `msg-${Date.now() + 1}`,
      role: 'ferni',
      content: response,
      timestamp: new Date(),
    });

    soundUI.play('click');
  } catch (error) {
    log.error('Failed to generate response:', error);
    state.chatMessages.push({
      id: `msg-${Date.now() + 1}`,
      role: 'ferni',
      content: t('practiceExperience.errorMessage'),
      timestamp: new Date(),
    });
  }

  state.isThinking = false;
  render();
  scrollChatToBottom();

  // Re-focus input
  const newInput = container?.querySelector('#chat-input') as HTMLTextAreaElement;
  newInput?.focus();
}

async function generateFerniResponse(userMessage: string): Promise<string> {
  const currentStep = state.steps[state.currentStepIndex];
  const practice = state.currentPractice;

  // Build context from previous responses
  const previousResponses = Array.from(state.userResponses.entries())
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');

  try {
    const result = await apiPost<{ response: string }>('/api/practice/chat', {
      userMessage,
      practiceId: practice?.id || 'general',
      practiceName: practice?.name || 'Practice',
      stepId: currentStep?.id || 'chat',
      stepTitle: currentStep ? t(currentStep.titleKey) : 'Chat',
      previousResponses,
      chatHistory: state.chatMessages.slice(-10).map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    if (result.ok && result.data?.response) {
      return result.data.response;
    }
  } catch (error) {
    log.warn('Practice chat API failed, using fallback:', error);
  }

  // Fallback responses based on practice type
  return getFallbackResponse(userMessage, practice?.id);
}

/** Fallback reply pool per practice: [i18n pool name, number of variants]. */
const FALLBACK_POOLS: Record<string, [string, number]> = {
  'daily-check-in': ['dailyCheckIn', 4],
  'gratitude-practice': ['gratitude', 3],
  'wind-down': ['windDown', 3],
  'weekly-review': ['weeklyReview', 3],
  'brainstorm-session': ['brainstorm', 3],
};

function getFallbackResponse(userMessage: string, practiceId?: string): string {
  // Simple fallback responses when API is unavailable
  const [pool, count] = FALLBACK_POOLS[practiceId || ''] ?? ['default', 4];
  return t(`practiceExperience.fallback.${pool}.option${1 + Math.floor(Math.random() * count)}`);
}

function scrollChatToBottom(): void {
  const messagesContainer = container?.querySelector('#chat-messages');
  if (messagesContainer) {
    setTimeout(() => {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 50);
  }
}

// ============================================================================
// BREATHING
// ============================================================================

function startBreathingExercise(durationSeconds: number): void {
  state.isBreathing = true;
  let remaining = durationSeconds;

  const circle = container?.querySelector('#breathing-circle');
  const instruction = container?.querySelector('#breathing-instruction');
  const timer = container?.querySelector('#breathing-timer');

  const breathCycle = () => {
    // 4 seconds inhale, 4 seconds hold, 6 seconds exhale
    const phases = [
      { phase: 'inhale', duration: 4000 },
      { phase: 'hold', duration: 4000 },
      { phase: 'exhale', duration: 6000 },
    ];

    let phaseIndex = 0;

    const runPhase = () => {
      if (!state.isBreathing || remaining <= 0) {
        stopBreathing();
        return;
      }

      const currentPhase = phases[phaseIndex];
      if (!currentPhase) return;
      const { phase, duration } = currentPhase;
      state.breathPhase = phase as 'inhale' | 'hold' | 'exhale';

      circle?.classList.remove('inhale', 'hold', 'exhale');
      circle?.classList.add(phase);
      if (instruction) instruction.textContent = t(`practiceExperience.breathing.${phase}`);

      // Update timer
      remaining -= duration / 1000;
      if (timer) timer.textContent = tp('practiceExperience.breathing.secondsLeft', Math.max(0, Math.ceil(remaining)));

      // Next phase
      phaseIndex = (phaseIndex + 1) % phases.length;

      breathingInterval = window.setTimeout(runPhase, duration);
    };

    runPhase();
  };

  breathCycle();
}

function stopBreathing(): void {
  state.isBreathing = false;
  state.breathPhase = 'rest';
  if (breathingInterval) {
    clearTimeout(breathingInterval);
    breathingInterval = null;
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function startPractice(practice: Practice): void {
  log.info('Starting practice', { id: practice.id, name: practice.name });

  injectStyles();
  container = createContainer();

  // Check if voice is connected
  const roomState = connectionService.getRoomState();

  if (roomState.isConnected) {
    // Voice is connected - offer choice
    log.info('Voice connected, offering hybrid mode');
  }

  // Get steps for this practice
  const practiceId = practice.id.toLowerCase().replace(/\s+/g, '-');
  const steps = PRACTICE_STEPS[practiceId] || DEFAULT_STEPS;

  // Reset state
  state.currentPractice = practice;
  state.currentStepIndex = 0;
  state.steps = steps;
  state.userResponses = new Map();
  state.chatMessages = [];
  state.isThinking = false;
  state.isBreathing = false;

  // Render and show
  render();

  // Animate in
  requestAnimationFrame(() => {
    container?.classList.add('open');
  });

  state.isOpen = true;
  soundUI.play('click');
}

export function close(): void {
  if (!state.isOpen) return;

  stopBreathing();

  container?.classList.remove('open');

  setTimeout(() => {
    container?.remove();
    container = null;
    state.isOpen = false;
    state.currentPractice = null;
    state.steps = [];
    state.userResponses.clear();
    state.chatMessages = [];
  }, 400);

  log.info('Practice closed');
}

export function isOpen(): boolean {
  return state.isOpen;
}

// ============================================================================
// SINGLETON
// ============================================================================

export const practiceExperienceUI = {
  startPractice,
  close,
  isOpen,
};
