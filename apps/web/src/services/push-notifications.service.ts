/**
 * Push Notifications Service
 *
 * Web push through the service worker (/sw.js) and the browser's PushManager.
 * The iOS app is native Swift (apps/ios-native) and does its own notifications.
 *
 * NOTIFICATION TYPES:
 *   - Ritual reminders (daily practice prompts)
 *   - Streak milestones (celebration triggers)
 *   - Prediction results (outcomes ready)
 *   - Team huddle invites (multi-persona events)
 *   - Ferni check-ins (proactive engagement)
 */

import { createLogger } from '../utils/logger.js';
import { isDevelopment } from '../utils/environment.js';
import { apiGet, apiPost } from '../utils/api.js';
import { openPanelForNotificationType } from './notification-navigation.js';

const log = createLogger('PushNotify');

// ============================================================================
// TYPES
// ============================================================================

export type NotificationType =
  | 'ritual_reminder'
  | 'streak_milestone'
  | 'prediction_result'
  | 'team_huddle'
  | 'ferni_checkin'
  | 'engagement'
  | 'general';

export interface PushNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  badge?: number;
  sound?: boolean;
  vibrate?: boolean;
  scheduledAt?: Date;
  personaId?: string;
}

export interface NotificationPreferences {
  enabled: boolean;
  ritualReminders: boolean;
  streakMilestones: boolean;
  predictionResults: boolean;
  teamHuddles: boolean;
  ferniCheckins: boolean;
  quietHoursStart?: string; // HH:MM format
  quietHoursEnd?: string;
}

export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  platform: 'web';
}

type NotificationCallback = (notification: PushNotification) => void;

// ============================================================================
// DEFAULT PREFERENCES
// ============================================================================

const DEFAULT_PREFERENCES: NotificationPreferences = {
  enabled: true,
  ritualReminders: true,
  streakMilestones: true,
  predictionResults: true,
  teamHuddles: true,
  ferniCheckins: true,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
};

// ============================================================================
// NOTIFICATION TEMPLATES
// ============================================================================

const NOTIFICATION_TEMPLATES: Record<NotificationType, { icon: string; tag: string }> = {
  ritual_reminder: { icon: '/icons/ritual-192.png', tag: 'ritual' },
  streak_milestone: { icon: '/icons/streak-192.png', tag: 'streak' },
  prediction_result: { icon: '/icons/prediction-192.png', tag: 'prediction' },
  team_huddle: { icon: '/icons/team-192.png', tag: 'huddle' },
  ferni_checkin: { icon: '/icons/ferni-192.png', tag: 'checkin' },
  engagement: { icon: '/icons/engagement-192.png', tag: 'engagement' },
  general: { icon: '/icons/icon-192.png', tag: 'general' },
};

// ============================================================================
// PUSH NOTIFICATIONS SERVICE
// ============================================================================

class PushNotificationsService {
  private swRegistration: ServiceWorkerRegistration | null = null;
  private subscription: PushSubscription | null = null;
  private preferences: NotificationPreferences = DEFAULT_PREFERENCES;
  private callbacks: Map<NotificationType | 'all', NotificationCallback[]> = new Map();
  private initialized = false;

