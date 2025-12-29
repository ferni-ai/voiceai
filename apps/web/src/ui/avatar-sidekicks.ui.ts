/**
 * Avatar Sidekicks - Expressive Side Companions
 * 
 * Small floating icons that appear BESIDE Ferni's avatar (not over it).
 * Think of these as "props" or "gestures" - like Ferni holding a coffee cup,
 * showing a lightbulb for an idea, or hearts drifting beside her.
 * 
 * DESIGN PHILOSOPHY:
 * ==================
 * Instead of covering Ferni's face/eyes with icons (which was "too much"),
 * these sidekicks float alongside her - like expressive hands or accessories.
 * 
 * - Coffee cup floating beside her in the morning
 * - Lightbulb appearing when she has an idea
 * - Musical notes drifting when discussing music
 * - Hearts floating during empathetic moments
 * - Sparkles dancing beside her during celebrations
 * 
 * ANIMATION PRINCIPLES:
 * ====================
 * 1. ENTRANCE: Icons float in from the side with gentle spring
 * 2. IDLE: Subtle bobbing/floating motion (breathing)
 * 3. EXIT: Fade and drift away naturally
 * 
 * POSITIONING:
 * ============
 * Icons appear in "slots" around the avatar:
 * - LEFT: Primary expressive slot (like left hand)
 * - RIGHT: Secondary slot (like right hand)
 * - Can show 1-2 icons at once for richness
 * 
 * Brand compliant: NO emojis - uses Lucide SVG icons only
 */

import { gsap } from '../utils/gsap-setup.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';

const log = createLogger('AvatarSidekicks');

// GSAP helper
const toSeconds = (ms: number) => ms / 1000;

// ============================================================================
// ICONS (Lucide-style, 2px stroke, rounded - Brand Compliant)
// 
// Organized by category for easy discovery. All icons follow Ferni brand guidelines:
// - Stroke weight: 2px
// - Style: Outlined, not filled
// - Corners: Rounded (stroke-linecap/linejoin: round)
// ============================================================================

