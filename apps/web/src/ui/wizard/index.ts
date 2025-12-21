/**
 * Custom Agent Wizard Module
 * 
 * A beautiful 5-step wizard for creating custom AI agents.
 * Supports voice cloning, memory capture, and personality configuration.
 * 
 * Steps:
 * 1. Choose Agent Type (Legacy, Mentor, Voice Twin, Custom)
 * 2. Basic Info (Name, description, icon)
 * 3. Voice Setup (Clone, library, or skip)
 * 4. Personality (Traits, communication style)
 * 5. Memories & Review (Add memories, finalize)
 * 
 * @module wizard
 * 
 * @example
 * ```typescript
 * import { openCustomAgentWizard, closeCustomAgentWizard } from './ui/wizard/index.js';
 * 
 * // Open the wizard
 * openCustomAgentWizard();
 * ```
 */

// Re-export main functions from the wizard UI
export {
  openCustomAgentWizard,
  closeCustomAgentWizard,
} from '../custom-agent-wizard.ui.js';

// Export types
export type {
  WizardStep,
  WizardStepId,
  VoiceOption,
  AgentDraft,
  IconOption,
  VoiceLibraryEntry,
} from './types.js';

// Export constants
export {
  WIZARD_STEPS,
  ICON_OPTIONS,
  PERSONALITY_TRAITS,
  COGNITIVE_PROFILES,
} from './constants.js';

