/**
 * Transcript UI - Live speech-to-text display
 * 
 * Shows what's being said in real-time with elegant typography
 * and smooth animations.
 */

// ============================================================================
// STATE
// ============================================================================

let container: HTMLElement | null = null;
let textElement: HTMLElement | null = null;
let hideTimeout: ReturnType<typeof setTimeout> | null = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initTranscriptUI(): void {
  container = document.getElementById('transcriptContainer');
  textElement = document.getElementById('transcriptText');
  
  if (!container || !textElement) {
    console.warn('Transcript elements not found');
    return;
  }
  
  console.log('📝 Transcript UI initialized');
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Show transcript with text (interim or final)
 */
export function showTranscript(text: string, isFinal = false): void {
  if (!container || !textElement) return;
  
  // Clear any pending hide
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }
  
  // Update text
  textElement.textContent = text;
  
  // Show container
  container.classList.remove('hidden');
  requestAnimationFrame(() => {
    container?.classList.add('visible');
  });
  
  // Toggle typing cursor based on final state
  if (isFinal) {
    textElement.classList.remove('typing');
    
    // Auto-hide after final text
    hideTimeout = setTimeout(() => {
      hide();
    }, 3000);
  } else {
    textElement.classList.add('typing');
  }
}

/**
 * Update transcript with interim (in-progress) text
 */
export function updateInterim(text: string): void {
  showTranscript(text, false);
}

/**
 * Finalize transcript with completed text
 */
export function finalize(text: string): void {
  showTranscript(text, true);
}

/**
 * Clear and hide transcript
 */
export function hide(): void {
  if (!container || !textElement) return;
  
  container.classList.remove('visible');
  
  setTimeout(() => {
    container?.classList.add('hidden');
    if (textElement) {
      textElement.textContent = '';
      textElement.classList.remove('typing');
    }
  }, 300);
}

/**
 * Clear transcript text but keep visible
 */
export function clear(): void {
  if (textElement) {
    textElement.textContent = '';
    textElement.classList.remove('typing');
  }
}

// ============================================================================
// CLEANUP
// ============================================================================

export function dispose(): void {
  if (hideTimeout) {
    clearTimeout(hideTimeout);
  }
  
  container = null;
  textElement = null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const transcriptUI = {
  init: initTranscriptUI,
  show: showTranscript,
  updateInterim,
  finalize,
  hide,
  clear,
  dispose,
};

