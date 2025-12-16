/**
 * Admin Portal Icons
 *
 * Lucide-style SVG icons for the admin portal.
 * All icons: 24x24 viewBox, 2px stroke, round linecap/linejoin.
 *
 * @module AdminIcons
 */

// Icon configuration
const ICON_ATTRS =
  'xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

// Size variants
export function iconSm(svg: string): string {
  return svg.replace('width="24" height="24"', 'width="16" height="16"');
}

export function iconLg(svg: string): string {
  return svg.replace('width="24" height="24"', 'width="32" height="32"');
}

export function iconXl(svg: string): string {
  return svg.replace('width="24" height="24"', 'width="48" height="48"');
}

// ============================================================================
// NAVIGATION ICONS
// ============================================================================

/** Dashboard / Layout grid */
export const ICON_DASHBOARD = `<svg ${ICON_ATTRS}><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>`;

/** Agents / Users */
export const ICON_AGENTS = `<svg ${ICON_ATTRS}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;

/** EvalOps / Target */
export const ICON_EVALOPS = `<svg ${ICON_ATTRS}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`;

/** Trust / Heart */
export const ICON_TRUST = `<svg ${ICON_ATTRS}><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`;

/** Feature Flags / Flag */
export const ICON_FLAGS = `<svg ${ICON_ATTRS}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/></svg>`;

/** Diagnostics / Wrench */
export const ICON_DIAGNOSTICS = `<svg ${ICON_ATTRS}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`;

/** API Docs / Book */
export const ICON_API_DOCS = `<svg ${ICON_ATTRS}><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>`;

/** Design System / Palette */
export const ICON_DESIGN_SYSTEM = `<svg ${ICON_ATTRS}><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z"/></svg>`;

// ============================================================================
// ACTION ICONS
// ============================================================================

/** Refresh / Rotate */
export const ICON_REFRESH = `<svg ${ICON_ATTRS}><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>`;

/** Settings / Gear */
export const ICON_SETTINGS = `<svg ${ICON_ATTRS}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`;

/** Menu / Hamburger */
export const ICON_MENU = `<svg ${ICON_ATTRS}><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>`;

/** Close / X */
export const ICON_CLOSE = `<svg ${ICON_ATTRS}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;

/** Back / Arrow Left */
export const ICON_BACK = `<svg ${ICON_ATTRS}><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>`;

/** Search / Magnifying Glass */
export const ICON_SEARCH = `<svg ${ICON_ATTRS}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`;

/** Edit / Pencil */
export const ICON_EDIT = `<svg ${ICON_ATTRS}><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`;

/** Delete / Trash */
export const ICON_DELETE = `<svg ${ICON_ATTRS}><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`;

/** Plus */
export const ICON_PLUS = `<svg ${ICON_ATTRS}><path d="M5 12h14"/><path d="M12 5v14"/></svg>`;

/** Check */
export const ICON_CHECK = `<svg ${ICON_ATTRS}><polyline points="20 6 9 17 4 12"/></svg>`;

/** Warning / Alert Triangle */
export const ICON_WARNING = `<svg ${ICON_ATTRS}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`;

/** Info / Info Circle */
export const ICON_INFO = `<svg ${ICON_ATTRS}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`;

/** Success / Check Circle */
export const ICON_SUCCESS = `<svg ${ICON_ATTRS}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;

/** Error / X Circle */
export const ICON_ERROR = `<svg ${ICON_ATTRS}><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>`;

// ============================================================================
// SECTION-SPECIFIC ICONS
// ============================================================================

/** Hospital / Health */
export const ICON_HEALTH = `<svg ${ICON_ATTRS}><path d="M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14"/><path d="M2 20h20"/><path d="M14 12v.01"/><path d="M14 8v.01"/><path d="M10 12v.01"/><path d="M10 8v.01"/></svg>`;

/** Activity / Pulse */
export const ICON_ACTIVITY = `<svg ${ICON_ATTRS}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`;

/** Zap / Lightning */
export const ICON_ZAP = `<svg ${ICON_ATTRS}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;

/** Play / Run */
export const ICON_PLAY = `<svg ${ICON_ATTRS}><polygon points="5 3 19 12 5 21 5 3"/></svg>`;

/** Pause */
export const ICON_PAUSE = `<svg ${ICON_ATTRS}><rect width="4" height="16" x="6" y="4"/><rect width="4" height="16" x="14" y="4"/></svg>`;

/** History / Clock */
export const ICON_HISTORY = `<svg ${ICON_ATTRS}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;

/** User */
export const ICON_USER = `<svg ${ICON_ATTRS}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;

/** Crown / Coordinator */
export const ICON_CROWN = `<svg ${ICON_ATTRS}><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/></svg>`;

/** Users / Team */
export const ICON_TEAM = `<svg ${ICON_ATTRS}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;

/** Package / Template */
export const ICON_PACKAGE = `<svg ${ICON_ATTRS}><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`;