  /**
   * Initialize the push notification service
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) return true;

    // Load saved preferences
    this.loadPreferences();

    // Check if notifications are supported
    if (!this.isSupported()) {
      log.warn('[PushNotifications] Not supported on this platform');
      return false;
    }

    try {
      await this.initializeWeb();
      this.initialized = true;
      log.debug('[PushNotifications] Initialized successfully');
      return true;
    } catch (error) {
      log.error('[PushNotifications] Initialization failed:', error);
      return false;
    }
  }

  /**
   * Check if push notifications are supported
   */
  isSupported(): boolean {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  /**
   * Request permission for notifications
   */
  async requestPermission(): Promise<'granted' | 'denied' | 'default'> {
    return this.requestWebPermission();
  }

  /**
   * Get current permission status
   */
  getPermissionStatus(): 'granted' | 'denied' | 'default' {
    return Notification.permission;
  }

  /**
   * Subscribe to push notifications
   */
  async subscribe(): Promise<PushSubscription | null> {
    const permission = await this.requestPermission();
    if (permission !== 'granted') {
      log.debug('[PushNotifications] Permission not granted');
      return null;
    }

    return this.subscribeWeb();
  }

  /**
   * Unsubscribe from push notifications
   */
  async unsubscribe(): Promise<boolean> {
    return this.unsubscribeWeb();
  }

  /**
   * Show a local notification immediately
   */
  async showLocalNotification(notification: PushNotification): Promise<void> {
    // Check quiet hours
    if (this.isQuietHours()) {
      log.debug('[PushNotifications] Quiet hours active, skipping notification');
      return;
    }

    // Check preferences
    if (!this.shouldShowNotification(notification.type)) {
      return;
    }

    await this.showWebNotification(notification);

    // Trigger callbacks
    this.triggerCallbacks(notification);
  }

  /**
   * Schedule a notification for later
   */
  async scheduleNotification(notification: PushNotification): Promise<string> {
    const id = notification.id ?? `notif-${Date.now()}`;

    // Web has no scheduled notifications: show it from a timer while the page is open
    const delay = notification.scheduledAt ? notification.scheduledAt.getTime() - Date.now() : 0;
    if (delay > 0) {
      setTimeout(() => {
        void this.showLocalNotification({ ...notification, id });
      }, delay);
    } else {
      await this.showLocalNotification({ ...notification, id });
    }

    return id;
  }

  /**
   * Get/set notification preferences
   */
  getPreferences(): NotificationPreferences {
    return { ...this.preferences };
  }

  setPreferences(prefs: Partial<NotificationPreferences>): void {
    this.preferences = { ...this.preferences, ...prefs };
    this.savePreferences();
  }

  /**
   * Register callback for notification events
   */
  onNotification(type: NotificationType | 'all', callback: NotificationCallback): () => void {
    const callbacks = this.callbacks.get(type) ?? [];
    callbacks.push(callback);
    this.callbacks.set(type, callbacks);

    return () => {
      const cbs = this.callbacks.get(type) ?? [];
      const idx = cbs.indexOf(callback);
      if (idx >= 0) cbs.splice(idx, 1);
    };
  }

  // ============================================================================
  // WEB PUSH IMPLEMENTATION
  // ============================================================================

  private async initializeWeb(): Promise<void> {
    // Register service worker
    if ('serviceWorker' in navigator) {
      this.swRegistration = await navigator.serviceWorker.register('/sw.js');
      log.debug('[PushNotifications] Service worker registered');

      // Listen for messages from service worker
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'notification-click') {
          this.handleNotificationClick(event.data.notification);
        }
      });
    }
  }

  private async requestWebPermission(): Promise<'granted' | 'denied' | 'default'> {
    try {
      const permission = await Notification.requestPermission();
      return permission;
    } catch {
      return 'denied';
    }
  }

  private async subscribeWeb(): Promise<PushSubscription | null> {
    if (!this.swRegistration) return null;

    try {
      const vapidPublicKey = await this.getVapidPublicKey();

      const pushSubscription = await this.swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(vapidPublicKey).buffer as ArrayBuffer,
      });

      const keys = pushSubscription.toJSON().keys;
      this.subscription = {
        endpoint: pushSubscription.endpoint,
        keys: {
          p256dh: keys?.p256dh ?? '',
          auth: keys?.auth ?? '',
        },
        platform: 'web',
      };

      // Send subscription to server
      await this.sendSubscriptionToServer(this.subscription);

      return this.subscription;
    } catch (error) {
      log.error('[PushNotifications] Web subscription failed:', error);
      return null;
    }
  }

  private async unsubscribeWeb(): Promise<boolean> {
    if (!this.swRegistration) return false;

    try {
      const subscription = await this.swRegistration.pushManager.getSubscription();
      if (subscription) {
        await apiPost('/api/push/unsubscribe', { endpoint: subscription.endpoint });
        await subscription.unsubscribe();
        this.subscription = null;
        return true;
      }
    } catch (error) {
      log.error('[PushNotifications] Web unsubscribe failed:', error);
    }
    return false;
  }

  private async showWebNotification(notification: PushNotification): Promise<void> {
    if (!this.swRegistration) {
      // Fallback to basic notification
      const n = new Notification(notification.title, {
        body: notification.body,
        icon: NOTIFICATION_TEMPLATES[notification.type]?.icon,
        tag: notification.id,
        data: notification.data,
      });
      n.onclick = () => this.handleNotificationClick(notification);
      return;
    }

    const template = NOTIFICATION_TEMPLATES[notification.type] ?? NOTIFICATION_TEMPLATES.general;

    await this.swRegistration.showNotification(notification.title, {
      body: notification.body,
      icon: template.icon,
      badge: '/icons/badge-72.png',
      tag: notification.id ?? template.tag,
      data: { ...notification.data, notificationId: notification.id, type: notification.type },
      // vibrate: notification.vibrate !== false ? [200, 100, 200] : undefined, // Not in NotificationOptions
      requireInteraction: notification.type === 'team_huddle',
    });
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private handleNotificationClick(notification: PushNotification): void {
    log.debug('[PushNotifications] Notification clicked:', notification);

    // Trigger click callbacks
    this.triggerCallbacks(notification);

    // Open the panel this type points at, or just focus the app
    if (!openPanelForNotificationType(notification.type)) window.focus();
  }

  private triggerCallbacks(notification: PushNotification): void {
    // Type-specific callbacks
    const typeCallbacks = this.callbacks.get(notification.type) ?? [];
    typeCallbacks.forEach((cb) => cb(notification));

    // Global callbacks
    const allCallbacks = this.callbacks.get('all') ?? [];
    allCallbacks.forEach((cb) => cb(notification));
  }

  private shouldShowNotification(type: NotificationType): boolean {
    if (!this.preferences.enabled) return false;

    switch (type) {
      case 'ritual_reminder':
        return this.preferences.ritualReminders;
      case 'streak_milestone':
        return this.preferences.streakMilestones;
      case 'prediction_result':
        return this.preferences.predictionResults;
      case 'team_huddle':
        return this.preferences.teamHuddles;
      case 'ferni_checkin':
        return this.preferences.ferniCheckins;
      default:
        return true;
    }
  }

  private isQuietHours(): boolean {
    if (!this.preferences.quietHoursStart || !this.preferences.quietHoursEnd) {
      return false;
    }

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const [startH = 0, startM = 0] = this.preferences.quietHoursStart.split(':').map(Number);
    const [endH = 0, endM = 0] = this.preferences.quietHoursEnd.split(':').map(Number);

    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    // Handle overnight quiet hours (e.g., 22:00 to 08:00)
    if (startMinutes > endMinutes) {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }

    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  private loadPreferences(): void {
    const saved = localStorage.getItem('ferni:notification-prefs');
    if (saved) {
      try {
        this.preferences = { ...DEFAULT_PREFERENCES, ...JSON.parse(saved) };
      } catch {
        this.preferences = DEFAULT_PREFERENCES;
      }
    }
  }

  private savePreferences(): void {
    localStorage.setItem('ferni:notification-prefs', JSON.stringify(this.preferences));
  }

  /**
   * Get VAPID public key for web push subscriptions.
   *
   * PRODUCTION BEHAVIOR:
   * - Fetches from /api/push/vapid-key endpoint
   * - Throws error if key is not available (push notifications won't work)
   *
   * DEVELOPMENT BEHAVIOR:
   * - Uses Vite's import.meta.env.VITE_VAPID_PUBLIC_KEY if set
   * - Falls back to demo key for local testing only
   */
  private async getVapidPublicKey(): Promise<string> {
    // Try environment variable first (works in both dev and prod builds)
    const envKey = (import.meta as unknown as { env?: Record<string, string> }).env
      ?.VITE_VAPID_PUBLIC_KEY;
    if (envKey) {
      return envKey;
    }

    // In production, fetch from server
    if (!isDevelopment()) {
      try {
        const response = await apiGet<{ publicKey: string }>('/api/push/vapid-key');
        if (!response.ok || !response.data) {
          throw new Error(`Failed to fetch VAPID key: ${response.status}`);
        }
        if (!response.data.publicKey) {
          throw new Error('VAPID key not configured on server');
        }
        return response.data.publicKey;
      } catch (error) {
        log.error('Failed to get VAPID public key - push notifications will not work:', error);
        throw error;
      }
    }

    // Development only - demo key for local testing
    // WARNING: This key is public and should NOT be used in production
    log.warn('Using demo VAPID key for development - push notifications are for testing only');
    return 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
  }

  /** Throws when the server didn't store it: a subscription it can't see never gets a push. */
  private async sendSubscriptionToServer(subscription: PushSubscription): Promise<void> {
    const response = await apiPost('/api/push/subscribe', subscription);
    if (!response.ok) throw new Error(`Push subscribe failed: ${response.status}`);
  }

  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let instance: PushNotificationsService | null = null;

export function getPushNotificationsService(): PushNotificationsService {
  if (!instance) {
    instance = new PushNotificationsService();
  }
  return instance;
}

export async function initPushNotifications(): Promise<boolean> {
  return getPushNotificationsService().initialize();
}

export async function requestNotificationPermission(): Promise<'granted' | 'denied' | 'default'> {
  return getPushNotificationsService().requestPermission();
}

export async function subscribeToPush(): Promise<PushSubscription | null> {
  return getPushNotificationsService().subscribe();
}

export async function showNotification(notification: PushNotification): Promise<void> {
  return getPushNotificationsService().showLocalNotification(notification);
}

export async function scheduleNotification(notification: PushNotification): Promise<string> {
  return getPushNotificationsService().scheduleNotification(notification);
}

export default PushNotificationsService;
