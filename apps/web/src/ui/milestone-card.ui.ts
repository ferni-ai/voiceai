/**
 * Milestone Card Generator
 *
 * Creates beautiful, shareable visual cards for milestone celebrations.
 * Uses canvas to generate images that users can download or share.
 *
 * BETTER THAN HUMAN:
 * - We create beautiful memories of your growth
 * - Each card is personalized to your journey
 * - Share your progress without sharing your conversations
 *
 * DESIGN:
 * - Warm, earthy color palette (Ferni brand)
 * - Clean, modern typography
 * - Subtle Ferni branding
 * - Optimized for social sharing (1200x630 for most platforms)
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('MilestoneCard');

// ============================================================================
// TYPES
// ============================================================================

export interface MilestoneCardData {
  milestoneName: string;
  milestoneMessage: string;
  category: 'relationship' | 'team' | 'conversation' | 'discovery' | 'sweet';
  daysTogeher?: number;
  streak?: number;
  celebratedAt?: Date;
}

export interface JourneySummaryCardData {
  celebrated: number;
  total: number;
  streak: number;
  daysTogether: number;
  topMilestones?: string[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Card dimensions optimized for social sharing
const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;

// Ferni brand colors
const COLORS = {
  background: '#FAF8F5', // Paper cream
  backgroundDark: '#2C2520', // Natural ink
  primary: '#4a6741', // Ferni sage
  primaryLight: '#6b8f5e',
  text: '#2C2520',
  textLight: '#70605a',
  textOnDark: '#FAF6F0',
  accent: {
    relationship: '#4a6741',
    team: '#3a6b73',
    conversation: '#5a6b8a',
    discovery: '#a67a6a',
    sweet: '#b8956a',
  },
};

// ============================================================================
// CARD GENERATION
// ============================================================================

/**
 * Generate a shareable milestone card image
 */
export async function generateMilestoneCard(data: MilestoneCardData): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');

  // Draw background
  drawBackground(ctx, data.category);

  // Draw content
  drawMilestoneContent(ctx, data);

  // Draw Ferni branding
  drawBranding(ctx);

  // Convert to blob
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to generate image'));
        }
      },
      'image/png',
      1.0
    );
  });
}

/**
 * Generate a journey summary card
 */
export async function generateJourneySummaryCard(data: JourneySummaryCardData): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');

  // Draw background with gradient
  drawSummaryBackground(ctx);

  // Draw summary content
  drawSummaryContent(ctx, data);

  // Draw Ferni branding
  drawBranding(ctx);

  // Convert to blob
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to generate image'));
        }
      },
      'image/png',
      1.0
    );
  });
}

// ============================================================================
// DRAWING FUNCTIONS
// ============================================================================

function drawBackground(ctx: CanvasRenderingContext2D, category: string): void {
  // Warm gradient background
  const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  gradient.addColorStop(0, COLORS.background);
  gradient.addColorStop(1, '#F5F0E8');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Category accent stripe at top
  const accentColor = COLORS.accent[category as keyof typeof COLORS.accent] || COLORS.primary;
  ctx.fillStyle = accentColor;
  ctx.fillRect(0, 0, CARD_WIDTH, 8);

  // Subtle pattern overlay
  drawSubtlePattern(ctx);
}

function drawSummaryBackground(ctx: CanvasRenderingContext2D): void {
  // Rich gradient for summary cards
  const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  gradient.addColorStop(0, '#4a6741');
  gradient.addColorStop(0.5, '#3d5a35');
  gradient.addColorStop(1, '#2d4428');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Subtle light overlay
  const overlay = ctx.createRadialGradient(
    CARD_WIDTH * 0.3,
    CARD_HEIGHT * 0.3,
    0,
    CARD_WIDTH * 0.3,
    CARD_HEIGHT * 0.3,
    CARD_WIDTH * 0.8
  );
  overlay.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
  overlay.addColorStop(1, 'rgba(0, 0, 0, 0.1)');

  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
}

