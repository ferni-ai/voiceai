/**
 * 📤 Share Routes
 *
 * API endpoints for shareable cards and social sharing.
 *
 * Endpoints:
 * - POST /api/share/cards/generate - Generate a new shareable card
 * - GET /api/share/cards/:cardId - Get card metadata
 * - GET /api/share/cards/:cardId/image - Get card image (PNG)
 * - GET /api/share/cards/:cardId/svg - Get card as SVG
 * - GET /share/:cardId - Public share page (redirects to app or shows preview)
 *
 * @module ShareRoutes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { parseBody, sendJSON, sendError } from '../helpers.js';
import {
  generateCardSVG,
  createShareableCard,
  getCardDimensions,
  type CardData,
} from '../../services/sharing/card-generator.js';
import type { CardType, ShareableCard } from '../../services/musical-you/types.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';

const log = createLogger({ module: 'ShareRoutes' });

// ============================================================================
// IN-MEMORY STORAGE (Replace with Firestore in production)
// ============================================================================

const cardStore = new Map<string, ShareableCard>();
const cardSVGCache = new Map<string, string>();

// ============================================================================
// HELPERS
// ============================================================================

// parseBody, sendJSON, sendError imported from '../helpers.js'

function sendSVG(res: ServerResponse, svg: string): void {
  res.writeHead(200, {
    'Content-Type': 'image/svg+xml',
    'Cache-Control': 'public, max-age=86400', // 24 hours
  });
  res.end(svg);
}

function getBaseUrl(req: IncomingMessage): string {
  const host = req.headers.host || 'app.ferni.ai';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  return `${protocol}://${host}`;
}

// ============================================================================
// ROUTE HANDLERS
// ============================================================================

/**
 * POST /api/share/cards/generate
 * Generate a new shareable card
 */
async function handleGenerateCard(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const body = (await parseBody(req)) as {
      type: CardType;
      userId: string;
      data: CardData;
    };

    if (!body.type || !body.userId || !body.data) {
      sendError(res, 'Missing required fields: type, userId, data', 400);
      return;
    }

    const baseUrl = getBaseUrl(req);

    // Create the card record
    const card = createShareableCard(body.type, body.userId, body.data, baseUrl);

    // Generate and cache the SVG
    const svg = generateCardSVG(body.type, body.data);
    cardSVGCache.set(card.id, svg);

    // Store the card
    cardStore.set(card.id, card);

    // Update the image URL
    card.imageUrl = `${baseUrl}/api/share/cards/${card.id}/image`;

    log.info(
      { cardId: card.id, type: body.type, userId: body.userId },
      '🃏 Generated shareable card'
    );

    sendJSON(res, {
      success: true,
      card: {
        id: card.id,
        type: card.type,
        shareUrl: card.shareUrl,
        imageUrl: card.imageUrl,
        svgUrl: `${baseUrl}/api/share/cards/${card.id}/svg`,
        expiresAt: card.expiresAt,
      },
    });
  } catch (error) {
    log.error({ error }, '❌ Failed to generate card');
    sendError(res, 'Failed to generate card', 500);
  }
}

/**
 * GET /api/share/cards/:cardId
 * Get card metadata
 */
function handleGetCard(req: IncomingMessage, res: ServerResponse, cardId: string): void {
  const card = cardStore.get(cardId);

  if (!card) {
    sendError(res, 'Card not found', 404);
    return;
  }

  // Increment view count
  card.viewCount++;

  sendJSON(res, {
    success: true,
    card: {
      id: card.id,
      type: card.type,
      shareUrl: card.shareUrl,
      imageUrl: card.imageUrl,
      createdAt: card.createdAt,
      viewCount: card.viewCount,
    },
  });
}

/**
 * GET /api/share/cards/:cardId/svg
 * Get card as SVG
 */
function handleGetCardSVG(req: IncomingMessage, res: ServerResponse, cardId: string): void {
  const svg = cardSVGCache.get(cardId);

  if (!svg) {
    // Try to regenerate from stored card
    const card = cardStore.get(cardId);
    if (card) {
      const regeneratedSvg = generateCardSVG(card.type, card.data);
      cardSVGCache.set(cardId, regeneratedSvg);
      sendSVG(res, regeneratedSvg);
      return;
    }

    sendError(res, 'Card not found', 404);
    return;
  }

  sendSVG(res, svg);
}

/**
 * GET /api/share/cards/:cardId/image
 * Get card as PNG image
 *
 * Note: In production, this would use Sharp or Puppeteer for PNG conversion.
 * For now, we return the SVG with PNG content-type headers that browsers
 * can still render, or use a client-side conversion.
 */
