/**
 * Game Music Types
 *
 * Track/search shapes shared by game-music.ts and its callers.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface GameTrack {
  name: string;
  artist: string;
  previewUrl: string;
  duration?: number;
  decade?: string;
  genre?: string;
}

export interface SearchResult {
  found: boolean;
  track?: GameTrack;
  error?: string;
}
