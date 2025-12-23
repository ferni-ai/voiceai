/**
 * 🎨 Creative DNA Identity Card Generator
 *
 * Generates shareable identity cards showcasing a user's Creative DNA.
 * Cards can be shared on social media or downloaded as images.
 *
 * ✨ "BETTER THAN HUMAN" FEATURES:
 * - Beautiful, personalized visual representation
 * - Ferni-voiced personality insights
 * - Auto-generated based on engagement history
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { CreativeDNA } from './creative-dna.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface IdentityCardData {
  userId: string;
  personalityLabel: string;
  personalityDescription: string;
  topTopics: Array<{ topic: string; score: number }>;
  stats: {
    videosWatched: number;
    podcastsListened: number;
    insightsSaved: number;
  };
  generatedAt: string;
}

export interface IdentityCardStyles {
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;
}

// ============================================================================
// PERSONALITY VISUALS
// ============================================================================

/**
 * Personality types mapped to visual styles
 */
const PERSONALITY_STYLES: Record<string, IdentityCardStyles> = {
  'Deep Diver': {
    primaryColor: '#3a6b73',
    secondaryColor: '#2d5359',
    backgroundColor: '#f0f7f8',
    textColor: '#1a3a3f',
  },
  'Curious Explorer': {
    primaryColor: '#c4856a',
    secondaryColor: '#a86d55',
    backgroundColor: '#fdf8f5',
    textColor: '#3d2518',
  },
  'Reflective Thinker': {
    primaryColor: '#5a6b8a',
    secondaryColor: '#4a5a73',
    backgroundColor: '#f5f7fa',
    textColor: '#2a3545',
  },
  'Growth Seeker': {
    primaryColor: '#4a6741',
    secondaryColor: '#3d5a35',
    backgroundColor: '#f5f8f4',
    textColor: '#1a2818',
  },
  'Creative Spirit': {
    primaryColor: '#a67a6a',
    secondaryColor: '#8a635a',
    backgroundColor: '#faf6f4',
    textColor: '#3a2520',
  },
  default: {
    primaryColor: '#4a6741',
    secondaryColor: '#3d5a35',
    backgroundColor: '#fffdfb',
    textColor: '#2c2520',
  },
};

/**
 * Personality type to emoji mapping
 */
const PERSONALITY_EMOJIS: Record<string, string> = {
  'Deep Diver': '🌊',
  'Curious Explorer': '🧭',
  'Reflective Thinker': '🪷',
  'Growth Seeker': '🌱',
  'Creative Spirit': '✨',
};

// ============================================================================
// CARD GENERATION
// ============================================================================

/**
 * Generate identity card data from Creative DNA
 */
