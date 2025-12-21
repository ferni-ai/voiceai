/**
 * 🎴 Shareable Cards
 *
 * Generate beautiful shareable cards for social media:
 * - Musical DNA cards
 * - Desert Island picks
 * - Game victories
 * - Weekly recaps
 *
 * Cards are generated as SVG for crisp rendering,
 * with option to export as PNG for sharing.
 *
 * @module ShareableCards
 */

import { createLogger } from '../../utils/safe-logger.js';
import type {
  ShareableCard,
  CardType,
  MusicalDNACardData,
  DesertIslandCardData,
  GameVictoryCardData,
  WeeklyRecapCardData,
  MusicalDNA,
  DesertIslandPicks,
} from './types.js';

const log = createLogger({ module: 'ShareableCards' });

// ============================================================================
// CARD STORAGE
// ============================================================================

const cards = new Map<string, ShareableCard>();

// ============================================================================
// CARD GENERATION
// ============================================================================

/**
 * Generate a Musical DNA card
 */
export function generateMusicalDNACard(userId: string, dna: MusicalDNA): ShareableCard {
  const cardId = `dna-${userId}-${Date.now()}`;

  const data: MusicalDNACardData = {
    type: 'musical-dna',
    personalityLabel: dna.personalityLabel,
    personalityDescription: dna.personalityDescription,
    topGenres: dna.genreAffinities.slice(0, 3).map((g) => ({
      name: g.displayName,
      score: g.affinityScore,
    })),
    totalGames: dna.totalGamesPlayed,
    currentStreak: 0, // Would need from game memory
  };

  const card: ShareableCard = {
    id: cardId,
    type: 'musical-dna',
    userId,
    data,
    imageUrl: null, // Would be generated server-side
    shareUrl: `https://ferni.ai/share/${cardId}`,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    viewCount: 0,
  };

  cards.set(cardId, card);

  log.info({ cardId, userId, personality: dna.personalityLabel }, '🎴 Generated Musical DNA card');

  return card;
}

/**
 * Generate a Desert Island card
 */
export function generateDesertIslandCard(userId: string, picks: DesertIslandPicks): ShareableCard {
  const cardId = `island-${userId}-${Date.now()}`;

  const data: DesertIslandCardData = {
    type: 'desert-island',
    picks: picks.picks.map((p) => ({
      rank: p.rank,
      trackName: p.trackName,
      artistName: p.artistName,
      reason: p.reason,
    })),
    curatedDate: picks.completedAt || new Date(),
  };

  const card: ShareableCard = {
    id: cardId,
    type: 'desert-island',
    userId,
    data,
    imageUrl: null,
    shareUrl: `https://ferni.ai/share/${cardId}`,
    createdAt: new Date(),
    expiresAt: null, // Never expires
    viewCount: 0,
  };

  cards.set(cardId, card);

  log.info({ cardId, userId, pickCount: picks.picks.length }, '🏝️ Generated Desert Island card');

  return card;
}

/**
 * Generate a Game Victory card
 */
export function generateGameVictoryCard(
  userId: string,
  gameType: string,
  gameDisplayName: string,
  score: number,
  trackName?: string,
  artistName?: string,
  guessTimeMs?: number,
  isPersonalBest: boolean = false
): ShareableCard {
  const cardId = `victory-${userId}-${Date.now()}`;

  const data: GameVictoryCardData = {
    type: 'game-victory',
    gameType,
    gameDisplayName,
    score,
    trackName,
    artistName,
    guessTimeMs,
    isPersonalBest,
  };

  const card: ShareableCard = {
    id: cardId,
    type: 'game-victory',
    userId,
    data,
    imageUrl: null,
    shareUrl: `https://ferni.ai/share/${cardId}`,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    viewCount: 0,
  };

  cards.set(cardId, card);

  log.info({ cardId, userId, gameType, score, isPersonalBest }, '🏆 Generated Victory card');

  return card;
}

/**
 * Generate a Weekly Recap card
 */