const SIDEKICK_ICONS = {
  // ============================================================================
  // ☕ TIME OF DAY - Morning, afternoon, evening, night contexts
  // ============================================================================
  coffee: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>',
  sunrise: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v8"/><path d="m4.93 10.93 1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="m8 6 4-4 4 4"/><path d="M16 18a4 4 0 0 0-8 0"/></svg>',
  sunset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 10V2"/><path d="m4.93 10.93 1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="m16 6-4 4-4-4"/><path d="M16 18a4 4 0 0 0-8 0"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
  flame: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  alarm: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M5 3 2 6"/><path d="m22 6-3-3"/><path d="M6.38 18.7 4 21"/><path d="M17.64 18.67 20 21"/></svg>',
  hourglass: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/></svg>',
  
  // ============================================================================
  // 🌤️ WEATHER & NATURE - Environmental contexts
  // ============================================================================
  cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>',
  cloudSun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="M20 12h2"/><path d="m19.07 4.93-1.41 1.41"/><path d="M15.947 12.65a4 4 0 1 0-5.925-4.128"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/></svg>',
  cloudRain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/></svg>',
  snowflake: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" x2="22" y1="12" y2="12"/><line x1="12" x2="12" y1="2" y2="22"/><path d="m20 16-4-4 4-4"/><path d="m4 8 4 4-4 4"/><path d="m16 4-4 4-4-4"/><path d="m8 20 4-4 4 4"/></svg>',
  wind: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/></svg>',
  rainbow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 17a10 10 0 0 0-20 0"/><path d="M6 17a6 6 0 0 1 12 0"/><path d="M10 17a2 2 0 0 1 4 0"/></svg>',
  leaf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>',
  flower: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7.5a4.5 4.5 0 1 1 4.5 4.5M12 7.5A4.5 4.5 0 1 0 7.5 12M12 7.5V9m-4.5 3a4.5 4.5 0 1 0 4.5 4.5M7.5 12H9m7.5 0a4.5 4.5 0 1 1-4.5 4.5m4.5-4.5H15m-3 4.5V15"/><circle cx="12" cy="12" r="3"/><path d="m8 16 1.5-1.5"/><path d="M14.5 9.5 16 8"/><path d="m8 8 1.5 1.5"/><path d="M14.5 14.5 16 16"/></svg>',
  sprout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/></svg>',
  palmtree: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 8c0-2.76-2.46-5-5.5-5S2 5.24 2 8h2l1-1 1 1h4"/><path d="M13 7.14A5.82 5.82 0 0 1 16.5 6c3.04 0 5.5 2.24 5.5 5h-3l-1-1-1 1h-3"/><path d="M5.89 9.71c-2.15 2.15-2.3 5.47-.35 7.43l4.24-4.25.7-.7.71-.71 2.12-2.12c-1.95-1.96-5.27-1.8-7.42.35z"/><path d="M11 15.5c.5 2.5-.17 4.5-1 6.5h4c2-5.5-.5-12-1-14"/></svg>',
  waves: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/></svg>',
  
  // ============================================================================
  // 💡 IDEAS & THINKING - Cognitive/creative moments
  // ============================================================================
  lightbulb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>',
  brain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-1.54"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-1.54"/></svg>',
  thinking: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9 10h.01"/><path d="M15 10h.01"/><path d="M9.5 15a3.5 3.5 0 0 0 5 0"/><path d="m21 3-8.5 8.5"/><path d="M21 3h-5"/><path d="M21 3v5"/></svg>',
  compass: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>',
  focus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/></svg>',
  target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  
  // ============================================================================
  // ❤️ EMOTIONS & CONNECTION - Emotional expressions
  // ============================================================================
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
  heartPulse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/></svg>',
  sparkles: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>',
  sparkle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"/></svg>',
  smile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>',
  laughing: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M18 13a6 6 0 0 1-6 5 6 6 0 0 1-6-5h12Z"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>',
  wink: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><path d="M14 9c.5 0 1 .5 1.5 0"/></svg>',
  worried: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 15h8"/><path d="M8 9h2"/><path d="M14 9h2"/></svg>',
  hug: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10a5 5 0 0 1 10 0"/><path d="M21 15v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><circle cx="12" cy="10" r="3"/></svg>',
  thumbsUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"/></svg>',
  
  // ============================================================================
  // 👋 GREETINGS & GESTURES - Physical expressions
  // ============================================================================
  hand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>',
  handshake: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3L14 8"/><path d="m8 14 4 4a1 1 0 1 0 3-3l-1.5-1.5"/><path d="M2 9h3a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2H2"/><path d="M22 9h-3a2 2 0 0 0-2 2v1a2 2 0 0 0 2 2h3"/></svg>',
  pointer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 14a8 8 0 0 1-8 8"/><path d="M18 11v-1a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V9a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v1"/><path d="M10 9.5V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v10"/><path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>',
  flex: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6.878V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v.878"/><path d="M17 11a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-3"/><path d="m7 16-4 4 4-4Z"/><path d="M7 16v2a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-7a5 5 0 0 0-5-5H9a5 5 0 0 0-5 5v5c0 1.57.75 2.96 1.89 3.86L7 16Z"/><path d="M10 10v2a2 2 0 0 0 4 0v-2"/></svg>',
  
  // ============================================================================
  // 🎵 ACTIVITIES & HOBBIES
  // ============================================================================
  music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  headphones: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  bookOpen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
  palette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z"/></svg>',
  brush: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z"/></svg>',
  gamepad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="15" y1="13" x2="15.01" y2="13"/><line x1="18" y1="11" x2="18.01" y2="11"/><rect x="2" y="6" width="20" height="12" rx="2"/></svg>',
  yoga: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2"/><path d="m5 22 3-8h8l3 8"/><path d="M7 10h10"/><path d="m12 14-3-4h6l-3 4Z"/></svg>',
  movie: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="20" x="2" y="2" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>',
  tent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="m2 21 20 0"/><path d="M12 21V3"/></svg>',
  
  // ============================================================================
  // 🏆 CELEBRATIONS & MILESTONES
  // ============================================================================
  trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  crown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/></svg>',
  gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect width="20" height="5" x="2" y="7"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>',
  cake: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8"/><path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1"/><path d="M2 21h20"/><path d="M7 8v3"/><path d="M12 8v3"/><path d="M17 8v3"/><path d="M7 4h0.01"/><path d="M12 4h0.01"/><path d="M17 4h0.01"/></svg>',
  party: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5.8 11.3 2 22l10.7-3.79"/><path d="M4 3h.01"/><path d="M22 8h.01"/><path d="M15 2h.01"/><path d="M22 20h.01"/><path d="m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12v0c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10"/><path d="m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11v0c-.11.7-.72 1.22-1.43 1.22H17"/><path d="m11 2 .33.82c.34.86-.2 1.82-1.11 1.98v0C9.52 4.9 9 5.52 9 6.23V7"/><path d="M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z"/></svg>',
  confetti: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 4 16 16"/><path d="M18 8c-.5-.5-1.5-2-3-2s-2.5 1.5-3 2c.5.5 1.5 2 3 2s2.5-1.5 3-2Z"/><path d="M6 16c.5.5 1.5 2 3 2s2.5-1.5 3-2c-.5-.5-1.5-2-3-2s-2.5 1.5-3 2Z"/><path d="m9 3 2 2"/><path d="m5 11-2 2"/><path d="m19 5-2 2"/><path d="m15 9-2 2"/><path d="m11 13-2 2"/><path d="m13 19 2 2"/><path d="m9 17 2 2"/></svg>',
  fireworks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v8"/><path d="m4.93 10.93 1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M16 18a4 4 0 0 0-8 0"/><circle cx="12" cy="12" r="3"/></svg>',
  rocket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>',
  flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>',
  
  // ============================================================================
  // ⚡ ENERGY & MOTIVATION
  // ============================================================================
  zap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  trendingUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>',
  activity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
  grow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22v-7l-2-2"/><path d="M17 8v.8A6 6 0 0 1 13.8 14v0a6.5 6.5 0 0 1-3.8 1h-.5c-2 0-3.5-.5-3.5-2.5C6 10 8 8 10 8c0-2 2-4 4.5-4C17 4 20 6 20 9.5c0 2.5-2 3.5-3 2.5"/></svg>',
  
  // ============================================================================
  // 😴 REST & CALM
  // ============================================================================
  sleepy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="15" x2="16" y2="15"/><path d="M8 9.5c0 .5-.5 1-1 1s-1-.5-1-1 .5-1 1-1 1 .5 1 1"/><path d="M18 9.5c0 .5-.5 1-1 1s-1-.5-1-1 .5-1 1-1 1 .5 1 1"/></svg>',
  bedtime: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
  tea: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg>',
  
  // ============================================================================
  // 💬 COMMUNICATION
  // ============================================================================
  messageCircle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>',
  
  // ============================================================================
  // 🐢 ANIMALS (Slow, gentle pacing vibes)
  // ============================================================================
  turtle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 10 2 4v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3a8 8 0 1 0-16 0v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3l2-4h4Z"/><path d="M4.82 7.9 8 10"/><path d="m19.18 7.9-3.18 2.1"/><path d="M2 19h20"/></svg>',
  snail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 13a6 6 0 1 0 12 0 4 4 0 1 0-8 0 2 2 0 0 0 4 0"/><circle cx="10" cy="13" r="8"/><path d="M2 21h12c4.4 0 8-3.6 8-8V7a2 2 0 1 0-4 0v6"/><path d="M18 3 19.1 5.2"/><path d="M22 3 20.9 5.2"/></svg>',
  bug: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="14" x="8" y="6" rx="4"/><path d="m19 7-3 2"/><path d="m5 7 3 2"/><path d="m19 19-3-2"/><path d="m5 19 3-2"/><path d="M20 13h-4"/><path d="M4 13h4"/><path d="m10 4 1 2"/><path d="m14 4-1 2"/></svg>',
  
  // ============================================================================
  // 🔮 MISC & SPECIAL
  // ============================================================================
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  checkCircle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  crystalBall: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="7"/><path d="M8.21 13.89 7 23l5-3 5 3-1.21-9.12"/></svg>',
  magic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/></svg>',
  layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
  wifi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>',
  // Missing icons that are referenced in event handlers
  pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>',
  dice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="12" height="12" x="2" y="10" rx="2" ry="2"/><path d="m17.92 14 3.5-3.5a2.24 2.24 0 0 0 0-3l-5-4.92a2.24 2.24 0 0 0-3 0L10 6"/><path d="M6 18h.01"/><path d="M10 14h.01"/><path d="M15 6h.01"/><path d="M18 9h.01"/></svg>',
} as const;

