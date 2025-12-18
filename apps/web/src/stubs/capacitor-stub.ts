/**
 * Capacitor Plugin Stub
 *
 * Provides empty implementations for native Capacitor plugins
 * that don't exist in web builds. This allows the dev server
 * to run without import errors.
 *
 * The actual services using these plugins handle the web case
 * gracefully and only use these features on native platforms.
 */

// Stub for @ferni/capacitor-purchases
export const FerniPurchases = {
  initialize: async () => ({ success: false, error: 'Not available on web' }),
  getProducts: async (_options: { productIds: string[] }) => ({ products: [] }),
  purchase: async (_options: { productId: string }) => ({ success: false, error: 'Not available on web' }),
  restorePurchases: async () => ({ success: false, transactions: [] }),
  getActiveSubscriptions: async () => ({ subscriptions: [] }),
};

// Stub for @capacitor/browser
export const Browser = {
  open: async (_options: { url: string }) => {
    // On web, just open in new tab
    if (typeof window !== 'undefined') {
      window.open(_options.url, '_blank');
    }
  },
  close: async () => {},
  addListener: () => ({ remove: async () => {} }),
};

// Stub for @capacitor/push-notifications
export const PushNotifications = {
  requestPermissions: async () => ({ receive: 'granted' as const }),
  register: async () => {},
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addListener: (_event: string, _callback: (data: any) => void) => ({ remove: async () => {} }),
  removeAllListeners: async () => {},
  getDeliveredNotifications: async () => ({ notifications: [] }),
  removeDeliveredNotifications: async () => {},
  removeAllDeliveredNotifications: async () => {},
  createChannel: async () => {},
  deleteChannel: async () => {},
  listChannels: async () => ({ channels: [] }),
  checkPermissions: async () => ({ receive: 'granted' as const }),
};

// Stub for @capacitor/local-notifications
export const LocalNotifications = {
  schedule: async (_options: unknown) => ({ notifications: [] }),
  getPending: async () => ({ notifications: [] }),
  cancel: async (_options: unknown) => {},
  registerActionTypes: async () => {},
  addListener: (_event: string, _callback: (data: unknown) => void) => ({ remove: async () => {} }),
  removeAllListeners: async () => {},
  areEnabled: async () => ({ value: false }),
  requestPermissions: async () => ({ display: 'granted' as const }),
  checkPermissions: async () => ({ display: 'granted' as const }),
  createChannel: async () => {},
  deleteChannel: async () => {},
  listChannels: async () => ({ channels: [] }),
};

// Stub for @capacitor/core
export const Capacitor = {
  isNativePlatform: () => false,
  getPlatform: () => 'web',
  isPluginAvailable: () => false,
};

// Stub for @capacitor/haptics
export const Haptics = {
  impact: async () => {},
  notification: async () => {},
  vibrate: async () => {},
  selectionStart: async () => {},
  selectionChanged: async () => {},
  selectionEnd: async () => {},
};

export default { FerniPurchases, Browser, PushNotifications, LocalNotifications, Capacitor, Haptics };
