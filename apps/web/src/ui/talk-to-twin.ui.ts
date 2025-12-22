/**
 * Talk to Twin UI
 *
 * Enables conversations with your Digital Twin. The twin responds
 * using your profile data (mannerisms, values, communication style)
 * and all your journal entries to speak as your past self.
 *
 * Features:
 * - Voice-first conversation interface
 * - Responses based on your authentic voice
 * - Journal entry context for realistic reflection
 * - "Past Self" persona for self-dialogue
 *
 * @module talk-to-twin.ui
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { soundUI } from './sound.ui.js';
import {
  getCustomAgent,
  listMemories,
  type CustomAgent,
} from '../services/custom-agent.service.js';

const log = createLogger('TalkToTwinUI');

// ============================================================================
// TYPES
// ============================================================================

interface Message {
  id: string;
  role: 'user' | 'twin';
  content: string;
  timestamp: Date;
}

interface TwinContext {
  profile: TwinProfile;
  recentJournals: JournalEntry[];
  keyThemes: string[];
  currentMood: string;
}

interface TwinProfile {
  name: string;
  mannerisms: string[];
  values: string[];
  communicationStyle: string;
  philosophy: string;
  passions: string[];
  // Extended profile data
  lifeChapters: Array<{
    title: string;
    years: string;
    description: string;
  }>;
  relationships: Array<{
    name: string;
    relationship: string;
  }>;
  emotionalExpressions: {
    happy: string[];
    sad: string[];
    excited: string[];
    frustrated: string[];
  };
  greetingStyle: string;
  farewellStyle: string;
}

interface JournalEntry {
  content: string;
  mood?: string;
  date: Date;
  themes?: string[];
}

// ============================================================================
// STATE
// ============================================================================

let twinModal: HTMLElement | null = null;
let currentAgent: CustomAgent | null = null;
let messages: Message[] = [];
let isThinking = false;
let twinContext: TwinContext | null = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

function ensureModalExists(): HTMLElement {
  if (twinModal) return twinModal;

  // Clean up orphaned elements (HMR protection)
  document.querySelectorAll('.talk-twin-overlay').forEach((el) => el.remove());

  twinModal = document.createElement('div');
  twinModal.className = 'talk-twin-overlay';
  twinModal.innerHTML = `
    <div class="twin-backdrop" data-action="close" role="button" tabindex="0"></div>
    <div class="twin-container" role="dialog" aria-modal="true" aria-labelledby="twin-title">
      <header class="twin-header">
        <div class="twin-identity">
          <div class="twin-avatar">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="8" r="5"/>
              <path d="M20 21a8 8 0 0 0-16 0"/>
            </svg>
          </div>
          <div class="twin-info">
            <h2 class="twin-title" id="twin-title">Your Past Self</h2>
            <p class="twin-subtitle">Based on your journals & profile</p>
          </div>
        </div>
        <button class="twin-close" data-action="close" aria-label="Close">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </header>

      <main class="twin-messages" id="twin-messages">
        <!-- Messages rendered dynamically -->
      </main>

      <footer class="twin-footer">
        <div class="twin-input-row">
          <textarea 
            class="twin-input" 
            id="twin-input"
            placeholder="Ask your past self something..."
            rows="1"
          ></textarea>
          <button class="twin-send" id="twin-send" aria-label="Send">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
        <p class="twin-hint">Speak with the perspective you've captured in your journals</p>
      </footer>
    </div>
  `;

  twinModal.addEventListener('click', handleModalClick);
  twinModal.addEventListener('keydown', handleModalKeydown);

  // Add styles
  if (!document.getElementById('talk-twin-styles')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'talk-twin-styles';
    styleSheet.textContent = getTwinStyles();
    document.head.appendChild(styleSheet);
  }

  document.body.appendChild(twinModal);
  return twinModal;
}

// ============================================================================
// MODAL CONTROLS
// ============================================================================

export async function openTalkToTwin(agentId: string, initialPrompt?: string): Promise<void> {
  const modal = ensureModalExists();

  try {
    const agent = await getCustomAgent(agentId);
    if (!agent) {
      log.error('Agent not found:', agentId);
      const { toast } = await import('./toast.ui.js');
      toast.error('Agent not found');
      return;
    }

    currentAgent = agent;
    messages = [];

    // Build context from profile and journals
    await buildTwinContext(agent);

    // Add welcome message from twin
    addTwinWelcome();

    renderMessages();

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    // Focus input
    const input = modal.querySelector('#twin-input') as HTMLTextAreaElement;
    if (input) input.focus();

    soundUI.play('switch');

    // If an initial prompt was provided (from coaching/roleplay/task mode), send it
    if (initialPrompt) {
      // Small delay to let the UI settle
      setTimeout(() => {
        sendMessage(initialPrompt);
      }, 500);
    }
  } catch (error) {
    log.error('Failed to open Talk to Twin:', error);
    const { toast } = await import('./toast.ui.js');
    toast.error('Could not start conversation');
  }
}

export function closeTalkToTwin(): void {
  if (!twinModal) return;

  twinModal.classList.remove('open');
  document.body.style.overflow = '';

  currentAgent = null;
  messages = [];
  twinContext = null;

  soundUI.play('switch');
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

async function buildTwinContext(agent: CustomAgent): Promise<void> {
  // Get recent journal entries
  const journals = (await listMemories(agent.id, 'journalEntry')) || [];

  // Extract profile from agent data
  const personality = (agent.personality || {}) as Record<string, unknown>;
  const behaviors = (agent.behaviors || {}) as Record<string, unknown>;
  const memories = (agent.memories || {}) as Record<string, unknown>;

  // Extract life chapters from memories
  const lifeEvents = (memories.lifeEvents as Array<Record<string, unknown>>) || [];
  const lifeChapters = lifeEvents.map((event) => ({
    title: (event.title as string) || '',
    years: (event.date as string) || '',
    description: (event.description as string) || '',
  }));

  // Extract relationships from memories
  const relationshipData = (memories.relationships as Array<Record<string, unknown>>) || [];
  const relationships = relationshipData.map((rel) => ({
    name: (rel.personName as string) || '',
    relationship: (rel.relationship as string) || '',
  }));

  // Extract emotional expressions from behaviors
  const emotionalExpressions = {
    happy: (behaviors.celebrationPhrases as string[]) || [],
    sad: (behaviors.comfortPhrases as string[]) || [],
    excited: ((behaviors.celebrationPhrases as string[]) || []).slice(0, 3),
    frustrated: [] as string[],
  };

  const profile: TwinProfile = {
    name: agent.displayName || agent.name,
    mannerisms: ((behaviors.catchphrases as string[]) || []).slice(0, 10),
    values: (personality.values as string[]) || [],
    communicationStyle: describeCommunicationStyle(personality),
    philosophy: (personality.worldview as string) || '',
    passions: (personality.passions as string[]) || [],
    lifeChapters,
    relationships,
    emotionalExpressions,
    greetingStyle: ((behaviors.greetings as string[]) || [])[0] || '',
    farewellStyle: ((behaviors.farewells as string[]) || [])[0] || '',
  };

  // Extract key themes from journals
  const themes = new Set<string>();
  const recentEntries: JournalEntry[] = [];

  for (const journal of journals.slice(0, 20)) {
    const entry = journal as Record<string, unknown>;
    recentEntries.push({
      content: (entry.content as string) || '',
      mood: entry.mood as string | undefined,
      date: new Date((entry.createdAt as string) || Date.now()),
      themes: entry.themes as string[] | undefined,
    });

    if (entry.themes && Array.isArray(entry.themes)) {
      for (const theme of entry.themes as string[]) {
        themes.add(theme);
      }
    }
  }

  // Get current mood from most recent entry
  const currentMood = recentEntries[0]?.mood || 'neutral';

  twinContext = {
    profile,
    recentJournals: recentEntries,
    keyThemes: Array.from(themes).slice(0, 10),
    currentMood,
  };
}

function describeCommunicationStyle(personality: Record<string, unknown>): string {
  const style = personality.communicationStyle as Record<string, unknown> | undefined;
  if (!style) return 'natural and authentic';

  const descriptors: string[] = [];

  if (style.speaksSlowly) descriptors.push('thoughtful');
  if (style.tellsStories) descriptors.push('story-driven');
  if (style.usesMetaphors) descriptors.push('metaphorical');
  if (style.asksQuestions) descriptors.push('curious');
  if (style.givesAdvice) descriptors.push('advisory');

  return descriptors.length > 0 ? descriptors.join(', ') : 'natural and authentic';
}

// ============================================================================
// MESSAGE HANDLING
// ============================================================================

function addTwinWelcome(): void {
  if (!twinContext) return;

  const { profile, recentJournals, currentMood } = twinContext;

  // Build a personalized welcome using the profile
  let welcome = '';

  // Use a greeting from mannerisms if available
  if (profile.mannerisms.length > 0) {
    welcome = profile.mannerisms[0] + ' ';
  } else {
    welcome = 'Hey. ';
  }

  welcome += `It's me—well, you. The ${profile.name} who's been journaling and reflecting. `;

  if (recentJournals.length > 0) {
    welcome += `I've got ${recentJournals.length} journal entries worth of perspective to share. `;
  }

  if (profile.philosophy) {
    welcome += `Remember what we believe: "${profile.philosophy}" `;
  }

  welcome += '\n\nWhat would you like to talk about?';

  messages.push({
    id: `msg-${Date.now()}`,
    role: 'twin',
    content: welcome,
    timestamp: new Date(),
  });
}

async function handleSendMessage(): Promise<void> {
  if (isThinking || !currentAgent || !twinContext) return;

  const input = twinModal?.querySelector('#twin-input') as HTMLTextAreaElement;
  const userMessage = input?.value.trim();

  if (!userMessage) return;

  // Add user message
  messages.push({
    id: `msg-${Date.now()}`,
    role: 'user',
    content: userMessage,
    timestamp: new Date(),
  });

  // Clear input
  input.value = '';
  input.style.height = 'auto';

  // Show thinking state
  isThinking = true;
  renderMessages();

  try {
    // Generate twin response
    const response = await generateTwinResponse(userMessage, twinContext);

    // Add twin response
    messages.push({
      id: `msg-${Date.now() + 1}`,
      role: 'twin',
      content: response,
      timestamp: new Date(),
    });

    soundUI.play('click');
  } catch (error) {
    log.error('Failed to generate twin response:', error);
    messages.push({
      id: `msg-${Date.now() + 1}`,
      role: 'twin',
      content: "I'm having trouble thinking right now. Give me a moment and try again?",
      timestamp: new Date(),
    });
  }

  isThinking = false;
  renderMessages();

  // Scroll to bottom
  const messagesContainer = twinModal?.querySelector('#twin-messages');
  if (messagesContainer) {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
}

async function generateTwinResponse(userMessage: string, context: TwinContext): Promise<string> {
  // Build system prompt from profile
  const { profile, recentJournals, keyThemes } = context;

  // For now, we'll use a local generation approach
  // In production, this would call an LLM API

  // Find relevant journal entries
  const relevantJournals = findRelevantJournals(userMessage, recentJournals);

  // Build response using profile patterns
  const response = await callTwinAPI(userMessage, profile, relevantJournals, keyThemes);

  return response;
}

function findRelevantJournals(
  query: string,
  journals: JournalEntry[]
): JournalEntry[] {
  const queryWords = new Set(query.toLowerCase().split(/\s+/));
  const scored = journals.map((journal) => {
    const contentWords = journal.content.toLowerCase().split(/\s+/);
    let score = 0;
    for (const word of contentWords) {
      if (queryWords.has(word)) score++;
    }
    return { journal, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((s) => s.journal);
}

async function callTwinAPI(
  userMessage: string,
  profile: TwinProfile,
  relevantJournals: JournalEntry[],
  keyThemes: string[]
): Promise<string> {
  try {
    const response = await fetch('/api/journal/twin-response', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userMessage,
        profile,
        relevantJournals: relevantJournals.map((j) => ({
          content: j.content,
          mood: j.mood,
          date: j.date.toISOString(),
        })),
        keyThemes,
      }),
    });

    if (response.ok) {
      const result = (await response.json()) as { response: string };
      return result.response;
    }
  } catch (error) {
    log.warn('Twin API failed, using fallback:', error);
  }

  // Fallback: Generate a simple response based on profile
  return generateFallbackResponse(userMessage, profile, relevantJournals);
}

function generateFallbackResponse(
  userMessage: string,
  profile: TwinProfile,
  relevantJournals: JournalEntry[]
): string {
  // Simple pattern-based response as fallback

  const lowerMessage = userMessage.toLowerCase();

  // Check for common patterns
  if (lowerMessage.includes('advice') || lowerMessage.includes('should i')) {
    if (profile.philosophy) {
      return `You know what I've learned? "${profile.philosophy}" Whatever you're facing, remember that.`;
    }
    if (profile.values.length > 0) {
      return `Think about what matters to us: ${profile.values.slice(0, 3).join(', ')}. Let those guide you.`;
    }
  }

  if (lowerMessage.includes('feeling') || lowerMessage.includes('feel')) {
    if (relevantJournals.length > 0) {
      const recent = relevantJournals[0];
      return `I've felt that too. In my journal I wrote: "${recent.content.slice(0, 200)}..." We got through it before.`;
    }
    return "I hear you. We've been through tough times before and found our way. What's really bothering you?";
  }

  if (lowerMessage.includes('remember') || lowerMessage.includes('past')) {
    if (relevantJournals.length > 0) {
      const entries = relevantJournals.slice(0, 2);
      let response = 'Yeah, I remember. ';
      for (const entry of entries) {
        response += `There was that time I wrote: "${entry.content.slice(0, 100)}..." `;
      }
      return response;
    }
  }

  // Default response using mannerisms
  if (profile.mannerisms.length > 0) {
    const phrase = profile.mannerisms[Math.floor(Math.random() * profile.mannerisms.length)];
    return `${phrase} That's something I've been thinking about too. What made you bring this up?`;
  }

  return "That's a good question. What made you think of that?";
}

// ============================================================================
// RENDERING
// ============================================================================

function renderMessages(): void {
  const container = twinModal?.querySelector('#twin-messages');
  if (!container) return;

  container.innerHTML = messages
    .map(
      (msg) => `
    <div class="twin-message twin-message--${msg.role}">
      ${msg.role === 'twin' ? `
        <div class="message-avatar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="8" r="5"/>
            <path d="M20 21a8 8 0 0 0-16 0"/>
          </svg>
        </div>
      ` : ''}
      <div class="message-content">
        <p>${escapeHtml(msg.content)}</p>
        <time class="message-time">${formatTime(msg.timestamp)}</time>
      </div>
    </div>
  `
    )
    .join('');

  // Add thinking indicator if needed
  if (isThinking) {
    container.innerHTML += `
      <div class="twin-message twin-message--twin twin-message--thinking">
        <div class="message-avatar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="8" r="5"/>
            <path d="M20 21a8 8 0 0 0-16 0"/>
          </svg>
        </div>
        <div class="message-content">
          <div class="thinking-dots">
            <span></span><span></span><span></span>
          </div>
        </div>
      </div>
    `;
  }

  // Scroll to bottom
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ============================================================================
// EVENT HANDLING
// ============================================================================

function handleModalClick(e: Event): void {
  const target = e.target as HTMLElement;

  if (target.closest('[data-action="close"]')) {
    closeTalkToTwin();
    return;
  }

  if (target.closest('#twin-send')) {
    void handleSendMessage();
    return;
  }
}

function handleModalKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    closeTalkToTwin();
    return;
  }

  // Enter to send (without shift)
  if (e.key === 'Enter' && !e.shiftKey) {
    const target = e.target as HTMLElement;
    if (target.id === 'twin-input') {
      e.preventDefault();
      void handleSendMessage();
    }
  }
}

// ============================================================================
// STYLES
// ============================================================================

function getTwinStyles(): string {
  return `
    /* Overlay */
    .talk-twin-overlay {
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
    
    .talk-twin-overlay.open {
      opacity: 1;
      pointer-events: auto;
    }
    
    .twin-backdrop {
      position: absolute;
      inset: 0;
      background: var(--backdrop-heavy, rgba(0, 0, 0, 0.6));
      backdrop-filter: blur(8px);
    }
    
    /* Container */
    .twin-container {
      position: relative;
      width: 90vw;
      max-width: clamp(350px, 90vw, 500px);
      height: 80vh;
      max-height: 700px;
      background: var(--color-bg-elevated, #1a1a2e);
      border-radius: var(--radius-2xl, 24px);
      box-shadow: var(--shadow-2xl);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transform: scale(0.95);
      transition: transform ${DURATION.NORMAL}ms ${EASING.SPRING};
    }
    
    .talk-twin-overlay.open .twin-container {
      transform: scale(1);
    }
    
    /* Header */
    .twin-header {
      padding: var(--space-md, 16px) var(--space-lg, 24px);
      border-bottom: 1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.1));
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    
    .twin-identity {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 12px);
    }
    
    .twin-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--color-accent, #4a6741), rgba(74, 103, 65, 0.7));
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
    }
    
    .twin-title {
      font-family: 'Plus Jakarta Sans', var(--font-display, sans-serif);
      font-size: 1rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0;
    }
    
    .twin-subtitle {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.75rem;
      color: var(--color-text-muted);
      margin: 2px 0 0;
    }
    
    .twin-close {
      background: none;
      border: none;
      color: var(--color-text-muted);
      cursor: pointer;
      padding: var(--space-xs, 8px);
      border-radius: var(--radius-md, 8px);
      transition: all ${DURATION.FAST}ms;
    }
    
    .twin-close:hover {
      background: var(--color-bg-tertiary);
      color: var(--color-text-primary);
    }
    
    /* Messages */
    .twin-messages {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-md, 16px);
      display: flex;
      flex-direction: column;
      gap: var(--space-md, 16px);
    }
    
    .twin-message {
      display: flex;
      gap: var(--space-sm, 10px);
      max-width: 85%;
      animation: fadeInUp ${DURATION.NORMAL}ms ${EASING.STANDARD};
    }
    
    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    .twin-message--user {
      align-self: flex-end;
      flex-direction: row-reverse;
    }
    
    .twin-message--twin {
      align-self: flex-start;
    }
    
    .message-avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--color-accent, #4a6741), rgba(74, 103, 65, 0.7));
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      flex-shrink: 0;
    }
    
    .message-content {
      padding: var(--space-sm, 10px) var(--space-md, 14px);
      border-radius: var(--radius-lg, 16px);
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.9rem;
      line-height: 1.5;
    }
    
    .twin-message--user .message-content {
      background: var(--color-accent, #4a6741);
      color: white;
      border-bottom-right-radius: 4px;
    }
    
    .twin-message--twin .message-content {
      background: var(--color-bg-secondary);
      color: var(--color-text-primary);
      border-bottom-left-radius: 4px;
    }
    
    .message-content p {
      margin: 0;
    }
    
    .message-time {
      display: block;
      font-size: 0.65rem;
      color: var(--color-text-muted);
      margin-top: var(--space-xs, 4px);
      opacity: 0.7;
    }
    
    .twin-message--user .message-time {
      color: rgba(255, 255, 255, 0.7);
    }
    
    /* Thinking indicator */
    .twin-message--thinking .thinking-dots {
      display: flex;
      gap: 4px;
      padding: var(--space-xs, 4px) 0;
    }
    
    .thinking-dots span {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--color-text-muted);
      animation: bounce 1.4s ease-in-out infinite;
    }
    
    .thinking-dots span:nth-child(2) {
      animation-delay: 0.2s;
    }
    
    .thinking-dots span:nth-child(3) {
      animation-delay: 0.4s;
    }
    
    @keyframes bounce {
      0%, 80%, 100% { transform: translateY(0); }
      40% { transform: translateY(-6px); }
    }
    
    /* Footer */
    .twin-footer {
      padding: var(--space-md, 16px);
      border-top: 1px solid var(--color-border-subtle);
    }
    
    .twin-input-row {
      display: flex;
      gap: var(--space-sm, 10px);
      align-items: flex-end;
    }
    
    .twin-input {
      flex: 1;
      padding: var(--space-sm, 10px) var(--space-md, 14px);
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-lg, 16px);
      color: var(--color-text-primary);
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.9rem;
      resize: none;
      max-height: 120px;
      overflow-y: auto;
    }
    
    .twin-input:focus {
      outline: none;
      border-color: var(--color-accent, #4a6741);
    }
    
    .twin-input::placeholder {
      color: var(--color-text-muted);
    }
    
    .twin-send {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--color-accent, #4a6741);
      border: none;
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all ${DURATION.FAST}ms;
      flex-shrink: 0;
    }
    
    .twin-send:hover {
      filter: brightness(1.1);
      transform: scale(1.05);
    }
    
    .twin-send:active {
      transform: scale(0.95);
    }
    
    .twin-hint {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.7rem;
      color: var(--color-text-muted);
      text-align: center;
      margin: var(--space-xs, 8px) 0 0;
    }
    
    /* Responsive */
    @media (max-width: clamp(448px, 90vw, 640px)) {
      .twin-container {
        width: 100vw;
        height: 100vh;
        max-height: 100vh;
        border-radius: 0;
      }
    }
    
    @media (prefers-reduced-motion: reduce) {
      .twin-message,
      .twin-container,
      .thinking-dots span {
        animation: none;
        transition: none;
      }
    }
  `;
}

// Functions are already exported with 'export function' declarations above