export type SidekickIcon = keyof typeof SIDEKICK_ICONS;
export type SidekickPosition = 'left' | 'right' | 'both';

// ============================================================================
// TYPES
// ============================================================================

interface SidekickConfig {
  icon: SidekickIcon;
  position?: SidekickPosition;
  duration?: number;       // How long to show (ms)
  color?: string;          // CSS color variable
  size?: 'sm' | 'md' | 'lg';
  animation?: 'float' | 'pulse' | 'bounce' | 'spin';
}

interface ActiveSidekick {
  element: HTMLElement;
  position: 'left' | 'right';
  timeline: gsap.core.Timeline;
}

// ============================================================================
// STATE
// ============================================================================

let container: HTMLElement | null = null;
let leftSlot: HTMLElement | null = null;
let rightSlot: HTMLElement | null = null;
let activeSidekicks: ActiveSidekick[] = [];
let isInitialized = false;
let eventAbortController: AbortController | null = null;

const { trackedTimeout, clearAll: clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the sidekicks system.
 * Creates the side slots around the avatar.
 */
export function initAvatarSidekicks(): void {
  if (isInitialized) return;
  
  // HMR protection
  cleanupOrphanedElements();
  
  injectStyles();
  createContainer();
  setupEventListeners();
  
  isInitialized = true;
  log.info('Avatar sidekicks initialized');
}

/**
 * Clean up orphaned elements from HMR hot reloads.
 */
function cleanupOrphanedElements(): void {
  document.querySelectorAll('.avatar-sidekicks-container').forEach(el => el.remove());
  document.querySelectorAll('.sidekick-slot').forEach(el => el.remove());
  document.querySelectorAll('.sidekick-icon').forEach(el => el.remove());
}

/**
 * Create the sidekick container and slots.
 */
function createContainer(): void {
  const coach = document.getElementById('coach');
  const avatarContainer = coach?.querySelector('.avatar-container') as HTMLElement | null;
  
  if (!coach || !avatarContainer) {
    log.debug('Avatar container not found');
    return;
  }
  
  // Create main container INSIDE the avatar-container so it inherits its position
  container = document.createElement('div');
  container.className = 'avatar-sidekicks-container';
  container.setAttribute('aria-hidden', 'true');
  
  // Create left and right slots
  leftSlot = document.createElement('div');
  leftSlot.className = 'sidekick-slot sidekick-slot--left';
  
  rightSlot = document.createElement('div');
  rightSlot.className = 'sidekick-slot sidekick-slot--right';
  
  container.appendChild(leftSlot);
  container.appendChild(rightSlot);
  
  // Insert INSIDE avatar-container as a child
  // This way our absolute positioning works relative to the avatar
  avatarContainer.appendChild(container);
  
  log.debug('Sidekick container created');
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Show a sidekick icon beside the avatar.
 * 
 * @example
 * // Morning coffee sidekick
 * showSidekick({ icon: 'coffee', position: 'right', duration: 3000 });
 * 
 * // Idea moment with lightbulb
 * showSidekick({ icon: 'lightbulb', position: 'left', animation: 'bounce' });
 */
export function showSidekick(config: SidekickConfig): void {
  if (!isInitialized) initAvatarSidekicks();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  
  const {
    icon,
    position = 'right',
    duration = 2500,
    color = 'var(--persona-primary, #4a6741)',
    size = 'md',
    animation = 'float',
  } = config;
  
  // Determine which slots to use
  const positions: ('left' | 'right')[] = position === 'both' 
    ? ['left', 'right'] 
    : [position];
  
  positions.forEach((pos, index) => {
    // Clear any existing sidekick in this slot
    clearSlot(pos);
    
    // Create and animate the sidekick
    const delay = position === 'both' ? index * 100 : 0;
    trackedTimeout(() => {
      createSidekick(icon, pos, duration, color, size, animation);
    }, delay);
  });
  
  log.debug('Sidekick shown:', icon, position);
}

/**
 * Show a pair of sidekicks (left and right) for emphasis.
 */
export function showSidekickPair(
  leftIcon: SidekickIcon, 
  rightIcon: SidekickIcon,
  duration = 2500
): void {
  showSidekick({ icon: leftIcon, position: 'left', duration });
  trackedTimeout(() => {
    showSidekick({ icon: rightIcon, position: 'right', duration: duration - 100 });
  }, 100);
}

/**
 * Clear all active sidekicks.
 */
export function clearAllSidekicks(): void {
  activeSidekicks.forEach(sidekick => {
    sidekick.timeline.kill();
    sidekick.element.remove();
  });
  activeSidekicks = [];
}

/**
 * Clear sidekick from a specific slot.
 */
function clearSlot(position: 'left' | 'right'): void {
  const existing = activeSidekicks.find(s => s.position === position);
  if (existing) {
    existing.timeline.kill();
    existing.element.remove();
    activeSidekicks = activeSidekicks.filter(s => s !== existing);
  }
}

// ============================================================================
// SIDEKICK CREATION & ANIMATION
// ============================================================================

/**
 * Create and animate a sidekick icon.
 */
function createSidekick(
  icon: SidekickIcon,
  position: 'left' | 'right',
  duration: number,
  color: string,
  size: 'sm' | 'md' | 'lg',
  animation: string
): void {
  const slot = position === 'left' ? leftSlot : rightSlot;
  if (!slot) {
    log.warn('Slot not found for position:', position);
    return;
  }
  
  const iconSvg = SIDEKICK_ICONS[icon];
  if (!iconSvg) {
    log.warn('Unknown sidekick icon:', icon);
    return;
  }
  
  // Size mapping - larger for visibility beside the avatar
  const sizeMap = { sm: 24, md: 32, lg: 40 };
  const iconSize = sizeMap[size];
  
  // Create sidekick element
  const sidekick = document.createElement('div');
  sidekick.className = `sidekick-icon sidekick-icon--${position} sidekick-icon--${size}`;
  sidekick.innerHTML = iconSvg;
  sidekick.style.cssText = `
    color: ${color};
    width: ${iconSize}px;
    height: ${iconSize}px;
    opacity: 0;
    transform: scale(0) translateY(10px);
  `;
  
  // Style the SVG
  const svg = sidekick.querySelector('svg');
  if (svg) {
    svg.style.width = '100%';
    svg.style.height = '100%';
  }
  
  slot.appendChild(sidekick);
  
  // Create animation timeline
  const tl = gsap.timeline({
    onComplete: () => {
      // Remove from active list when animation completes
      activeSidekicks = activeSidekicks.filter(s => s.element !== sidekick);
      sidekick.remove();
    }
  });
  
  // Track this sidekick
  activeSidekicks.push({ element: sidekick, position, timeline: tl });
  
  // === ENTRANCE ===
  // Float in from the side with spring physics
  const entranceX = position === 'left' ? -15 : 15;
  tl.set(sidekick, { 
    x: entranceX, 
    opacity: 0, 
    scale: 0.5,
    y: 8
  });
  
  tl.to(sidekick, {
    x: 0,
    y: 0,
    opacity: 1,
    scale: 1,
    duration: toSeconds(DURATION.SLOW),
    ease: 'back.out(1.4)',
  });
  
  // === IDLE ANIMATION ===
  // Subtle movement while visible
  const idleDuration = duration - DURATION.SLOW - DURATION.NORMAL;
  
  switch (animation) {
    case 'float':
      // Gentle floating bob
      tl.to(sidekick, {
        y: -5,
        duration: toSeconds(idleDuration / 4),
        ease: 'sine.inOut',
        yoyo: true,
        repeat: 3,
      });
      break;
      
    case 'pulse':
      // Soft pulsing
      tl.to(sidekick, {
        scale: 1.1,
        duration: toSeconds(idleDuration / 6),
        ease: 'power2.inOut',
        yoyo: true,
        repeat: 5,
      });
      break;
      
    case 'bounce':
      // Playful bounce
      tl.to(sidekick, {
        y: -8,
        duration: toSeconds(DURATION.FAST),
        ease: 'power2.out',
      })
      .to(sidekick, {
        y: 0,
        duration: toSeconds(DURATION.FAST),
        ease: 'bounce.out',
        repeat: Math.floor(idleDuration / (DURATION.FAST * 2)) - 1,
        repeatDelay: toSeconds(DURATION.FAST),
      });
      break;
      
    case 'spin':
      // Gentle rotation
      tl.to(sidekick, {
        rotation: 360,
        duration: toSeconds(idleDuration),
        ease: 'none',
      });
      break;
      
    default:
      // Just hold with tiny micro-movements
      tl.to(sidekick, {
        y: -2,
        rotation: position === 'left' ? 3 : -3,
        duration: toSeconds(idleDuration),
        ease: 'sine.inOut',
        yoyo: true,
        repeat: 1,
      });
  }
  
  // === EXIT ===
  // Float away and fade
  tl.to(sidekick, {
    x: position === 'left' ? -20 : 20,
    y: -15,
    opacity: 0,
    scale: 0.6,
    rotation: position === 'left' ? -15 : 15,
    duration: toSeconds(DURATION.NORMAL),
    ease: 'power2.in',
  });
}

// ============================================================================
// CONVENIENCE FUNCTIONS - Time of Day
// ============================================================================

/**
 * Show time-appropriate sidekick based on current hour.
 */
export function showTimeOfDaySidekick(): void {
  const hour = new Date().getHours();
  
  if (hour >= 5 && hour < 8) {
    // Early morning - sunrise
    showSidekick({ 
      icon: 'sunrise', 
      position: 'right',
      duration: 3000,
      color: 'var(--color-semantic-warning, #c4856a)',
      animation: 'float'
    });
  } else if (hour >= 8 && hour < 11) {
    // Morning - coffee
    showSidekick({ 
      icon: 'coffee', 
      position: 'right',
      duration: 3000,
      color: 'var(--color-text-secondary, #9a7b5a)',
      animation: 'float'
    });
  } else if (hour >= 11 && hour < 17) {
    // Day - sunshine
    showSidekick({ 
      icon: 'sun', 
      position: 'right',
      duration: 2500,
      color: 'var(--color-semantic-warning, #c4856a)',
      animation: 'pulse'
    });
  } else if (hour >= 17 && hour < 19) {
    // Evening - sunset
    showSidekick({ 
      icon: 'sunset', 
      position: 'right',
      duration: 3000,
      color: 'var(--color-semantic-warning, #c4856a)',
      animation: 'float'
    });
  } else if (hour >= 19 && hour < 21) {
    // Late evening - cozy flame
    showSidekick({ 
      icon: 'flame', 
      position: 'right',
      duration: 3000,
      color: 'var(--color-semantic-warning, #c4856a)',
      animation: 'float'
    });
  } else {
    // Night - moon
    showSidekick({ 
      icon: 'moon', 
      position: 'right',
      duration: 3000,
      color: 'var(--color-text-muted, #5a6b8a)',
      animation: 'float'
    });
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS - Emotional
// ============================================================================

/**
 * Show a lightbulb for "aha" moments.
 */
export function showIdea(): void {
  showSidekick({
    icon: 'lightbulb',
    position: 'left',
    duration: 2000,
    color: 'var(--color-semantic-warning, #b8956a)',
    animation: 'bounce',
  });
}

/**
 * Show hearts for empathetic/loving moments.
 */
export function showLove(): void {
  showSidekick({
    icon: 'heart',
    position: 'right',
    duration: 2500,
    color: 'var(--color-semantic-error, #a67a6a)',
    animation: 'float',
  });
}

/**
 * Show sparkles for celebration.
 */
export function showCelebration(): void {
  showSidekickPair('sparkles', 'star', 2500);
}

/**
 * Show music notes when discussing music/playlists.
 */
export function showMusic(): void {
  showSidekick({
    icon: 'music',
    position: 'left',
    duration: 3000,
    color: 'var(--persona-primary)',
    animation: 'float',
  });
}

/**
 * Show thinking/brain for contemplative moments.
 */
export function showThinking(): void {
  showSidekick({
    icon: 'brain',
    position: 'left',
    duration: 2500,
    color: 'var(--persona-secondary)',
    animation: 'pulse',
  });
}

/**
 * Show wave hand for greetings.
 */
export function showWave(): void {
  showSidekick({
    icon: 'hand',
    position: 'right',
    duration: 2000,
    color: 'var(--persona-primary)',
    animation: 'bounce',
    size: 'lg',
  });
}

// ============================================================================
// CONVENIENCE FUNCTIONS - Activities
// ============================================================================

/**
 * Show reading/book icon for learning moments.
 */
export function showReading(): void {
  showSidekick({
    icon: 'bookOpen',
    position: 'left',
    duration: 3000,
    color: 'var(--persona-secondary)',
    animation: 'float',
  });
}

/**
 * Show headphones for music listening.
 */
export function showListening(): void {
  showSidekick({
    icon: 'headphones',
    position: 'right',
    duration: 3000,
    color: 'var(--persona-primary)',
    animation: 'pulse',
  });
}

/**
 * Show yoga for wellness/mindfulness.
 */
export function showWellness(): void {
  showSidekick({
    icon: 'yoga',
    position: 'left',
    duration: 3000,
    color: 'var(--persona-secondary)',
    animation: 'float',
  });
}

/**
 * Show art palette for creative moments.
 */
export function showCreative(): void {
  showSidekick({
    icon: 'palette',
    position: 'left',
    duration: 2500,
    color: 'var(--color-semantic-warning, #b8956a)',
    animation: 'float',
  });
}

// ============================================================================
// CONVENIENCE FUNCTIONS - Weather & Environment
// ============================================================================

/**
 * Show rainbow for hopeful moments.
 */
export function showHope(): void {
  showSidekickPair('sparkle', 'rainbow', 3000);
}

/**
 * Show nature leaf for grounding.
 */
export function showGrounding(): void {
  showSidekick({
    icon: 'leaf',
    position: 'right',
    duration: 3000,
    color: 'var(--persona-primary)',
    animation: 'float',
  });
}

/**
 * Show waves for calm/flowing energy.
 */
export function showCalm(): void {
  showSidekick({
    icon: 'waves',
    position: 'right',
    duration: 3500,
    color: 'var(--color-text-muted, #5a6b8a)',
    animation: 'float',
  });
}

// ============================================================================
// CONVENIENCE FUNCTIONS - Energy & Motivation
// ============================================================================

/**
 * Show lightning bolt for energy/motivation.
 */
export function showEnergy(): void {
  showSidekick({
    icon: 'zap',
    position: 'left',
    duration: 2000,
    color: 'var(--color-semantic-warning, #b8956a)',
    animation: 'bounce',
  });
}

/**
 * Show trending up for progress.
 */
export function showProgress(): void {
  showSidekick({
    icon: 'trendingUp',
    position: 'right',
    duration: 2500,
    color: 'var(--color-semantic-success, #4a6741)',
    animation: 'bounce',
  });
}

/**
 * Show rocket for launching into action.
 */
export function showLaunch(): void {
  showSidekick({
    icon: 'rocket',
    position: 'left',
    duration: 2500,
    color: 'var(--persona-primary)',
    animation: 'bounce',
  });
}

/**
 * Show growth plant for personal development.
 */
export function showGrowth(): void {
  showSidekick({
    icon: 'grow',
    position: 'right',
    duration: 3000,
    color: 'var(--persona-primary)',
    animation: 'float',
  });
}

// ============================================================================
// CONVENIENCE FUNCTIONS - Milestones
// ============================================================================

/**
 * Show trophy for achievements.
 */
export function showAchievement(): void {
  showSidekick({
    icon: 'trophy',
    position: 'left',
    duration: 3000,
    color: 'var(--color-semantic-warning, #b8956a)',
    animation: 'bounce',
  });
}

/**
 * Show gift for surprises/rewards.
 */
export function showGift(): void {
  showSidekick({
    icon: 'gift',
    position: 'right',
    duration: 3000,
    color: 'var(--color-semantic-error, #a67a6a)',
    animation: 'bounce',
  });
}

/**
 * Show cake for birthdays/anniversaries.
 */
export function showBirthday(): void {
  showSidekickPair('cake', 'party', 3500);
}

/**
 * Show crown for special recognition.
 */
export function showRecognition(): void {
  showSidekick({
    icon: 'crown',
    position: 'left',
    duration: 2500,
    color: 'var(--color-semantic-warning, #b8956a)',
    animation: 'pulse',
  });
}

// ============================================================================
// CONVENIENCE FUNCTIONS - Communication
// ============================================================================

/**
 * Show chat bubble for discussion.
 */
export function showChat(): void {
  showSidekick({
    icon: 'chat',
    position: 'left',
    duration: 2500,
    color: 'var(--persona-primary)',
    animation: 'float',
  });
}

/**
 * Show bell for reminders/notifications.
 */
export function showReminder(): void {
  showSidekick({
    icon: 'bell',
    position: 'right',
    duration: 2000,
    color: 'var(--color-semantic-warning, #b8956a)',
    animation: 'bounce',
  });
}

// ============================================================================
// CONVENIENCE FUNCTIONS - Rest & Calm
// ============================================================================

/**
 * Show sleep/bedtime icon.
 */
export function showBedtime(): void {
  showSidekick({
    icon: 'moon',
    position: 'right',
    duration: 3000,
    color: 'var(--color-text-muted, #5a6b8a)',
    animation: 'float',
  });
}

/**
 * Show tea for relaxation.
 */
export function showRelaxation(): void {
  showSidekick({
    icon: 'tea',
    position: 'right',
    duration: 3000,
    color: 'var(--persona-secondary)',
    animation: 'float',
  });
}

// ============================================================================
// CONVENIENCE FUNCTIONS - Focus & Planning
// ============================================================================

/**
 * Show focus/target for concentration.
 */
export function showFocus(): void {
  showSidekick({
    icon: 'focus',
    position: 'left',
    duration: 2500,
    color: 'var(--persona-primary)',
    animation: 'pulse',
  });
}

/**
 * Show calendar for planning.
 */
export function showPlanning(): void {
  showSidekick({
    icon: 'calendar',
    position: 'right',
    duration: 2500,
    color: 'var(--persona-secondary)',
    animation: 'float',
  });
}

/**
 * Show checkmark for completion.
 */
export function showComplete(): void {
  showSidekick({
    icon: 'checkCircle',
    position: 'right',
    duration: 2000,
    color: 'var(--color-semantic-success, #4a6741)',
    animation: 'bounce',
  });
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  const styleId = 'avatar-sidekicks-styles';
  if (document.getElementById(styleId)) return;
  
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    /* ========================================================================
       Avatar Sidekicks - Floating side companion icons
       ======================================================================== */
    
    /* Allow overflow so sidekicks can appear outside the avatar bounds */
    .avatar-container:has(.avatar-sidekicks-container) {
      overflow: visible !important;
    }
    
    .avatar-sidekicks-container {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: var(--z-floating, 20);
      overflow: visible;
    }
    
    /* Sidekick slots - positioned beside the avatar */
    .sidekick-slot {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
    }
    
    .sidekick-slot--left {
      right: calc(100% + 12px);
    }
    
    .sidekick-slot--right {
      left: calc(100% + 12px);
    }
    
    /* Sidekick icon styling */
    .sidekick-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      filter: drop-shadow(0 2px 4px rgba(44, 37, 32, 0.2));
      will-change: transform, opacity;
    }
    
    .sidekick-icon svg {
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    
    /* Size variants */
    .sidekick-icon--sm { transform-origin: center; }
    .sidekick-icon--md { transform-origin: center; }
    .sidekick-icon--lg { transform-origin: center; }
    
    /* Subtle glow on icons */
    .sidekick-icon::after {
      content: '';
      position: absolute;
      inset: -4px;
      border-radius: 50%;
      background: radial-gradient(
        circle,
        var(--persona-glow, rgba(74, 103, 65, 0.2)) 0%,
        transparent 70%
      );
      opacity: 0.5;
      pointer-events: none;
      z-index: -1;
    }
    
    /* Reduced motion - no animation */
    @media (prefers-reduced-motion: reduce) {
      .avatar-sidekicks-container {
        display: none;
      }
    }
    
    /* Dark theme adjustments */
    [data-theme='dark'] .sidekick-icon {
      filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.4));
    }
    
    /* Responsive - hide on very small screens */
    @media (max-width: 360px) {
      .sidekick-slot {
        display: none;
      }
    }
  `;
  
  document.head.appendChild(style);
}

// ============================================================================
// CLEANUP
// ============================================================================

export function dispose(): void {
  clearAllTimeouts();
  clearAllSidekicks();
  removeEventListeners();
  
  container?.remove();
  container = null;
  leftSlot = null;
  rightSlot = null;
  isInitialized = false;
  
  // Remove injected styles
  const styleElement = document.getElementById('avatar-sidekicks-styles');
  styleElement?.remove();
  
  log.debug('Avatar sidekicks disposed');
}

// ============================================================================
// EVENT INTEGRATION
// ============================================================================

/**
 * All the signals/events that can trigger sidekicks:
 * 
 * EMOTION SIGNALS (from voice prosody analysis):
 * - ferni:emotion-change - User's emotional state detected
 * - ferni:emotion-detected - Detailed emotion with confidence
 * 
 * ENGAGEMENT SIGNALS:
 * - ferni:celebration - Achievement or milestone
 * - ferni:memory-callback - Ferni remembered something
 * - ferni:growth-recognized - User growth detected
 * - ferni:concern-detected - User concern/distress
 * - ferni:deep-moment - Emotionally significant moment
 * 
 * CONVERSATION SIGNALS:
 * - ferni:conversation-start - Call began
 * - ferni:conversation-end - Call ended
 * - ferni:thinking - Ferni is processing
 * - ferni:user-speech-start/end - User speaking state
 * 
 * HUMANIZATION SIGNALS (from backend):
 * - humanization_signal with types: breakthrough, vulnerability, high_engagement, etc.
 * 
 * TOOL EXECUTION (from backend data messages):
 * - Music playing → music sidekick
 * - Calendar events → calendar sidekick
 * - Habit tracking → wellness sidekick
 * 
 * RELATIONSHIP MILESTONES:
 * - ferni:team-member-unlocked - New persona unlocked
 * - ferni:streak-milestone - Streak achievement
 * - ferni:milestone-celebrated - General milestone
 */

function setupEventListeners(): void {
  // Use AbortController for clean removal of all listeners
  if (eventAbortController) return; // Already set up
  eventAbortController = new AbortController();
  const signal = eventAbortController.signal;

  // ─────────────────────────────────────────────────────────────────
  // EMOTION SIGNALS - React to user's emotional state
  // Uses ferni:emotion-detected (the actual dispatched event name)
  // ─────────────────────────────────────────────────────────────────
  
  document.addEventListener('ferni:emotion-detected', ((e: CustomEvent) => {
    const { emotion, intensity } = e.detail || {};
    if (!emotion || intensity < 0.6) return; // Only strong emotions
    
    // Map emotions to sidekick icons
    const emotionToIcon: Record<string, SidekickIcon> = {
      happy: 'sparkles',
      excited: 'zap',
      curious: 'lightbulb',
      sad: 'heart',
      empathetic: 'hug',
      proud: 'trophy',
      surprised: 'sparkle',
      thinking: 'brain',
      celebrating: 'party',
    };
    
    const icon = emotionToIcon[emotion as string];
    if (icon) {
      showSidekick({ icon, position: 'right', duration: 2500 });
    }
  }) as EventListener, { signal });

  // ─────────────────────────────────────────────────────────────────
  // CELEBRATION & MILESTONE SIGNALS
  // Uses actual event names from brand-integration.ts
  // ─────────────────────────────────────────────────────────────────
  
  // ferni:big-win from brand-integration.ts
  document.addEventListener('ferni:big-win', () => {
    showSidekickPair('sparkles', 'party', 3000);
  }, { signal });
  
  // ferni:small-win from brand-integration.ts
  document.addEventListener('ferni:small-win', () => {
    showSidekick({ icon: 'sparkle', position: 'right', duration: 2000 });
  }, { signal });

  document.addEventListener('ferni:memory-callback', () => {
    // Recognition moment - lightbulb to show "I remember!"
    showSidekick({ icon: 'lightbulb', position: 'right', duration: 2000 });
  }, { signal });

  // ferni:deep-moment from brand-integration.ts
  document.addEventListener('ferni:deep-moment', () => {
    // Heart for emotionally significant moments
    showSidekick({ icon: 'heart', position: 'right', duration: 3000 });
  }, { signal });

  // ─────────────────────────────────────────────────────────────────
  // RELATIONSHIP MILESTONES
  // Uses actual event names from brand-integration.ts
  // ─────────────────────────────────────────────────────────────────
  
  // ferni:team-unlock (actual name, not team-member-unlocked)
  document.addEventListener('ferni:team-unlock', () => {
    showSidekickPair('sparkles', 'star', 4000);
  }, { signal });

  // ferni:streak from brand-integration.ts
  document.addEventListener('ferni:streak', ((e: CustomEvent) => {
    const streak = e.detail?.streak;
    if (streak >= 7) {
      showSidekickPair('trophy', 'flame', 3500);
    } else {
      showSidekick({ icon: 'flame', position: 'right', duration: 2500 });
    }
  }) as EventListener, { signal });

  // ferni:milestone from brand-integration.ts
  document.addEventListener('ferni:milestone', () => {
    showSidekick({ icon: 'trophy', position: 'right', duration: 3000 });
  }, { signal });

  // ─────────────────────────────────────────────────────────────────
  // CONVERSATION STATE SIGNALS
  // ─────────────────────────────────────────────────────────────────
  
  document.addEventListener('ferni:thinking', () => {
    showSidekick({ icon: 'brain', position: 'right', duration: 2000 });
  }, { signal });

  // ferni:conversation-start is dispatched on window, not document
  window.addEventListener('ferni:conversation-start', () => {
    // Gentle wave on connection
    showSidekick({ icon: 'hand', position: 'right', duration: 2000 });
  }, { signal });

  // ─────────────────────────────────────────────────────────────────
  // MUSIC & MEDIA SIGNALS
  // Uses ferni:music-state (the actual dispatched event name)
  // ─────────────────────────────────────────────────────────────────
  
  document.addEventListener('ferni:music-state', ((e: CustomEvent) => {
    const { state, isAmbient } = e.detail || {};
    if (state === 'playing') {
      // Different icon for ambient vs user-requested music
      const icon: SidekickIcon = isAmbient ? 'music' : 'headphones';
      showSidekick({ icon, position: 'right', duration: 4000 });
    }
  }) as EventListener, { signal });

  // ─────────────────────────────────────────────────────────────────
  // HANDOFF / PERSONA SWITCH SIGNALS
  // These are dispatched on window by persona-magic.ui.ts
  // ─────────────────────────────────────────────────────────────────
  
  window.addEventListener('ferni:handoff-start', () => {
    // Wave goodbye as we hand off
    showSidekick({ icon: 'hand', position: 'left', duration: 2500 });
  }, { signal });

  window.addEventListener('ferni:handoff-complete', () => {
    // Sparkle to welcome new persona
    showSidekick({ icon: 'sparkle', position: 'right', duration: 2000 });
  }, { signal });
  
  // ferni:handoff from brand-integration.ts (alternate event)
  document.addEventListener('ferni:handoff', () => {
    showSidekick({ icon: 'sparkle', position: 'right', duration: 2000 });
  }, { signal });

  // ─────────────────────────────────────────────────────────────────
  // WEATHER / SKY-CHECK SIGNALS (internal emotional weather)
  // ─────────────────────────────────────────────────────────────────
  
  document.addEventListener('ferni:sky-check', ((e: CustomEvent) => {
    const { weather, energy } = e.detail || {};
    
    // Map weather to sidekick icons
    const weatherToIcon: Record<string, SidekickIcon> = {
      sunny: 'sun',
      'partly-cloudy': 'cloudSun',
      cloudy: 'cloud',
      rainy: 'cloudRain',
      stormy: 'zap',
      foggy: 'cloud',
      rainbow: 'rainbow',
    };
    
    const icon = weatherToIcon[weather as string] || 'sun';
    const energyIcon: Record<string, SidekickIcon> = {
      high: 'zap',
      medium: 'coffee',
      low: 'moon',
    };
    
    // Show weather on left, energy indicator on right
    showSidekickPair(icon, energyIcon[energy as string] || 'coffee', 3500);
  }) as EventListener, { signal });

  // ─────────────────────────────────────────────────────────────────
  // BIRTHDAY / ANNIVERSARY / IMPORTANT DATES
  // ─────────────────────────────────────────────────────────────────
  
  document.addEventListener('ferni:birthday-reminder', () => {
    showSidekickPair('cake', 'gift', 4000);
  }, { signal });

  document.addEventListener('ferni:anniversary-reminder', () => {
    showSidekickPair('heart', 'star', 4000);
  }, { signal });

  // ─────────────────────────────────────────────────────────────────
  // GAMING & PLAY SIGNALS
  // ─────────────────────────────────────────────────────────────────
  
  document.addEventListener('ferni:game-started', ((e: CustomEvent) => {
    const gameType = e.detail?.gameType;
    if (gameType === 'dice' || gameType === 'random') {
      showSidekick({ icon: 'dice', position: 'right', duration: 3000 });
    } else {
      showSidekick({ icon: 'gamepad', position: 'right', duration: 3000 });
    }
  }) as EventListener, { signal });

  // ─────────────────────────────────────────────────────────────────
  // PROACTIVE OUTREACH (from proactive-outreach.ui.ts)
  // ─────────────────────────────────────────────────────────────────
  
  document.addEventListener('ferni:proactive-outreach', ((e: CustomEvent) => {
    const type = e.detail?.type;
    if (type === 'thinking-of-you') {
      showSidekick({ icon: 'heart', position: 'right', duration: 3000 });
    } else if (type === 'check-in') {
      showSidekick({ icon: 'messageCircle', position: 'right', duration: 2500 });
    } else {
      showSidekick({ icon: 'bell', position: 'right', duration: 2000 });
    }
  }) as EventListener, { signal });
  
  // ferni:thinking-of-you from brand-integration.ts
  document.addEventListener('ferni:thinking-of-you', () => {
    showSidekick({ icon: 'heart', position: 'right', duration: 3000 });
  }, { signal });

  // ─────────────────────────────────────────────────────────────────
  // BREAKTHROUGH MOMENTS (from humanization-bridge.service.ts)
  // ─────────────────────────────────────────────────────────────────
  
  document.addEventListener('ferni:breakthrough', () => {
    showSidekickPair('lightbulb', 'sparkles', 4000);
  }, { signal });

  // ─────────────────────────────────────────────────────────────────
  // JOURNAL & REFLECTION SIGNALS
  // ─────────────────────────────────────────────────────────────────
  
  // ferni:journal-entry from voice-journal/save.ts
  document.addEventListener('ferni:journal-entry', () => {
    showSidekick({ icon: 'pen', position: 'right', duration: 2500 });
  }, { signal });
  
  // ─────────────────────────────────────────────────────────────────
  // WELLNESS & BREATHING SIGNALS
  // ─────────────────────────────────────────────────────────────────
  
  // ferni:breathing-exercise from breathing-guide.ui.ts
  document.addEventListener('ferni:breathing-exercise', () => {
    showSidekick({ icon: 'wind', position: 'right', duration: 4000 });
  }, { signal });
  
  // ferni:meditation-started from game-picker.ui.ts (reflection games)
  document.addEventListener('ferni:meditation-started', () => {
    showSidekick({ icon: 'leaf', position: 'right', duration: 3000 });
  }, { signal });
  
  // ─────────────────────────────────────────────────────────────────
  // PROGRESS & GOALS SIGNALS
  // ─────────────────────────────────────────────────────────────────
  
  // ferni:goal-achieved from monetization-integration.service.ts
  document.addEventListener('ferni:goal-achieved', () => {
    showSidekickPair('trophy', 'confetti', 4000);
  }, { signal });
  
  // ferni:progress-tracked from growth-journey.service.ts
  document.addEventListener('ferni:progress-tracked', () => {
    showSidekick({ icon: 'trendingUp', position: 'right', duration: 2500 });
  }, { signal });
  
  // ferni:insights-generated from relationship-stage.service.ts
  document.addEventListener('ferni:insights-generated', () => {
    showSidekick({ icon: 'lightbulb', position: 'right', duration: 2500 });
  }, { signal });

  log.debug('Event listeners set up for sidekick triggers');
}

function removeEventListeners(): void {
  // AbortController cleanly removes all event listeners at once
  if (eventAbortController) {
    eventAbortController.abort();
    eventAbortController = null;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const avatarSidekicks = {
  init: initAvatarSidekicks,
  show: showSidekick,
  showPair: showSidekickPair,
  clear: clearAllSidekicks,
  dispose,
  
  // Time of Day
  timeOfDay: showTimeOfDaySidekick,
  
  // Ideas & Thinking
  idea: showIdea,
  thinking: showThinking,
  focus: showFocus,
  
  // Emotions & Connection
  love: showLove,
  celebrate: showCelebration,
  wave: showWave,
  hope: showHope,
  
  // Activities
  music: showMusic,
  listening: showListening,
  reading: showReading,
  wellness: showWellness,
  creative: showCreative,
  
  // Energy & Motivation
  energy: showEnergy,
  progress: showProgress,
  launch: showLaunch,
  growth: showGrowth,
  
  // Nature & Environment
  grounding: showGrounding,
  calm: showCalm,
  
  // Milestones & Celebrations
  achievement: showAchievement,
  gift: showGift,
  birthday: showBirthday,
  recognition: showRecognition,
  
  // Communication
  chat: showChat,
  reminder: showReminder,
  
  // Rest & Calm
  bedtime: showBedtime,
  relaxation: showRelaxation,
  
  // Focus & Planning
  planning: showPlanning,
  complete: showComplete,
  
  // Icon list for dev panel (organized by category)
  icons: Object.keys(SIDEKICK_ICONS) as SidekickIcon[],
  
  // Icon categories for better discovery in dev panel
  categories: {
    timeOfDay: ['coffee', 'sun', 'sunrise', 'sunset', 'moon', 'flame', 'clock', 'alarm', 'hourglass'],
    weather: ['cloud', 'cloudSun', 'cloudRain', 'snowflake', 'wind', 'rainbow'],
    nature: ['leaf', 'flower', 'sprout', 'palmtree', 'waves', 'grow'],
    ideas: ['lightbulb', 'brain', 'thinking', 'compass', 'focus', 'target', 'search'],
    emotions: ['heart', 'heartPulse', 'sparkles', 'sparkle', 'smile', 'laughing', 'wink', 'worried', 'hug', 'thumbsUp'],
    gestures: ['hand', 'handshake', 'pointer', 'flex'],
    activities: ['music', 'headphones', 'book', 'bookOpen', 'palette', 'brush', 'gamepad', 'yoga', 'movie', 'tent'],
    celebrations: ['trophy', 'star', 'crown', 'gift', 'cake', 'party', 'confetti', 'fireworks', 'rocket', 'flag'],
    energy: ['zap', 'trendingUp', 'activity', 'flame'],
    rest: ['sleepy', 'bedtime', 'tea', 'moon', 'cloud'],
    communication: ['messageCircle', 'chat', 'bell', 'phone', 'mail'],
    misc: ['eye', 'calendar', 'checkCircle', 'crystalBall', 'magic', 'layers', 'wifi', 'info', 'mic', 'pen', 'dice'],
    animals: ['turtle', 'snail', 'bug'],
  } as const,
};

export default avatarSidekicks;
