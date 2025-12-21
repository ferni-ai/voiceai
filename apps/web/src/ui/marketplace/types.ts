/**
 * Marketplace UI Types
 * @module marketplace/types
 */

import type { MarketplaceAgent } from '../../services/marketplace.service.js';
import type { CustomAgent } from '../../services/custom-agent.service.js';

export type MarketplaceTab = 'browse' | 'installed' | 'creations';

export interface AgentReview {
  id: string;
  author: string;
  rating: number;
  content: string;
  date: string;
  helpful: number;
}

export interface MarketplaceState {
  modal: HTMLElement | null;
  currentTab: MarketplaceTab;
  currentCategory: string | null;
  searchQuery: string;
  isLoading: boolean;
}

export interface CategoryColors {
  primary: string;
  secondary: string;
  glow: string;
}

export type ExtendedMarketplaceAgent = MarketplaceAgent & { isInstalled: boolean };

// Re-export types that consumers need
export type { MarketplaceAgent, CustomAgent };

