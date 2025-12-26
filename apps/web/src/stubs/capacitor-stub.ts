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
  initialize: () => Promise.resolve({ success: false, error: 'Not available on web' }),
  getProducts: (_options: { productIds: string[] }) => Promise.resolve({ products: [] }),
  purchase: (_options: { productId: string }) => Promise.resolve({ success: false, error: 'Not available on web' }),
  restorePurchases: () => Promise.resolve({ success: false, transactions: [] }),
  getActiveSubscriptions: () => Promise.resolve({ subscriptions: [] }),
};

// Stub for @capacitor/browser
export const Browser = {
  open: (_options: { url: string }) => {
    // On web, just open in new tab
    if (typeof window !== 'undefined') {
      window.open(_options.url, '_blank');
    }
    return Promise.resolve();
  },
  close: () => Promise.resolve(),
  addListener: () => ({ remove: () => Promise.resolve() }),
};

// Stub for @capacitor/push-notifications
export const PushNotifications = {
  requestPermissions: () => Promise.resolve({ receive: 'granted' as const }),
  register: () => Promise.resolve(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addListener: (_event: string, _callback: (data: any) => void) => ({ remove: () => Promise.resolve() }),
  removeAllListeners: () => Promise.resolve(),
  getDeliveredNotifications: () => Promise.resolve({ notifications: [] }),
  removeDeliveredNotifications: () => Promise.resolve(),
  removeAllDeliveredNotifications: () => Promise.resolve(),
  createChannel: () => Promise.resolve(),
  deleteChannel: () => Promise.resolve(),
  listChannels: () => Promise.resolve({ channels: [] }),
  checkPermissions: () => Promise.resolve({ receive: 'granted' as const }),
};

// Stub for @capacitor/local-notifications
export const LocalNotifications = {
  schedule: (_options: unknown) => Promise.resolve({ notifications: [] }),
  getPending: () => Promise.resolve({ notifications: [] }),
  cancel: (_options: unknown) => Promise.resolve(),
  registerActionTypes: () => Promise.resolve(),
  addListener: (_event: string, _callback: (data: unknown) => void) => ({ remove: () => Promise.resolve() }),
  removeAllListeners: () => Promise.resolve(),
  areEnabled: () => Promise.resolve({ value: false }),
  requestPermissions: () => Promise.resolve({ display: 'granted' as const }),
  checkPermissions: () => Promise.resolve({ display: 'granted' as const }),
  createChannel: () => Promise.resolve(),
  deleteChannel: () => Promise.resolve(),
  listChannels: () => Promise.resolve({ channels: [] }),
};

// Stub for @capacitor/core
export const Capacitor = {
  isNativePlatform: () => false,
  getPlatform: () => 'web',
  isPluginAvailable: () => false,
};

// Stub for @capacitor/haptics
export const Haptics = {
  impact: () => Promise.resolve(),
  notification: () => Promise.resolve(),
  vibrate: () => Promise.resolve(),
  selectionStart: () => Promise.resolve(),
  selectionChanged: () => Promise.resolve(),
  selectionEnd: () => Promise.resolve(),
};

export default { FerniPurchases, Browser, PushNotifications, LocalNotifications, Capacitor, Haptics };
