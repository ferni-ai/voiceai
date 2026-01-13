#!/usr/bin/env node
/**
 * Developer Blog OG Image Generator
 *
 * Generates branded OG images for developer blog posts using SVG + Sharp.
 *
 * Usage:
 *   node generate-dev-blog-image.js --title "Getting Started" --category tutorial
 *   node generate-dev-blog-image.js --title "v1.2.3" --category changelog --version v1.2.3
 *   node generate-dev-blog-image.js --batch  # Generate all missing images
 *
 * Environment:
 *   None required (uses Sharp for SVG → PNG conversion)
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try to load Sharp
let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.error('❌ Sharp is required. Install with: pnpm add -D sharp');
  process.exit(1);
}

// Try to load gray-matter for batch mode
let matter;
try {
  matter = (await import('gray-matter')).default;
} catch {
  console.warn('⚠️  gray-matter not installed, batch mode unavailable');
}

const DEFAULT_OUTPUT = path.join(__dirname, '../apps/website/ferni-website/images/dev-blog');
const POSTS_DIR = path.join(__dirname, '../apps/website/ferni-website/src/dev-blog');

// Design tokens for developer blog (dark theme)
const TOKENS = {
  bg: {
    primary: '#0f172a',
    secondary: '#1e293b',
  },
  text: {
    primary: '#e2e8f0',
    secondary: '#94a3b8',
  },
  accent: {
    cyan: '#38bdf8',
    emerald: '#10b981',
    violet: '#8b5cf6',
    amber: '#f59e0b',
    pink: '#ec4899',
    blue: '#3b82f6',
  },
};

// Category configurations
const CATEGORIES = {
  tutorial: {
    label: 'TUTORIAL',
    accent: TOKENS.accent.emerald,
    icon: 'book',
  },
  tutorials: {
    label: 'TUTORIAL',
    accent: TOKENS.accent.emerald,
    icon: 'book',
  },
  changelog: {
    label: 'CHANGELOG',
    accent: TOKENS.accent.amber,
    icon: 'rocket',
  },
  'deep-dive': {
    label: 'DEEP DIVE',
    accent: TOKENS.accent.violet,
    icon: 'microscope',
  },
  'deep-dives': {
    label: 'DEEP DIVE',
    accent: TOKENS.accent.violet,
    icon: 'microscope',
  },
  'case-study': {
    label: 'CASE STUDY',
    accent: TOKENS.accent.cyan,
    icon: 'building',
  },
  community: {
    label: 'COMMUNITY',
    accent: TOKENS.accent.pink,
    icon: 'users',
  },
  'quick-tips': {
    label: 'QUICK TIP',
    accent: TOKENS.accent.cyan,
    icon: 'zap',
  },
  'quick-tip': {
    label: 'QUICK TIP',
    accent: TOKENS.accent.cyan,
    icon: 'zap',
  },
  announcements: {
    label: 'ANNOUNCEMENT',
    accent: TOKENS.accent.blue,
    icon: 'megaphone',
  },
  'integration-guides': {
    label: 'INTEGRATION',
    accent: TOKENS.accent.emerald,
    icon: 'plug',
  },
  'technical-deep-dives': {
    label: 'DEEP DIVE',
    accent: TOKENS.accent.violet,
    icon: 'microscope',
  },
  'industry-insights': {
    label: 'INSIGHTS',
    accent: TOKENS.accent.violet,
    icon: 'lightbulb',
  },
  roadmap: {
    label: 'ROADMAP',
    accent: TOKENS.accent.blue,
    icon: 'map',
  },
  default: {
    label: 'DEVELOPER',
    accent: TOKENS.accent.cyan,
    icon: 'code',
  },
};

function getCategory(categoryName) {
  const key = categoryName?.toLowerCase().replace(/\s+/g, '-') || 'default';
  return CATEGORIES[key] || CATEGORIES.default;
}

function wrapText(text, maxChars) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length <= maxChars) {
      currentLine = (currentLine + ' ' + word).trim();
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines.slice(0, 3); // Max 3 lines
}

function generateSVG({ title, category, version }) {
  const cat = getCategory(category);
  const lines = wrapText(title, 35);

  // Calculate title Y positions
  const titleStartY = 200;
  const lineHeight = 70;

  const titleLines = lines
    .map(
      (line, i) => `
    <text x="80" y="${titleStartY + i * lineHeight}"
          font-family="Inter, -apple-system, sans-serif"
          font-size="52" font-weight="700" fill="${TOKENS.text.primary}">
      ${escapeXml(line)}
    </text>
  `
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Background gradient -->
    <linearGradient id="bg-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${TOKENS.bg.primary}"/>
      <stop offset="100%" style="stop-color:${TOKENS.bg.secondary}"/>
    </linearGradient>

    <!-- Dot grid pattern -->
    <pattern id="dot-grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <circle cx="20" cy="20" r="1.5" fill="white" opacity="0.08"/>
    </pattern>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bg-gradient)"/>
  <rect width="1200" height="630" fill="url(#dot-grid)"/>

  <!-- Left accent bar -->
  <rect x="60" y="80" width="6" height="120" rx="3" fill="${cat.accent}"/>

  <!-- Category badge -->
  <rect x="90" y="80" width="${cat.label.length * 12 + 40}" height="40" rx="20"
        fill="${cat.accent}" opacity="0.15"/>
  <text x="110" y="108"
        font-family="Inter, -apple-system, sans-serif"
        font-size="16" font-weight="600" letter-spacing="0.05em"
        fill="${cat.accent}">
    ${cat.label}
  </text>

  <!-- Title -->
  ${titleLines}

  <!-- Version badge (if changelog) -->
  ${
    version
      ? `
    <rect x="80" y="${titleStartY + lines.length * lineHeight + 20}" width="${version.length * 14 + 24}" height="36" rx="6"
          fill="${TOKENS.bg.secondary}" stroke="${TOKENS.accent.cyan}" stroke-opacity="0.3"/>
    <text x="92" y="${titleStartY + lines.length * lineHeight + 45}"
          font-family="JetBrains Mono, monospace"
          font-size="18" font-weight="500" fill="${TOKENS.text.secondary}">
      ${escapeXml(version)}
    </text>
  `
      : ''
  }

  <!-- Ferni eyes logo (bottom right) -->
  <g transform="translate(1080, 560)">
    <circle cx="0" cy="0" r="30" fill="${cat.accent}" opacity="0.1"/>
    <!-- Luxo-style eyes -->
    <ellipse cx="-10" cy="0" rx="6" ry="8" fill="white"/>
    <ellipse cx="10" cy="0" rx="6" ry="8" fill="white"/>
  </g>

  <!-- Domain watermark -->
  <text x="80" y="580"
        font-family="Inter, -apple-system, sans-serif"
        font-size="18" fill="${TOKENS.text.secondary}">
    developers.ferni.ai
  </text>
</svg>`;
}

function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function generateImage({ title, category, version, output, filename }) {
  const svg = generateSVG({ title, category, version });

  const outputFilename = filename || `${slugify(title)}.png`;
  const outputPath = path.join(output, outputFilename);

  await fs.mkdir(output, { recursive: true });

  await sharp(Buffer.from(svg)).png().toFile(outputPath);

  console.log(`✅ Generated: ${outputFilename}`);
  return outputPath;
}

async function batchGenerate() {
  if (!matter) {
    console.error('❌ gray-matter required for batch mode. Install with: pnpm add -D gray-matter');
    process.exit(1);
  }

  console.log('🔍 Scanning for posts missing images...');

  let posts;
  try {
    posts = await fs.readdir(POSTS_DIR);
  } catch (error) {
    console.error('❌ Could not read posts directory:', POSTS_DIR);
    process.exit(1);
  }

  let existingImages;
  try {
    existingImages = new Set(await fs.readdir(DEFAULT_OUTPUT));
  } catch {
    existingImages = new Set();
  }

  let generated = 0;

  for (const file of posts) {
    if (!file.endsWith('.md') || file === 'dev-blog.json') continue;

    const content = await fs.readFile(path.join(POSTS_DIR, file), 'utf-8');
    const { data } = matter(content);

    const expectedImage = data.image || `${file.replace('.md', '')}.png`;

    if (!existingImages.has(expectedImage)) {
      console.log(`📷 Generating: ${data.title || file}`);

      await generateImage({
        title: data.title || file.replace('.md', ''),
        category: data.category || 'default',
        version: data.version,
        output: DEFAULT_OUTPUT,
        filename: expectedImage,
      });

      generated++;
    }
  }

  console.log(`\n✨ Generated ${generated} images`);
}

async function main() {
  const args = process.argv.slice(2);

  // Batch mode
  if (args.includes('--batch')) {
    return batchGenerate();
  }

  // Single image mode
  const titleIndex = args.indexOf('--title');
  const categoryIndex = args.indexOf('--category');
  const versionIndex = args.indexOf('--version');
  const outputIndex = args.indexOf('--output');

  if (titleIndex === -1) {
    console.log(`
Developer Blog OG Image Generator

Usage:
  Single image:
    node generate-dev-blog-image.js --title "Your Title" --category tutorial
    node generate-dev-blog-image.js --title "v1.2.3" --category changelog --version v1.2.3

  Batch mode (generate all missing):
    node generate-dev-blog-image.js --batch

Options:
  --title      Post title (required for single mode)
  --category   Category: tutorial, changelog, deep-dive, case-study, community, quick-tip
  --version    Version string (for changelog posts)
  --output     Output directory (default: images/dev-blog/)
  --batch      Generate images for all posts missing them
`);
    process.exit(0);
  }

  const title = args[titleIndex + 1];
  const category = categoryIndex !== -1 ? args[categoryIndex + 1] : 'default';
  const version = versionIndex !== -1 ? args[versionIndex + 1] : null;
  const output = outputIndex !== -1 ? args[outputIndex + 1] : DEFAULT_OUTPUT;

  await generateImage({ title, category, version, output });
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
