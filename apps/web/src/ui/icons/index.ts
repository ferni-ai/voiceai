/**
 * Centralized UI Icons
 *
 * Export all icon modules from here.
 * Components should import from '@ui/icons' or '../icons'
 *
 * BRAND COMPLIANCE:
 * - All icons are Lucide-style (2px stroke, rounded corners)
 * - NO emoji - only SVG icons
 * - Icons use currentColor for theming
 */

export { JOURNEY_ICONS, getJourneyIcon } from './journey-icons.js';
export type { JourneyIconName } from './journey-icons.js';

export {
  PERSONA_ICONS,
  RESULT_ICONS,
  TRACKED_ICONS,
  SECTION_ICONS,
  CHAPTER_ICONS,
  getPersonaIcon,
  getResultIcon,
  getTrackedIcon,
  getChapterIcon,
} from './hub-icons.js';
export type {
  PersonaIconName,
  ResultIconName,
  TrackedIconName,
  SectionIconName,
  ChapterIconName,
} from './hub-icons.js';

