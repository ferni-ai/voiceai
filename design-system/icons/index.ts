/**
 * Ferni Icon System
 * 
 * A comprehensive icon library designed for voice-first AI experiences.
 * All icons follow Ferni brand guidelines:
 * - 24x24 viewBox (scalable)
 * - 2px stroke weight
 * - Rounded line caps and joins
 * - currentColor for theming
 */

// =============================================================================
// Types
// =============================================================================

export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type IconCategory = 'voice' | 'ai' | 'emotion' | 'persona' | 'action' | 'status' | 'navigation';

export interface IconDefinition {
  name: string;
  category: IconCategory;
  path: string;
  keywords: string[];
}

// =============================================================================
// Size Configuration
// =============================================================================

export const ICON_SIZES: Record<IconSize, number> = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
};

// =============================================================================
// Voice Icons - For voice-first experiences
// =============================================================================

export const voiceIcons: IconDefinition[] = [
  {
    name: 'microphone',
    category: 'voice',
    path: 'M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v1a7 7 0 0 1-14 0v-1M12 19v3M8 22h8',
    keywords: ['mic', 'record', 'speak', 'voice'],
  },
  {
    name: 'microphone-off',
    category: 'voice',
    path: 'M2 2l20 20M9 9v2a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6M19 10v1a7 7 0 0 1-.11 1.23M12 19v3M8 22h8M5 10v1a7 7 0 0 0 1.78 4.66',
    keywords: ['mute', 'silence'],
  },
  {
    name: 'waveform',
    category: 'voice',
    path: 'M2 12h2M6 8v8M10 5v14M14 8v8M18 10v4M22 12h0',
    keywords: ['audio', 'sound', 'speaking'],
  },
  {
    name: 'volume',
    category: 'voice',
    path: 'M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14',
    keywords: ['sound', 'audio', 'speaker'],
  },
  {
    name: 'volume-off',
    category: 'voice',
    path: 'M11 5L6 9H2v6h4l5 4V5zM22 9l-6 6M16 9l6 6',
    keywords: ['mute', 'silent'],
  },
  {
    name: 'headphones',
    category: 'voice',
    path: 'M3 18v-6a9 9 0 0 1 18 0v6M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z',
    keywords: ['listen', 'audio'],
  },
  {
    name: 'speech-bubble',
    category: 'voice',
    path: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
    keywords: ['message', 'chat', 'conversation'],
  },
  {
    name: 'speech-bubble-typing',
    category: 'voice',
    path: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2zM8 10h0M12 10h0M16 10h0',
    keywords: ['typing', 'thinking', 'processing'],
  },
];

// =============================================================================
// AI Icons - For AI-specific interactions
// =============================================================================

export const aiIcons: IconDefinition[] = [
  {
    name: 'brain',
    category: 'ai',
    path: 'M12 2a4 4 0 0 0-4 4c0 1.1.45 2.1 1.17 2.83L9 9a3 3 0 0 0 0 6l.17.17A4 4 0 0 0 8 18a4 4 0 0 0 8 0 4 4 0 0 0-1.17-2.83L15 15a3 3 0 0 0 0-6l-.17-.17A4 4 0 0 0 16 6a4 4 0 0 0-4-4z',
    keywords: ['think', 'intelligence', 'mind'],
  },
  {
    name: 'sparkles',
    category: 'ai',
    path: 'M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5zM5 19l.5 1.5L7 21l-1.5.5L5 23l-.5-1.5L3 21l1.5-.5zM19 5l.5 1.5L21 7l-1.5.5L19 9l-.5-1.5L17 7l1.5-.5z',
    keywords: ['magic', 'ai', 'generate'],
  },
  {
    name: 'lightbulb',
    category: 'ai',
    path: 'M12 2a7 7 0 0 0-4 12.7V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.3A7 7 0 0 0 12 2zM9 21h6M10 21v1a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-1',
    keywords: ['idea', 'insight', 'think'],
  },
  {
    name: 'thinking',
    category: 'ai',
    path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM8 9h0M12 9h0M16 9h0M8 14s1.5 2 4 2 4-2 4-2',
    keywords: ['processing', 'loading', 'considering'],
  },
  {
    name: 'memory',
    category: 'ai',
    path: 'M4 4h16v16H4zM9 9v6M15 9v6M4 12h16',
    keywords: ['remember', 'recall', 'history'],
  },
  {
    name: 'neural',
    category: 'ai',
    path: 'M12 4v4M12 16v4M4 12h4M16 12h4M6.34 6.34l2.83 2.83M14.83 14.83l2.83 2.83M6.34 17.66l2.83-2.83M14.83 9.17l2.83-2.83',
    keywords: ['network', 'connections', 'synapses'],
  },
  {
    name: 'uncertainty',
    category: 'ai',
    path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM12 8c1.1 0 2 .9 2 2 0 .74-.4 1.39-1 1.73V13h-2v-2h1a1 1 0 1 0-1-1H9c0-1.66 1.34-3 3-3zM13 17h-2v-2h2z',
    keywords: ['question', 'unsure', 'confidence'],
  },
];

