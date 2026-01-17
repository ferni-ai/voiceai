/**
 * Marketplace UI Types
 *
 * Type definitions for the marketplace feature.
 *
 * @module marketplace/types
 */

import type { MarketplaceAgent as ServiceMarketplaceAgent } from '../../services/marketplace.service.js';

// Re-export the service type for convenience
export type { MarketplaceAgent } from '../../services/marketplace.service.js';

/**
 * Agent with installation status for rendering
 */
export interface MarketplaceAgentWithStatus extends ServiceMarketplaceAgent {
  isInstalled: boolean;
  installedAt?: string;
}

/**
 * Marketplace tabs
 */
export type MarketplaceTab = 'browse' | 'installed' | 'creations';

/**
 * Review for an agent
 */
export interface AgentReview {
  id: string;
  userId: string;
  userName?: string;
  rating: number;
  title?: string;
  body: string;
  createdAt: string;
  helpfulCount: number;
  publisherResponse?: {
    body: string;
    respondedAt: string;
  };
}

/**
 * Review statistics for an agent
 */
export interface ReviewStats {
  totalReviews: number;
  averageRating: number;
  ratingDistribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

/**
 * Category color definition
 */
export interface CategoryColors {
  primary: string;
  secondary: string;
  glow: string;
}

/**
 * Marketplace modal state
 */
export interface MarketplaceState {
  modal: HTMLElement | null;
  currentTab: MarketplaceTab;
  currentCategory: string | null;
  searchQuery: string;
  isLoading: boolean;
}

/**
 * Category label mapping
 */
export type CategoryId =
  | 'mentorship'
  | 'finance'
  | 'health'
  | 'productivity'
  | 'lifestyle'
  | 'education'
  | 'entertainment'
  | 'custom';

/**
 * External AI company brand IDs
 */
export type ExternalBrandId = 'claude' | 'gemini' | 'gpt';

/**
 * Marketplace event handlers
 */
export interface MarketplaceCallbacks {
  onClose?: () => void;
  onInstall?: (agentId: string) => void;
  onUninstall?: (agentId: string) => void;
  onTabChange?: (tab: MarketplaceTab) => void;
}
