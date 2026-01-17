/**
 * Marketplace Listing Types
 *
 * Type definitions for marketplace listings displayed to users.
 */

import type {
  LicenseType,
  MarketplaceId,
  Pricing,
  PublisherId,
  SemVer,
  TrustLevel,
} from './core-types.js';

// ============================================================================
// MARKETPLACE LISTING
// ============================================================================

export interface MarketplaceListing {
  /** Item info */
  id: MarketplaceId;
  type: 'agent' | 'tool';
  name: string;
  displayName: string;
  version: SemVer;

  /** Publisher */
  publisher: {
    id: PublisherId;
    name: string;
    verified: boolean;
  };

  /** Description */
  description: {
    short: string;
    long: string;
  };

  /** Metadata */
  metadata: {
    category: string;
    tags: string[];
    icon?: string;
    colors?: {
      primary: string;
      secondary?: string;
    };
  };

  /** Trust level */
  trustLevel: TrustLevel;
  verified: boolean;

  /** Licensing */
  license: LicenseType;
  pricing?: Pricing;

  /** Stats */
  stats: {
    downloads: number;
    activeInstalls: number;
    rating: number;
    reviewCount: number;
    weeklyGrowth?: number;
  };

  /** Timestamps */
  publishedAt: string;
  updatedAt: string;

  /** Featured/promoted */
  featured?: boolean;
  featuredUntil?: string;
}

// ============================================================================
// FIRESTORE COLLECTION STRUCTURE
// ============================================================================

/**
 * Firestore Collections:
 *
 * /marketplace_listings/{listingId}           - Public listing data
 * /marketplace_manifests/{manifestId}         - Full manifest (agent or tool)
 * /marketplace_publishers/{publisherId}       - Publisher profiles
 * /marketplace_reviews/{reviewId}             - User reviews
 *
 * /user_installations/{installationId}        - User installations
 *   - Index: userId + itemId (for lookup)
 *   - Index: tenantId + itemId (for org installs)
 *
 * /tool_executions/{executionId}              - Audit log (TTL: 90 days)
 *   - Index: userId + toolId + executedAt
 *   - Index: tenantId + toolId + executedAt
 *
 * /tenant_configs/{tenantId}                  - Tenant-specific config
 *   - Allowed tools/agents
 *   - Custom permissions
 *   - Billing settings
 */
