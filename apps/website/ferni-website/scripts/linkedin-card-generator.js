#!/usr/bin/env node
/**
 * LinkedIn Social Card Generator
 *
 * Generates SVG cards for Ferni's LinkedIn company page posts.
 * Uses brand colors and typography for consistent visual identity.
 *
 * Card Types:
 * - zen-wisdom: Daily Wisdom posts with Japanese kanji
 * - thought-leadership: Insight-to-Action pillar content
 * - quote: Simple quote cards
 *
 * Usage:
 *   node linkedin-card-generator.js --type=zen-wisdom --kanji=金継ぎ --romaji=Kintsugi --english="Golden repair" --wisdom="The cracks become the most beautiful part."
 *   node linkedin-card-generator.js --type=thought-leadership --title="The Loneliness Gap" --subtitle="What if the problem isn't connection—it's depth?"
 *   node linkedin-card-generator.js --generate-week=1
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// FERNI BRAND COLORS
// ============================================================================

const COLORS = {
  // Backgrounds
  cream: '#FFFDFB',
  warmCream: '#F5F1E8',
  warmGray: '#E8E4DC',
  dark: '#2C2520',

  // Primary
  ferni: '#4a6741',      // Sage green
  ferniLight: '#5d7a54',
  ferniDark: '#3d5a35',

  // Text
  textPrimary: '#2C2520',
  textSecondary: '#5C5248',
  textMuted: '#7A6F63',
  textLight: '#FFFDFB',

  // Accents
  gold: '#C4A35A',
  coral: '#C4856A',
  teal: '#3A6B73',
  terracotta: '#a67a6a',
  amber: '#b8956a',
};

// LinkedIn optimal dimensions
const DIMENSIONS = {
  standard: { width: 1200, height: 627 },  // LinkedIn feed
  square: { width: 1080, height: 1080 },   // Square format
  story: { width: 1080, height: 1920 },    // Story format
};

// ============================================================================
// DAILY WISDOM CONTENT (13-week series)
// ============================================================================

const ZEN_WISDOM_CONTENT = [
  // Week 1
  { kanji: '金継ぎ', romaji: 'Kintsugi', english: 'Golden repair', wisdom: 'Your wounds don\'t diminish you. They\'re where the light gets in.' },
  { kanji: '一期一会', romaji: 'Ichi-go Ichi-e', english: 'One time, one meeting', wisdom: 'This moment will never come again. Give it your full attention.' },
  { kanji: '間', romaji: 'Ma', english: 'Negative space', wisdom: 'What you leave out matters as much as what you include.' },
  { kanji: '侘寂', romaji: 'Wabi-sabi', english: 'Beauty in imperfection', wisdom: 'The crack in the bowl is not a flaw. It is the bowl\'s story.' },

  // Week 2
  { kanji: '森林浴', romaji: 'Shinrin-yoku', english: 'Forest bathing', wisdom: 'Sometimes the best therapy is unplugging and walking among trees.' },
  { kanji: '改善', romaji: 'Kaizen', english: 'Continuous improvement', wisdom: 'A journey of a thousand miles begins with a single step.' },
  { kanji: '木漏れ日', romaji: 'Komorebi', english: 'Sunlight through leaves', wisdom: 'Some beauty can\'t be manufactured. Only witnessed.' },
  { kanji: '花鳥風月', romaji: 'Kachō Fūgetsu', english: 'Flowers, birds, wind, moon', wisdom: 'Find beauty in nature\'s simple gifts before seeking it elsewhere.' },

  // Week 3
  { kanji: '物の哀れ', romaji: 'Mono no Aware', english: 'The pathos of things', wisdom: 'The beauty of cherry blossoms is inseparable from the fact that they fall.' },
  { kanji: '生きがい', romaji: 'Ikigai', english: 'Reason for being', wisdom: 'What you love × What you\'re good at × What the world needs × What you can be paid for.' },
  { kanji: '結び', romaji: 'Musubi', english: 'Connection', wisdom: 'You are not as alone as you feel. The threads of connection extend beyond what you can see.' },
  { kanji: '慈悲', romaji: 'Jihi', english: 'Compassion', wisdom: 'True friendship is not possession. It is presence.' },

  // Week 4
  { kanji: '無心', romaji: 'Mushin', english: 'No-mind', wisdom: 'The expert acts without thinking. That\'s not the absence of thought—it\'s its transcendence.' },
  { kanji: '気', romaji: 'Ki', english: 'Life energy', wisdom: 'Your energy introduces you before you speak.' },
  { kanji: '和', romaji: 'Wa', english: 'Harmony', wisdom: 'Harmony is not the absence of conflict. It is the art of navigating it with grace.' },
  { kanji: '心', romaji: 'Kokoro', english: 'Heart-mind', wisdom: 'In Japanese, heart and mind are the same word. Perhaps they knew something we forgot.' },

  // Additional concepts for full quarter
  { kanji: '幽玄', romaji: 'Yūgen', english: 'Mysterious depth', wisdom: 'Some things are meant to be felt, not understood.' },
  { kanji: '渋い', romaji: 'Shibui', english: 'Refined simplicity', wisdom: 'True elegance is the elimination of excess.' },
  { kanji: '縁', romaji: 'En', english: 'Fateful coincidence', wisdom: 'The invisible threads that connect moments, people, and experiences.' },
  { kanji: '空', romaji: 'Kū', english: 'Emptiness', wisdom: 'The cup must be empty before it can be filled.' },
  { kanji: '柔', romaji: 'Jū', english: 'Gentleness', wisdom: 'Water is soft, yet it carves mountains.' },
  { kanji: '初心', romaji: 'Shoshin', english: 'Beginner\'s mind', wisdom: 'In the beginner\'s mind there are many possibilities. In the expert\'s mind there are few.' },
  { kanji: '正念', romaji: 'Shōnen', english: 'Right mindfulness', wisdom: 'Be where your feet are.' },
  { kanji: '道', romaji: 'Dō', english: 'The way', wisdom: 'The path is made by walking.' },
];

// ============================================================================
// SVG TEMPLATES
// ============================================================================

/**
 * Generate Zen Wisdom card SVG
 * Clean, minimal design with Japanese kanji featured prominently
 */
