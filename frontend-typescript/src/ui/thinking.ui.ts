/**
 * Thinking Indicator UI - Shows when AI is processing
 * 
 * Displays an elegant animated indicator when the AI is
 * thinking/processing a response.
 */

// ============================================================================
// STATE
// ============================================================================

let container: HTMLElement | null = null;
let textElement: HTMLElement | null = null;
let hideTimeout: ReturnType<typeof setTimeout> | null = null;

// Thinking messages to cycle through
const THINKING_MESSAGES = [
  'Thinking',
  'Processing',
  'Analyzing',
  'Considering',
  'Pondering',
];

let messageIndex = 0;
let messageInterval: ReturnType<typeof setInterval> | null = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initThinkingUI(): void {
  container = document.getElementById('thinkingIndicator');
  textElement = container?.querySelector('.thinking-text') ?? null;
  
  if (!container) {
    console.warn('Thinking indicator not found');
    return;
  }
  
  console.log('🧠 Thinking indicator UI initialized');
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Show the thinking indicator
 */
export function show(message?: string): void {
  if (!container) return;
  
  // Clear any pending hide
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }
  
  // Set initial message
  if (textElement) {
    textElement.textContent = message ?? THINKING_MESSAGES[0] ?? 'Thinking';
  }
  
  // Show container
  container.classList.remove('hidden');
  requestAnimationFrame(() => {
    container?.classList.add('visible');
  });
  
  // Start cycling messages if no custom message
  if (!message) {
    startMessageCycle();
  }
}

/**
 * Hide the thinking indicator
 */
export function hide(): void {
  if (!container) return;
  
  // Stop message cycling
  stopMessageCycle();
  
  container.classList.remove('visible');
  
  setTimeout(() => {
    container?.classList.add('hidden');
  }, 300);
}

/**
 * Update the thinking message
 */
export function setMessage(message: string): void {
  if (textElement) {
    textElement.textContent = message;
  }
}

// ============================================================================
// MESSAGE CYCLING
// ============================================================================

function startMessageCycle(): void {
  if (messageInterval) return;
  
  messageIndex = 0;
  
  messageInterval = setInterval(() => {
    messageIndex = (messageIndex + 1) % THINKING_MESSAGES.length;
    if (textElement) {
      textElement.textContent = THINKING_MESSAGES[messageIndex] ?? 'Thinking';
    }
  }, 2000);
}

function stopMessageCycle(): void {
  if (messageInterval) {
    clearInterval(messageInterval);
    messageInterval = null;
  }
}

// ============================================================================
// CLEANUP
// ============================================================================

export function dispose(): void {
  if (hideTimeout) {
    clearTimeout(hideTimeout);
  }
  
  stopMessageCycle();
  
  container = null;
  textElement = null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const thinkingUI = {
  init: initThinkingUI,
  show,
  hide,
  setMessage,
  dispose,
};

