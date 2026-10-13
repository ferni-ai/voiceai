/**
 * Icons and per-type config for trust signals (split out of
 * trust-signals.ui.ts, which is over the file-size budget).
 *
 * @module ui/trust-signals-config
 */

export type TrustSignalType =
  | 'growth' // Noticed personal growth
  | 'boundary' // Respecting a boundary
  | 'callback' // Shared history reference
  | 'small_win' // Celebrating effort
  | 'thinking_of_you' // Proactive care
  | 'reading_lines'; // Noticed unspoken emotion

// ============================================================================
// ICONS (Lucide-style SVG)
// ============================================================================

export const ICONS = {
  close: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
  leaf: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>`,
  shield: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>`,
  messageHeart: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M15.8 9.2a2.5 2.5 0 0 0-3.5 0l-.3.4-.3-.4a2.5 2.5 0 0 0-3.5 0 2.5 2.5 0 0 0 0 3.5l3.8 3.8 3.8-3.8a2.5 2.5 0 0 0 0-3.5Z"/></svg>`,
  trophy: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`,
  heart: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
  eye: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>`,
};

// ============================================================================
// SIGNAL TYPE CONFIG
// ============================================================================

export const SIGNAL_CONFIG: Record<
  TrustSignalType,
  {
    icon: string;
    color: string;
    prefixKey: string;
  }
> = {
  growth: {
    icon: ICONS.leaf,
    color: 'var(--color-semantic-success, #4a8560)',
    prefixKey: 'trustSignals.prefix.growth',
  },
  boundary: {
    icon: ICONS.shield,
    color: 'var(--persona-primary, #4a6741)',
    prefixKey: 'trustSignals.prefix.boundary',
  },
  callback: {
    icon: ICONS.messageHeart,
    color: 'var(--persona-peter-primary, #3a6b73)',
    prefixKey: 'trustSignals.prefix.callback',
  },
  small_win: {
    icon: ICONS.trophy,
    color: 'var(--color-semantic-warning, #c49a6c)',
    prefixKey: 'trustSignals.prefix.smallWin',
  },
  thinking_of_you: {
    icon: ICONS.heart,
    color: 'var(--persona-maya-primary, #a67a6a)',
    prefixKey: 'trustSignals.prefix.thinkingOfYou',
  },
  reading_lines: {
    icon: ICONS.eye,
    color: 'var(--persona-alex-primary, #5a6b8a)',
    prefixKey: 'trustSignals.prefix.readingLines',
  },
};
