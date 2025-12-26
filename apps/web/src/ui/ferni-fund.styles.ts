/**
 * Ferni Fund / Seed Fund Styles
 *
 * Extracted from ferni-fund.ui.ts for file size compliance (<500 lines per file).
 * Contains all CSS-in-JS styles for the Seed Fund modal component.
 */

import { DURATION, EASING } from '../config/animation-constants.js';

// ============================================================================
// MAIN STYLES
// ============================================================================

export const ferniFundStyles = `
.ferni-fund-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
  opacity: 0;
  pointer-events: none;
  transition: opacity ${DURATION.MODERATE}ms ${EASING.STANDARD};
}

.ferni-fund-overlay.open {
  opacity: 1;
  pointer-events: auto;
}

.ferni-fund-backdrop {
  position: absolute;
  inset: 0;
  background: var(--glass-backdrop-bg, rgba(44, 37, 32, 0.4));
  backdrop-filter: blur(var(--glass-blur-thick, 24px));
  -webkit-backdrop-filter: blur(var(--glass-blur-thick, 24px));
}

.ferni-fund-card {
  position: relative;
  background: var(--glass-thick-bg, rgba(255, 255, 255, 0.12));
  backdrop-filter: blur(var(--glass-blur-thick, 24px));
  -webkit-backdrop-filter: blur(var(--glass-blur-thick, 24px));
  border: 1px solid var(--glass-thick-border, rgba(255, 255, 255, 0.14));
  border-radius: var(--radius-2xl, 24px);
  padding: var(--space-8, 32px);
  max-width: clamp(308px, 90vw, 440px);
  width: calc(100% - 32px);
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: var(--glass-shadow-thick, 0 8px 12px rgba(0, 0, 0, 0.10), 0 16px 32px rgba(0, 0, 0, 0.08));
  transform: scale(0.9);
  transition: transform ${DURATION.MODERATE}ms ${EASING.SPRING};
}

.ferni-fund-overlay.open .ferni-fund-card {
  transform: scale(1);
}

@supports not (backdrop-filter: blur(24px)) {
  .ferni-fund-card {
    background: var(--color-background-elevated, #FFFDFB);
  }
}

.ferni-fund-close {
  position: absolute;
  top: 16px;
  right: 16px;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 8px;
  border-radius: 50%;
  color: var(--color-text-muted);
  transition: background ${DURATION.FAST}ms;
}

.ferni-fund-close:hover {
  background: var(--color-bg-secondary);
}

.ferni-fund-header {
  text-align: center;
  margin-bottom: var(--space-6, 24px);
}

.ferni-fund-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto var(--space-4, 16px);
  background: linear-gradient(135deg, var(--persona-primary, #4a6741), var(--persona-secondary, #3d5a35));
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ferni-fund-icon svg {
  width: 32px;
  height: 32px;
  color: white;
}

.ferni-fund-title {
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 8px 0;
}

.ferni-fund-subtitle {
  font-size: 0.95rem;
  color: var(--color-text-secondary);
  margin: 0;
  line-height: 1.6;
}

/* Progress Bar - Transparent Fund */
.ferni-fund-progress {
  margin-bottom: var(--space-6, 24px);
  text-align: center;
}

.ferni-fund-progress-header {
  margin-bottom: var(--space-2, 8px);
}

.ferni-fund-progress-current {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--color-text-primary);
}

.ferni-fund-progress-goal {
  font-size: 1.1rem;
  color: var(--color-text-muted);
}

.ferni-fund-progress-bar-container {
  height: 12px;
  background: var(--color-bg-secondary);
  border-radius: 999px;
  overflow: hidden;
  margin-bottom: var(--space-3, 12px);
}

.ferni-fund-progress-bar {
  height: 100%;
  border-radius: 999px;
  transition: width ${DURATION.SLOW}ms ${EASING.STANDARD};
}

.ferni-fund-progress-message {
  font-size: 0.9rem;
  color: var(--color-text-secondary);
  margin: 0;
  line-height: 1.5;
}

/* Community Stats */
.ferni-fund-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-3, 12px);
  margin-bottom: var(--space-6, 24px);
  padding: var(--space-4, 16px);
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-lg, 12px);
}

.ferni-fund-stat {
  text-align: center;
}

.ferni-fund-stat-value {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--persona-primary, #4a6741);
}

.ferni-fund-stat-label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Section Labels */
.ferni-fund-section-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  margin-bottom: var(--space-3, 12px);
}

/* Divider */
.ferni-fund-divider {
  display: flex;
  align-items: center;
  margin: var(--space-5, 20px) 0;
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

.ferni-fund-divider::before,
.ferni-fund-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--color-border);
}

.ferni-fund-divider span {
  padding: 0 var(--space-3, 12px);
}

/* Amount Selection - Vertical Layout */
.ferni-fund-amounts--vertical {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
  margin-bottom: var(--space-4, 16px);
}

.ferni-fund-amount-btn {
  padding: var(--space-4, 16px);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg, 12px);
  background: transparent;
  cursor: pointer;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text-primary);
  transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3, 12px);
  text-align: left;
}

.ferni-fund-amount-btn:hover {
  border-color: var(--persona-primary, #4a6741);
  background: var(--color-bg-tertiary);
}

.ferni-fund-amount-btn.selected {
  border-color: var(--persona-primary, #4a6741);
  background: var(--persona-primary, #4a6741);
  color: white;
}

.ferni-fund-amount-btn .tier-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ferni-fund-amount-btn .tier-name {
  font-size: 0.95rem;
  font-weight: 600;
}

.ferni-fund-amount-btn .tier-desc {
  font-size: 0.8rem;
  font-weight: 400;
  opacity: 0.7;
}

.ferni-fund-amount-btn .tier-price {
  font-size: 1rem;
  font-weight: 700;
  white-space: nowrap;
}

.ferni-fund-amount-btn.selected .tier-desc {
  opacity: 0.9;
}

/* Monthly Options */
.ferni-fund-monthly-options {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
  margin-bottom: var(--space-4, 16px);
}

.ferni-fund-monthly-btn {
  padding: var(--space-4, 16px);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg, 12px);
  background: transparent;
  cursor: pointer;
  font-size: 0.95rem;
  color: var(--color-text-primary);
  transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3, 12px);
  text-align: left;
}

.ferni-fund-monthly-btn:hover {
  border-color: var(--persona-primary, #4a6741);
  background: var(--color-bg-tertiary);
}

.ferni-fund-monthly-btn.selected {
  border-color: var(--persona-primary, #4a6741);
  background: linear-gradient(135deg, var(--persona-primary, #4a6741), var(--persona-secondary, #3d5a35));
  color: white;
}

.ferni-fund-monthly-btn .tier-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ferni-fund-monthly-btn .tier-name {
  font-size: 0.95rem;
  font-weight: 600;
}

.ferni-fund-monthly-btn .tier-desc {
  font-size: 0.8rem;
  font-weight: 400;
  opacity: 0.7;
}

.ferni-fund-monthly-btn .tier-badge {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 4px 10px;
  background: var(--color-bg-secondary);
  border-radius: var(--radius-full, 100px);
  color: var(--persona-primary, #4a6741);
}

.ferni-fund-monthly-btn.selected .tier-badge {
  background: rgba(255,255,255,0.2);
  color: white;
}

.ferni-fund-monthly-btn.selected .tier-desc {
  opacity: 0.9;
}

.ferni-fund-custom-input {
  width: 100%;
  padding: var(--space-4, 16px);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg, 12px);
  font-size: 1rem;
  margin-bottom: var(--space-4, 16px);
  text-align: center;
}

.ferni-fund-custom-input:focus {
  outline: none;
  border-color: var(--persona-primary, #4a6741);
}

/* Message Input */
.ferni-fund-message-section {
  margin-bottom: var(--space-4, 16px);
}

.ferni-fund-message-label {
  display: block;
  font-size: 0.85rem;
  color: var(--color-text-secondary);
  margin-bottom: var(--space-2, 8px);
}

.ferni-fund-message-input {
  width: 100%;
  padding: var(--space-3, 12px);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md, 8px);
  font-size: 0.9rem;
  resize: none;
  font-family: inherit;
}

.ferni-fund-message-input::placeholder {
  color: var(--color-text-muted);
}

/* Recurring Toggle */
.ferni-fund-recurring {
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
  padding: var(--space-3, 12px);
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md, 8px);
  margin-bottom: var(--space-4, 16px);
}

.ferni-fund-recurring-toggle {
  position: relative;
  width: 44px;
  height: 24px;
  background: var(--color-border);
  border-radius: 12px;
  cursor: pointer;
  transition: background ${DURATION.FAST}ms;
}

.ferni-fund-recurring-toggle.active {
  background: var(--persona-primary, #4a6741);
}

.ferni-fund-recurring-toggle::after {
  content: '';
  position: absolute;
  width: 20px;
  height: 20px;
  background: white;
  border-radius: 50%;
  top: 2px;
  left: 2px;
  transition: transform ${DURATION.FAST}ms ${EASING.SPRING};
}

.ferni-fund-recurring-toggle.active::after {
  transform: translateX(20px);
}

.ferni-fund-recurring-text {
  flex: 1;
}

.ferni-fund-recurring-title {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--color-text-primary);
}

.ferni-fund-recurring-desc {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

/* Submit Button */
.ferni-fund-submit-btn {
  width: 100%;
  padding: var(--space-4, 16px);
  background: var(--persona-primary, #4a6741);
  color: white;
  border: none;
  border-radius: var(--radius-lg, 12px);
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
}

.ferni-fund-submit-btn:hover:not(:disabled) {
  background: var(--persona-secondary, #3d5a35);
  transform: translateY(-1px);
}

.ferni-fund-submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ferni-fund-footer {
  text-align: center;
  margin-top: var(--space-4, 16px);
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

/* Impact Preview */
.ferni-fund-impact {
  text-align: center;
  padding: var(--space-4, 16px);
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-lg, 12px);
  margin-bottom: var(--space-4, 16px);
}

.ferni-fund-impact-number {
  font-size: 2rem;
  font-weight: 700;
  color: var(--persona-primary, #4a6741);
}

.ferni-fund-impact-text {
  font-size: 0.9rem;
  color: var(--color-text-secondary);
}

/* Thank You State */
.ferni-fund-thank-you {
  text-align: center;
  padding: var(--space-8, 32px) 0;
}

.ferni-fund-thank-you-icon {
  width: 80px;
  height: 80px;
  margin: 0 auto var(--space-4, 16px);
  background: linear-gradient(135deg, var(--persona-primary, #4a6741), var(--persona-secondary, #3d5a35));
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fund-pulse 1s ${EASING.SPRING};
}

@keyframes fund-pulse {
  0% { transform: scale(0); opacity: 0; }
  50% { transform: scale(1.1); }
  100% { transform: scale(1); opacity: 1; }
}

.ferni-fund-thank-you-icon svg {
  width: 40px;
  height: 40px;
  color: white;
}

.ferni-fund-thank-you-title {
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 12px 0;
}

.ferni-fund-thank-you-message {
  font-size: 1rem;
  color: var(--color-text-secondary);
  line-height: 1.6;
  margin: 0 0 var(--space-4, 16px) 0;
}

.ferni-fund-impact-summary {
  padding: var(--space-4, 16px);
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-lg, 12px);
}

.ferni-fund-impact-summary-title {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  margin-bottom: var(--space-2, 8px);
}

.ferni-fund-impact-summary-value {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--persona-primary, #4a6741);
}

/* Loading State */
.ferni-fund-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-8, 32px) 0;
}

.ferni-fund-spinner {
  width: 48px;
  height: 48px;
  border: 3px solid var(--color-border);
  border-top-color: var(--persona-primary, #4a6741);
  border-radius: 50%;
  animation: fund-spin 1s linear infinite;
  margin-bottom: var(--space-4, 16px);
}

@keyframes fund-spin {
  to { transform: rotate(360deg); }
}

/* ============================================
   USER IMPACT VIEW STYLES
   ============================================ */

.ferni-fund-impact-view {
  text-align: center;
}

.ferni-fund-user-stats {
  display: flex;
  gap: var(--space-4, 16px);
  justify-content: center;
  flex-wrap: wrap;
  margin-bottom: var(--space-6, 24px);
}

.ferni-fund-stat {
  flex: 1;
  min-width: min(100px, 100%);
  padding: var(--space-4, 16px);
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-lg, 12px);
}

.ferni-fund-stat--primary {
  background: linear-gradient(135deg, var(--persona-primary, #4a6741), var(--persona-secondary, #3d5a35));
  color: white;
}

.ferni-fund-stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 4px;
}

.ferni-fund-stat-value--status {
  font-size: 1rem;
  color: var(--persona-primary, #4a6741);
}

.ferni-fund-stat--primary .ferni-fund-stat-value {
  color: white;
}

.ferni-fund-stat-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.8;
}

.ferni-fund-member-since {
  font-size: 0.85rem;
  color: var(--color-text-secondary);
  margin-bottom: var(--space-6, 24px);
}

.ferni-fund-community {
  padding: var(--space-4, 16px);
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-lg, 12px);
  margin-bottom: var(--space-6, 24px);
  text-align: left;
}

.ferni-fund-community h3 {
  font-size: 0.85rem;
  font-weight: 600;
  margin: 0 0 var(--space-3, 12px) 0;
  color: var(--color-text-primary);
}

.ferni-fund-progress-container {
  margin-top: var(--space-2, 8px);
}

.ferni-fund-progress {
  height: 8px;
  background: var(--color-border);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: var(--space-2, 8px);
}

.ferni-fund-progress-bar {
  height: 100%;
  background: linear-gradient(90deg, var(--persona-primary, #4a6741), var(--persona-secondary, #5d7a55));
  border-radius: 4px;
  transition: width ${DURATION.SLOW}ms ${EASING.STANDARD};
}

.ferni-fund-progress-text {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.ferni-fund-actions {
  display: flex;
  gap: var(--space-3, 12px);
  justify-content: center;
}

.ferni-fund-action-btn {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  padding: var(--space-3, 12px) var(--space-5, 20px);
  border: none;
  border-radius: var(--radius-full, 100px);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
}

.ferni-fund-action-btn svg {
  width: 18px;
  height: 18px;
}

.ferni-fund-action-btn--primary {
  background: var(--persona-primary, #4a6741);
  color: white;
}

.ferni-fund-action-btn--primary:hover {
  background: var(--persona-secondary, #3d5a35);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.ferni-fund-action-btn--secondary {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}

.ferni-fund-action-btn--secondary:hover {
  background: var(--color-bg-secondary);
  transform: translateY(-1px);
}

/* Welcome state for new users */
.ferni-fund-welcome {
  padding: var(--space-4, 16px) 0;
}

.ferni-fund-welcome-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto var(--space-4, 16px);
  background: var(--color-bg-tertiary);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--persona-primary, #4a6741);
}

.ferni-fund-welcome-icon svg {
  width: 32px;
  height: 32px;
}

.ferni-fund-welcome h3 {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0 0 var(--space-3, 12px) 0;
  color: var(--color-text-primary);
}

.ferni-fund-welcome p {
  font-size: 0.9rem;
  color: var(--color-text-secondary);
  line-height: 1.6;
  margin: 0 0 var(--space-6, 24px) 0;
}
`;

// ============================================================================
// ICONS
// ============================================================================

export const CLOSE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

// Seed/sprout icon for the new branding
export const SEED_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/></svg>`;

export const CHECK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
