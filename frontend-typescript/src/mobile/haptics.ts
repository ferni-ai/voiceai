/**
 * Mobile Haptics System
 * 
 * Provides native-feeling haptic feedback for the Ferni mobile apps.
 * Uses Capacitor Haptics plugin on native, falls back gracefully on web.
 * 
 * NOTE: @capacitor/core and @capacitor/haptics are optional dependencies
 * only needed when building native mobile apps. They are dynamically imported.
 */

// Capacitor is an optional dependency for native mobile builds
import { Capacitor } from '@capacitor/core';
import { createLogger } from '../utils/logger.js';

const log = createLogger('Haptics');

// Types for haptic patterns
type NotificationType = 'success' | 'warning' | 'error';

// Capacitor Haptics interface (for type safety without import)
interface HapticsPlugin {
  impact: (options: { style: string }) => Promise<void>;
  notification: (options: { type: string }) => Promise<void>;
  vibrate: (options?: { duration?: number }) => Promise<void>;
  selectionStart: () => Promise<void>;
  selectionChanged: () => Promise<void>;
  selectionEnd: () => Promise<void>;
}

// ============================================================================
// HAPTICS SERVICE
// ============================================================================

class MobileHapticsService {
  private haptics: HapticsPlugin | null = null;
  private enabled = true;
  private initialized = false;

  /**
   * Initialize haptics - call once at app startup
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    if (Capacitor.isNativePlatform()) {
      try {
        // @capacitor/haptics is an optional dependency for native mobile builds
        const { Haptics } = await import('@capacitor/haptics');
        this.haptics = Haptics as unknown as HapticsPlugin;
        this.initialized = true;
        log.debug('[Haptics] Initialized for native platform');
      } catch (error) {
        log.warn('[Haptics] Failed to initialize:', error);
      }
    } else {
      log.debug('[Haptics] Running in web mode (no haptics)');
      this.initialized = true;
    }

    // Load user preference
    const storedPref = localStorage.getItem('ferni_haptics_enabled');
    if (storedPref !== null) {
      this.enabled = storedPref === 'true';
    }
  }

  /**
   * Enable or disable haptics
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    localStorage.setItem('ferni_haptics_enabled', String(enabled));
  }

  /**
   * Check if haptics are available and enabled
   */
  isAvailable(): boolean {
    return this.initialized && this.haptics !== null && this.enabled;
  }

  // ==========================================================================
  // BASIC HAPTICS
  // ==========================================================================

  /**
   * Light tap - for subtle UI interactions
   */
  async tap(): Promise<void> {
    if (!this.isAvailable()) return;
    await this.haptics!.impact({ style: 'Light' });
  }

  /**
   * Medium impact - for confirmations
   */
  async confirm(): Promise<void> {
    if (!this.isAvailable()) return;
    await this.haptics!.impact({ style: 'Medium' });
  }

  /**
   * Heavy impact - for significant actions
   */
  async heavy(): Promise<void> {
    if (!this.isAvailable()) return;
    await this.haptics!.impact({ style: 'Heavy' });
  }

  /**
   * Notification feedback
   */
  async notification(type: NotificationType): Promise<void> {
    if (!this.isAvailable()) return;
    const typeMap: Record<NotificationType, string> = {
      success: 'Success',
      warning: 'Warning',
      error: 'Error',
    };
    await this.haptics!.notification({ type: typeMap[type] });
  }

  /**
   * Custom vibration duration
   */
  async vibrate(durationMs: number = 50): Promise<void> {
    if (!this.isAvailable()) return;
    await this.haptics!.vibrate({ duration: durationMs });
  }

  // ==========================================================================
  // SELECTION HAPTICS
  // ==========================================================================

  /**
   * Start a selection gesture (e.g., dragging slider)
   */
  async selectionStart(): Promise<void> {
    if (!this.isAvailable()) return;
    await this.haptics!.selectionStart();
  }

  /**
   * Selection value changed (e.g., slider tick)
   */
  async selectionChanged(): Promise<void> {
    if (!this.isAvailable()) return;
    await this.haptics!.selectionChanged();
  }