function generateZenWisdomSVG({ kanji, romaji, english, wisdom, index = 0 }) {
  const { width, height } = DIMENSIONS.standard;

  // Alternate accent colors for variety
  const accentColors = [COLORS.ferni, COLORS.teal, COLORS.gold, COLORS.terracotta];
  const accent = accentColors[index % accentColors.length];

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${COLORS.cream}"/>
      <stop offset="100%" style="stop-color:${COLORS.warmCream}"/>
    </linearGradient>
    <linearGradient id="accentGradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:${accent}"/>
      <stop offset="100%" style="stop-color:${COLORS.ferniLight}"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="${width}" height="${height}" fill="url(#bgGradient)"/>

  <!-- Left accent bar -->
  <rect x="0" y="0" width="8" height="${height}" fill="url(#accentGradient)"/>

  <!-- Subtle texture pattern -->
  <pattern id="texture" patternUnits="userSpaceOnUse" width="100" height="100">
    <circle cx="50" cy="50" r="0.5" fill="${COLORS.textMuted}" opacity="0.1"/>
  </pattern>
  <rect width="${width}" height="${height}" fill="url(#texture)" opacity="0.5"/>

  <!-- Content layout: Kanji on left, text on right -->

  <!-- Kanji section (left side) -->
  <g transform="translate(80, ${height / 2})">
    <!-- Large kanji character -->
    <text x="0" y="0"
          font-family="Noto Sans JP, Yu Gothic, Meiryo, sans-serif"
          font-size="180"
          font-weight="300"
          fill="${COLORS.textPrimary}"
          text-anchor="start"
          dominant-baseline="middle"
          letter-spacing="10">${kanji}</text>
  </g>

  <!-- Divider line -->
  <line x1="480" y1="100" x2="480" y2="${height - 100}" stroke="${accent}" stroke-width="1" opacity="0.3"/>

  <!-- Text section (right side) -->
  <g transform="translate(540, 0)">
    <!-- Romaji pronunciation -->
    <text x="0" y="180"
          font-family="Plus Jakarta Sans, Inter, sans-serif"
          font-size="28"
          font-weight="500"
          fill="${accent}"
          letter-spacing="4">${romaji}</text>

    <!-- English translation -->
    <text x="0" y="220"
          font-family="Plus Jakarta Sans, Inter, sans-serif"
          font-size="20"
          font-weight="400"
          fill="${COLORS.textSecondary}">"${english}"</text>

    <!-- Wisdom quote -->
    <text x="0" y="300"
          font-family="Crimson Text, Georgia, serif"
          font-size="32"
          font-weight="400"
          font-style="italic"
          fill="${COLORS.textPrimary}">
      ${wrapText(wisdom, 45).map((line, i) => `<tspan x="0" dy="${i === 0 ? 0 : 44}">${line}</tspan>`).join('')}
    </text>

    <!-- Hashtags hint -->
    <text x="0" y="${height - 100}"
          font-family="Inter, sans-serif"
          font-size="16"
          fill="${COLORS.textMuted}">#JapaneseWisdom #DailyReflection #Mindfulness</text>
  </g>

  <!-- Ferni branding (bottom right) -->
  <g transform="translate(${width - 180}, ${height - 60})">
    <text x="0" y="0"
          font-family="Plus Jakarta Sans, sans-serif"
          font-size="24"
          font-weight="600"
          fill="${COLORS.ferni}">ferni.ai</text>
  </g>

  <!-- Series indicator (bottom left) -->
  <text x="80" y="${height - 40}"
        font-family="Inter, sans-serif"
        font-size="14"
        fill="${COLORS.textMuted}">Daily Wisdom Series</text>
</svg>`;
}

/**
 * Generate Thought Leadership card SVG
 * For pillar content and deep dive articles
 */
function generateThoughtLeadershipSVG({ title, subtitle, insight = null, cta = 'Read more at ferni.ai' }) {
  const { width, height } = DIMENSIONS.standard;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${COLORS.warmCream}"/>
      <stop offset="60%" style="stop-color:${COLORS.cream}"/>
    </linearGradient>
    <linearGradient id="ferniGradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:${COLORS.ferniDark}"/>
      <stop offset="100%" style="stop-color:${COLORS.ferniLight}"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="${width}" height="${height}" fill="url(#bgGradient)"/>

  <!-- Top accent bar -->
  <rect x="0" y="0" width="${width}" height="6" fill="url(#ferniGradient)"/>

  <!-- Decorative corner element -->
  <circle cx="${width - 100}" cy="100" r="200" fill="${COLORS.ferni}" opacity="0.03"/>
  <circle cx="${width - 100}" cy="100" r="150" fill="${COLORS.ferni}" opacity="0.03"/>

  <!-- Main content -->
  <g transform="translate(80, 140)">
    <!-- Title -->
    <text x="0" y="0"
          font-family="Plus Jakarta Sans, sans-serif"
          font-size="56"
          font-weight="700"
          fill="${COLORS.textPrimary}">
      ${wrapText(title, 28).map((line, i) => `<tspan x="0" dy="${i === 0 ? 0 : 68}">${line}</tspan>`).join('')}
    </text>

    <!-- Subtitle / key insight -->
    <text x="0" y="${wrapText(title, 28).length * 68 + 60}"
          font-family="Crimson Text, Georgia, serif"
          font-size="28"
          font-style="italic"
          fill="${COLORS.textSecondary}">
      ${wrapText(subtitle, 55).map((line, i) => `<tspan x="0" dy="${i === 0 ? 0 : 38}">${line}</tspan>`).join('')}
    </text>

    ${insight ? `
    <!-- Key insight callout -->
    <g transform="translate(0, ${wrapText(title, 28).length * 68 + wrapText(subtitle, 55).length * 38 + 100})">
      <rect x="0" y="0" width="600" height="80" rx="8" fill="${COLORS.ferni}" opacity="0.08"/>
      <text x="20" y="50"
            font-family="Inter, sans-serif"
            font-size="20"
            font-weight="500"
            fill="${COLORS.ferni}">${insight}</text>
    </g>
    ` : ''}
  </g>

  <!-- CTA -->
  <text x="80" y="${height - 80}"
        font-family="Plus Jakarta Sans, sans-serif"
        font-size="22"
        font-weight="600"
        fill="${COLORS.ferni}">${cta}</text>

  <!-- Ferni branding -->
  <g transform="translate(${width - 180}, ${height - 60})">
    <text x="0" y="0"
          font-family="Plus Jakarta Sans, sans-serif"
          font-size="24"
          font-weight="600"
          fill="${COLORS.ferni}">ferni.ai</text>
  </g>
</svg>`;
}

