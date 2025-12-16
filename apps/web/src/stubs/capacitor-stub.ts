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
  getProducts: async () => ({ products: [] }),
  purchaseProduct: async () => ({ success: false, error: 'Not available on web' }),
  restorePurchases: async () => ({ success: false, error: 'Not available on web' }),
  getSubscriptionStatus: async () => ({ isActive: false }),
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

export default { FerniPurchases, Browser };
