/**
 * Favicon Generator for Agent Pages
 *
 * Generates inline SVG data URIs for favicons with agent initials
 * on a brand-colored circle background.
 */

/**
 * Generate an inline SVG favicon data URI
 *
 * Creates a circular favicon with initials centered on a colored background.
 * The SVG is optimized for both browser tabs and mobile home screens.
 *
 * @param initials - 1-3 character initials (e.g., "JD")
 * @param color - Background color in hex format (e.g., "#96151D")
 * @returns Data URI string for use in <link rel="icon">
 */
export function generateFavicon(initials: string, color: string): string {
  // Sanitize inputs for SVG embedding
  const safeInitials = escapeXml(initials.slice(0, 3).toUpperCase());
  const safeColor = encodeURIComponent(color);

  // Adjust font size based on initials length
  const fontSize = initials.length === 1 ? 14 : initials.length === 2 ? 12 : 10;

  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>
    <circle cx='16' cy='16' r='14' fill='${safeColor}'/>
    <text x='16' y='21' text-anchor='middle' fill='white' font-family='system-ui, -apple-system, sans-serif' font-size='${fontSize}' font-weight='bold'>${safeInitials}</text>
  </svg>`;

  // Encode for data URI
  return `data:image/svg+xml,${encodeURIComponent(svg.replace(/\n\s*/g, ''))}`;
}

/**
 * Generate Apple Touch Icon SVG
 *
 * Creates a larger icon optimized for iOS home screen.
 * Includes subtle gradient and shadow for depth.
 *
 * @param initials - 1-3 character initials
 * @param color - Background color in hex format
 * @returns Data URI string for apple-touch-icon
 */
export function generateAppleTouchIcon(
  initials: string,
  color: string
): string {
  const safeInitials = escapeXml(initials.slice(0, 3).toUpperCase());
  const safeColor = encodeURIComponent(color);

  // Calculate a lighter shade for gradient
  const lighterColor = lightenHex(color, 20);

  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 180 180'>
    <defs>
      <linearGradient id='bg' x1='0%' y1='0%' x2='100%' y2='100%'>
        <stop offset='0%' stop-color='${encodeURIComponent(lighterColor)}'/>
        <stop offset='100%' stop-color='${safeColor}'/>
      </linearGradient>
    </defs>
    <rect width='180' height='180' rx='40' fill='url(%23bg)'/>
    <text x='90' y='115' text-anchor='middle' fill='white' font-family='system-ui, -apple-system, sans-serif' font-size='72' font-weight='bold' style='text-shadow: 0 2px 4px rgba(0,0,0,0.2)'>${safeInitials}</text>
  </svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg.replace(/\n\s*/g, ''))}`;
}

/**
 * Generate Microsoft Tile Icon
 *
 * Creates an icon for Windows tiles with proper sizing.
 *
 * @param initials - 1-3 character initials
 * @param color - Background color in hex format
 * @returns Data URI string for msapplication-TileImage
 */
export function generateMsTileIcon(initials: string, color: string): string {
  const safeInitials = escapeXml(initials.slice(0, 3).toUpperCase());
  const safeColor = encodeURIComponent(color);

  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 144 144'>
    <rect width='144' height='144' fill='${safeColor}'/>
    <text x='72' y='92' text-anchor='middle' fill='white' font-family='system-ui, -apple-system, sans-serif' font-size='56' font-weight='bold'>${safeInitials}</text>
  </svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg.replace(/\n\s*/g, ''))}`;
}

/**
 * Generate all favicon variants
 */
export function generateAllFavicons(
  initials: string,
  color: string
): {
  favicon: string;
  appleTouchIcon: string;
  msTileIcon: string;
  tileColor: string;
  themeColor: string;
} {
  return {
    favicon: generateFavicon(initials, color),
    appleTouchIcon: generateAppleTouchIcon(initials, color),
    msTileIcon: generateMsTileIcon(initials, color),
    tileColor: color,
    themeColor: color,
  };
}

/**
 * Escape XML special characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Simple hex color lightening (used for gradient)
 */
function lightenHex(hex: string, percent: number): string {
  const cleanHex = hex.replace(/^#/, '');
  const num = parseInt(cleanHex, 16);

  let r = (num >> 16) + Math.round((255 - (num >> 16)) * (percent / 100));
  let g =
    ((num >> 8) & 0x00ff) +
    Math.round((255 - ((num >> 8) & 0x00ff)) * (percent / 100));
  let b =
    (num & 0x0000ff) + Math.round((255 - (num & 0x0000ff)) * (percent / 100));

  r = Math.min(255, r);
  g = Math.min(255, g);
  b = Math.min(255, b);

  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
