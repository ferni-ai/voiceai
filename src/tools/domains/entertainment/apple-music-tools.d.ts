/**
 * Apple Music Tools
 *
 * Search and play music from Apple Music catalog.
 *
 * ## Key Insight: iTunes = Apple Music for Previews!
 *
 * The iTunes Search API returns 30-second previews from Apple's music catalog
 * without requiring any authentication. This is the SAME catalog as Apple Music.
 *
 * So we have two ways to play Apple Music content:
 * 1. **iTunes Search API** (free, no auth) - Perfect for previews
 * 2. **Apple MusicKit API** (requires Apple Dev) - Better search + metadata
 *
 * For playback, both use the same preview URLs (30-sec MP3s).
 * Full playback requires Apple Music subscription on user's device.
 *
 * Falls back gracefully when Apple Music is not configured.
 */
import type { ToolDefinition } from '../../registry/types.js';
export declare const appleMusicTools: ToolDefinition[];
export default appleMusicTools;
//# sourceMappingURL=apple-music-tools.d.ts.map