// =============================================================================
// Emotion Icons - For emotional states
// =============================================================================

export const emotionIcons: IconDefinition[] = [
  {
    name: 'calm',
    category: 'emotion',
    path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM8 14s1.5 2 4 2 4-2 4-2M9 9h0M15 9h0',
    keywords: ['peaceful', 'relaxed', 'serene'],
  },
  {
    name: 'joy',
    category: 'emotion',
    path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM8 14s1.5 3 4 3 4-3 4-3M9 9h0M15 9h0',
    keywords: ['happy', 'excited', 'delight'],
  },
  {
    name: 'concern',
    category: 'emotion',
    path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM16 14s-1.5 2-4 2-4-2-4-2M9 9l1 1M15 9l-1 1',
    keywords: ['worried', 'anxious', 'empathy'],
  },
  {
    name: 'support',
    category: 'emotion',
    path: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z',
    keywords: ['heart', 'love', 'care'],
  },
  {
    name: 'growth',
    category: 'emotion',
    path: 'M12 22V8M5 12l7-7 7 7M8 22h8',
    keywords: ['progress', 'improve', 'rise'],
  },
  {
    name: 'reflection',
    category: 'emotion',
    path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 6v6l4 2',
    keywords: ['time', 'contemplate', 'think'],
  },
  {
    name: 'breath',
    category: 'emotion',
    path: 'M12 22c4-2.5 7-6.5 7-11a7 7 0 1 0-14 0c0 4.5 3 8.5 7 11z',
    keywords: ['breathing', 'meditation', 'calm'],
  },
  {
    name: 'energy',
    category: 'emotion',
    path: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
    keywords: ['power', 'vitality', 'charge'],
  },
];

// =============================================================================
// Persona Icons - For the 6 team members
// =============================================================================

export const personaIcons: IconDefinition[] = [
  {
    name: 'ferni',
    category: 'persona',
    path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM12 6a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM12 20c-2.67 0-5.02-1.37-6.39-3.44C7.02 14.92 9.39 14 12 14s4.98.92 6.39 2.56C17.02 18.63 14.67 20 12 20z',
    keywords: ['coach', 'guide', 'main'],
  },
  {
    name: 'maya',
    category: 'persona',
    path: 'M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83',
    keywords: ['habits', 'routines', 'sun'],
  },
  {
    name: 'peter',
    category: 'persona',
    path: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z',
    keywords: ['research', 'knowledge', 'book'],
  },
  {
    name: 'alex',
    category: 'persona',
    path: 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM22 6l-10 7L2 6',
    keywords: ['communication', 'email', 'message'],
  },
  {
    name: 'jordan',
    category: 'persona',
    path: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
    keywords: ['events', 'calendar', 'planning'],
  },
  {
    name: 'nayan',
    category: 'persona',
    path: 'M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5zM12 17v4M8 21h8',
    keywords: ['wisdom', 'philosophy', 'star'],
  },
];

// =============================================================================
// Action Icons - Common actions
// =============================================================================

export const actionIcons: IconDefinition[] = [
  {
    name: 'play',
    category: 'action',
    path: 'M5 3l14 9-14 9V3z',
    keywords: ['start', 'begin', 'audio'],
  },
  {
    name: 'pause',
    category: 'action',
    path: 'M6 4h4v16H6zM14 4h4v16h-4z',
    keywords: ['stop', 'wait', 'hold'],
  },
  {
    name: 'stop',
    category: 'action',
    path: 'M6 6h12v12H6z',
    keywords: ['end', 'halt'],
  },
  {
    name: 'skip-forward',
    category: 'action',
    path: 'M5 4l10 8-10 8V4zM19 5v14',
    keywords: ['next', 'forward'],
  },
  {
    name: 'skip-back',
    category: 'action',
    path: 'M19 20L9 12l10-8v16zM5 19V5',
    keywords: ['previous', 'back'],
  },
  {
    name: 'refresh',
    category: 'action',
    path: 'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
    keywords: ['reload', 'retry', 'again'],
  },
  {
    name: 'settings',
    category: 'action',
    path: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z',
    keywords: ['config', 'options', 'preferences'],
  },
  {
    name: 'close',
    category: 'action',
    path: 'M18 6L6 18M6 6l12 12',
    keywords: ['cancel', 'dismiss', 'x'],
  },
  {
    name: 'check',
    category: 'action',
    path: 'M20 6L9 17l-5-5',
    keywords: ['done', 'complete', 'success'],
  },
  {
    name: 'plus',
    category: 'action',
    path: 'M12 5v14M5 12h14',
    keywords: ['add', 'new', 'create'],
  },
  {
    name: 'minus',
    category: 'action',
    path: 'M5 12h14',
    keywords: ['remove', 'subtract', 'delete'],
  },
];

