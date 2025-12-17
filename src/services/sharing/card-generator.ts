/**
 * 🃏 Shareable Card Generator
 *
 * Generates beautiful, shareable images for social media.
 * Uses server-side SVG → PNG conversion for consistent output.
 *
 * Card Types:
 * - Musical DNA (Instagram Story - 1080x1920)
 * - Desert Island (Square - 1080x1080)
 * - Game Victory (Twitter Card - 1200x675)
 * - Weekly Recap (Instagram Story - 1080x1920)
 *
 * @module CardGenerator
 */

import { createLogger } from '../../utils/safe-logger.js';
import type {
  CardType,
  ShareableCard,
  MusicalDNACardData,
  DesertIslandCardData,
  GameVictoryCardData,
  WeeklyRecapCardData,
  CreativeProfileCardData,
} from '../musical-you/types.js';

const log = createLogger({ module: 'CardGenerator' });

// ============================================================================
// CONSTANTS
// ============================================================================

const CARD_DIMENSIONS: Record<CardType, { width: number; height: number }> = {
  'musical-dna': { width: 1080, height: 1920 }, // Instagram Story
  'desert-island': { width: 1080, height: 1080 }, // Square
  'game-victory': { width: 1200, height: 675 }, // Twitter Card
  'weekly-recap': { width: 1080, height: 1920 }, // Instagram Story
  'milestone-achieved': { width: 1080, height: 1080 }, // Square
  'challenge-invite': { width: 1200, height: 675 }, // Twitter Card
  'creative-profile': { width: 1080, height: 1920 }, // Instagram Story
};

// Ferni brand colors
const COLORS = {
  // Backgrounds
  bgCream: '#FFFDFB',
  bgWarm: '#F5F2ED',
  bgDark: '#2C2520',

  // Text
  textPrimary: '#2C2520',
  textSecondary: '#5C5248',
  textMuted: '#7A6F63',
  textLight: '#FFFDFB',

  // Persona colors
  ferni: '#4a6741',
  ferniLight: '#5d7a54',
  ferniDark: '#3d5a35',

  // Accents
  gold: '#C4A35A',
  coral: '#C4856A',
  teal: '#3A6B73',
};

// ============================================================================
// SVG TEMPLATES
// ============================================================================

/**
 * Generate Musical DNA card SVG
 */
