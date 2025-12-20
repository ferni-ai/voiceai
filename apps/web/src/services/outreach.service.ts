/**
 * Outreach Service
 *
 * Frontend service for milestone celebrations, welcome sequences, and streak reminders.
 * Calls the backend /api/outreach endpoints.
 *
 * BETTER THAN HUMAN:
 * - We reach out with warmth, not marketing speak
 * - We celebrate your growth, not promote our product
 * - We're there when you need us, not when we want attention
 */

import { getApiHeadersAsync } from '../utils/api-helpers.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('OutreachService');

// ============================================================================
// TYPES
// ============================================================================

export interface OutreachPreferences {
  emailEnabled: boolean;
  smsEnabled: boolean;
  weeklyRecap: boolean;
  monthlyRecap: boolean;
  streakReminders: boolean;
  milestoneNotifications: boolean;
  preferredChannel?: 'sms' | 'email' | 'call';
  quietHours?: { start: number; end: number };
  timezone?: string;
}

export interface ContactInfo {
  phone?: string;
  email?: string;
  name?: string;
  preferredMethod?: 'sms' | 'email' | 'call';
  timezone?: string;
}

export interface MilestoneOutreachData {
  milestoneId: string;
  milestoneName: string;
  milestoneMessage: string;
  daysTogether?: number;
  streak?: number;
}

export interface OutreachResult {
  success: boolean;
  message?: string;
  error?: string;
  results?: {
    email?: boolean;
    sms?: boolean;
  };
}

// ============================================================================
// API
// ============================================================================

const API_BASE = '/api/outreach';

