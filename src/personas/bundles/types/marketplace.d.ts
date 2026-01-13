/**
 * Marketplace Types
 *
 * Configuration for persona discovery and distribution.
 * Inspired by Claude Code's plugin marketplace.
 */
/**
 * Marketplace configuration for persona discovery and distribution
 */
export interface BundleMarketplaceConfig {
    display_name: string;
    short_description: string;
    long_description?: string;
    category: 'finance' | 'health' | 'productivity' | 'lifestyle' | 'education' | 'entertainment' | 'custom';
    tags: string[];
    icon?: string;
    preview_image?: string;
    demo_video_url?: string;
    license: 'free' | 'premium' | 'enterprise' | 'custom';
    price?: number;
    min_version?: string;
    max_version?: string;
    downloads?: number;
    rating?: number;
    reviews_count?: number;
    loading_tiers?: {
        tier1_metadata_kb?: number;
        tier2_instructions_kb?: number;
        tier3_resources_kb?: number;
    };
}
//# sourceMappingURL=marketplace.d.ts.map