export function generateWeeklyRecapCard(
  userId: string,
  weekOf: Date,
  gamesPlayed: number,
  totalMinutes: number,
  bestMoment: string,
  topGenreThisWeek: string,
  streakDays: number
): ShareableCard {
  const cardId = `recap-${userId}-${formatWeek(weekOf)}`;

  const data: WeeklyRecapCardData = {
    type: 'weekly-recap',
    weekOf,
    gamesPlayed,
    totalMinutes,
    bestMoment,
    topGenreThisWeek,
    streakDays,
  };

  const card: ShareableCard = {
    id: cardId,
    type: 'weekly-recap',
    userId,
    data,
    imageUrl: null,
    shareUrl: `https://ferni.ai/share/${cardId}`,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    viewCount: 0,
  };

  cards.set(cardId, card);

  log.info({ cardId, userId, gamesPlayed, streakDays }, '📊 Generated Weekly Recap card');

  return card;
}

// ============================================================================
// CARD RETRIEVAL
// ============================================================================

/**
 * Get a card by ID
 */
export function getCard(cardId: string): ShareableCard | null {
  const card = cards.get(cardId);

  if (card) {
    // Check expiry
    if (card.expiresAt && new Date() > card.expiresAt) {
      cards.delete(cardId);
      return null;
    }

    // Increment view count
    card.viewCount++;
  }

  return card || null;
}

/**
 * Get all cards for a user
 */
