/**
 * The Chronicle - Immersive Journal Experience
 *
 * A beautiful, meaningful journal experience that works with or without voice.
 * "Your voice captures nuance that text never could" - but text captures what
 * you might never say aloud.
 *
 * Philosophy: Both paths are powerful. Voice captures emotion, spontaneity,
 * the sound of your thinking. Text captures the refined thought, the thing
 * you needed to write to understand.
 *
 * "Better than human" - We remember everything, surface patterns you can't see,
 * and let you have conversations with who you were.
 *
 * @module chronicle.ui
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { soundUI } from './sound.ui.js';
import { apiGet, apiPost, getUserId } from '../utils/api.js';
import { connectionService } from '../services/connection.service.js';
import { t } from '../i18n/index.js';

const log = createLogger('ChronicleUI');

// ============================================================================
// TYPES
// ============================================================================

interface JournalEntry {
  id: string;
  content: string;
  mood?: string;
  themes?: string[];
  createdAt: string;
  source: 'voice' | 'text' | 'auto';
}

interface JournalInsight {
  id: string;
  type: 'streak' | 'mood' | 'growth' | 'pattern' | 'memory';
  title: string;
  description: string;
  value?: string | number;
  icon: string;
}

interface ChronicleData {
  greeting: string;
  timeContext: TimeContext;
  entries: JournalEntry[];
  insights: JournalInsight[];
  memories: JournalEntry[]; // Featured memories to resurface
  streak: number;
  totalEntries: number;
}

type TimeContext = 'morning' | 'afternoon' | 'evening' | 'night';

interface ChronicleState {
  isOpen: boolean;
  isLoading: boolean;
  data: ChronicleData | null;
  activeSection: 'capture' | 'converse' | null;
  textEntry: string;
  chatMessages: ChatMessage[];
  isThinking: boolean;
  agentId: string | null;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'past-self';
  content: string;
  timestamp: Date;
}

// ============================================================================
// ICONS (Lucide-style SVGs)
// ============================================================================

const ICONS = {
  close: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
  pen: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
  mic: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>`,
  user: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>`,
  sparkles: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg>`,
  flame: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`,
  messageCircle: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/></svg>`,
  trendUp: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
  heart: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
  book: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>`,
  send: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>`,
  calendar: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>`,
  brain: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-1.54"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-1.54"/></svg>`,
  sunrise: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v8"/><path d="m4.93 10.93 1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="m8 6 4-4 4 4"/><path d="M16 18a4 4 0 0 0-8 0"/></svg>`,
  moon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`,
  quote: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/></svg>`,
};

// ============================================================================
// STATE
// ============================================================================

const state: ChronicleState = {
  isOpen: false,
  isLoading: false,
  data: null,
  activeSection: null,
  textEntry: '',
  chatMessages: [],
  isThinking: false,
  agentId: null,
};

let container: HTMLElement | null = null;

// ============================================================================
// STYLES
// ============================================================================

const styles = `
  /* ========================================================================
     CHRONICLE OVERLAY
     ======================================================================== */
  
  .chronicle-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal, 2100);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.4s ease, visibility 0.4s ease;
  }
  
  .chronicle-overlay.open {
    opacity: 1;
    visibility: visible;
  }
  
  .chronicle-backdrop {
    position: absolute;
    inset: 0;
    background: var(--color-utility-backdrop, rgba(20, 16, 14, 0.85));
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
  }
  
  .chronicle-container {
    position: relative;
    width: 95vw;
    max-width: 720px;
    max-height: 90vh;
    background: var(--color-background-elevated, #fffdfb);
    border-radius: var(--radius-2xl, 24px);
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    overflow: hidden;
    transform: scale(0.95) translateY(20px);
    transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    display: flex;
    flex-direction: column;
  }
  
  .chronicle-overlay.open .chronicle-container {
    transform: scale(1) translateY(0);
  }
  
  /* ========================================================================
     HEADER
     ======================================================================== */
  
  .chronicle-header {
    padding: var(--space-5, 20px) var(--space-6, 24px);
    border-bottom: 1px solid var(--color-border-subtle, rgba(0,0,0,0.06));
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
  }
  
  .chronicle-header-content {
    flex: 1;
  }
  
  .chronicle-eyebrow {
    font-family: var(--font-body, Inter, sans-serif);
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-accent, #3d5a45);
    margin-bottom: var(--space-1, 4px);
  }
  
  .chronicle-title {
    font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--color-text-primary, #2c2520);
    margin: 0 0 var(--space-1, 4px);
  }
  
  .chronicle-subtitle {
    font-family: var(--font-body, Inter, sans-serif);
    font-size: 0.9rem;
    color: var(--color-text-secondary, #5a4a42);
  }
  
  .chronicle-close {
    width: 44px;
    height: 44px;
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
  
  .chronicle-close:hover,
  .chronicle-close:focus-visible {
    background: var(--color-background-subtle, rgba(0,0,0,0.04));
    color: var(--color-text-primary, #2c2520);
  }
  
  /* ========================================================================
     CONTENT
     ======================================================================== */
  
  .chronicle-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-6, 24px);
  }
  
  /* ========================================================================
     STATS ROW
     ======================================================================== */
  
  .chronicle-stats {
    display: flex;
    gap: var(--space-4, 16px);
    margin-bottom: var(--space-6, 24px);
  }
  
  .chronicle-stat {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--space-3, 12px);
    padding: var(--space-4, 16px);
    background: var(--color-background-subtle, rgba(0,0,0,0.02));
    border-radius: var(--radius-lg, 12px);
    border: 1px solid var(--color-border-subtle, rgba(0,0,0,0.04));
  }
  
  .chronicle-stat-icon {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-md, 8px);
    background: var(--color-accent-subtle, rgba(61, 90, 69, 0.1));
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-accent, #3d5a45);
  }
  
  .chronicle-stat-value {
    font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--color-text-primary, #2c2520);
  }
  
  .chronicle-stat-label {
    font-family: var(--font-body, Inter, sans-serif);
    font-size: 0.75rem;
    color: var(--color-text-muted, #9a8c7f);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  
  /* ========================================================================
     ACTION CARDS
     ======================================================================== */
  
  .chronicle-actions {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-4, 16px);
    margin-bottom: var(--space-6, 24px);
  }
  
  .chronicle-action-card {
    position: relative;
    padding: var(--space-5, 20px);
    background: var(--color-background-elevated, #fffdfb);
    border: 1px solid var(--color-border-subtle, rgba(0,0,0,0.08));
    border-radius: var(--radius-xl, 16px);
    cursor: pointer;
    transition: all 0.3s ease;
    overflow: hidden;
  }
  
  .chronicle-action-card::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, 
      var(--color-accent-subtle, rgba(61, 90, 69, 0.05)), 
      transparent
    );
    opacity: 0;
    transition: opacity 0.3s ease;
  }
  
  .chronicle-action-card:hover::before,
  .chronicle-action-card:focus-visible::before {
    opacity: 1;
  }
  
  .chronicle-action-card:hover,
  .chronicle-action-card:focus-visible {
    border-color: var(--color-accent, #3d5a45);
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(61, 90, 69, 0.15);
  }
  
  .chronicle-action-icon {
    position: relative;
    width: 48px;
    height: 48px;
    border-radius: var(--radius-lg, 12px);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: var(--space-3, 12px);
    background: linear-gradient(135deg, 
      var(--color-accent, #3d5a45), 
      var(--persona-ferni, #4a6741)
    );
    color: white;
  }
  
  .chronicle-action-title {
    font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--color-text-primary, #2c2520);
    margin: 0 0 var(--space-1, 4px);
    position: relative;
  }
  
  .chronicle-action-description {
    font-family: var(--font-body, Inter, sans-serif);
    font-size: 0.85rem;
    color: var(--color-text-secondary, #5a4a42);
    line-height: 1.5;
    margin: 0;
    position: relative;
  }
  
  /* ========================================================================
     INSIGHTS SECTION
     ======================================================================== */
  
  .chronicle-section {
    margin-bottom: var(--space-6, 24px);
  }
  
  .chronicle-section-header {
    display: flex;
    align-items: center;
    gap: var(--space-2, 8px);
    margin-bottom: var(--space-4, 16px);
  }
  
  .chronicle-section-icon {
    color: var(--color-accent, #3d5a45);
  }
  
  .chronicle-section-title {
    font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--color-text-primary, #2c2520);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0;
  }
  
  .chronicle-insights-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-3, 12px);
  }
  
  .chronicle-insight-card {
    padding: var(--space-4, 16px);
    background: var(--color-background-subtle, rgba(0,0,0,0.02));
    border-radius: var(--radius-lg, 12px);
    border: 1px solid var(--color-border-subtle, rgba(0,0,0,0.04));
  }
  
  .chronicle-insight-card.full-width {
    grid-column: span 2;
  }
  
  .chronicle-insight-icon {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-md, 8px);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: var(--space-2, 8px);
    background: var(--color-accent-subtle, rgba(61, 90, 69, 0.1));
    color: var(--color-accent, #3d5a45);
  }
  
  .chronicle-insight-title {
    font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--color-text-primary, #2c2520);
    margin: 0 0 var(--space-1, 4px);
  }
  
  .chronicle-insight-description {
    font-family: var(--font-body, Inter, sans-serif);
    font-size: 0.8rem;
    color: var(--color-text-secondary, #5a4a42);
    line-height: 1.5;
    margin: 0;
  }
  
  /* ========================================================================
     MEMORIES SECTION
     ======================================================================== */
  
  .chronicle-memory-card {
    padding: var(--space-5, 20px);
    background: linear-gradient(135deg, 
      var(--color-accent-subtle, rgba(61, 90, 69, 0.08)),
      var(--color-background-subtle, rgba(0,0,0,0.02))
    );
    border-radius: var(--radius-xl, 16px);
    border-left: 3px solid var(--color-accent, #3d5a45);
    position: relative;
  }
  
  .chronicle-memory-quote {
    position: absolute;
    top: var(--space-4, 16px);
    right: var(--space-4, 16px);
    color: var(--color-accent, #3d5a45);
    opacity: 0.3;
  }
  
  .chronicle-memory-content {
    font-family: var(--font-narrative, 'EB Garamond', Georgia, serif);
    font-size: 1.1rem;
    font-style: italic;
    color: var(--color-text-primary, #2c2520);
    line-height: 1.6;
    margin: 0 0 var(--space-3, 12px);
  }
  
  .chronicle-memory-date {
    font-family: var(--font-body, Inter, sans-serif);
    font-size: 0.75rem;
    color: var(--color-text-muted, #9a8c7f);
  }
  
  /* ========================================================================
     CAPTURE PANEL (Text Entry)
     ======================================================================== */
  
  .chronicle-capture-panel {
    position: absolute;
    inset: 0;
    background: var(--color-background-elevated, #fffdfb);
    display: flex;
    flex-direction: column;
    transform: translateX(100%);
    transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    z-index: 1;
  }
  
  .chronicle-capture-panel.active {
    transform: translateX(0);
  }
  
  .chronicle-capture-header {
    padding: var(--space-4, 16px) var(--space-6, 24px);
    border-bottom: 1px solid var(--color-border-subtle, rgba(0,0,0,0.06));
    display: flex;
    align-items: center;
    gap: var(--space-3, 12px);
  }
  
  .chronicle-back-btn {
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
  
  .chronicle-back-btn:hover,
  .chronicle-back-btn:focus-visible {
    background: var(--color-background-subtle, rgba(0,0,0,0.04));
    color: var(--color-text-primary, #2c2520);
  }
  
  .chronicle-capture-title {
    font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--color-text-primary, #2c2520);
    margin: 0;
  }
  
  .chronicle-capture-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: var(--space-6, 24px);
  }
  
  .chronicle-capture-prompt {
    font-family: var(--font-narrative, 'EB Garamond', Georgia, serif);
    font-size: 1.25rem;
    font-style: italic;
    color: var(--color-text-secondary, #5a4a42);
    text-align: center;
    margin-bottom: var(--space-5, 20px);
    padding: var(--space-4, 16px);
    background: var(--color-accent-subtle, rgba(61, 90, 69, 0.05));
    border-radius: var(--radius-lg, 12px);
  }
  
  .chronicle-capture-textarea {
    flex: 1;
    width: 100%;
    min-height: 200px;
    padding: var(--space-4, 16px);
    border: 2px solid var(--color-border-subtle, rgba(0,0,0,0.08));
    border-radius: var(--radius-lg, 12px);
    font-family: var(--font-body, Inter, sans-serif);
    font-size: 1rem;
    line-height: 1.7;
    color: var(--color-text-primary, #2c2520);
    background: var(--color-background-elevated, #fffdfb);
    resize: none;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }
  
  .chronicle-capture-textarea:focus {
    outline: none;
    border-color: var(--color-accent, #3d5a45);
    box-shadow: 0 0 0 4px rgba(61, 90, 69, 0.1);
  }
  
  .chronicle-capture-textarea::placeholder {
    color: var(--color-text-muted, #9a8c7f);
  }
  
  .chronicle-capture-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-4, 16px) var(--space-6, 24px);
    border-top: 1px solid var(--color-border-subtle, rgba(0,0,0,0.06));
  }
  
  .chronicle-capture-options {
    display: flex;
    gap: var(--space-2, 8px);
  }
  
  .chronicle-voice-btn {
    display: flex;
    align-items: center;
    gap: var(--space-2, 8px);
    padding: var(--space-2, 8px) var(--space-4, 16px);
    background: transparent;
    border: 1px solid var(--color-border-subtle, rgba(0,0,0,0.1));
    border-radius: var(--radius-full, 9999px);
    color: var(--color-text-muted, #9a8c7f);
    font-family: var(--font-body, Inter, sans-serif);
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  .chronicle-voice-btn:hover,
  .chronicle-voice-btn:focus-visible {
    border-color: var(--color-accent, #3d5a45);
    color: var(--color-accent, #3d5a45);
  }
  
  .chronicle-save-btn {
    display: flex;
    align-items: center;
    gap: var(--space-2, 8px);
    padding: var(--space-3, 12px) var(--space-5, 20px);
    background: linear-gradient(135deg, 
      var(--color-accent, #3d5a45), 
      var(--persona-ferni, #4a6741)
    );
    border: none;
    border-radius: var(--radius-full, 9999px);
    color: white;
    font-family: var(--font-body, Inter, sans-serif);
    font-size: 0.95rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  .chronicle-save-btn:hover,
  .chronicle-save-btn:focus-visible {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(61, 90, 69, 0.3);
  }
  
  .chronicle-save-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
  
  /* ========================================================================
     CONVERSE PANEL (Talk to Past Self)
     ======================================================================== */
  
  .chronicle-converse-panel {
    position: absolute;
    inset: 0;
    background: var(--color-background-elevated, #fffdfb);
    display: flex;
    flex-direction: column;
    transform: translateX(100%);
    transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    z-index: 1;
  }
  
  .chronicle-converse-panel.active {
    transform: translateX(0);
  }
  
  .chronicle-converse-header {
    padding: var(--space-4, 16px) var(--space-6, 24px);
    border-bottom: 1px solid var(--color-border-subtle, rgba(0,0,0,0.06));
    display: flex;
    align-items: center;
    gap: var(--space-3, 12px);
  }
  
  .chronicle-converse-identity {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--space-3, 12px);
  }
  
  .chronicle-converse-avatar {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: linear-gradient(135deg, 
      var(--color-accent, #3d5a45), 
      var(--persona-ferni, #4a6741)
    );
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
  }
  
  .chronicle-converse-info h3 {
    font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-text-primary, #2c2520);
    margin: 0;
  }
  
  .chronicle-converse-info p {
    font-family: var(--font-body, Inter, sans-serif);
    font-size: 0.75rem;
    color: var(--color-text-muted, #9a8c7f);
    margin: 2px 0 0;
  }
  
  .chronicle-converse-messages {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-4, 16px);
    display: flex;
    flex-direction: column;
    gap: var(--space-3, 12px);
  }
  
  .chronicle-chat-message {
    max-width: 85%;
    padding: var(--space-3, 12px) var(--space-4, 16px);
    border-radius: var(--radius-lg, 12px);
    font-family: var(--font-body, Inter, sans-serif);
    font-size: 0.95rem;
    line-height: 1.5;
    animation: fadeInUp 0.3s ease;
  }
  
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  
  .chronicle-chat-message.past-self {
    align-self: flex-start;
    background: linear-gradient(135deg,
      var(--color-accent, #3d5a45) 0%,
      var(--persona-ferni, #4a6741) 100%
    );
    color: white;
    border-bottom-left-radius: var(--radius-sm, 4px);
  }
  
  .chronicle-chat-message.user {
    align-self: flex-end;
    background: var(--color-background-subtle, rgba(0,0,0,0.04));
    color: var(--color-text-primary, #2c2520);
    border-bottom-right-radius: var(--radius-sm, 4px);
  }
  
  .chronicle-chat-message.thinking {
    background: var(--color-background-subtle, rgba(0,0,0,0.04));
    color: var(--color-text-muted, #9a8c7f);
  }
  
  .thinking-dots {
    display: flex;
    gap: 4px;
    padding: var(--space-1, 4px) 0;
  }
  
  .thinking-dots span {
    width: 6px;
    height: 6px;
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
  
  .chronicle-converse-footer {
    padding: var(--space-4, 16px);
    border-top: 1px solid var(--color-border-subtle, rgba(0,0,0,0.06));
  }
  
  .chronicle-chat-input-row {
    display: flex;
    gap: var(--space-2, 8px);
    align-items: flex-end;
  }
  
  .chronicle-chat-input {
    flex: 1;
    padding: var(--space-3, 12px) var(--space-4, 16px);
    border: 2px solid var(--color-border-subtle, rgba(0,0,0,0.08));
    border-radius: var(--radius-xl, 16px);
    font-family: var(--font-body, Inter, sans-serif);
    font-size: 0.95rem;
    color: var(--color-text-primary, #2c2520);
    background: var(--color-background-elevated, #fffdfb);
    resize: none;
    min-height: 48px;
    max-height: 120px;
    transition: border-color 0.2s ease;
  }
  
  .chronicle-chat-input:focus {
    outline: none;
    border-color: var(--color-accent, #3d5a45);
  }
  
  .chronicle-chat-send {
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
  
  .chronicle-chat-send:hover,
  .chronicle-chat-send:focus-visible {
    background: var(--persona-ferni, #4a6741);
    transform: scale(1.05);
  }
  
  .chronicle-chat-send:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
  
  .chronicle-chat-hint {
    font-family: var(--font-body, Inter, sans-serif);
    font-size: 0.7rem;
    color: var(--color-text-muted, #9a8c7f);
    text-align: center;
    margin-top: var(--space-2, 8px);
  }
  
  /* ========================================================================
     EMPTY STATE
     ======================================================================== */
  
  .chronicle-empty {
    text-align: center;
    padding: var(--space-8, 32px);
  }
  
  .chronicle-empty-icon {
    width: 64px;
    height: 64px;
    margin: 0 auto var(--space-4, 16px);
    border-radius: var(--radius-xl, 16px);
    background: var(--color-accent-subtle, rgba(61, 90, 69, 0.1));
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-accent, #3d5a45);
  }
  
  .chronicle-empty-title {
    font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--color-text-primary, #2c2520);
    margin: 0 0 var(--space-2, 8px);
  }
  
  .chronicle-empty-description {
    font-family: var(--font-body, Inter, sans-serif);
    font-size: 0.95rem;
    color: var(--color-text-secondary, #5a4a42);
    line-height: 1.6;
    max-width: 320px;
    margin: 0 auto;
  }
  
  /* ========================================================================
     LOADING
     ======================================================================== */
  
  .chronicle-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-12, 48px);
    gap: var(--space-3, 12px);
  }
  
  .chronicle-loading-spinner {
    width: 32px;
    height: 32px;
    border: 2px solid var(--color-border-subtle, rgba(0,0,0,0.1));
    border-top-color: var(--color-accent, #3d5a45);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  /* ========================================================================
     RESPONSIVE
     ======================================================================== */
  
  @media (max-width: 640px) {
    .chronicle-container {
      width: 100vw;
      height: 100vh;
      max-height: 100vh;
      border-radius: 0;
    }
    
    .chronicle-actions {
      grid-template-columns: 1fr;
    }
    
    .chronicle-insights-grid {
      grid-template-columns: 1fr;
    }
    
    .chronicle-insight-card.full-width {
      grid-column: span 1;
    }
    
    .chronicle-stats {
      flex-direction: column;
    }
  }
  
  /* ========================================================================
     REDUCED MOTION
     ======================================================================== */
  
  @media (prefers-reduced-motion: reduce) {
    .chronicle-overlay,
    .chronicle-container,
    .chronicle-capture-panel,
    .chronicle-converse-panel,
    .chronicle-action-card,
    .thinking-dots span {
      animation: none;
      transition: none;
    }
  }
`;

// ============================================================================
// INITIALIZATION
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('chronicle-styles')) return;

  const styleEl = document.createElement('style');
  styleEl.id = 'chronicle-styles';
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);
}

function createContainer(): HTMLElement {
  // Clean up existing (HMR protection)
  document.querySelectorAll('.chronicle-overlay').forEach((el) => el.remove());

  const overlay = document.createElement('div');
  overlay.className = 'chronicle-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Your Chronicle');

  overlay.innerHTML = `
    <div class="chronicle-backdrop"></div>
    <div class="chronicle-container">
      <header class="chronicle-header">
        <div class="chronicle-header-content">
          <p class="chronicle-eyebrow">YOUR CHRONICLE</p>
          <h2 class="chronicle-title">Your Story</h2>
          <p class="chronicle-subtitle">Capture your thoughts, wisdom, and growth</p>
        </div>
        <button class="chronicle-close" aria-label="Close">
          ${ICONS.close}
        </button>
      </header>
      <div class="chronicle-content" id="chronicle-content">
        <div class="chronicle-loading">
          <div class="chronicle-loading-spinner"></div>
          <p>Loading your chronicle...</p>
        </div>
      </div>
      
      <!-- Capture Panel (slides in) -->
      <div class="chronicle-capture-panel" id="chronicle-capture-panel">
        <div class="chronicle-capture-header">
          <button class="chronicle-back-btn" id="capture-back" aria-label="Back">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
          </button>
          <h3 class="chronicle-capture-title">Capture a Thought</h3>
        </div>
        <div class="chronicle-capture-content">
          <div class="chronicle-capture-prompt" id="capture-prompt">
            What's on your mind right now?
          </div>
          <textarea 
            class="chronicle-capture-textarea" 
            id="capture-textarea"
            placeholder="Write freely. No one will see this but you..."
          ></textarea>
        </div>
        <div class="chronicle-capture-footer">
          <div class="chronicle-capture-options">
            <button class="chronicle-voice-btn" id="switch-to-voice">
              ${ICONS.mic}
              Switch to voice
            </button>
          </div>
          <button class="chronicle-save-btn" id="save-entry" disabled>
            Save Entry
          </button>
        </div>
      </div>
      
      <!-- Converse Panel (slides in) -->
      <div class="chronicle-converse-panel" id="chronicle-converse-panel">
        <div class="chronicle-converse-header">
          <button class="chronicle-back-btn" id="converse-back" aria-label="Back">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
          </button>
          <div class="chronicle-converse-identity">
            <div class="chronicle-converse-avatar">
              ${ICONS.user}
            </div>
            <div class="chronicle-converse-info">
              <h3>Your Past Self</h3>
              <p>Reflecting from your journal entries</p>
            </div>
          </div>
        </div>
        <div class="chronicle-converse-messages" id="converse-messages">
          <!-- Messages rendered dynamically -->
        </div>
        <div class="chronicle-converse-footer">
          <div class="chronicle-chat-input-row">
            <textarea 
              class="chronicle-chat-input" 
              id="converse-input"
              placeholder="Ask your past self something..."
              rows="1"
            ></textarea>
            <button class="chronicle-chat-send" id="converse-send">
              ${ICONS.send}
            </button>
          </div>
          <p class="chronicle-chat-hint">Speak with the perspective you've captured in your journals</p>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Event listeners
  overlay.querySelector('.chronicle-backdrop')?.addEventListener('click', close);
  overlay.querySelector('.chronicle-close')?.addEventListener('click', close);
  overlay.querySelector('#capture-back')?.addEventListener('click', () => closePanel('capture'));
  overlay.querySelector('#converse-back')?.addEventListener('click', () => closePanel('converse'));
  overlay.querySelector('#switch-to-voice')?.addEventListener('click', switchToVoice);
  overlay.querySelector('#save-entry')?.addEventListener('click', () => void saveTextEntry());
  overlay.querySelector('#converse-send')?.addEventListener('click', () => void sendConversation());

  // Textarea events
  const textarea = overlay.querySelector('#capture-textarea') as HTMLTextAreaElement;
  textarea?.addEventListener('input', () => {
    state.textEntry = textarea.value;
    const saveBtn = overlay.querySelector('#save-entry') as HTMLButtonElement;
    if (saveBtn) saveBtn.disabled = !textarea.value.trim();
  });

  const converseInput = overlay.querySelector('#converse-input') as HTMLTextAreaElement;
  converseInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendConversation();
    }
  });

  // Escape key
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (state.activeSection) {
        closePanel(state.activeSection);
      } else {
        close();
      }
    }
  });

  return overlay;
}

// ============================================================================
// DATA LOADING
// ============================================================================

function getTimeContext(): TimeContext {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

function getGreeting(timeContext: TimeContext): string {
  const greetings: Record<TimeContext, string[]> = {
    morning: ['Good morning', 'A fresh day awaits', 'Rise gently'],
    afternoon: ['Good afternoon', 'The day unfolds', 'Present moment'],
    evening: ['Good evening', 'As the day settles', 'Evening reflection'],
    night: ['Hello, night owl', 'In the stillness', 'Quiet hours'],
  };
  const options = greetings[timeContext];
  return options[Math.floor(Math.random() * options.length)];
}

async function loadData(): Promise<ChronicleData> {
  const timeContext = getTimeContext();
  const greeting = getGreeting(timeContext);

  try {
    // Try to load real journal data
    const userId = getUserId();
    if (userId) {
      const result = await apiGet<{
        recentEntries: Array<{
          id: string;
          content: string;
          type: 'voice' | 'text';
          createdAt: string;
          mood?: string;
          audioUrl?: string;
          themes?: string[];
        }>;
        insights: Array<{
          icon: string;
          title: string;
          text: string;
        }>;
        prompts: Array<{
          id: string;
          category: string;
          difficulty: 'gentle' | 'moderate' | 'deep';
          text: string;
          followUp?: string;
        }>;
        stats: {
          totalEntries: number;
          currentStreak: number;
          averageMood?: string;
          moodTrend?: 'improving' | 'declining' | 'stable';
          entriesThisWeek: number;
          topThemes: string[];
        };
      }>(`/api/journal/chronicle?userId=${encodeURIComponent(userId)}`);

      if (result.ok && result.data) {
        // Transform API response to ChronicleData format
        const transformedEntries: JournalEntry[] = (result.data.recentEntries || []).map(
          (e) => ({
            id: e.id,
            content: e.content,
            mood: e.mood,
            themes: e.themes,
            createdAt: e.createdAt,
            source: e.type === 'voice' ? 'voice' : 'text',
          })
        );

        const transformedInsights: JournalInsight[] = (result.data.insights || []).map(
          (insight, idx) => ({
            id: `insight-${idx}`,
            type: 'pattern' as const,
            title: insight.title,
            description: insight.text,
            icon: ICONS[insight.icon as keyof typeof ICONS] || ICONS.sparkles,
          })
        );

        return {
          greeting,
          timeContext,
          entries: transformedEntries,
          insights: transformedInsights.length > 0 ? transformedInsights : getDefaultInsights(),
          memories: transformedEntries.slice(0, 3),
          streak: result.data.stats?.currentStreak || 0,
          totalEntries: result.data.stats?.totalEntries || 0,
        };
      }
    }
  } catch (error) {
    log.warn({ error }, 'Failed to load chronicle data, using defaults');
  }

  // Return defaults if API fails
  return {
    greeting,
    timeContext,
    entries: [],
    insights: getDefaultInsights(),
    memories: [],
    streak: 0,
    totalEntries: 0,
  };
}

function getDefaultInsights(): JournalInsight[] {
  return [
    {
      id: 'start-journey',
      type: 'growth',
      title: 'Start Your Journey',
      description: 'Your first entry awaits. Every great story starts somewhere.',
      icon: ICONS.book,
    },
    {
      id: 'voice-text',
      type: 'pattern',
      title: 'Two Powerful Paths',
      description: 'Voice captures emotion. Text captures reflection. Both build wisdom.',
      icon: ICONS.brain,
    },
  ];
}

function getJournalPrompts(): string[] {
  const prompts: Record<TimeContext, string[]> = {
    morning: [
      "What's alive in you this morning?",
      'What would make today meaningful?',
      "How did you sleep? What's lingering?",
      'What intention do you want to carry today?',
    ],
    afternoon: [
      "How is the day unfolding? What's surprised you?",
      'What are you learning right now?',
      "What's asking for your attention?",
      'Pause and notice: how do you feel right now?',
    ],
    evening: [
      'What was the most alive moment of today?',
      "What are you grateful for? What's unfinished?",
      'What would you tell yourself from this morning?',
      'What do you want to remember from today?',
    ],
    night: [
      "What's keeping you awake? Let it out.",
      'What thoughts need a home before sleep?',
      'What would your past self think of where you are now?',
      "If you could only remember one thing from today, what would it be?",
    ],
  };

  return prompts[state.data?.timeContext || 'evening'];
}

// ============================================================================
// RENDERING
// ============================================================================

function render(): void {
  if (!container || !state.data) return;

  const content = container.querySelector('#chronicle-content');
  if (!content) return;

  const { greeting, entries, insights, memories, streak, totalEntries } = state.data;

  // If no entries yet, show empty state
  if (totalEntries === 0) {
    content.innerHTML = renderEmptyState(greeting);
    setupContentListeners();
    return;
  }

  content.innerHTML = `
    <!-- Stats Row -->
    <div class="chronicle-stats">
      <div class="chronicle-stat">
        <div class="chronicle-stat-icon">${ICONS.flame}</div>
        <div>
          <div class="chronicle-stat-value">${streak}</div>
          <div class="chronicle-stat-label">Day Streak</div>
        </div>
      </div>
      <div class="chronicle-stat">
        <div class="chronicle-stat-icon">${ICONS.book}</div>
        <div>
          <div class="chronicle-stat-value">${totalEntries}</div>
          <div class="chronicle-stat-label">Entries</div>
        </div>
      </div>
    </div>
    
    <!-- Action Cards -->
    <div class="chronicle-actions">
      <button class="chronicle-action-card" id="action-capture">
        <div class="chronicle-action-icon">${ICONS.pen}</div>
        <h3 class="chronicle-action-title">Capture a Thought</h3>
        <p class="chronicle-action-description">Write freely. Text captures what you might never say aloud.</p>
      </button>
      <button class="chronicle-action-card" id="action-converse">
        <div class="chronicle-action-icon">${ICONS.messageCircle}</div>
        <h3 class="chronicle-action-title">Talk to Past Self</h3>
        <p class="chronicle-action-description">Have a conversation with who you were.</p>
      </button>
    </div>
    
    <!-- Insights Section -->
    ${insights.length > 0 ? `
      <section class="chronicle-section">
        <div class="chronicle-section-header">
          <span class="chronicle-section-icon">${ICONS.sparkles}</span>
          <h3 class="chronicle-section-title">Patterns I Notice</h3>
        </div>
        <div class="chronicle-insights-grid">
          ${insights.map((insight) => renderInsightCard(insight)).join('')}
        </div>
      </section>
    ` : ''}
    
    <!-- Memory Section -->
    ${memories.length > 0 ? `
      <section class="chronicle-section">
        <div class="chronicle-section-header">
          <span class="chronicle-section-icon">${ICONS.heart}</span>
          <h3 class="chronicle-section-title">From Your Past</h3>
        </div>
        ${renderMemoryCard(memories[0])}
      </section>
    ` : ''}
  `;

  setupContentListeners();
}

function renderEmptyState(greeting: string): string {
  return `
    <div class="chronicle-empty">
      <div class="chronicle-empty-icon">${ICONS.book}</div>
      <h3 class="chronicle-empty-title">${greeting}</h3>
      <p class="chronicle-empty-description">
        Your chronicle is empty, but every great story starts somewhere. 
        Capture your first thought, and watch your wisdom grow.
      </p>
    </div>
    
    <!-- Action Cards -->
    <div class="chronicle-actions">
      <button class="chronicle-action-card" id="action-capture">
        <div class="chronicle-action-icon">${ICONS.pen}</div>
        <h3 class="chronicle-action-title">Capture a Thought</h3>
        <p class="chronicle-action-description">Write freely. Text captures what you might never say aloud.</p>
      </button>
      <button class="chronicle-action-card" id="action-voice">
        <div class="chronicle-action-icon">${ICONS.mic}</div>
        <h3 class="chronicle-action-title">Speak Your Mind</h3>
        <p class="chronicle-action-description">Your voice captures nuance that text never could.</p>
      </button>
    </div>
    
    <!-- Tips -->
    <section class="chronicle-section">
      <div class="chronicle-section-header">
        <span class="chronicle-section-icon">${ICONS.sparkles}</span>
        <h3 class="chronicle-section-title">Two Paths, One Story</h3>
      </div>
      <div class="chronicle-insights-grid">
        <div class="chronicle-insight-card">
          <div class="chronicle-insight-icon">${ICONS.pen}</div>
          <h4 class="chronicle-insight-title">Text Captures Reflection</h4>
          <p class="chronicle-insight-description">Writing helps you process. The act of finding words for feelings transforms them.</p>
        </div>
        <div class="chronicle-insight-card">
          <div class="chronicle-insight-icon">${ICONS.mic}</div>
          <h4 class="chronicle-insight-title">Voice Captures Emotion</h4>
          <p class="chronicle-insight-description">Speaking reveals what writing filters. The pauses, the tone, the spontaneity.</p>
        </div>
      </div>
    </section>
  `;
}

function renderInsightCard(insight: JournalInsight): string {
  const isFullWidth = insight.type === 'memory' || insight.type === 'growth';
  return `
    <div class="chronicle-insight-card ${isFullWidth ? 'full-width' : ''}">
      <div class="chronicle-insight-icon">${insight.icon}</div>
      <h4 class="chronicle-insight-title">${insight.title}</h4>
      <p class="chronicle-insight-description">${insight.description}</p>
    </div>
  `;
}

function renderMemoryCard(entry: JournalEntry): string {
  const date = new Date(entry.createdAt);
  const dateStr = date.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  });

  // Truncate long entries
  const content = entry.content.length > 300 ? entry.content.slice(0, 300) + '...' : entry.content;

  return `
    <div class="chronicle-memory-card">
      <div class="chronicle-memory-quote">${ICONS.quote}</div>
      <p class="chronicle-memory-content">"${content}"</p>
      <p class="chronicle-memory-date">${dateStr}</p>
    </div>
  `;
}

function setupContentListeners(): void {
  if (!container) return;

  // Action buttons
  container.querySelector('#action-capture')?.addEventListener('click', () => openPanel('capture'));
  container.querySelector('#action-converse')?.addEventListener('click', () => openPanel('converse'));
  container.querySelector('#action-voice')?.addEventListener('click', switchToVoice);
}

// ============================================================================
// PANEL MANAGEMENT
// ============================================================================

function openPanel(panel: 'capture' | 'converse'): void {
  if (!container) return;

  state.activeSection = panel;

  if (panel === 'capture') {
    // Set random prompt
    const prompts = getJournalPrompts();
    const prompt = prompts[Math.floor(Math.random() * prompts.length)];
    const promptEl = container.querySelector('#capture-prompt');
    if (promptEl) promptEl.textContent = prompt;

    // Clear textarea
    const textarea = container.querySelector('#capture-textarea') as HTMLTextAreaElement;
    if (textarea) {
      textarea.value = '';
      state.textEntry = '';
    }

    container.querySelector('#chronicle-capture-panel')?.classList.add('active');

    // Focus textarea
    setTimeout(() => textarea?.focus(), 300);
  } else if (panel === 'converse') {
    // Initialize chat with welcome message
    state.chatMessages = [
      {
        id: 'welcome',
        role: 'past-self',
        content: getConversationWelcome(),
        timestamp: new Date(),
      },
    ];
    renderChatMessages();
    container.querySelector('#chronicle-converse-panel')?.classList.add('active');

    // Focus input
    const input = container.querySelector('#converse-input') as HTMLTextAreaElement;
    setTimeout(() => input?.focus(), 300);
  }

  soundUI.play('click');
}

function closePanel(panel: 'capture' | 'converse'): void {
  if (!container) return;

  state.activeSection = null;

  if (panel === 'capture') {
    container.querySelector('#chronicle-capture-panel')?.classList.remove('active');
  } else if (panel === 'converse') {
    container.querySelector('#chronicle-converse-panel')?.classList.remove('active');
    state.chatMessages = [];
  }

  soundUI.play('click');
}

// ============================================================================
// TEXT ENTRY
// ============================================================================

async function saveTextEntry(): Promise<void> {
  if (!state.textEntry.trim()) return;

  const saveBtn = container?.querySelector('#save-entry') as HTMLButtonElement;
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
  }

  try {
    const result = await apiPost('/api/journal/chronicle/entry', {
      content: state.textEntry,
      type: 'text',
      agentId: state.agentId,
    });

    if (result.ok) {
      soundUI.play('success');
      closePanel('capture');
      // Reload data to show new entry
      void refreshData();

      // Show toast
      const { toast } = await import('./whisper.ui.js');
      toast.success('Captured!');
    } else {
      throw new Error(result.error || 'Failed to save');
    }
  } catch (error) {
    log.error('Failed to save entry:', error);
    const { toast } = await import('./whisper.ui.js');
    toast.error('Could not save. Try again?');

    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Entry';
    }
  }
}

function switchToVoice(): void {
  // Check if voice is available
  const isConnected = connectionService.getRoomState().isConnected;

  if (isConnected) {
    // Close chronicle and let voice take over
    close();
    window.dispatchEvent(new CustomEvent('ferni:start-journal-voice'));
  } else {
    // Open the voice journal UI directly
    void import('./voice-journal/index.js').then(({ openVoiceJournal }) => {
      if (state.agentId) {
        close();
        void openVoiceJournal(state.agentId);
      }
    });
  }
}

// ============================================================================
// CONVERSATION (Talk to Past Self)
// ============================================================================

function getConversationWelcome(): string {
  const timeContext = state.data?.timeContext || 'evening';
  const totalEntries = state.data?.totalEntries || 0;

  if (totalEntries === 0) {
    return "Hey. I'm here - well, I'm you. Start journaling and I'll have more to reflect on. For now, what's on your mind?";
  }

  const welcomes: Record<TimeContext, string[]> = {
    morning: [
      "Good morning. I've been thinking about some of the things we've written. What's waking up with you today?",
      "Morning. Ready to talk? I've got some perspective from our journals.",
    ],
    afternoon: [
      "Hey. The day's moving. Something on your mind? I've got all our entries to draw from.",
      "Checking in mid-day. What would help right now?",
    ],
    evening: [
      "Evening. A good time to reflect. What's the day taught you?",
      "Hey. As the day winds down, what's worth talking through?",
    ],
    night: [
      "Still awake? Me too. Sometimes the quiet hours are when we think clearest. What's up?",
      "Night thoughts hit different. What's on your mind?",
    ],
  };

  const options = welcomes[timeContext];
  return options[Math.floor(Math.random() * options.length)];
}

function renderChatMessages(): void {
  const messagesContainer = container?.querySelector('#converse-messages');
  if (!messagesContainer) return;

  messagesContainer.innerHTML = state.chatMessages
    .map(
      (msg) => `
      <div class="chronicle-chat-message ${msg.role}">
        ${msg.content}
      </div>
    `
    )
    .join('');

  // Add thinking indicator
  if (state.isThinking) {
    messagesContainer.innerHTML += `
      <div class="chronicle-chat-message thinking past-self">
        <div class="thinking-dots">
          <span></span><span></span><span></span>
        </div>
      </div>
    `;
  }

  // Scroll to bottom
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function sendConversation(): Promise<void> {
  if (state.isThinking) return;

  const input = container?.querySelector('#converse-input') as HTMLTextAreaElement;
  const userMessage = input?.value.trim();

  if (!userMessage) return;

  // Add user message
  state.chatMessages.push({
    id: `msg-${Date.now()}`,
    role: 'user',
    content: userMessage,
    timestamp: new Date(),
  });

  // Clear input
  input.value = '';

  // Show thinking state
  state.isThinking = true;
  renderChatMessages();

  try {
    // Call API for response
    const result = await apiPost<{ response: string }>('/api/journal/twin-response', {
      userMessage,
      agentId: state.agentId,
    });

    const response =
      result.ok && result.data?.response ? result.data.response : getFallbackResponse(userMessage);

    state.chatMessages.push({
      id: `msg-${Date.now() + 1}`,
      role: 'past-self',
      content: response,
      timestamp: new Date(),
    });

    soundUI.play('click');
  } catch (error) {
    log.error('Conversation error:', error);
    state.chatMessages.push({
      id: `msg-${Date.now() + 1}`,
      role: 'past-self',
      content: getFallbackResponse(userMessage),
      timestamp: new Date(),
    });
  }

  state.isThinking = false;
  renderChatMessages();

  // Re-focus input
  input?.focus();
}

function getFallbackResponse(userMessage: string): string {
  const lower = userMessage.toLowerCase();

  if (lower.includes('advice') || lower.includes('should')) {
    return "I've learned that the best advice usually comes from sitting with the question longer. What does your gut say?";
  }

  if (lower.includes('feel') || lower.includes('feeling')) {
    return "That's a lot to carry. I've felt that too. What would help right now - to talk it through or to just sit with it?";
  }

  if (lower.includes('remember')) {
    return "I remember more than you might think. The journal entries hold a lot. What specifically are you looking for?";
  }

  const fallbacks = [
    "That's interesting. What makes you bring that up now?",
    "I hear you. What else is there?",
    "Tell me more. What's underneath that?",
    "That's something I've been thinking about too. What's the question behind the question?",
  ];

  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

// ============================================================================
// DATA REFRESH
// ============================================================================

async function refreshData(): Promise<void> {
  state.isLoading = true;
  state.data = await loadData();
  state.isLoading = false;
  render();
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function openChronicle(agentId?: string): void {
  log.info('Opening Chronicle', { agentId });

  injectStyles();
  container = createContainer();

  state.agentId = agentId || null;
  state.isOpen = true;
  state.isLoading = true;
  state.activeSection = null;
  state.textEntry = '';
  state.chatMessages = [];

  // Show immediately, load data async
  requestAnimationFrame(() => {
    container?.classList.add('open');
  });

  // Load data
  void loadData().then((data) => {
    state.data = data;
    state.isLoading = false;
    render();
  });

  soundUI.play('switch');
}

export function close(): void {
  if (!state.isOpen) return;

  container?.classList.remove('open');

  setTimeout(() => {
    container?.remove();
    container = null;
    state.isOpen = false;
    state.data = null;
    state.activeSection = null;
  }, 400);

  log.info('Chronicle closed');
}

export function isChronicleOpen(): boolean {
  return state.isOpen;
}

export function setChronicleAgentId(agentId: string): void {
  state.agentId = agentId;
}

// Singleton accessor
let chronicleInstance: { open: typeof openChronicle; close: typeof close; isOpen: typeof isChronicleOpen } | null =
  null;

export function getChronicleUI() {
  if (!chronicleInstance) {
    chronicleInstance = {
      open: openChronicle,
      close,
      isOpen: isChronicleOpen,
    };
  }
  return chronicleInstance;
}
