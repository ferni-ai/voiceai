/**
 * Styles for speaker-cues.ui.ts. The mic ring scales with --cue-mic-level
 * (0 to 1). With prefers-reduced-motion nothing animates or scales; the glow
 * and ring show at a fixed strength so the speaker is still clear.
 */
export const SPEAKER_CUES_CSS = `
.speaker-cues__glow, .speaker-cues__mic-ring {
  position: absolute; inset: -6px; border-radius: 50%; pointer-events: none; opacity: 0;
  transition: opacity var(--duration-slow, 300ms) var(--ease-smooth, ease-out);
}
.speaker-cues__glow { box-shadow: var(--shadow-glow); background: var(--color-accent-glow); }
.speaker-cues__mic-ring {
  border: 3px solid var(--color-accent-primary);
  transform: scale(calc(1 + var(--cue-mic-level, 0) * 0.18));
  transition: opacity var(--duration-slow, 300ms) var(--ease-smooth, ease-out),
    transform var(--duration-slow, 300ms) var(--ease-smooth, ease-out);
}
#coach.cue-ferni-speaking .speaker-cues__glow {
  opacity: 1; animation: speakerCuesGlow var(--duration-glacial, 1500ms) ease-in-out infinite;
}
#coach.cue-thinking:not(.cue-ferni-speaking) .speaker-cues__glow {
  opacity: 0.45; animation: speakerCuesBreath var(--duration-meditative, 3000ms) ease-in-out infinite;
}
#coach.cue-user-speaking .speaker-cues__mic-ring { opacity: calc(0.4 + var(--cue-mic-level, 0) * 0.6); }
@keyframes speakerCuesGlow { 0%, 100% { opacity: 0.7; transform: scale(1); } 50% { opacity: 1; transform: scale(1.04); } }
@keyframes speakerCuesBreath { 0%, 100% { opacity: 0.25; transform: scale(0.98); } 50% { opacity: 0.5; transform: scale(1.02); } }
.speaker-cues__interrupt {
  position: absolute; left: 50%; top: calc(100% + 12px); transform: translateX(-50%); z-index: 2;
  min-height: 44px; padding: 0 18px; border-radius: 9999px; white-space: nowrap; cursor: pointer;
  border: 1px solid var(--color-border-subtle); background: var(--color-background-elevated);
  color: var(--color-text-primary); font: inherit; font-size: 14px;
}
.speaker-cues__interrupt[hidden] { display: none; }
.speaker-cues__interrupt:focus-visible { outline: 2px solid var(--color-accent-primary); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  .speaker-cues__mic-ring { transform: none; }
  #coach.cue-ferni-speaking .speaker-cues__glow,
  #coach.cue-thinking:not(.cue-ferni-speaking) .speaker-cues__glow { animation: none; }
  #coach.cue-user-speaking .speaker-cues__mic-ring { opacity: 0.8; }
}
`;
