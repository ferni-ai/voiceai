/**
 * Connection Quality UI - Network status indicator
 * 
 * Shows connection quality in an elegant, non-intrusive way.
 */

// ============================================================================
// TYPES
// ============================================================================

export type ConnectionQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'disconnected';

// ============================================================================
// STATE
// ============================================================================

let container: HTMLElement | null = null;
let qualityTextElement: HTMLElement | null = null;
let currentQuality: ConnectionQuality = 'disconnected';

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initConnectionQualityUI(): void {
  // Create element if it doesn't exist
  container = document.getElementById('connectionQuality');
  
  if (!container) {
    container = document.createElement('div');
    container.id = 'connectionQuality';
    container.className = 'connection-quality hidden';
    container.innerHTML = `
      <div class="quality-bars">
        <div class="quality-bar"></div>
        <div class="quality-bar"></div>
        <div class="quality-bar"></div>
        <div class="quality-bar"></div>
      </div>
      <span class="quality-text">Connected</span>
    `;
    
    document.body.appendChild(container);
  }
  
  qualityTextElement = container.querySelector('.quality-text');
  
  console.log('📶 Connection quality UI initialized');
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Show the connection quality indicator
 */
export function show(): void {
  if (!container) return;
  
  container.classList.remove('hidden');
  requestAnimationFrame(() => {
    container?.classList.add('visible');
  });
}

/**
 * Hide the connection quality indicator
 */
export function hide(): void {
  if (!container) return;
  
  container.classList.remove('visible');
  
  setTimeout(() => {
    container?.classList.add('hidden');
  }, 300);
}

/**
 * Set the connection quality level
 */
export function setQuality(quality: ConnectionQuality): void {
  if (!container) return;
  
  currentQuality = quality;
  
  // Remove all quality classes
  container.classList.remove('excellent', 'good', 'fair', 'poor', 'disconnected');
  
  // Add new quality class
  container.classList.add(quality);
  
  // Update text
  if (qualityTextElement) {
    const texts: Record<ConnectionQuality, string> = {
      excellent: 'Excellent',
      good: 'Good',
      fair: 'Fair',
      poor: 'Poor',
      disconnected: 'Disconnected',
    };
    qualityTextElement.textContent = texts[quality];
  }
}

/**
 * Get current quality
 */
export function getQuality(): ConnectionQuality {
  return currentQuality;
}

/**
 * Update quality based on latency (in ms)
 */
export function updateFromLatency(latencyMs: number): void {
  let quality: ConnectionQuality;
  
  if (latencyMs < 100) {
    quality = 'excellent';
  } else if (latencyMs < 250) {
    quality = 'good';
  } else if (latencyMs < 500) {
    quality = 'fair';
  } else {
    quality = 'poor';
  }
  
  setQuality(quality);
}

// ============================================================================
// CLEANUP
// ============================================================================

export function dispose(): void {
  if (container && container.parentNode === document.body) {
    // Only remove if we created it
    const originalElement = document.getElementById('connectionQuality');
    if (!originalElement) {
      container.remove();
    }
  }
  
  container = null;
  qualityTextElement = null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const connectionQualityUI = {
  init: initConnectionQualityUI,
  show,
  hide,
  setQuality,
  getQuality,
  updateFromLatency,
  dispose,
};