/**
 * Generate simple Quote card SVG
 */
function generateQuoteSVG({ quote, attribution = 'Ferni', context = null }) {
  const { width, height } = DIMENSIONS.standard;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${COLORS.cream}"/>
      <stop offset="100%" style="stop-color:${COLORS.warmCream}"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="${width}" height="${height}" fill="url(#bgGradient)"/>

  <!-- Large quotation mark -->
  <text x="60" y="200"
        font-family="Crimson Text, Georgia, serif"
        font-size="300"
        fill="${COLORS.ferni}"
        opacity="0.1">"</text>

  <!-- Quote text -->
  <g transform="translate(100, ${height / 2 - 60})">
    <text x="0" y="0"
          font-family="Crimson Text, Georgia, serif"
          font-size="36"
          font-weight="400"
          fill="${COLORS.textPrimary}">
      ${wrapText(quote, 45).map((line, i) => `<tspan x="0" dy="${i === 0 ? 0 : 48}">${line}</tspan>`).join('')}
    </text>
  </g>

  <!-- Attribution -->
  <text x="100" y="${height - 100}"
        font-family="Plus Jakarta Sans, sans-serif"
        font-size="22"
        font-weight="500"
        fill="${COLORS.textSecondary}">— ${attribution}</text>

  ${context ? `
  <text x="100" y="${height - 60}"
        font-family="Inter, sans-serif"
        font-size="16"
        fill="${COLORS.textMuted}">${context}</text>
  ` : ''}

  <!-- Ferni branding -->
  <g transform="translate(${width - 180}, ${height - 60})">
    <text x="0" y="0"
          font-family="Plus Jakarta Sans, sans-serif"
          font-size="24"
          font-weight="600"
          fill="${COLORS.ferni}">ferni.ai</text>
  </g>
</svg>`;
}

/**
 * Generate "Build in Public" card SVG
 */
function generateBuildInPublicSVG({ stat, label, context, emoji = '🚀' }) {
  const { width, height } = DIMENSIONS.standard;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${COLORS.warmCream}"/>
      <stop offset="100%" style="stop-color:${COLORS.cream}"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="${width}" height="${height}" fill="url(#bgGradient)"/>

  <!-- Left accent -->
  <rect x="0" y="0" width="8" height="${height}" fill="${COLORS.coral}"/>

  <!-- Header -->
  <text x="80" y="80"
        font-family="Plus Jakarta Sans, sans-serif"
        font-size="18"
        font-weight="600"
        fill="${COLORS.coral}"
        letter-spacing="3">BUILD IN PUBLIC</text>

  <!-- Big stat -->
  <g transform="translate(80, ${height / 2 - 40})">
    <text x="0" y="0"
          font-family="Plus Jakarta Sans, sans-serif"
          font-size="140"
          font-weight="700"
          fill="${COLORS.textPrimary}">${stat}</text>
    <text x="0" y="60"
          font-family="Plus Jakarta Sans, sans-serif"
          font-size="32"
          font-weight="500"
          fill="${COLORS.textSecondary}">${label}</text>
  </g>

  <!-- Context -->
  <text x="80" y="${height - 100}"
        font-family="Inter, sans-serif"
        font-size="20"
        fill="${COLORS.textSecondary}">
    ${wrapText(context, 60).map((line, i) => `<tspan x="80" dy="${i === 0 ? 0 : 28}">${line}</tspan>`).join('')}
  </text>

  <!-- Emoji accent -->
  <text x="${width - 150}" y="200"
        font-size="80"
        opacity="0.2">${emoji}</text>

  <!-- Ferni branding -->
  <g transform="translate(${width - 180}, ${height - 60})">
    <text x="0" y="0"
          font-family="Plus Jakarta Sans, sans-serif"
          font-size="24"
          font-weight="600"
          fill="${COLORS.ferni}">ferni.ai</text>
  </g>
</svg>`;
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Wrap text to fit within character limit
 */
function wrapText(text, maxChars) {
  if (text.length <= maxChars) return [text];

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

  return lines;
}

/**
 * Save SVG to file
 */
function saveSVG(svg, filename, folder = 'social-cards') {
  const outputDir = path.join(__dirname, '..', 'images', 'generated', folder);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, filename);
  fs.writeFileSync(outputPath, svg);
  console.log(`✓ Saved: ${folder}/${filename}`);
  return outputPath;
}

