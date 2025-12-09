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
  // Discovery metadata
  display_name: string;
  short_description: string; // Max 120 chars
  long_description?: string;
  category:
    | 'finance'
    | 'health'
    | 'productivity'
    | 'lifestyle'
    | 'education'
    | 'entertainment'
    | 'custom';
  tags: string[];

  // Showcase
  icon?: string;
  preview_image?: string;
  demo_video_url?: string;

  // Pricing and licensing
  license: 'free' | 'premium' | 'enterprise' | 'custom';
  price?: number;

  // Compatibility
  min_version?: string;
  max_version?: string;

  // Statistics (populated by marketplace)
  downloads?: number;
  rating?: number;
  reviews_count?: number;

  // Progressive disclosure hints
  loading_tiers?: {
    tier1_metadata_kb?: number;
    tier2_instructions_kb?: number;
    tier3_resources_kb?: number;
  };
}
