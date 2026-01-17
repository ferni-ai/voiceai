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

import { apiGet, apiPost } from '../utils/api.js';
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
      const response = await apiPost<OutreachResult>(`${API_BASE}/milestone`, data);
      if (!response.ok || !response.data) {
        log.error({ error: response.error }, 'Failed to send milestone outreach');
        return { success: false, error: response.error || 'API error' };
      }
      log.info('Milestone outreach sent:', data.milestoneId, response.data);
      return response.data;
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
      const response = await apiPost<OutreachResult>(`${API_BASE}/welcome`, { sequence });
      if (!response.ok || !response.data) {
        log.error({ error: response.error }, 'Failed to send welcome email');
        return { success: false, error: response.error || 'API error' };
      }
      log.info('Welcome email sent:', sequence, response.data);
      return response.data;
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
      const response = await apiPost<OutreachResult>(`${API_BASE}/streak-reminder`, { streak });
      if (!response.ok || !response.data) {
        log.error({ error: response.error }, 'Failed to send streak reminder');
        return { success: false, error: response.error || 'API error' };
      }
      log.info('Streak reminder sent:', streak, response.data);
      return response.data;
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
      const response = await apiPost<OutreachResult>(`${API_BASE}/contact`, info);
      if (!response.ok || !response.data) {
        log.error({ error: response.error }, 'Failed to set contact info');
        return { success: false, error: response.error || 'API error' };
      }
      log.info('Contact info updated');
      return response.data;
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
      const response = await apiPost<OutreachResult>(`${API_BASE}/verify-phone`, { phone });
      if (!response.ok || !response.data) {
        log.error({ error: response.error }, 'Failed to send verification code');
        return { success: false, error: response.error || 'API error' };
      }
      log.info('Verification code sent');
      return response.data;
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
      const response = await apiPost<OutreachResult>(`${API_BASE}/verify-phone/confirm`, {
        phone,
        code,
      });
      if (!response.ok || !response.data) {
        log.error({ error: response.error }, 'Failed to verify phone');
        return { success: false, error: response.error || 'API error' };
      }
      log.info('Phone verified');
      return response.data;
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
      const response = await apiGet<{
        success: boolean;
        preferences: Partial<OutreachPreferences>;
        allowedChannels: string[];
        outreachEnabled: boolean;
      }>(`${API_BASE}/preferences`);

      if (!response.ok || !response.data) {
        log.warn({ error: response.error }, 'Failed to fetch preferences, using local');
        return this.localPreferences;
      }

      const result = response.data;

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

      const response = await apiPost(`${API_BASE}/preferences`, { preferences: backendPrefs });
      if (!response.ok) {
        log.error({ error: response.error }, 'Failed to sync preferences to backend');
        return;
      }
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
      const response = await apiPost<OutreachResult>(`${API_BASE}/test/send`, {
        channel,
        message,
        subject,
      });
      if (!response.ok || !response.data) {
        log.error({ error: response.error }, 'Failed to send test message');
        return { success: false, error: response.error || 'API error' };
      }
      log.info('Test message sent:', channel, response.data);
      return response.data;
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
