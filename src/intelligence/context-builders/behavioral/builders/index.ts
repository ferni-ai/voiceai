/**
 * Behavioral Builders Index
 *
 * All converted behavioral builders are registered here.
 *
 * CONVERSION STATUS:
 * ==================
 *
 * CONVERTED (behavioral signals):
 * ✅ emotional.behavioral.ts - Emotional state → behavioral guidance
 * ✅ memory.behavioral.ts - Memory hints (not facts)
 * ✅ distress.behavioral.ts - Crisis detection
 * ✅ awareness.behavioral.ts - Time/temporal behavioral implications
 * ✅ pacing.behavioral.ts - Response pacing/length
 * ✅ humanizing.behavioral.ts - Human conversational style
 * ✅ validation.behavioral.ts - When user needs validation
 * ✅ energy.behavioral.ts - Energy level matching
 * ✅ predictive.behavioral.ts - Superhuman predictive intelligence (Better Than Human v4)
 *
 * HANDLED BY AWARENESS (facts the model should know):
 * 📊 Time of day, user name, session state, current topic
 * 📊 See awareness.ts for fact injection
 *
 * HANDLED BY TOOLS (model calls when needed):
 * 🔧 RAG/memory search - searchMemories tool
 * 🔧 Calendar details - getCalendar tool
 * 🔧 Biometrics - getHealthData tool
 * 🔧 Commitments - checkCommitments tool
 *
 * NEEDS LITERAL PASSTHROUGH (can't be behavioral):
 * 📝 tool_capabilities - Literal tool availability list
 * 📝 game_context - Literal game state
 * 📝 financial_prediction - Specific numeric predictions
 *
 * @module intelligence/context-builders/behavioral/builders
 */

// Register all behavioral builders
import './emotional.behavioral.js';
import './memory.behavioral.js';
import './distress.behavioral.js';
import './awareness.behavioral.js';
import './pacing.behavioral.js';
import './humanizing.behavioral.js';
import './validation.behavioral.js';
import './energy.behavioral.js';
import './predictive.behavioral.js';

// Export for explicit importing
export { buildEmotionalBehavior } from './emotional.behavioral.js';
export { buildMemoryBehavior } from './memory.behavioral.js';
export { buildDistressBehavior, hasCrisisKeywords } from './distress.behavioral.js';
export { buildAwarenessBehavior } from './awareness.behavioral.js';
export { buildPacingBehavior } from './pacing.behavioral.js';
export { buildHumanizingBehavior } from './humanizing.behavioral.js';
export { buildValidationBehavior } from './validation.behavioral.js';
export { buildEnergyBehavior } from './energy.behavioral.js';
export { buildPredictiveBehavior } from './predictive.behavioral.js';
