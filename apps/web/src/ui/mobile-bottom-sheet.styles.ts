/**
 * Styles for the mobile bottom sheet (split out of mobile-bottom-sheet.ui.ts,
 * which is over the file-size budget).
 *
 * @module ui/mobile-bottom-sheet.styles
 */

export const STYLES = `
/* Mobile Bottom Sheet - iOS-style slide-up panel */
.mobile-bottom-sheet-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(44, 37, 32, 0.75);
  opacity: 0;
  visibility: hidden;
  transition: opacity var(--duration-slow, 0.3s) ease, visibility var(--duration-slow, 0.3s) ease;
  z-index: var(--z-modal-backdrop);
  touch-action: none;
}

.mobile-bottom-sheet-backdrop.open {
  opacity: 1;
  visibility: visible;
}

.mobile-bottom-sheet {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--color-bg-elevated, #2a2520);
  border-radius: 20px 20px 0 0;
  transform: translateY(100%);
  transition: transform 0.35s cubic-bezier(0.32, 0.72, 0, 1);
  z-index: var(--z-modal);
  max-height: 70vh;
  overflow: hidden;
  box-shadow: var(--shadow-lg, 0 -4px 32px rgba(0, 0, 0, 0.3));
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

.mobile-bottom-sheet.open {
  transform: translateY(0);
}

.mobile-bottom-sheet.dragging {
  transition: none;
}

/* Drag handle */
.mobile-bottom-sheet__handle {
  display: flex;
  justify-content: center;
  padding: 12px 0 8px;
  cursor: grab;
  touch-action: none;
}

.mobile-bottom-sheet__handle::before {
  content: '';
  width: 36px;
  height: 4px;
  background: var(--color-text-muted, var(--color-border-subtle, rgba(255,255,255,0.3)));
  border-radius: 2px;
}

.mobile-bottom-sheet__handle:active {
  cursor: grabbing;
}

/* Content */
.mobile-bottom-sheet__content {
  padding: 8px 20px 24px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  max-height: calc(70vh - 60px);
}

/* In the overlay-host dialog sheet, the dialog supplies padding and height. */
.mobile-bottom-sheet-dialog .mobile-bottom-sheet__content {
  padding: 0;
  max-height: none;
}

/* Title */
.mobile-bottom-sheet__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-secondary, rgba(255,255,255,0.7));
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 16px;
  padding: 0 4px;
}

/* Action grid */
.mobile-bottom-sheet__actions {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

/* Individual action button */
.mobile-bottom-sheet__action {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm, 8px);
  padding: var(--space-md, 16px) var(--space-sm, 8px);
  border: none;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-lg, 16px);
  cursor: pointer;
  transition: background var(--duration-fast, 0.2s) ease, transform var(--duration-fast, 0.15s) ease;
  -webkit-tap-highlight-color: transparent;
}

.mobile-bottom-sheet__action:hover,
.mobile-bottom-sheet__action:focus-visible {
  background: var(--color-bg-glass);
  outline: none;
}

.mobile-bottom-sheet__action:focus-visible {
  box-shadow: 0 0 0 2px var(--color-accent-primary, var(--color-ferni));
}

.mobile-bottom-sheet__action:active {
  transform: scale(0.95);
  background: var(--color-bg-glass);
}

.mobile-bottom-sheet__action-icon {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mobile-bottom-sheet__action-icon svg {
  width: 24px;
  height: 24px;
  stroke: currentColor;
  fill: none;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.mobile-bottom-sheet__action-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text-secondary);
  text-align: center;
  line-height: 1.2;
}

/* Only show on mobile */
@media (min-width: 769px) {
  .mobile-bottom-sheet,
  .mobile-bottom-sheet-backdrop,
  .mobile-menu-trigger {
    display: none !important;
  }
}

/* Menu trigger button (floating) */
.mobile-menu-trigger {
  position: fixed;
  bottom: calc(var(--space-lg, 26px) + env(safe-area-inset-bottom, 0px));
  left: var(--space-md, 16px);
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  box-shadow: var(--shadow-md, 0 4px 16px rgba(0, 0, 0, 0.2));
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: var(--z-floating);
  transition: transform var(--duration-fast, 0.2s) ease, box-shadow var(--duration-fast, 0.2s) ease;
  -webkit-tap-highlight-color: transparent;
}

.mobile-menu-trigger:hover,
.mobile-menu-trigger:focus-visible {
  transform: scale(1.05);
  box-shadow: var(--shadow-lg, 0 6px 20px rgba(0, 0, 0, 0.3));
  outline: none;
}

.mobile-menu-trigger:focus-visible {
  box-shadow: 0 0 0 2px var(--color-accent-primary, var(--color-ferni));
}

.mobile-menu-trigger:active {
  transform: scale(0.95);
}

.mobile-menu-trigger svg {
  width: 20px;
  height: 20px;
  color: var(--color-text-primary);
  stroke: currentColor;
  fill: none;
  stroke-width: 2;
}

/* Hide trigger when sheet is open */
.mobile-menu-trigger.hidden {
  opacity: 0;
  pointer-events: none;
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  .mobile-bottom-sheet,
  .mobile-bottom-sheet-backdrop,
  .mobile-menu-trigger,
  .mobile-bottom-sheet__action {
    transition: none;
  }
}
`;
