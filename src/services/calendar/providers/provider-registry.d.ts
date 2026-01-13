/**
 * Calendar Provider Registry
 *
 * Central registry for all calendar provider adapters.
 * Use this to get provider instances and check configurations.
 *
 * @module calendar/providers/provider-registry
 */
import type { CalendarProviderAdapter, CalendarProvider } from '../types.js';
/**
 * Get a specific provider adapter
 */
export declare function getProvider(provider: CalendarProvider): CalendarProviderAdapter | null;
/**
 * Get all provider adapters
 */
export declare function getAllProviders(): CalendarProviderAdapter[];
/**
 * Get all configured providers (have credentials)
 */
export declare function getConfiguredProviders(): CalendarProviderAdapter[];
/**
 * Check if a provider is configured
 */
export declare function isProviderConfigured(provider: CalendarProvider): boolean;
/**
 * Get provider display info
 */
export declare function getProviderInfo(provider: CalendarProvider): {
    id: CalendarProvider;
    name: string;
    icon: string;
    description: string;
    configured: boolean;
    authType: 'oauth' | 'credentials' | 'native';
};
/**
 * Get all provider info
 */
export declare function getAllProviderInfo(): ReturnType<typeof getProviderInfo>[];
declare const _default: {
    getProvider: typeof getProvider;
    getAllProviders: typeof getAllProviders;
    getConfiguredProviders: typeof getConfiguredProviders;
    isProviderConfigured: typeof isProviderConfigured;
    getProviderInfo: typeof getProviderInfo;
    getAllProviderInfo: typeof getAllProviderInfo;
};
export default _default;
//# sourceMappingURL=provider-registry.d.ts.map