// =============================================================================
// Status Icons - State indicators
// =============================================================================

export const statusIcons: IconDefinition[] = [
  {
    name: 'connected',
    category: 'status',
    path: 'M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h0',
    keywords: ['wifi', 'online', 'signal'],
  },
  {
    name: 'disconnected',
    category: 'status',
    path: 'M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M2 8.82a15 15 0 0 1 4.17-2.65M5 12.86a10 10 0 0 1 2.12-1.44M10.66 5c4.01-.36 8.14.9 11.34 3.76M15 10a6.3 6.3 0 0 1 4 2.3M12 20h0',
    keywords: ['offline', 'no-signal'],
  },
  {
    name: 'loading',
    category: 'status',
    path: 'M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83',
    keywords: ['spinner', 'wait', 'processing'],
  },
  {
    name: 'success',
    category: 'status',
    path: 'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3',
    keywords: ['complete', 'done', 'check'],
  },
  {
    name: 'error',
    category: 'status',
    path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM12 8v4M12 16h0',
    keywords: ['alert', 'warning', 'problem'],
  },
  {
    name: 'info',
    category: 'status',
    path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM12 16v-4M12 8h0',
    keywords: ['information', 'help', 'about'],
  },
];

// =============================================================================
// Navigation Icons
// =============================================================================

export const navigationIcons: IconDefinition[] = [
  {
    name: 'home',
    category: 'navigation',
    path: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10',
    keywords: ['main', 'start', 'dashboard'],
  },
  {
    name: 'menu',
    category: 'navigation',
    path: 'M3 12h18M3 6h18M3 18h18',
    keywords: ['hamburger', 'nav', 'list'],
  },
  {
    name: 'arrow-left',
    category: 'navigation',
    path: 'M19 12H5M12 19l-7-7 7-7',
    keywords: ['back', 'previous', 'return'],
  },
  {
    name: 'arrow-right',
    category: 'navigation',
    path: 'M5 12h14M12 5l7 7-7 7',
    keywords: ['forward', 'next', 'continue'],
  },
  {
    name: 'arrow-up',
    category: 'navigation',
    path: 'M12 19V5M5 12l7-7 7 7',
    keywords: ['up', 'top'],
  },
  {
    name: 'arrow-down',
    category: 'navigation',
    path: 'M12 5v14M5 12l7 7 7-7',
    keywords: ['down', 'bottom'],
  },
  {
    name: 'chevron-left',
    category: 'navigation',
    path: 'M15 18l-6-6 6-6',
    keywords: ['back', 'previous'],
  },
  {
    name: 'chevron-right',
    category: 'navigation',
    path: 'M9 18l6-6-6-6',
    keywords: ['forward', 'next'],
  },
];

// =============================================================================
// All Icons Combined
// =============================================================================

export const allIcons: IconDefinition[] = [
  ...voiceIcons,
  ...aiIcons,
  ...emotionIcons,
  ...personaIcons,
  ...actionIcons,
  ...statusIcons,
  ...navigationIcons,
];

// =============================================================================
// Icon Lookup
// =============================================================================

const iconMap = new Map<string, IconDefinition>();
allIcons.forEach(icon => iconMap.set(icon.name, icon));

/**
 * Get an icon by name
 */
export function getIcon(name: string): IconDefinition | undefined {
  return iconMap.get(name);
}

/**
 * Get icons by category
 */
export function getIconsByCategory(category: IconCategory): IconDefinition[] {
  return allIcons.filter(icon => icon.category === category);
}

/**
 * Search icons by keyword
 */
export function searchIcons(query: string): IconDefinition[] {
  const q = query.toLowerCase();
  return allIcons.filter(icon => 
    icon.name.toLowerCase().includes(q) ||
    icon.keywords.some(k => k.toLowerCase().includes(q))
  );
}

// =============================================================================
// SVG Rendering
// =============================================================================

/**
 * Render an icon as SVG string
 */
export function renderIcon(name: string, size: IconSize = 'md', color?: string): string {
  const icon = getIcon(name);
  if (!icon) return '';

  const px = ICON_SIZES[size];
  const colorStyle = color ? `stroke="${color}"` : 'stroke="currentColor"';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" ${colorStyle} stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${icon.path}"/></svg>`;
}

/**
 * Create an SVG element for an icon
 */
export function createIconElement(name: string, size: IconSize = 'md', color?: string): SVGSVGElement | null {
  const html = renderIcon(name, size, color);
  if (!html) return null;

  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstChild as SVGSVGElement;
}
