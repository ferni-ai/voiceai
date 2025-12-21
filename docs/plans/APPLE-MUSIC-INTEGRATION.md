# 🍎 Apple Music Integration Plan

> **Goal:** Track user's Apple Music listening history to build Musical DNA from real listening behavior, not just game results.

## Why This Matters

Currently, Musical DNA is built only from music games the user plays with Ferni. But most users listen to music ALL THE TIME on Apple Music. By integrating with their actual listening history, we can:

1. **Build richer Musical DNA** - Based on thousands of listens, not dozens of games
2. **Understand time patterns** - When they listen, what mood correlates
3. **Detect preferences automatically** - No games needed to understand taste
4. **Suggest "Our Songs"** - Based on songs that appear during conversations
5. **Personalize game difficulty** - Use familiar songs they know well

---

## Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     USER'S APPLE MUSIC                          │
├─────────────────────────────────────────────────────────────────┤
│  Recently Played  │  Heavy Rotation  │  Library  │  Playlists   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   APPLE MUSICKIT API                            │
│  Developer Token (JWT) + User Token (Apple Music subscription)  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              src/services/musical-you/apple-music.ts            │
├─────────────────────────────────────────────────────────────────┤
│  syncAppleMusicLibrary()   - Fetch user's library               │
│  getRecentlyPlayed()       - Last 25 tracks played              │
│  getHeavyRotation()        - Most played tracks                 │
│  analyzeAppleMusicTaste()  - Build preferences from data        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    MUSICAL DNA SERVICE                          │
│  Combines: Game Results + Spotify Library + Apple Music Library │
└─────────────────────────────────────────────────────────────────┘
```

---

## Apple MusicKit API Overview

### Required Credentials

1. **Developer Token (Server-side)**
   - JWT signed with Apple Music Key
   - Created in Apple Developer Portal
   - Valid for up to 6 months
   - Required headers: `Authorization: Bearer <developer_token>`

2. **User Token (Client-side)**  
   - Obtained via MusicKit JS on frontend
   - Requires user to authorize Apple Music access
   - Tied to their Apple Music subscription

### Key Endpoints

| Endpoint | Returns | Use Case |
|----------|---------|----------|
| `GET /v1/me/library/songs` | User's added songs | Library size, genres |
| `GET /v1/me/recent/played/tracks` | Recently played (25) | Current listening |
| `GET /v1/me/library/playlists` | User's playlists | Curation style |
| `GET /v1/catalog/{storefront}/charts` | Top charts | Mainstream vs niche score |

### Rate Limits
- 3000 requests per day per user
- Burst: 30 requests per minute

---

## Phase 1: Foundation

### 1.1 Types (`types.ts`)

```typescript
// Add to src/services/musical-you/types.ts

export interface AppleMusicLibraryData {
  userId: string;
  appleMusicUserId: string;
  connected: boolean;
  lastSyncedAt: Date | null;
  
  // Library summary
  libraryTrackCount: number;
  playlistCount: number;
  
  // Top items (from Heavy Rotation)
  topArtists: AppleMusicArtist[];
  topGenres: string[];
  topDecades: string[];
  
  // For games
  libraryTracks: AppleMusicTrack[];
  recentlyPlayed: AppleMusicTrack[];
  heavyRotation: AppleMusicTrack[];
}

export interface AppleMusicTrack {
  id: string;
  name: string;
  artistName: string;
  albumName: string;
  albumArt: string;
  durationMs: number;
  releaseYear: number;
  genres: string[];
  playCount?: number; // From Heavy Rotation
  lastPlayedAt?: Date;
  // Note: Apple Music doesn't provide preview URLs like iTunes
  // Use iTunes Search API to find preview for a track
}

export interface AppleMusicArtist {
  id: string;
  name: string;
  genres: string[];
  imageUrl?: string;
}
```

### 1.2 Service (`apple-music.ts`)

```typescript
// src/services/musical-you/apple-music.ts

/**
 * 🍎 Apple Music Library Integration
 * 
 * Deep integration with user's Apple Music library for:
 * - Understanding real listening patterns
 * - Building Musical DNA from actual behavior
 * - Personalizing music games with familiar songs
 */

const APPLE_MUSIC_API_BASE = 'https://api.music.apple.com/v1';

// Sync user's Apple Music library
export async function syncAppleMusicLibrary(
  userId: string,
  developerToken: string,
  userToken: string
): Promise<AppleMusicLibraryData | null>

// Get recently played tracks
export async function getRecentlyPlayed(
  developerToken: string,
  userToken: string
): Promise<AppleMusicTrack[]>

// Get heavy rotation (most played)
export async function getHeavyRotation(
  developerToken: string,
  userToken: string
): Promise<AppleMusicTrack[]>

// Analyze taste from Apple Music data
export function analyzeAppleMusicTaste(
  library: AppleMusicLibraryData
): AppleMusicTasteAnalysis
```

---

## Phase 2: OAuth Flow

### Frontend (MusicKit JS)

```typescript
// apps/web/src/services/apple-music-auth.ts

/**
 * Initialize MusicKit and get user token
 */
export async function initAppleMusic(): Promise<string | null> {
  const music = await MusicKit.configure({
    developerToken: await getDeveloperToken(),
    app: {
      name: 'Ferni',
      build: '1.0.0'
    }
  });
  
  // Request user authorization
  await music.authorize();
  
  return music.musicUserToken;
}
```

### Backend Token Server

```typescript
// src/servers/token/apple-music-token.ts