/** Speaker / Volume */
export const ICON_SPEAKER = `<svg ${ICON_ATTRS}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;

/** Grip / Drag Handle */
export const ICON_GRIP = `<svg ${ICON_ATTRS}><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>`;

/** Toggle On */
export const ICON_TOGGLE_ON = `<svg ${ICON_ATTRS}><rect width="20" height="12" x="2" y="6" rx="6" ry="6"/><circle cx="16" cy="12" r="2"/></svg>`;

/** Toggle Off */
export const ICON_TOGGLE_OFF = `<svg ${ICON_ATTRS}><rect width="20" height="12" x="2" y="6" rx="6" ry="6"/><circle cx="8" cy="12" r="2"/></svg>`;

/** Trend Up */
export const ICON_TREND_UP = `<svg ${ICON_ATTRS}><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`;

/** Trend Down */
export const ICON_TREND_DOWN = `<svg ${ICON_ATTRS}><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>`;

/** Leaf / Ferni */
export const ICON_LEAF = `<svg ${ICON_ATTRS}><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>`;

/** Database / Server */
export const ICON_DATABASE = `<svg ${ICON_ATTRS}><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>`;

/** Code / API */
export const ICON_CODE = `<svg ${ICON_ATTRS}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`;

/** Send */
export const ICON_SEND = `<svg ${ICON_ATTRS}><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>`;

/** External Link */
export const ICON_EXTERNAL = `<svg ${ICON_ATTRS}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg>`;

/** Chart / Bar Chart */
export const ICON_CHART = `<svg ${ICON_ATTRS}><line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/></svg>`;

/** Shield / Security */
export const ICON_SHIELD = `<svg ${ICON_ATTRS}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>`;

/** Lock */
export const ICON_LOCK = `<svg ${ICON_ATTRS}><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;

/** Arrow Right */
export const ICON_ARROW_RIGHT = `<svg ${ICON_ATTRS}><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`;

/** Handoff / Shuffle */
export const ICON_HANDOFF = `<svg ${ICON_ATTRS}><path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4"/><path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2"/><path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8"/><path d="m18 14 4 4-4 4"/></svg>`;

/** Layout Grid / More Dashboards */
export const ICON_LAYOUT_GRID = `<svg ${ICON_ATTRS}><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>`;

/** Sparkles / Avatar Soul */
export const ICON_SPARKLES = `<svg ${ICON_ATTRS}><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>`;

// ============================================================================
// ICON MAP (for dynamic lookup)
// ============================================================================

export const ICONS = {
  // Navigation
  dashboard: ICON_DASHBOARD,
  agents: ICON_AGENTS,
  evalops: ICON_EVALOPS,
  trust: ICON_TRUST,
  flags: ICON_FLAGS,
  diagnostics: ICON_DIAGNOSTICS,
  'api-docs': ICON_API_DOCS,
  'design-system': ICON_DESIGN_SYSTEM,

  // Actions
  refresh: ICON_REFRESH,
  settings: ICON_SETTINGS,
  menu: ICON_MENU,
  close: ICON_CLOSE,
  back: ICON_BACK,
  search: ICON_SEARCH,
  edit: ICON_EDIT,
  delete: ICON_DELETE,
  plus: ICON_PLUS,
  check: ICON_CHECK,
  warning: ICON_WARNING,
  info: ICON_INFO,
  success: ICON_SUCCESS,
  error: ICON_ERROR,

  // Section-specific
  health: ICON_HEALTH,
  activity: ICON_ACTIVITY,
  zap: ICON_ZAP,
  play: ICON_PLAY,
  history: ICON_HISTORY,
  user: ICON_USER,
  crown: ICON_CROWN,
  team: ICON_TEAM,
  package: ICON_PACKAGE,
  speaker: ICON_SPEAKER,
  grip: ICON_GRIP,
  'toggle-on': ICON_TOGGLE_ON,
  'toggle-off': ICON_TOGGLE_OFF,
  'trend-up': ICON_TREND_UP,
  'trend-down': ICON_TREND_DOWN,
  leaf: ICON_LEAF,
  database: ICON_DATABASE,
  code: ICON_CODE,
  send: ICON_SEND,
  external: ICON_EXTERNAL,
  chart: ICON_CHART,
  shield: ICON_SHIELD,
  lock: ICON_LOCK,
  'arrow-right': ICON_ARROW_RIGHT,
  handoff: ICON_HANDOFF,
  sparkles: ICON_SPARKLES,
} as const;

export type IconName = keyof typeof ICONS;

/**
 * Get an icon by name
 */
export function getIcon(name: IconName): string {
  return ICONS[name] || ICON_INFO;
}

/**
 * Render an icon with custom class
 */
export function icon(name: IconName, className?: string): string {
  const svg = ICONS[name] || ICON_INFO;
  if (className) {
    return svg.replace('<svg ', `<svg class="${className}" `);
  }
  return svg;
}

export default ICONS;