export function generateIdentityCardData(dna: CreativeDNA): IdentityCardData {
  return {
    userId: dna.userId,
    personalityLabel: dna.personalityLabel || 'Creative Soul',
    personalityDescription: dna.personalityDescription || 'Every journey is unique.',
    topTopics: dna.topTopics.slice(0, 5),
    stats: {
      videosWatched: dna.totalVideosWatched || 0,
      podcastsListened: dna.totalPodcastsListened || 0,
      insightsSaved: dna.totalInsightsSaved || 0,
    },
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Get visual styles for a personality type
 */
export function getPersonalityStyles(personalityLabel: string): IdentityCardStyles {
  return PERSONALITY_STYLES[personalityLabel] || PERSONALITY_STYLES.default;
}

/**
 * Generate HTML for a shareable identity card
 */
export function generateIdentityCardHTML(cardData: IdentityCardData): string {
  const styles = getPersonalityStyles(cardData.personalityLabel);
  const emoji = PERSONALITY_EMOJIS[cardData.personalityLabel] || '🌟';

  // Generate topic bars HTML
  const topicBarsHTML = cardData.topTopics
    .map(
      (topic) => `
    <div class="topic-bar">
      <span class="topic-name">${topic.topic}</span>
      <div class="bar-container">
        <div class="bar-fill" style="width: ${Math.min(100, topic.score)}%"></div>
      </div>
    </div>
  `
    )
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${cardData.personalityLabel} | Ferni Creative DNA</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      background: ${styles.backgroundColor};
      color: ${styles.textColor};
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .identity-card {
      width: 100%;
      max-width: 400px;
      background: white;
      border-radius: 24px;
      overflow: hidden;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.1);
    }

    .card-header {
      background: linear-gradient(135deg, ${styles.primaryColor}, ${styles.secondaryColor});
      color: white;
      padding: 32px 24px;
      text-align: center;
    }

    .personality-emoji {
      font-size: 48px;
      margin-bottom: 16px;
    }

    .personality-label {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 8px;
    }

    .personality-description {
      font-size: 14px;
      opacity: 0.9;
      line-height: 1.5;
    }

    .card-body {
      padding: 24px;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 24px;
      padding: 16px;
      background: ${styles.backgroundColor};
      border-radius: 12px;
    }

    .stat {
      text-align: center;
    }

    .stat-value {
      font-size: 24px;
      font-weight: 700;
      color: ${styles.primaryColor};
    }

    .stat-label {
      font-size: 11px;
      color: #666;
      margin-top: 4px;
    }

    .section-title {
      font-size: 12px;
      font-weight: 600;
      color: ${styles.primaryColor};
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 16px;
    }

    .topic-bar {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }

    .topic-name {
      width: 100px;
      font-size: 13px;
      color: #444;
      text-transform: capitalize;
    }

    .bar-container {
      flex: 1;
      height: 8px;
      background: #eee;
      border-radius: 4px;
      overflow: hidden;
    }

    .bar-fill {
      height: 100%;
      background: linear-gradient(90deg, ${styles.primaryColor}, ${styles.secondaryColor});
      border-radius: 4px;
    }

    .card-footer {
      padding: 16px 24px;
      border-top: 1px solid #eee;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .ferni-branding {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .ferni-logo {
      width: 24px;
      height: 24px;
      background: ${styles.primaryColor};
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 700;
      font-size: 12px;
    }

    .ferni-text {
      font-size: 12px;
      color: #888;
    }

    .generated-date {
      font-size: 11px;
      color: #aaa;
    }
  </style>
</head>
<body>
  <div class="identity-card">
    <div class="card-header">
      <div class="personality-emoji">${emoji}</div>
      <div class="personality-label">${cardData.personalityLabel}</div>
      <div class="personality-description">${cardData.personalityDescription}</div>
    </div>

    <div class="card-body">
      <div class="stats-grid">
        <div class="stat">
          <div class="stat-value">${cardData.stats.videosWatched}</div>
          <div class="stat-label">Videos</div>
        </div>
        <div class="stat">
          <div class="stat-value">${cardData.stats.podcastsListened}</div>
          <div class="stat-label">Podcasts</div>
        </div>
        <div class="stat">
          <div class="stat-value">${cardData.stats.insightsSaved}</div>
          <div class="stat-label">Insights</div>
        </div>
      </div>

      <div class="section-title">Top Interests</div>
      <div class="topic-bars">
        ${topicBarsHTML}
      </div>
    </div>

    <div class="card-footer">
      <div class="ferni-branding">
        <div class="ferni-logo">F</div>
        <span class="ferni-text">ferni.ai</span>
      </div>
      <span class="generated-date">${new Date(cardData.generatedAt).toLocaleDateString()}</span>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Generate a shareable URL-safe card data string
 */
export function generateShareableCardData(cardData: IdentityCardData): string {
  const minimalData = {
    p: cardData.personalityLabel,
    d: cardData.personalityDescription.slice(0, 80),
    t: cardData.topTopics.slice(0, 3).map((t) => t.topic),
    s: [
      cardData.stats.videosWatched,
      cardData.stats.podcastsListened,
      cardData.stats.insightsSaved,
    ],
  };

  return Buffer.from(JSON.stringify(minimalData)).toString('base64url');
}

/**
 * Parse a shareable card data string back to card data
 */
export function parseShareableCardData(encoded: string): IdentityCardData | null {
  try {
    const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString());
    return {
      userId: 'shared',
      personalityLabel: decoded.p,
      personalityDescription: decoded.d,
      topTopics: decoded.t.map((topic: string, index: number) => ({
        topic,
        score: 100 - index * 20,
      })),
      stats: {
        videosWatched: decoded.s[0],
        podcastsListened: decoded.s[1],
        insightsSaved: decoded.s[2],
      },
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    log.warn({ error: String(error) }, '⚠️ Failed to parse shareable card data');
    return null;
  }
}

/**
 * Generate Open Graph meta tags for social sharing
 */
export function generateOGMetaTags(cardData: IdentityCardData): string {
  const title = `I'm a ${cardData.personalityLabel} on Ferni`;
  const description = cardData.personalityDescription;
  const topTopics = cardData.topTopics
    .slice(0, 3)
    .map((t) => t.topic)
    .join(', ');

  return `
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}. Top interests: ${topTopics}" />
    <meta property="og:type" content="profile" />
    <meta property="og:image" content="https://ferni.ai/og/creative-dna.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
  `;
}

log.debug('🎨 Identity card generator loaded');