export function getUserCards(userId: string, type?: CardType): ShareableCard[] {
  const userCards: ShareableCard[] = [];

  for (const card of cards.values()) {
    if (card.userId !== userId) continue;
    if (type && card.type !== type) continue;

    // Skip expired
    if (card.expiresAt && new Date() > card.expiresAt) continue;

    userCards.push(card);
  }

  return userCards.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

// ============================================================================
// SVG GENERATION
// ============================================================================

/**
 * Generate SVG for a Musical DNA card
 */
export function generateMusicalDNASVG(data: MusicalDNACardData): string {
  const { personalityLabel, personalityDescription, topGenres, totalGames } = data;

  // Card dimensions: 1200x630 (standard social share)
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#2C2520;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#4a3f38;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="accentGradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#4a6741;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#6a8b5d;stop-opacity:1" />
    </linearGradient>
  </defs>
  
  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bgGradient)" rx="20" />
  
  <!-- Decorative pattern -->
  <g opacity="0.1">
    ${generateMusicNotes()}
  </g>
  
  <!-- Header -->
  <text x="80" y="80" font-family="Plus Jakarta Sans, sans-serif" font-size="16" fill="#8a7b6d" letter-spacing="0.1em">MUSICAL DNA</text>
  
  <!-- Personality Type -->
  <text x="80" y="140" font-family="Plus Jakarta Sans, sans-serif" font-size="48" font-weight="700" fill="#faf6f0">${escapeXml(personalityLabel)}</text>
  <text x="80" y="190" font-family="Inter, sans-serif" font-size="18" fill="#c9beb0" width="600">
    ${wrapText(escapeXml(personalityDescription), 60)
      .map((line, i) => `<tspan x="80" dy="${i === 0 ? 0 : 24}">${line}</tspan>`)
      .join('')}
  </text>
  
  <!-- Top Genres -->
  <text x="80" y="320" font-family="Plus Jakarta Sans, sans-serif" font-size="14" fill="#8a7b6d" letter-spacing="0.05em">TOP GENRES</text>
  ${topGenres
    .map(
      (genre, i) => `
    <g transform="translate(80, ${350 + i * 60})">
      <rect width="${Math.round(genre.score * 4)}" height="8" fill="url(#accentGradient)" rx="4" />
      <text y="-8" font-family="Inter, sans-serif" font-size="16" fill="#faf6f0">${escapeXml(genre.name)}</text>
      <text x="${Math.round(genre.score * 4) + 16}" y="6" font-family="Inter, sans-serif" font-size="14" fill="#8a7b6d">${genre.score}%</text>
    </g>
  `
    )
    .join('')}
  
  <!-- Stats -->
  <g transform="translate(700, 320)">
    <text font-family="Plus Jakarta Sans, sans-serif" font-size="14" fill="#8a7b6d" letter-spacing="0.05em">GAMES PLAYED</text>
    <text y="50" font-family="Plus Jakarta Sans, sans-serif" font-size="72" font-weight="700" fill="#4a6741">${totalGames}</text>
  </g>
  
  <!-- Ferni branding -->
  <g transform="translate(80, 570)">
    <text font-family="Plus Jakarta Sans, sans-serif" font-size="18" font-weight="600" fill="#4a6741">ferni</text>
    <text x="60" font-family="Inter, sans-serif" font-size="14" fill="#8a7b6d">Your soundtrack, understood.</text>
  </g>
</svg>`.trim();

  return svg;
}

/**
 * Generate SVG for a Desert Island card
 */
export function generateDesertIslandSVG(data: DesertIslandCardData): string {
  const { picks } = data;

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a3a4a;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#2d5568;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="sandGradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#d4a574;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#c4956a;stop-opacity:1" />
    </linearGradient>
  </defs>
  
  <!-- Ocean background -->
  <rect width="1200" height="630" fill="url(#bgGradient)" rx="20" />
  
  <!-- Waves -->
  <g opacity="0.3">
    <path d="M0,500 Q300,470 600,500 T1200,480 V630 H0 Z" fill="#ffffff" opacity="0.1"/>
    <path d="M0,520 Q300,490 600,520 T1200,500 V630 H0 Z" fill="#ffffff" opacity="0.05"/>
  </g>
  
  <!-- Island/sand -->
  <ellipse cx="600" cy="580" rx="400" ry="80" fill="url(#sandGradient)" />
  
  <!-- Header -->
  <text x="80" y="80" font-family="Plus Jakarta Sans, sans-serif" font-size="16" fill="#7ab8d4" letter-spacing="0.1em">DESERT ISLAND DISCS</text>
  <text x="80" y="130" font-family="Plus Jakarta Sans, sans-serif" font-size="36" font-weight="700" fill="#faf6f0">My 5 Essential Songs</text>
  
  <!-- Picks -->
  ${picks
    .slice(0, 5)
    .map(
      (pick, i) => `
    <g transform="translate(80, ${180 + i * 70})">
      <text font-family="Plus Jakarta Sans, sans-serif" font-size="24" font-weight="700" fill="#d4a574">${pick.rank}</text>
      <text x="40" font-family="Plus Jakarta Sans, sans-serif" font-size="20" font-weight="600" fill="#faf6f0">${escapeXml(truncate(pick.trackName, 30))}</text>
      <text x="40" y="28" font-family="Inter, sans-serif" font-size="14" fill="#7ab8d4">${escapeXml(truncate(pick.artistName, 35))}</text>
    </g>
  `
    )
    .join('')}
  
  <!-- Palm tree decoration -->
  <g transform="translate(1000, 350)" opacity="0.5">
    <path d="M0,200 Q10,100 0,0" stroke="#4a6741" stroke-width="8" fill="none"/>
    <ellipse cx="-30" cy="20" rx="50" ry="15" fill="#4a6741" transform="rotate(-30)"/>
    <ellipse cx="30" cy="20" rx="50" ry="15" fill="#4a6741" transform="rotate(30)"/>
    <ellipse cx="0" cy="0" rx="40" ry="15" fill="#4a6741"/>
  </g>
  
  <!-- Ferni branding -->
  <g transform="translate(80, 570)">
    <text font-family="Plus Jakarta Sans, sans-serif" font-size="18" font-weight="600" fill="#4a6741">ferni</text>
    <text x="60" font-family="Inter, sans-serif" font-size="14" fill="#7ab8d4">ferni.ai/island</text>
  </g>
</svg>`.trim();

  return svg;
}

/**
 * Generate SVG for a Game Victory card
 */