function handleGetCardImage(req: IncomingMessage, res: ServerResponse, cardId: string): void {
  const svg = cardSVGCache.get(cardId);

  if (!svg) {
    const card = cardStore.get(cardId);
    if (card) {
      const regeneratedSvg = generateCardSVG(card.type, card.data);
      cardSVGCache.set(cardId, regeneratedSvg);
      // For now, return SVG (browsers will render it)
      // TODO: Convert to PNG using Sharp
      sendSVG(res, regeneratedSvg);
      return;
    }

    sendError(res, 'Card not found', 404);
    return;
  }

  // TODO: Convert SVG to PNG using Sharp
  // For now, return SVG which works for most use cases
  sendSVG(res, svg);
}

/**
 * GET /share/:cardId (public share page)
 * Returns an HTML page with Open Graph meta tags for social sharing
 */
function handleSharePage(req: IncomingMessage, res: ServerResponse, cardId: string): void {
  const card = cardStore.get(cardId);

  if (!card) {
    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end('<html><body><h1>Card not found</h1></body></html>');
    return;
  }

  const baseUrl = getBaseUrl(req);
  const imageUrl = `${baseUrl}/api/share/cards/${cardId}/svg`;
  const dimensions = getCardDimensions(card.type);

  // Generate title based on card type
  const titles: Record<CardType, string> = {
    'musical-dna': 'My Musical DNA | Ferni',
    'desert-island': 'My Desert Island Discs | Ferni',
    'game-victory': 'I Just Won! | Ferni',
    'weekly-recap': 'My Week in Music | Ferni',
    'milestone-achieved': 'Achievement Unlocked | Ferni',
    'challenge-invite': 'Challenge Me! | Ferni',
    'creative-profile': 'My Creative Profile | Ferni',
  };

  const descriptions: Record<CardType, string> = {
    'musical-dna': 'See my musical personality and what genres I know best.',
    'desert-island': 'The 5 songs I would take to a desert island.',
    'game-victory': 'Think you can beat my score? Try it!',
    'weekly-recap': 'My musical journey this week.',
    'milestone-achieved': 'Just unlocked a new achievement in Ferni!',
    'challenge-invite': 'Can you beat my music game score?',
    'creative-profile': 'Discover my creative journey and learning style.',
  };

  const title = titles[card.type] || 'Musical You | Ferni';
  const description = descriptions[card.type] || 'Check out my music profile on Ferni.';

  // Increment view count
  card.viewCount++;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="website">
  <meta property="og:url" content="${baseUrl}/share/${cardId}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:image:width" content="${dimensions.width}">
  <meta property="og:image:height" content="${dimensions.height}">
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="${baseUrl}/share/${cardId}">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${imageUrl}">
  
  <!-- Redirect to app after short delay -->
  <meta http-equiv="refresh" content="2;url=${baseUrl}/?card=${cardId}">
  
  <style>
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #F5F2ED;
      margin: 0;
      padding: 20px;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .card-container {
      max-width: 100%;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.15);
    }
    .card-container img {
      max-width: 100%;
      height: auto;
      display: block;
    }
    .loading {
      margin-top: 20px;
      color: #5C5248;
      font-size: 16px;
    }
    .cta {
      margin-top: 30px;
      padding: 16px 32px;
      background: #4a6741;
      color: white;
      text-decoration: none;
      border-radius: 50px;
      font-weight: 600;
      font-size: 18px;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .cta:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(74, 103, 65, 0.3);
    }
  </style>
</head>
<body>
  <div class="card-container">
    <img src="${imageUrl}" alt="${title}">
  </div>
  <p class="loading">Opening Ferni...</p>
  <a href="${baseUrl}" class="cta">Try Ferni</a>
</body>
</html>`;

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html);
}

// ============================================================================
// MAIN ROUTE HANDLER
// ============================================================================

/**
 * Handle all share-related routes
 */
export async function handleShareRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  const method = req.method || 'GET';

  // POST /api/share/cards/generate
  if (pathname === '/api/share/cards/generate' && method === 'POST') {
    await handleGenerateCard(req, res);
    return true;
  }

  // GET /api/share/cards/:cardId
  const cardMetaMatch = pathname.match(/^\/api\/share\/cards\/([^/]+)$/);
  if (cardMetaMatch && method === 'GET') {
    handleGetCard(req, res, cardMetaMatch[1]);
    return true;
  }

  // GET /api/share/cards/:cardId/svg
  const cardSvgMatch = pathname.match(/^\/api\/share\/cards\/([^/]+)\/svg$/);
  if (cardSvgMatch && method === 'GET') {
    handleGetCardSVG(req, res, cardSvgMatch[1]);
    return true;
  }

  // GET /api/share/cards/:cardId/image
  const cardImageMatch = pathname.match(/^\/api\/share\/cards\/([^/]+)\/image$/);
  if (cardImageMatch && method === 'GET') {
    handleGetCardImage(req, res, cardImageMatch[1]);
    return true;
  }

  // GET /share/:cardId (public share page)
  const sharePageMatch = pathname.match(/^\/share\/([^/]+)$/);
  if (sharePageMatch && method === 'GET') {
    handleSharePage(req, res, sharePageMatch[1]);
    return true;
  }

  return false;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default handleShareRoutes;
