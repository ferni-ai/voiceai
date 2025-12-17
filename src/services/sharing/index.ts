/**
 * 📤 Sharing Service
 *
 * Generate and manage shareable content for social media.
 *
 * Features:
 * - Card generation (Musical DNA, Desert Island, Game Victory, etc.)
 * - Share URL management
 * - Social preview optimization (OG tags, Twitter cards)
 *
 * @module Sharing
 * @see {@link file:///docs/plans/CREATIVE-MUSICAL-YOU-PLAN.md} Full documentation
 */

// Card Generator
export {
  generateCardSVG,
  getCardDimensions,
  createShareableCard,
  CARD_COLORS,
  CARD_DIMENSIONS,
  type CardData,
} from './card-generator.js';

// Share Routes
export { handleShareRoutes } from '../../api/routes/share-routes.js';

// Re-export types
export type {
  CardType,
  ShareableCard,
  MusicalDNACardData,
  DesertIslandCardData,
  GameVictoryCardData,
  WeeklyRecapCardData,
} from '../musical-you/types.js';