/**
 * Generate Apple Music Developer Token (JWT)
 * 
 * Required env vars:
 * - APPLE_MUSIC_TEAM_ID
 * - APPLE_MUSIC_KEY_ID  
 * - APPLE_MUSIC_PRIVATE_KEY
 */
export function generateDeveloperToken(): string {
  const header = {
    alg: 'ES256',
    kid: process.env.APPLE_MUSIC_KEY_ID
  };
  
  const payload = {
    iss: process.env.APPLE_MUSIC_TEAM_ID,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 15777000 // 6 months
  };
  
  return jwt.sign(payload, privateKey, { header });
}
```

---

## Phase 3: Musical DNA Integration

### Enhanced DNA Generation

```typescript
// Update src/services/musical-you/musical-dna.ts

export async function generateMusicalDNA(
  userId: string,
  gameMemory: GameMemory | null,
  spotifyAccessToken?: string,
  appleMusicTokens?: { developer: string; user: string }  // NEW
): Promise<MusicalDNA | null> {
  
  // Get data from ALL sources
  const spotifyLibrary = spotifyAccessToken 
    ? await getSpotifyLibrary(userId, spotifyAccessToken)
    : null;
    
  const appleMusicLibrary = appleMusicTokens
    ? await getAppleMusicLibrary(userId, appleMusicTokens.developer, appleMusicTokens.user)
    : null;
  
  // Merge insights from all sources
  const genreAffinities = mergeGenreAffinities([
    gameMemory?.genreStats,
    spotifyLibrary?.topGenres,
    appleMusicLibrary?.topGenres,
  ]);
  
  // Apple Music provides PLAY COUNTS which Spotify doesn't!
  // This is more accurate for understanding preferences
  const weightedPreferences = appleMusicLibrary?.heavyRotation
    ? calculateWeightedPreferences(appleMusicLibrary.heavyRotation)
    : null;
  
  // ...rest of DNA generation
}
```

### Data Source Priority

| Insight | Best Source | Fallback 1 | Fallback 2 |
|---------|-------------|------------|------------|
| Genre preferences | Apple Music (play counts) | Spotify (library) | Games |
| Decade preferences | Apple Music (heavy rotation) | Spotify (saved) | Games |
| Current mood | Apple Music (recently played) | Spotify (recent) | Last game |
| Discovery openness | Apple Music (new vs repeat) | Spotify (discover weekly) | Game choices |

---

## Phase 4: API Routes

```typescript
// Add to src/api/routes/musical-you-routes.ts

// POST /api/musical/apple/connect - Exchange user token
if (pathname === '/api/musical/apple/connect' && method === 'POST') {
  const { userToken } = await parseBody(req);
  // Validate and store token
  // Trigger initial sync
}

// GET /api/musical/apple/library - Get synced library
if (pathname === '/api/musical/apple/library' && method === 'GET') {
  // Return cached library data
}

// POST /api/musical/apple/sync - Force re-sync
if (pathname === '/api/musical/apple/sync' && method === 'POST') {
  // Re-fetch from Apple Music API
}
```

---

## Phase 5: Dashboard UI

### Music Source Selector

```
┌────────────────────────────────────────────────┐
│  🎵 Your Music Sources                         │
├────────────────────────────────────────────────┤
│                                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │ 🎮 Games │  │ 🟢 Spotify│  │ 🍎 Apple │     │
│  │ 47 plays │  │ Connected │  │ Connect  │     │
│  └──────────┘  └──────────┘  └──────────┘     │
│                                                │
│  DNA Confidence: ████████░░ 82%               │
│  (Connect Apple Music for 95%+ accuracy)       │
│                                                │
└────────────────────────────────────────────────┘
```

---

## Environment Variables Required

```bash
# Apple Music API (MusicKit)
APPLE_MUSIC_TEAM_ID=XXXXXXXXXX
APPLE_MUSIC_KEY_ID=XXXXXXXXXX
APPLE_MUSIC_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
```

---

## Timeline Estimate

| Phase | Effort | Deliverable |
|-------|--------|-------------|
| Phase 1: Types & Service | 2 hours | `apple-music.ts` foundation |
| Phase 2: OAuth Flow | 4 hours | Token generation, MusicKit JS |
| Phase 3: DNA Integration | 3 hours | Merge with existing DNA |
| Phase 4: API Routes | 2 hours | Endpoints for connect/sync |
| Phase 5: Dashboard UI | 2 hours | Source selector, status |
| **Total** | **~13 hours** | Full Apple Music integration |

---

## Comparison: Spotify vs Apple Music

| Capability | Spotify | Apple Music |
|------------|---------|-------------|
| Library access | ✅ Full | ✅ Full |
| Recently played | ✅ Yes | ✅ Yes |
| **Play counts** | ❌ No | ✅ Yes (Heavy Rotation) |
| Preview URLs | ✅ Yes (30s) | ❌ No (use iTunes) |
| Playlist CRUD | ✅ Yes | ✅ Yes |
| Real-time events | ✅ Yes | ❌ No |
| OAuth complexity | Medium | Higher |

**Key Advantage of Apple Music:** Play counts from Heavy Rotation give MUCH better preference data than Spotify's binary "saved/not saved".

---

## Next Steps

1. [ ] Get Apple Developer account credentials
2. [ ] Create `apple-music.ts` service
3. [ ] Add MusicKit JS to frontend
4. [ ] Implement OAuth flow
5. [ ] Integrate with Musical DNA
6. [ ] Add to dashboard

Would you like me to start building this?

