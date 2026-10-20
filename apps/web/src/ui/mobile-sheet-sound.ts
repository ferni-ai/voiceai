/**
 * Sound effects on/off in the phone bottom sheet.
 *
 * Mute is saved (sound.ui.ts setMuted), so a mute set from the desktop menu
 * follows the person to their phone, where the menu's Sound Effects row
 * isn't one tap away. This sheet action shows the saved state and flips it
 * without closing the sheet.
 *
 * @module ui/mobile-sheet-sound
 */
import { t } from '../i18n/index.js';
import { soundUI } from './sound.ui.js';

/** Speaker (Lucide volume-2) */
const SPEAKER = 'M11 5 6 9H2v6h4l5 4V5z|M15.54 8.46a5 5 0 0 1 0 7.07|M19.07 4.93a10 10 0 0 1 0 14.14';

const label = (): string =>
  t(soundUI.getMuted() ? 'menu.mobileSheet.actions.soundOff' : 'menu.mobileSheet.actions.soundOn');

export function soundSheetAction(): { id: string; iconPath: string; label: string; onClick: () => void } {
  return {
    id: 'sound',
    iconPath: SPEAKER,
    label: label(),
    onClick: () => {
      soundUI.toggleMute();
      const button = document.querySelector<HTMLElement>('.mobile-bottom-sheet__action[data-action="sound"]');
      const text = button?.querySelector('.mobile-bottom-sheet__action-label');
      if (text) text.textContent = label();
    },
  };
}