function generateMusicalDNASVG(data: MusicalDNACardData): string {
  const { width, height } = CARD_DIMENSIONS['musical-dna'];

  // Generate genre bars
  const genreBars = data.topGenres
    .slice(0, 4)
    .map((genre, i) => {
      const y = 980 + i * 120;
      const barWidth = (genre.score / 100) * 700;
      return `
      <g transform="translate(190, ${y})">
        <text x="0" y="0" font-family="Plus Jakarta Sans, sans-serif" font-size="36" font-weight="600" fill="${COLORS.textPrimary}">${genre.name}</text>
        <rect x="0" y="20" width="700" height="16" rx="8" fill="${COLORS.bgWarm}"/>
        <rect x="0" y="20" width="${barWidth}" height="16" rx="8" fill="${COLORS.ferni}"/>
        <text x="720" y="35" font-family="Plus Jakarta Sans, sans-serif" font-size="32" font-weight="700" fill="${COLORS.textSecondary}">${genre.score}%</text>
      </g>
    `;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${COLORS.bgCream}"/>
      <stop offset="100%" style="stop-color:${COLORS.bgWarm}"/>
    </linearGradient>
    <linearGradient id="accentGradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:${COLORS.ferniDark}"/>
      <stop offset="100%" style="stop-color:${COLORS.ferniLight}"/>
    </linearGradient>
  </defs>
  
  <!-- Background -->
  <rect width="${width}" height="${height}" fill="url(#bgGradient)"/>
  
  <!-- Decorative top accent -->
  <rect x="0" y="0" width="${width}" height="8" fill="url(#accentGradient)"/>
  
  <!-- Header Section -->
  <g transform="translate(0, 120)">
    <!-- Music icon -->
    <circle cx="540" cy="100" r="80" fill="${COLORS.ferni}" opacity="0.1"/>
    <text x="540" y="120" font-size="64" text-anchor="middle">🎵</text>
    
    <!-- Title -->
    <text x="540" y="260" font-family="Plus Jakarta Sans, sans-serif" font-size="48" font-weight="700" fill="${COLORS.textSecondary}" text-anchor="middle" letter-spacing="8">MUSICAL YOU</text>
  </g>
  
  <!-- Personality Section -->
  <g transform="translate(0, 480)">
    <!-- Star icon -->
    <text x="540" y="0" font-size="56" text-anchor="middle">✨</text>
    
    <!-- Personality label -->
    <text x="540" y="80" font-family="Plus Jakarta Sans, sans-serif" font-size="56" font-weight="700" fill="${COLORS.textPrimary}" text-anchor="middle">${data.personalityLabel}</text>
    
    <!-- Personality description -->
    <text x="540" y="150" font-family="Inter, sans-serif" font-size="32" fill="${COLORS.textSecondary}" text-anchor="middle">"${data.personalityDescription}"</text>
  </g>
  
  <!-- Divider -->
  <line x1="190" y1="920" x2="890" y2="920" stroke="${COLORS.bgWarm}" stroke-width="2"/>
  
  <!-- Genre Bars -->
  ${genreBars}
  
  <!-- Divider -->
  <line x1="190" y1="1520" x2="890" y2="1520" stroke="${COLORS.bgWarm}" stroke-width="2"/>
  
  <!-- Stats Section -->
  <g transform="translate(0, 1580)">
    <g transform="translate(270, 0)">
      <text x="0" y="0" font-family="Plus Jakarta Sans, sans-serif" font-size="64" font-weight="700" fill="${COLORS.ferni}">🏆</text>
      <text x="80" y="-5" font-family="Plus Jakarta Sans, sans-serif" font-size="48" font-weight="700" fill="${COLORS.textPrimary}">${data.totalGames}</text>
      <text x="80" y="45" font-family="Inter, sans-serif" font-size="24" fill="${COLORS.textMuted}">games</text>
    </g>
    <g transform="translate(540, 0)">
      <text x="0" y="0" font-family="Plus Jakarta Sans, sans-serif" font-size="64" font-weight="700" fill="${COLORS.coral}">🔥</text>
      <text x="80" y="-5" font-family="Plus Jakarta Sans, sans-serif" font-size="48" font-weight="700" fill="${COLORS.textPrimary}">${data.currentStreak}</text>
      <text x="80" y="45" font-family="Inter, sans-serif" font-size="24" fill="${COLORS.textMuted}">day streak</text>
    </g>
  </g>
  
  <!-- Footer -->
  <g transform="translate(0, ${height - 120})">
    <text x="540" y="0" font-family="Plus Jakarta Sans, sans-serif" font-size="36" font-weight="600" fill="${COLORS.ferni}" text-anchor="middle">ferni.ai</text>
  </g>
</svg>`;
}

/**
 * Generate Desert Island card SVG
 */
function generateDesertIslandSVG(data: DesertIslandCardData): string {
  const { width, height } = CARD_DIMENSIONS['desert-island'];

  // Generate song list
  const songs = data.picks
    .slice(0, 5)
    .map((pick, i) => {
      const y = 380 + i * 120;
      return `
      <g transform="translate(100, ${y})">
        <text x="0" y="0" font-family="Plus Jakarta Sans, sans-serif" font-size="36" font-weight="700" fill="${COLORS.ferni}">${pick.rank}.</text>
        <text x="60" y="0" font-family="Plus Jakarta Sans, sans-serif" font-size="32" font-weight="600" fill="${COLORS.textPrimary}">"${truncate(pick.trackName, 28)}"</text>
        <text x="60" y="45" font-family="Inter, sans-serif" font-size="26" fill="${COLORS.textSecondary}">${truncate(pick.artistName, 35)}</text>
      </g>
    `;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${COLORS.bgCream}"/>
      <stop offset="100%" style="stop-color:${COLORS.bgWarm}"/>
    </linearGradient>
  </defs>
  
  <!-- Background -->
  <rect width="${width}" height="${height}" fill="url(#bgGradient)"/>
  
  <!-- Header -->
  <g transform="translate(0, 80)">
    <text x="540" y="0" font-size="72" text-anchor="middle">🏝️</text>
    <text x="540" y="100" font-family="Plus Jakarta Sans, sans-serif" font-size="44" font-weight="700" fill="${COLORS.textPrimary}" text-anchor="middle">MY DESERT ISLAND DISCS</text>
    <text x="540" y="160" font-family="Inter, sans-serif" font-size="28" fill="${COLORS.textSecondary}" text-anchor="middle">5 songs I'd take forever</text>
  </g>
  
  <!-- Divider -->
  <line x1="100" y1="320" x2="980" y2="320" stroke="${COLORS.ferni}" stroke-width="2" opacity="0.3"/>
  
  <!-- Song List -->
  ${songs}
  
  <!-- Footer -->
  <g transform="translate(0, ${height - 100})">
    <text x="540" y="0" font-family="Inter, sans-serif" font-size="26" fill="${COLORS.textMuted}" text-anchor="middle">Curated with Ferni 🌿</text>
    <text x="540" y="50" font-family="Plus Jakarta Sans, sans-serif" font-size="32" font-weight="600" fill="${COLORS.ferni}" text-anchor="middle">ferni.ai</text>
  </g>
</svg>`;
}

/**
 * Generate Game Victory card SVG
 */
function generateGameVictorySVG(data: GameVictoryCardData): string {
  const { width, height } = CARD_DIMENSIONS['game-victory'];

  const timeDisplay = data.guessTimeMs
    ? `${(data.guessTimeMs / 1000).toFixed(1)} SECONDS`
    : `SCORE: ${data.score}`;

  const personalBestBadge = data.isPersonalBest
    ? `<g transform="translate(${width - 200}, 30)">
        <rect x="0" y="0" width="170" height="40" rx="20" fill="${COLORS.gold}"/>
        <text x="85" y="27" font-family="Plus Jakarta Sans, sans-serif" font-size="18" font-weight="700" fill="white" text-anchor="middle">🏆 PERSONAL BEST</text>
      </g>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${COLORS.bgCream}"/>
      <stop offset="100%" style="stop-color:${COLORS.bgWarm}"/>
    </linearGradient>
    <linearGradient id="accentGradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:${COLORS.ferniDark}"/>
      <stop offset="100%" style="stop-color:${COLORS.ferniLight}"/>
    </linearGradient>
  </defs>
  
  <!-- Background -->
  <rect width="${width}" height="${height}" fill="url(#bgGradient)"/>
  
  <!-- Top accent bar -->
  <rect x="0" y="0" width="${width}" height="6" fill="url(#accentGradient)"/>
  
  <!-- Personal Best Badge -->
  ${personalBestBadge}
  
  <!-- Game Type -->
  <g transform="translate(60, 60)">
    <text x="0" y="0" font-size="36">🎵</text>
    <text x="50" y="5" font-family="Plus Jakarta Sans, sans-serif" font-size="24" font-weight="600" fill="${COLORS.textSecondary}" letter-spacing="2">${data.gameDisplayName.toUpperCase()}</text>
  </g>
  
  <!-- Main Score -->
  <g transform="translate(60, 200)">
    <text x="0" y="0" font-size="48">⚡</text>
    <text x="70" y="10" font-family="Plus Jakarta Sans, sans-serif" font-size="72" font-weight="700" fill="${COLORS.textPrimary}">${timeDisplay}</text>
  </g>
  
  <!-- Track Info -->
  ${
    data.trackName
      ? `
  <g transform="translate(60, 340)">
    <text x="0" y="0" font-family="Plus Jakarta Sans, sans-serif" font-size="36" font-weight="600" fill="${COLORS.textPrimary}">"${truncate(data.trackName, 40)}"</text>
    <text x="0" y="50" font-family="Inter, sans-serif" font-size="28" fill="${COLORS.textSecondary}">${data.artistName || ''}</text>
  </g>
  `
      : ''
  }
  
  <!-- CTA -->
  <g transform="translate(60, ${height - 120})">
    <text x="0" y="0" font-family="Inter, sans-serif" font-size="28" fill="${COLORS.textSecondary}">Think you can beat that?</text>
    <text x="0" y="45" font-family="Plus Jakarta Sans, sans-serif" font-size="32" font-weight="600" fill="${COLORS.ferni}">Challenge me at ferni.ai</text>
  </g>
</svg>`;
}

/**
 * Generate Weekly Recap card SVG
 */
function generateWeeklyRecapSVG(data: WeeklyRecapCardData): string {
  const { width, height } = CARD_DIMENSIONS['weekly-recap'];

  const weekLabel = formatWeekLabel(data.weekOf);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${COLORS.bgCream}"/>
      <stop offset="100%" style="stop-color:${COLORS.bgWarm}"/>
    </linearGradient>
  </defs>
  
  <!-- Background -->
  <rect width="${width}" height="${height}" fill="url(#bgGradient)"/>
  
  <!-- Header -->
  <g transform="translate(0, 150)">
    <text x="540" y="0" font-size="64" text-anchor="middle">🎵</text>
    <text x="540" y="100" font-family="Plus Jakarta Sans, sans-serif" font-size="42" font-weight="700" fill="${COLORS.textPrimary}" text-anchor="middle">MY WEEK IN MUSIC</text>
    <text x="540" y="160" font-family="Inter, sans-serif" font-size="28" fill="${COLORS.textSecondary}" text-anchor="middle">${weekLabel}</text>
  </g>
  
  <!-- Stats Grid -->
  <g transform="translate(190, 500)">
    <!-- Games Played -->
    <g transform="translate(0, 0)">
      <rect x="0" y="0" width="300" height="180" rx="20" fill="white"/>
      <text x="150" y="70" font-family="Plus Jakarta Sans, sans-serif" font-size="64" font-weight="700" fill="${COLORS.ferni}" text-anchor="middle">${data.gamesPlayed}</text>
      <text x="150" y="120" font-family="Inter, sans-serif" font-size="28" fill="${COLORS.textSecondary}" text-anchor="middle">games played</text>
    </g>
    
    <!-- Minutes -->
    <g transform="translate(400, 0)">
      <rect x="0" y="0" width="300" height="180" rx="20" fill="white"/>
      <text x="150" y="70" font-family="Plus Jakarta Sans, sans-serif" font-size="64" font-weight="700" fill="${COLORS.teal}" text-anchor="middle">${data.totalMinutes}</text>
      <text x="150" y="120" font-family="Inter, sans-serif" font-size="28" fill="${COLORS.textSecondary}" text-anchor="middle">minutes</text>
    </g>
    
    <!-- Streak -->
    <g transform="translate(200, 220)">
      <rect x="0" y="0" width="300" height="180" rx="20" fill="white"/>
      <text x="150" y="70" font-family="Plus Jakarta Sans, sans-serif" font-size="64" font-weight="700" fill="${COLORS.coral}" text-anchor="middle">🔥 ${data.streakDays}</text>
      <text x="150" y="120" font-family="Inter, sans-serif" font-size="28" fill="${COLORS.textSecondary}" text-anchor="middle">day streak</text>
    </g>
  </g>
  
  <!-- Best Moment -->
  <g transform="translate(0, 1100)">
    <text x="540" y="0" font-family="Plus Jakarta Sans, sans-serif" font-size="28" font-weight="600" fill="${COLORS.textSecondary}" text-anchor="middle">BEST MOMENT</text>
    <text x="540" y="60" font-family="Inter, sans-serif" font-size="32" fill="${COLORS.textPrimary}" text-anchor="middle">"${data.bestMoment}"</text>
  </g>
  
  <!-- Top Genre -->
  <g transform="translate(0, 1280)">
    <text x="540" y="0" font-family="Plus Jakarta Sans, sans-serif" font-size="28" font-weight="600" fill="${COLORS.textSecondary}" text-anchor="middle">TOP GENRE THIS WEEK</text>
    <text x="540" y="60" font-family="Plus Jakarta Sans, sans-serif" font-size="40" font-weight="700" fill="${COLORS.ferni}" text-anchor="middle">${data.topGenreThisWeek}</text>
  </g>
  
  <!-- Footer -->
  <g transform="translate(0, ${height - 120})">
    <text x="540" y="0" font-family="Plus Jakarta Sans, sans-serif" font-size="36" font-weight="600" fill="${COLORS.ferni}" text-anchor="middle">ferni.ai</text>
  </g>
</svg>`;
}

/**
 * Generate Creative Profile card SVG
 */
function generateCreativeProfileSVG(data: CreativeProfileCardData): string {
  const { width, height } = CARD_DIMENSIONS['creative-profile'];

  // Generate topic bars
  const topicBars = data.topTopics
    .slice(0, 4)
    .map((topic, i) => {
      const y = 980 + i * 120;
      const barWidth = Math.min((topic.score / 100) * 700, 700);
      return `
      <g transform="translate(190, ${y})">
        <text x="0" y="0" font-family="Plus Jakarta Sans, sans-serif" font-size="36" font-weight="600" fill="${COLORS.textPrimary}">${topic.name}</text>
        <rect x="0" y="20" width="700" height="16" rx="8" fill="${COLORS.bgWarm}"/>
        <rect x="0" y="20" width="${barWidth}" height="16" rx="8" fill="${COLORS.teal}"/>
        <text x="720" y="35" font-family="Plus Jakarta Sans, sans-serif" font-size="32" font-weight="700" fill="${COLORS.textSecondary}">${Math.round(topic.score)}</text>
      </g>
    `;
    })
    .join('');

  const descTruncated = truncate(data.personalityDescription, 50);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${COLORS.bgCream}"/>
      <stop offset="100%" style="stop-color:${COLORS.bgWarm}"/>
    </linearGradient>
    <linearGradient id="accentGradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:${COLORS.teal}"/>
      <stop offset="100%" style="stop-color:#4A8B93"/>
    </linearGradient>
  </defs>
  
  <!-- Background -->
  <rect width="${width}" height="${height}" fill="url(#bgGradient)"/>
  
  <!-- Decorative top bar -->
  <rect x="0" y="0" width="${width}" height="8" fill="url(#accentGradient)"/>
  
  <!-- Header -->
  <g transform="translate(0, 150)">
    <text x="540" y="0" font-size="80" text-anchor="middle">🎨</text>
    <text x="540" y="100" font-family="Plus Jakarta Sans, sans-serif" font-size="32" font-weight="500" fill="${COLORS.textSecondary}" text-anchor="middle" letter-spacing="8">CREATIVE PROFILE</text>
  </g>
  
  <!-- Personality Card -->
  <g transform="translate(100, 350)">
    <rect x="0" y="0" width="${width - 200}" height="500" rx="30" fill="white"/>
    <rect x="0" y="0" width="${width - 200}" height="100" rx="30" fill="${COLORS.teal}" clip-path="url(#roundTop)"/>
    
    <!-- Personality Label -->
    <text x="440" y="200" font-family="Plus Jakarta Sans, sans-serif" font-size="56" font-weight="700" fill="${COLORS.textPrimary}" text-anchor="middle">${data.personalityLabel}</text>
    
    <!-- Description -->
    <text x="440" y="280" font-family="Inter, sans-serif" font-size="28" fill="${COLORS.textSecondary}" text-anchor="middle">${descTruncated}</text>
    
    <!-- Stats Row -->
    <g transform="translate(90, 350)">
      <g transform="translate(0, 0)">
        <text x="0" y="0" font-family="Plus Jakarta Sans, sans-serif" font-size="48" font-weight="700" fill="${COLORS.teal}">${data.totalContent}</text>
        <text x="0" y="40" font-family="Inter, sans-serif" font-size="22" fill="${COLORS.textMuted}">content watched</text>
      </g>
      <g transform="translate(250, 0)">
        <text x="0" y="0" font-family="Plus Jakarta Sans, sans-serif" font-size="48" font-weight="700" fill="${COLORS.coral}">${data.insightsSaved}</text>
        <text x="0" y="40" font-family="Inter, sans-serif" font-size="22" fill="${COLORS.textMuted}">insights saved</text>
      </g>
      <g transform="translate(500, 0)">
        <text x="0" y="0" font-family="Plus Jakarta Sans, sans-serif" font-size="36" font-weight="600" fill="${COLORS.textPrimary}">${data.learningStyle}</text>
        <text x="0" y="40" font-family="Inter, sans-serif" font-size="22" fill="${COLORS.textMuted}">learning style</text>
      </g>
    </g>
  </g>
  
  <!-- Top Topics Section -->
  <g transform="translate(0, 900)">
    <text x="540" y="0" font-family="Plus Jakarta Sans, sans-serif" font-size="28" font-weight="600" fill="${COLORS.textSecondary}" text-anchor="middle" letter-spacing="4">TOP INTERESTS</text>
  </g>
  
  ${topicBars}
  
  <!-- Footer -->
  <g transform="translate(0, ${height - 150})">
    <text x="540" y="0" font-family="Inter, sans-serif" font-size="26" fill="${COLORS.textMuted}" text-anchor="middle">Discover your creative journey at</text>
    <text x="540" y="50" font-family="Plus Jakarta Sans, sans-serif" font-size="36" font-weight="600" fill="${COLORS.teal}" text-anchor="middle">ferni.ai</text>
  </g>
</svg>`;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

function formatWeekLabel(date: Date): string {
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const startOfWeek = new Date(date);
  startOfWeek.setDate(date.getDate() - date.getDay());
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);

  return `${startOfWeek.toLocaleDateString('en-US', options)} - ${endOfWeek.toLocaleDateString('en-US', options)}`;
}

function generateCardId(): string {
  return `card_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ============================================================================
// MAIN GENERATOR
// ============================================================================

export type CardData = MusicalDNACardData | DesertIslandCardData | GameVictoryCardData | WeeklyRecapCardData | CreativeProfileCardData;

/**
 * Generate SVG for a shareable card
 */
export function generateCardSVG(type: CardType, data: CardData): string {
  switch (type) {
    case 'musical-dna':
      return generateMusicalDNASVG(data as MusicalDNACardData);
    case 'desert-island':
      return generateDesertIslandSVG(data as DesertIslandCardData);
    case 'game-victory':
      return generateGameVictorySVG(data as GameVictoryCardData);
    case 'weekly-recap':
      return generateWeeklyRecapSVG(data as WeeklyRecapCardData);
    case 'creative-profile':
      return generateCreativeProfileSVG(data as CreativeProfileCardData);
    default:
      throw new Error(`Unknown card type: ${type}`);
  }
}

/**
 * Get card dimensions for a type
 */
export function getCardDimensions(type: CardType): { width: number; height: number } {
  return CARD_DIMENSIONS[type] || CARD_DIMENSIONS['musical-dna'];
}

/**
 * Create a shareable card record
 */
export function createShareableCard(
  type: CardType,
  userId: string,
  data: CardData,
  baseUrl: string
): ShareableCard {
  const id = generateCardId();
  const shareUrl = `${baseUrl}/share/${id}`;

  log.info({ type, userId, cardId: id }, '🃏 Created shareable card');

  return {
    id,
    type,
    userId,
    data,
    imageUrl: null, // Will be set after image generation
    shareUrl,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    viewCount: 0,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export { COLORS as CARD_COLORS, CARD_DIMENSIONS };

export default {
  generateCardSVG,
  getCardDimensions,
  createShareableCard,
};