export function generateVictorySVG(data: GameVictoryCardData): string {
  const { gameDisplayName, score, trackName, artistName, guessTimeMs, isPersonalBest } = data;

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#2C2520;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#3a3530;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#d4a574;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#c4956a;stop-opacity:1" />
    </linearGradient>
  </defs>
  
  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bgGradient)" rx="20" />
  
  ${
    isPersonalBest
      ? `
  <!-- Personal Best banner -->
  <g transform="translate(850, 50)">
    <rect width="280" height="50" fill="url(#goldGradient)" rx="25" />
    <text x="140" y="32" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="16" font-weight="700" fill="#2C2520">⭐ PERSONAL BEST!</text>
  </g>
  `
      : ''
  }
  
  <!-- Celebration sparkles -->
  <g opacity="0.6">
    ${generateSparkles()}
  </g>
  
  <!-- Header -->
  <text x="80" y="80" font-family="Plus Jakarta Sans, sans-serif" font-size="16" fill="#8a7b6d" letter-spacing="0.1em">${escapeXml(gameDisplayName.toUpperCase())}</text>
  
  <!-- Score -->
  <text x="80" y="200" font-family="Plus Jakarta Sans, sans-serif" font-size="120" font-weight="700" fill="url(#goldGradient)">${score}</text>
  <text x="80" y="240" font-family="Inter, sans-serif" font-size="20" fill="#8a7b6d">points</text>
  
  ${
    trackName
      ? `
  <!-- Song info -->
  <g transform="translate(80, 320)">
    <text font-family="Plus Jakarta Sans, sans-serif" font-size="14" fill="#8a7b6d" letter-spacing="0.05em">I NAILED</text>
    <text y="40" font-family="Plus Jakarta Sans, sans-serif" font-size="28" font-weight="600" fill="#faf6f0">${escapeXml(truncate(trackName, 35))}</text>
    <text y="70" font-family="Inter, sans-serif" font-size="18" fill="#c9beb0">${escapeXml(truncate(artistName || '', 40))}</text>
  </g>
  `
      : ''
  }
  
  ${
    guessTimeMs
      ? `
  <!-- Time -->
  <g transform="translate(700, 180)">
    <text font-family="Plus Jakarta Sans, sans-serif" font-size="14" fill="#8a7b6d" letter-spacing="0.05em">TIME</text>
    <text y="50" font-family="Plus Jakarta Sans, sans-serif" font-size="48" font-weight="700" fill="#4a6741">${(guessTimeMs / 1000).toFixed(1)}s</text>
  </g>
  `
      : ''
  }
  
  <!-- Ferni branding -->
  <g transform="translate(80, 570)">
    <text font-family="Plus Jakarta Sans, sans-serif" font-size="18" font-weight="600" fill="#4a6741">ferni</text>
    <text x="60" font-family="Inter, sans-serif" font-size="14" fill="#8a7b6d">Play music games at ferni.ai</text>
  </g>
</svg>`.trim();

  return svg;
}

// ============================================================================
// HELPERS
// ============================================================================

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length <= maxCharsPerLine) {
      currentLine = (currentLine + ' ' + word).trim();
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines.slice(0, 3); // Max 3 lines
}

function formatWeek(date: Date): string {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  return start.toISOString().split('T')[0];
}

function generateMusicNotes(): string {
  const notes: string[] = [];
  for (let i = 0; i < 15; i++) {
    const x = Math.random() * 1200;
    const y = Math.random() * 630;
    const size = 20 + Math.random() * 20;
    notes.push(
      `<text x="${x}" y="${y}" font-size="${size}" fill="#faf6f0" transform="rotate(${Math.random() * 30 - 15}, ${x}, ${y})">♪</text>`
    );
  }
  return notes.join('');
}

function generateSparkles(): string {
  const sparkles: string[] = [];
  for (let i = 0; i < 20; i++) {
    const x = Math.random() * 1200;
    const y = Math.random() * 400;
    const size = 2 + Math.random() * 4;
    sparkles.push(`<circle cx="${x}" cy="${y}" r="${size}" fill="#d4a574" />`);
  }
  return sparkles.join('');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  generateMusicalDNACard,
  generateDesertIslandCard,
  generateGameVictoryCard,
  generateWeeklyRecapCard,
  getCard,
  getUserCards,
  generateMusicalDNASVG,
  generateDesertIslandSVG,
  generateVictorySVG,
};