// Helper to make authenticated API calls
async function apiCall<T>(
  endpoint: string,
  method: 'GET' | 'POST' = 'GET',
  body?: unknown
): Promise<T> {
  // Get authenticated headers (includes X-User-Id and Firebase token)
  const headers = await getApiHeadersAsync();
  
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers,
    credentials: 'include', // Include auth cookies
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// ============================================================================
// SERVICE
// ============================================================================

class OutreachService {
  private localPreferences: OutreachPreferences = {
    emailEnabled: true,
    smsEnabled: true,
    weeklyRecap: true,
    monthlyRecap: true,
    streakReminders: true,
    milestoneNotifications: true,
  };

  constructor() {
    this.loadLocalPreferences();
  }

  // ============================================================================
  // MILESTONE OUTREACH
  // ============================================================================

  /**
   * Send milestone celebration via email/SMS
   * Uses the backend to send - respects user preferences
   */
  async sendMilestoneCelebration(data: MilestoneOutreachData): Promise<OutreachResult> {
    if (!this.localPreferences.milestoneNotifications) {
      log.debug('Milestone notifications disabled locally, skipping');
      return { success: true, message: 'Notifications disabled' };
    }

    try {
      const result = await apiCall<OutreachResult>('/milestone', 'POST', data);
      log.info('Milestone outreach sent:', data.milestoneId, result);
      return result;
    } catch (error) {
      log.error('Failed to send milestone outreach:', error);
      return { success: false, error: String(error) };
    }
  }

  // ============================================================================
  // WELCOME SEQUENCE
  // ============================================================================

  /**
   * Trigger welcome email sequence
   */
  async sendWelcomeEmail(sequence: 'day0' | 'day3' | 'week' = 'day0'): Promise<OutreachResult> {
    try {
      const result = await apiCall<OutreachResult>('/welcome', 'POST', { sequence });
      log.info('Welcome email sent:', sequence, result);
      return result;
    } catch (error) {
      log.error('Failed to send welcome email:', error);
      return { success: false, error: String(error) };
    }
  }

  // ============================================================================
  // STREAK REMINDERS
  // ============================================================================

  /**
   * Send streak saver SMS reminder
   */
  async sendStreakReminder(streak: number): Promise<OutreachResult> {
    if (!this.localPreferences.streakReminders) {
      log.debug('Streak reminders disabled locally, skipping');
      return { success: true, message: 'Reminders disabled' };
    }

    try {
      const result = await apiCall<OutreachResult>('/streak-reminder', 'POST', { streak });
      log.info('Streak reminder sent:', streak, result);
      return result;
    } catch (error) {
      log.error('Failed to send streak reminder:', error);
      return { success: false, error: String(error) };
    }
  }

  // ============================================================================
  // CONTACT INFO
  // ============================================================================

  /**
   * Set user's contact info for outreach
   */
  async setContactInfo(info: ContactInfo): Promise<OutreachResult> {
    try {
      const result = await apiCall<OutreachResult>('/contact', 'POST', info);
      log.info('Contact info updated');
      return result;
    } catch (error) {
      log.error('Failed to set contact info:', error);
      return { success: false, error: String(error) };
    }
  }

  // ============================================================================
  // PHONE VERIFICATION
  // ============================================================================

  /**
   * Send phone verification code
   */
  async sendVerificationCode(phone: string): Promise<OutreachResult> {
    try {
      const result = await apiCall<OutreachResult>('/verify-phone', 'POST', { phone });
      log.info('Verification code sent');
      return result;
    } catch (error) {
      log.error('Failed to send verification code:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Verify phone with code
   */
  async verifyPhone(phone: string, code: string): Promise<OutreachResult> {
    try {
      const result = await apiCall<OutreachResult>('/verify-phone/confirm', 'POST', {
        phone,
        code,
      });
      log.info('Phone verified');
      return result;
    } catch (error) {
      log.error('Failed to verify phone:', error);
      return { success: false, error: String(error) };
    }
  }

  // ============================================================================
  // PREFERENCES (Backend-synced)
  // ============================================================================

  /**
   * Get preferences from backend
   */
  async fetchPreferences(): Promise<OutreachPreferences> {
    try {
      const result = await apiCall<{
        success: boolean;
        preferences: Partial<OutreachPreferences>;
        allowedChannels: string[];
        outreachEnabled: boolean;
      }>('/preferences', 'GET');

      // Merge with local prefs
      this.localPreferences = {
        ...this.localPreferences,
        ...result.preferences,
        emailEnabled: result.allowedChannels.includes('email'),
        smsEnabled: result.allowedChannels.includes('sms'),
      };

      this.saveLocalPreferences();
      return this.localPreferences;
    } catch (error) {
      log.warn('Failed to fetch preferences, using local:', error);
      return this.localPreferences;
    }
  }

  /**
   * Update preferences on backend
   */
  async updatePreferences(prefs: Partial<OutreachPreferences>): Promise<void> {
    // Update local immediately
    this.localPreferences = { ...this.localPreferences, ...prefs };
    this.saveLocalPreferences();

    // Sync to backend
    try {
      const backendPrefs: Record<string, unknown> = {};

      // Map to backend preference format
      if (prefs.preferredChannel) backendPrefs.preferredChannel = prefs.preferredChannel;
      if (prefs.quietHours) backendPrefs.quietHours = prefs.quietHours;
      if (prefs.timezone) backendPrefs.timezone = prefs.timezone;

      // Disabled channels
      const disabled: string[] = [];
      if (prefs.emailEnabled === false) disabled.push('email');
      if (prefs.smsEnabled === false) disabled.push('sms');
      if (disabled.length > 0) backendPrefs.disabledChannels = disabled;

      await apiCall('/preferences', 'POST', { preferences: backendPrefs });
      log.info('Preferences synced to backend');
    } catch (error) {
      log.error('Failed to sync preferences to backend:', error);
    }
  }

  /**
   * Get current preferences (local)
   */
  getPreferences(): OutreachPreferences {
    return { ...this.localPreferences };
  }

  // ============================================================================
  // LOCAL STORAGE
  // ============================================================================

  private loadLocalPreferences(): void {
    try {
      const saved = localStorage.getItem('ferni-outreach-prefs');
      if (saved) {
        this.localPreferences = { ...this.localPreferences, ...JSON.parse(saved) };
      }
    } catch {
      // Use defaults
    }
  }

  private saveLocalPreferences(): void {
    try {
      localStorage.setItem('ferni-outreach-prefs', JSON.stringify(this.localPreferences));
    } catch {
      // Storage unavailable
    }
  }

  // ============================================================================
  // TEST OUTREACH (Dev only)
  // ============================================================================

  /**
   * Send test outreach message (dev only)
   */
  async sendTestMessage(
    channel: 'sms' | 'email' | 'call',
    message: string,
    subject?: string
  ): Promise<OutreachResult> {
    try {
      const result = await apiCall<OutreachResult>('/test/send', 'POST', {
        channel,
        message,
        subject,
      });
      log.info('Test message sent:', channel, result);
      return result;
    } catch (error) {
      log.error('Failed to send test message:', error);
      return { success: false, error: String(error) };
    }
  }
}

// ============================================================================
// SINGLETON & EXPORTS
// ============================================================================

let instance: OutreachService | null = null;

export function getOutreachService(): OutreachService {
  if (!instance) {
    instance = new OutreachService();
  }
  return instance;
}

export const outreachService = {
  // Milestone celebrations
  sendMilestoneCelebration: (data: MilestoneOutreachData) =>
    getOutreachService().sendMilestoneCelebration(data),

  // Welcome sequence
  sendWelcomeEmail: (sequence?: 'day0' | 'day3' | 'week') =>
    getOutreachService().sendWelcomeEmail(sequence),

  // Streak reminders
  sendStreakReminder: (streak: number) => getOutreachService().sendStreakReminder(streak),

  // Contact info
  setContactInfo: (info: ContactInfo) => getOutreachService().setContactInfo(info),

  // Phone verification
  sendVerificationCode: (phone: string) => getOutreachService().sendVerificationCode(phone),
  verifyPhone: (phone: string, code: string) => getOutreachService().verifyPhone(phone, code),

  // Preferences
  fetchPreferences: () => getOutreachService().fetchPreferences(),
  updatePreferences: (prefs: Partial<OutreachPreferences>) =>
    getOutreachService().updatePreferences(prefs),
  getPreferences: () => getOutreachService().getPreferences(),

  // Test (dev only)
  sendTestMessage: (channel: 'sms' | 'email' | 'call', message: string, subject?: string) =>
    getOutreachService().sendTestMessage(channel, message, subject),
};

export default outreachService;