  /**
   * End selection gesture
   */
  async selectionEnd(): Promise<void> {
    if (!this.isAvailable()) return;
    await this.haptics!.selectionEnd();
  }

  // ==========================================================================
  // FERNI-SPECIFIC PATTERNS
  // ==========================================================================

  /**
   * Voice activation - strong feedback when user starts speaking
   */
  async voiceStart(): Promise<void> {
    if (!this.isAvailable()) return;
    await this.haptics!.impact({ style: 'Heavy' });
  }

  /**
   * Voice deactivation - subtle feedback when listening stops
   */
  async voiceEnd(): Promise<void> {
    if (!this.isAvailable()) return;
    await this.haptics!.impact({ style: 'Light' });
  }

  /**
   * Persona switch - double tap pattern
   */
  async personaChange(): Promise<void> {
    if (!this.isAvailable()) return;
    await this.haptics!.impact({ style: 'Medium' });
    setTimeout(async () => {
      await this.haptics!.impact({ style: 'Light' });
    }, 80);
  }

  /**
   * Handoff to another persona - cascading pattern
   */
  async handoff(): Promise<void> {
    if (!this.isAvailable()) return;
    await this.haptics!.impact({ style: 'Heavy' });
    setTimeout(async () => {
      await this.haptics!.impact({ style: 'Medium' });
    }, 100);
    setTimeout(async () => {
      await this.haptics!.impact({ style: 'Light' });
    }, 200);
  }

  /**
   * Success feedback - achievement unlocked, goal reached
   */
  async success(): Promise<void> {
    if (!this.isAvailable()) return;
    await this.haptics!.notification({ type: 'Success' });
  }

  /**
   * Error feedback - something went wrong
   */
  async error(): Promise<void> {
    if (!this.isAvailable()) return;
    await this.haptics!.notification({ type: 'Error' });
  }

  /**
   * Connection established - WebRTC/LiveKit connected
   */
  async connected(): Promise<void> {
    if (!this.isAvailable()) return;
    await this.haptics!.impact({ style: 'Medium' });
    setTimeout(async () => {
      await this.haptics!.notification({ type: 'Success' });
    }, 100);
  }

  /**
   * Disconnected - session ended
   */
  async disconnected(): Promise<void> {
    if (!this.isAvailable()) return;
    await this.haptics!.vibrate({ duration: 100 });
  }

  /**
   * Milestone celebration - big achievement
   */
  async celebrate(): Promise<void> {
    if (!this.isAvailable()) return;
    // Staggered celebration pattern
    await this.haptics!.impact({ style: 'Heavy' });
    setTimeout(async () => {
      await this.haptics!.notification({ type: 'Success' });
    }, 150);
    setTimeout(async () => {
      await this.haptics!.impact({ style: 'Light' });
    }, 300);
    setTimeout(async () => {
      await this.haptics!.impact({ style: 'Light' });
    }, 400);
  }

  /**
   * Thinking indicator - subtle pulse while AI is processing
   */
  async thinking(): Promise<void> {
    if (!this.isAvailable()) return;
    await this.haptics!.impact({ style: 'Light' });
  }

  /**
   * Button press feedback
   */
  async buttonPress(): Promise<void> {
    if (!this.isAvailable()) return;
    await this.haptics!.impact({ style: 'Light' });
  }

  /**
   * Toggle switch feedback
   */
  async toggle(): Promise<void> {
    if (!this.isAvailable()) return;
    await this.haptics!.impact({ style: 'Medium' });
  }

  /**
   * Pull to refresh trigger
   */
  async pullRefresh(): Promise<void> {
    if (!this.isAvailable()) return;
    await this.haptics!.impact({ style: 'Medium' });
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const MobileHaptics = new MobileHapticsService();

/**
 * Initialize haptics at app startup
 */
export async function initializeHaptics(): Promise<void> {
  await MobileHaptics.init();
}

export default MobileHaptics;