function drawSubtlePattern(ctx: CanvasRenderingContext2D): void {
  // Very subtle dot pattern for texture
  ctx.fillStyle = 'rgba(74, 103, 65, 0.03)';
  for (let x = 0; x < CARD_WIDTH; x += 40) {
    for (let y = 0; y < CARD_HEIGHT; y += 40) {
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawMilestoneContent(ctx: CanvasRenderingContext2D, data: MilestoneCardData): void {
  const centerX = CARD_WIDTH / 2;

  // Category label
  ctx.font = '600 14px "Inter", sans-serif';
  ctx.fillStyle = COLORS.textLight;
  ctx.textAlign = 'center';
  ctx.letterSpacing = '2px';
  const categoryLabel = getCategoryLabel(data.category);
  ctx.fillText(categoryLabel.toUpperCase(), centerX, 180);

  // Milestone name
  ctx.font = '700 48px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = COLORS.text;
  ctx.fillText(data.milestoneName, centerX, 250);

  // Milestone message (the warm copy)
  ctx.font = '400 24px "Inter", sans-serif';
  ctx.fillStyle = COLORS.textLight;
  wrapText(ctx, data.milestoneMessage, centerX, 320, 800, 36);

  // Stats row
  const statsY = 460;
  const stats: string[] = [];

  if (data.daysTogeher && data.daysTogeher > 0) {
    stats.push(`${data.daysTogeher} days together`);
  }
  if (data.streak && data.streak > 1) {
    stats.push(`${data.streak} day streak`);
  }
  if (data.celebratedAt) {
    const dateStr = data.celebratedAt.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    stats.push(dateStr);
  }

  if (stats.length > 0) {
    ctx.font = '500 18px "Inter", sans-serif';
    ctx.fillStyle = COLORS.primary;
    ctx.fillText(stats.join('  •  '), centerX, statsY);
  }

  // Decorative icon
  drawCategoryIcon(ctx, data.category, centerX, 80);
}

function drawSummaryContent(ctx: CanvasRenderingContext2D, data: JourneySummaryCardData): void {
  const centerX = CARD_WIDTH / 2;

  // Eyebrow
  ctx.font = '600 14px "Inter", sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.textAlign = 'center';
  ctx.fillText('MY JOURNEY WITH FERNI', centerX, 160);

  // Main headline
  ctx.font = '700 56px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = COLORS.textOnDark;
  ctx.fillText('Our Story So Far', centerX, 240);

  // Stats grid
  const statsY = 360;
  const statSpacing = 200;
  const startX = centerX - statSpacing * 1.5;

  // Milestones
  drawStat(ctx, startX, statsY, String(data.celebrated), `of ${data.total} milestones`);

  // Days together
  drawStat(ctx, startX + statSpacing, statsY, String(data.daysTogether), 'days together');

  // Streak
  drawStat(ctx, startX + statSpacing * 2, statsY, String(data.streak), 'day streak');

  // Conversations (estimated)
  const estimatedConversations = Math.max(data.celebrated, data.daysTogether);
  drawStat(ctx, startX + statSpacing * 3, statsY, String(estimatedConversations), 'conversations');

  // Warm tagline
  ctx.font = '400 20px "Inter", sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.fillText('Every moment matters.', centerX, 520);
}

function drawStat(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  value: string,
  label: string
): void {
  // Value
  ctx.font = '700 42px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = COLORS.textOnDark;
  ctx.textAlign = 'center';
  ctx.fillText(value, x, y);

  // Label
  ctx.font = '400 14px "Inter", sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.fillText(label, x, y + 28);
}

function drawBranding(ctx: CanvasRenderingContext2D): void {
  // Ferni wordmark in corner
  ctx.font = '600 16px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = ctx.fillStyle === COLORS.textOnDark ? 'rgba(255,255,255,0.5)' : COLORS.textLight;
  ctx.textAlign = 'right';
  ctx.fillText('ferni.ai', CARD_WIDTH - 40, CARD_HEIGHT - 30);
}

function drawCategoryIcon(
  ctx: CanvasRenderingContext2D,
  category: string,
  x: number,
  y: number
): void {
  const color = COLORS.accent[category as keyof typeof COLORS.accent] || COLORS.primary;
  ctx.fillStyle = color;

  // Simple heart shape for all categories (could be enhanced per category)
  ctx.beginPath();
  const size = 24;
  ctx.moveTo(x, y + size / 4);
  ctx.bezierCurveTo(x, y, x - size / 2, y, x - size / 2, y + size / 4);
  ctx.bezierCurveTo(x - size / 2, y + size / 2, x, y + size * 0.75, x, y + size);
  ctx.bezierCurveTo(x, y + size * 0.75, x + size / 2, y + size / 2, x + size / 2, y + size / 4);
  ctx.bezierCurveTo(x + size / 2, y, x, y, x, y + size / 4);
  ctx.fill();
}

function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    relationship: 'Our Relationship',
    team: 'Team Connection',
    conversation: 'Our Conversations',
    discovery: 'Discovery',
    sweet: 'Sweet Moment',
  };
  return labels[category] || 'Milestone';
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
): void {
  const words = text.split(' ');
  let line = '';
  let currentY = y;

  for (const word of words) {
    const testLine = line + word + ' ';
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && line !== '') {
      ctx.fillText(line.trim(), x, currentY);
      line = word + ' ';
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }

  ctx.fillText(line.trim(), x, currentY);
}

// ============================================================================
// SHARE FUNCTIONS
// ============================================================================

/**
 * Download a milestone card as an image
 */
export async function downloadMilestoneCard(data: MilestoneCardData): Promise<void> {
  try {
    const blob = await generateMilestoneCard(data);
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `ferni-${data.milestoneName.toLowerCase().replace(/\s+/g, '-')}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
    log.info('Milestone card downloaded:', data.milestoneName);
  } catch (error) {
    log.error('Failed to download milestone card:', error);
    throw error;
  }
}

/**
 * Download a journey summary card
 */
export async function downloadJourneySummaryCard(data: JourneySummaryCardData): Promise<void> {
  try {
    const blob = await generateJourneySummaryCard(data);
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = 'my-journey-with-ferni.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
    log.info('Journey summary card downloaded');
  } catch (error) {
    log.error('Failed to download journey summary card:', error);
    throw error;
  }
}

/**
 * Share a milestone card using native share (with image)
 */
export async function shareMilestoneCard(data: MilestoneCardData): Promise<boolean> {
  try {
    const blob = await generateMilestoneCard(data);
    const file = new File([blob], 'ferni-milestone.png', { type: 'image/png' });

    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: data.milestoneName,
        text: `${data.milestoneMessage}\n\nferni.ai`,
      });
      log.info('Milestone card shared');
      return true;
    }

    // Fallback to download
    await downloadMilestoneCard(data);
    return false;
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      return false; // User cancelled
    }
    log.error('Failed to share milestone card:', error);
    throw error;
  }
}

/**
 * Share a journey summary card
 */
export async function shareJourneySummaryCard(data: JourneySummaryCardData): Promise<boolean> {
  try {
    const blob = await generateJourneySummaryCard(data);
    const file = new File([blob], 'my-journey-with-ferni.png', { type: 'image/png' });

    const shareText = [
      'My journey with Ferni:',
      `${data.celebrated}/${data.total} milestones`,
      data.streak > 1 ? `${data.streak} day streak` : '',
      `${data.daysTogether} days together`,
      '',
      'ferni.ai',
    ]
      .filter(Boolean)
      .join('\n');

    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: 'My Journey with Ferni',
        text: shareText,
      });
      log.info('Journey summary card shared');
      return true;
    }

    // Fallback to download
    await downloadJourneySummaryCard(data);
    return false;
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      return false;
    }
    log.error('Failed to share journey summary card:', error);
    throw error;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const milestoneCardUI = {
  generateMilestoneCard,
  generateJourneySummaryCard,
  downloadMilestoneCard,
  downloadJourneySummaryCard,
  shareMilestoneCard,
  shareJourneySummaryCard,
};

export default milestoneCardUI;
