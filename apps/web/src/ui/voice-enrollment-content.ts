/**
 * Static content for the voice enrollment UI: its states, icons, prompts and
 * the overlay-host dialog CSS. Split out of voice-enrollment.ui.ts, which is at
 * its file-size budget. Imports nothing back from it.
 *
 * @module ui/voice-enrollment-content
 */

export type EnrollmentState =
  | 'idle'
  | 'checking'
  | 'not_available'
  | 'already_enrolled'
  | 'ready'
  | 'recording'
  | 'processing'
  | 'complete'
  | 'error';

// ============================================================================
// ICONS (Lucide-style, brand compliant)
// ============================================================================

export const ICONS = {
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>',
  close:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  check:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  alert:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>',
  speaker:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="12" cy="12" r="3"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M2 12h2"/><path d="M20 12h2"/></svg>',
  sparkles:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>',
  trash:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>',
};

// ============================================================================
// ENROLLMENT PROMPTS - Different phrases for each sample
// ============================================================================

export const ENROLLMENT_PROMPTS = [
  "Say anything that comes to mind - maybe what you had for breakfast?",
  "Tell me about your favorite place to relax.",
  "Describe something that made you smile recently.",
  "What's a hobby you enjoy or want to try?",
  "Share a fun fact about yourself.",
];

/** With the overlay host on, the native dialog is the card; flatten the inner card. */
export const ENROLLMENT_DIALOG_CSS = `/* Overlay host: the dialog is the card. */
    .ferni-dialog.voice-enrollment-dialog .ferni-dialog__surface { padding: 0; }
    .ferni-dialog.voice-enrollment-dialog .voice-enrollment-card {
      width: auto;
      max-width: none;
      max-height: none;
      border: 0;
      border-radius: 0;
      box-shadow: none;
      background: transparent;
      transform: none;
    }`;