/**
 * Generate all cards for a given week
 */
function generateWeekCards(weekNumber) {
  const startIndex = (weekNumber - 1) * 4;
  const weekWisdom = ZEN_WISDOM_CONTENT.slice(startIndex, startIndex + 4);

  console.log(`\n🗓️  Generating Week ${weekNumber} cards...\n`);

  const generated = [];

  weekWisdom.forEach((content, i) => {
    const dayIndex = i;
    const filename = `week${weekNumber}-day${dayIndex + 1}-${content.romaji.toLowerCase().replace(/\s+/g, '-')}.svg`;
    const svg = generateZenWisdomSVG({ ...content, index: startIndex + i });
    saveSVG(svg, filename);
    generated.push({ filename, content });
  });

  return generated;
}

/**
 * Generate all 13 weeks of content
 */
function generateAllWeeks() {
  console.log('\n📅 Generating full 13-week calendar...\n');

  for (let week = 1; week <= 13; week++) {
    generateWeekCards(week);
  }

  console.log('\n✅ All cards generated!');
}

// ============================================================================
// CLI
// ============================================================================

function printUsage() {
  console.log(`
LinkedIn Social Card Generator
==============================

Generate branded social cards for Ferni's LinkedIn company page.

Usage:
  node linkedin-card-generator.js [options]

Options:
  --type=zen-wisdom           Generate Zen wisdom card
  --type=thought-leadership   Generate thought leadership card
  --type=quote               Generate quote card
  --type=build-in-public     Generate build-in-public stat card

  --generate-week=N          Generate all cards for week N (1-13)
  --generate-all             Generate all 13 weeks of content

Zen Wisdom Options:
  --kanji=金継ぎ              Japanese characters
  --romaji=Kintsugi          Romanization
  --english="Golden repair"  English translation
  --wisdom="The cracks..."   Wisdom quote

Thought Leadership Options:
  --title="The Loneliness Gap"
  --subtitle="What if the problem isn't connection—it's depth?"
  --insight="Optional key insight callout"

Quote Options:
  --quote="The quote text"
  --attribution="Speaker name"
  --context="Optional context"

Build in Public Options:
  --stat="47%"
  --label="increase in daily active users"
  --context="Since launching voice-first..."
  --emoji=🚀

Examples:
  node linkedin-card-generator.js --type=zen-wisdom --kanji=金継ぎ --romaji=Kintsugi --english="Golden repair" --wisdom="Your wounds are where the light gets in."
  node linkedin-card-generator.js --generate-week=1
  node linkedin-card-generator.js --generate-all
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    printUsage();
    return;
  }

  const getArg = (name) => {
    const arg = args.find(a => a.startsWith(`--${name}=`));
    return arg ? arg.split('=').slice(1).join('=') : null;
  };

  // Generate full calendar
  if (args.includes('--generate-all')) {
    generateAllWeeks();
    return;
  }

  // Generate specific week
  const weekNum = getArg('generate-week');
  if (weekNum) {
    generateWeekCards(parseInt(weekNum, 10));
    return;
  }

  // Generate single card
  const type = getArg('type');

  if (!type) {
    console.error('❌ Please specify --type or --generate-week');
    printUsage();
    return;
  }

  let svg;
  let filename;

  switch (type) {
    case 'zen-wisdom':
      svg = generateZenWisdomSVG({
        kanji: getArg('kanji') || '金継ぎ',
        romaji: getArg('romaji') || 'Kintsugi',
        english: getArg('english') || 'Golden repair',
        wisdom: getArg('wisdom') || 'The cracks become the most beautiful part.',
      });
      filename = `zen-${(getArg('romaji') || 'kintsugi').toLowerCase().replace(/\s+/g, '-')}.svg`;
      break;

    case 'thought-leadership':
      svg = generateThoughtLeadershipSVG({
        title: getArg('title') || 'The Loneliness Gap',
        subtitle: getArg('subtitle') || 'What if the problem isn\'t connection—it\'s depth?',
        insight: getArg('insight'),
      });
      filename = `thought-${Date.now()}.svg`;
      break;

    case 'quote':
      svg = generateQuoteSVG({
        quote: getArg('quote') || 'Being remembered is a form of being valued.',
        attribution: getArg('attribution') || 'Ferni',
        context: getArg('context'),
      });
      filename = `quote-${Date.now()}.svg`;
      break;

    case 'build-in-public':
      svg = generateBuildInPublicSVG({
        stat: getArg('stat') || '47%',
        label: getArg('label') || 'increase in retention',
        context: getArg('context') || 'Since launching voice-first, users are sticking around longer.',
        emoji: getArg('emoji') || '🚀',
      });
      filename = `build-${Date.now()}.svg`;
      break;

    default:
      console.error(`❌ Unknown card type: ${type}`);
      printUsage();
      return;
  }

  saveSVG(svg, filename);
}

// Export for programmatic use
module.exports = {
  generateZenWisdomSVG,
  generateThoughtLeadershipSVG,
  generateQuoteSVG,
  generateBuildInPublicSVG,
  generateWeekCards,
  generateAllWeeks,
  ZEN_WISDOM_CONTENT,
  COLORS,
  DIMENSIONS,
};

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}
