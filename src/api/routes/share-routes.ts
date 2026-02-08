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
import sharp from 'sharp';
import { getPersonaColor, getPersonaGlowColor } from '../../config/brand-colors.js';
import type { CardType, ShareableCard } from '../../services/musical-you/types.js';
import {
  createShareableCard,
  generateCardSVG,
  getCardDimensions,
  type CardData,
} from '../../services/sharing/card-generator.js';
import { cleanForFirestore, getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { parseBody, sendError, sendJSON } from '../helpers.js';

const log = createLogger({ module: 'ShareRoutes' });

// ============================================================================
// FIRESTORE-BACKED STORAGE (with in-memory cache for hot reads)
// ============================================================================

const CARDS_COLLECTION = 'shareable_cards';

/** In-memory cache for hot card reads (avoids Firestore roundtrip on every image request) */
const cardCache = new Map<string, ShareableCard>();
const svgCache = new Map<string, string>();
const pngCache = new Map<string, Buffer>();

// Cache TTL for PNG images (1 hour)
const PNG_CACHE_TTL_MS = 60 * 60 * 1000;
const pngCacheTimestamps = new Map<string, number>();

/** Maximum in-memory cache size to prevent unbounded growth */
const MAX_CACHE_SIZE = 500;

/**
 * Save a card to Firestore and local cache.
 */
async function saveCard(card: ShareableCard): Promise<void> {
  // Always cache locally for fast reads
  if (cardCache.size >= MAX_CACHE_SIZE) {
    // Evict oldest entry
    const firstKey = cardCache.keys().next().value;
    if (firstKey) {
      cardCache.delete(firstKey);
      svgCache.delete(firstKey);
      pngCache.delete(firstKey);
      pngCacheTimestamps.delete(firstKey);
    }
  }
  cardCache.set(card.id, card);

  // Persist to Firestore
  const db = getFirestoreDb();
  if (db) {
    try {
      await db.collection(CARDS_COLLECTION).doc(card.id).set(cleanForFirestore(card));
    } catch (err) {
      log.warn(
        { error: String(err), cardId: card.id },
        'Failed to persist card to Firestore, serving from cache'
      );
    }
  }
}

/**
 * Load a card from cache or Firestore.
 */
async function loadCard(cardId: string): Promise<ShareableCard | null> {
  // Check local cache first
  const cached = cardCache.get(cardId);
  if (cached) return cached;

  // Fall back to Firestore
  const db = getFirestoreDb();
  if (db) {
    try {
      const doc = await db.collection(CARDS_COLLECTION).doc(cardId).get();
      if (doc.exists) {
        const card = doc.data() as ShareableCard;
        cardCache.set(cardId, card); // Populate cache
        return card;
      }
    } catch (err) {
      log.warn({ error: String(err), cardId }, 'Failed to load card from Firestore');
    }
  }

  return null;
}

/**
 * Increment view count in Firestore (fire-and-forget).
 */
function incrementViewCount(cardId: string): void {
  const db = getFirestoreDb();
  if (db) {
    void (async () => {
      try {
        const { FieldValue } = await import('firebase-admin/firestore');
        await db
          .collection(CARDS_COLLECTION)
          .doc(cardId)
          .update({
            viewCount: FieldValue.increment(1),
          });
      } catch {
        // Fire-and-forget: view count is non-critical
      }
    })();
  }
}

/**
 * Convert SVG to PNG using Sharp
 */
async function convertSvgToPng(
  svg: string,
  dimensions: { width: number; height: number }
): Promise<Buffer> {
  try {
    // Convert SVG string to buffer
    const svgBuffer = Buffer.from(svg);

    // Use sharp to convert SVG to PNG
    const pngBuffer = await sharp(svgBuffer)
      .resize(dimensions.width, dimensions.height)
      .png({
        quality: 90,
        compressionLevel: 6,
      })
      .toBuffer();

    return pngBuffer;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to convert SVG to PNG');
    throw error;
  }
}

/**
 * Send PNG image response
 */
function sendPNG(res: ServerResponse, buffer: Buffer): void {
  res.writeHead(200, {
    'Content-Type': 'image/png',
    'Content-Length': buffer.length,
    'Cache-Control': 'public, max-age=3600', // 1 hour
  });
  res.end(buffer);
}

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
    svgCache.set(card.id, svg);

    // Persist to Firestore + local cache
    await saveCard(card);

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
async function handleGetCard(
  req: IncomingMessage,
  res: ServerResponse,
  cardId: string
): Promise<void> {
  try {
    const card = await loadCard(cardId);

    if (!card) {
      sendError(res, 'Card not found', 404);
      return;
    }

    // Increment view count (fire-and-forget)
    card.viewCount = (card.viewCount || 0) + 1;
    incrementViewCount(cardId);

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
  } catch (error) {
    log.error({ error: String(error), cardId }, 'Failed to get card');
    sendError(res, 'Failed to get card', 500);
  }
}

/**
 * GET /api/share/cards/:cardId/svg
 * Get card as SVG
 */
async function handleGetCardSVG(
  req: IncomingMessage,
  res: ServerResponse,
  cardId: string
): Promise<void> {
  try {
    // Check SVG cache first
    const cachedSvg = svgCache.get(cardId);
    if (cachedSvg) {
      sendSVG(res, cachedSvg);
      return;
    }

    // Try to regenerate from stored card
    const card = await loadCard(cardId);
    if (card) {
      const regeneratedSvg = generateCardSVG(card.type, card.data);
      svgCache.set(cardId, regeneratedSvg);
      sendSVG(res, regeneratedSvg);
      return;
    }

    sendError(res, 'Card not found', 404);
  } catch (error) {
    log.error({ error: String(error), cardId }, 'Failed to get card SVG');
    sendError(res, 'Failed to get card SVG', 500);
  }
}

/**
 * GET /api/share/cards/:cardId/image
 * Get card as PNG image using Sharp for conversion
 */
async function handleGetCardImage(
  req: IncomingMessage,
  res: ServerResponse,
  cardId: string
): Promise<void> {
  try {
    // Check PNG cache first (with TTL)
    const cachedPng = pngCache.get(cardId);
    const cacheTimestamp = pngCacheTimestamps.get(cardId);

    if (cachedPng && cacheTimestamp && Date.now() - cacheTimestamp < PNG_CACHE_TTL_MS) {
      sendPNG(res, cachedPng);
      return;
    }

    // Get the card
    const card = await loadCard(cardId);
    if (!card) {
      sendError(res, 'Card not found', 404);
      return;
    }

    // Get or generate SVG
    let svg = svgCache.get(cardId);
    if (!svg) {
      svg = generateCardSVG(card.type, card.data);
      svgCache.set(cardId, svg);
    }

    // Get dimensions for the card type
    const dimensions = getCardDimensions(card.type);

    // Convert SVG to PNG
    const pngBuffer = await convertSvgToPng(svg, dimensions);

    // Cache the PNG in memory (not persisted - regenerated on demand)
    pngCache.set(cardId, pngBuffer);
    pngCacheTimestamps.set(cardId, Date.now());

    log.debug({ cardId, pngSize: pngBuffer.length }, 'PNG generated from SVG');

    sendPNG(res, pngBuffer);
  } catch (error) {
    log.error({ error: String(error), cardId }, 'Failed to generate PNG image');
    // Fallback to SVG if PNG conversion fails
    const card = await loadCard(cardId);
    if (card) {
      const svg = svgCache.get(cardId) || generateCardSVG(card.type, card.data);
      sendSVG(res, svg);
    } else {
      sendError(res, 'Failed to generate image', 500);
    }
  }
}

/**
 * GET /share/:cardId (public share page)
 * Returns an HTML page with Open Graph meta tags for social sharing
 */
async function handleSharePage(
  req: IncomingMessage,
  res: ServerResponse,
  cardId: string
): Promise<void> {
  const card = await loadCard(cardId);

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

  // Increment view count (fire-and-forget)
  card.viewCount = (card.viewCount || 0) + 1;
  incrementViewCount(cardId);

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
      background: ${getPersonaColor('ferni')};
      color: white;
      text-decoration: none;
      border-radius: 50px;
      font-weight: 600;
      font-size: 18px;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .cta:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 20px ${getPersonaGlowColor('ferni')};
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
    await handleGetCard(req, res, cardMetaMatch[1]);
    return true;
  }

  // GET /api/share/cards/:cardId/svg
  const cardSvgMatch = pathname.match(/^\/api\/share\/cards\/([^/]+)\/svg$/);
  if (cardSvgMatch && method === 'GET') {
    await handleGetCardSVG(req, res, cardSvgMatch[1]);
    return true;
  }

  // GET /api/share/cards/:cardId/image
  const cardImageMatch = pathname.match(/^\/api\/share\/cards\/([^/]+)\/image$/);
  if (cardImageMatch && method === 'GET') {
    await handleGetCardImage(req, res, cardImageMatch[1]);
    return true;
  }

  // GET /share/:cardId (public share page)
  const sharePageMatch = pathname.match(/^\/share\/([^/]+)$/);
  if (sharePageMatch && method === 'GET') {
    await handleSharePage(req, res, sharePageMatch[1]);
    return true;
  }

  return false;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default handleShareRoutes;
