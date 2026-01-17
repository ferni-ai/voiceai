/**
 * Bundle Runtime Processor
 *
 * Processes bundle runtime behaviors:
 * - Mode detection and transitions
 * - Situational responses (celebrations, condolences)
 * - Pushback detection
 */

import type { BundleRuntimeContext, TurnAnalysisResult, TurnContext } from './types.js';

// ============================================================================
// KEYWORD LISTS
// ============================================================================

const CELEBRATION_KEYWORDS = [
  'promotion',
  'got the job',
  'engaged',
  'married',
  'pregnant',
  'retired',
  'graduated',
  'paid off',
];

const CONDOLENCE_KEYWORDS = [
  'died',
  'passed away',
  'cancer',
  'lost my',
  'funeral',
  'divorce',
  'laid off',
  'fired',
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Map celebration keyword to situation type
 */
function getCelebrationSituation(keyword: string): string {
  if (keyword.includes('job')) return 'job_promotion';
  if (keyword.includes('engaged')) return 'engagement';
  if (keyword.includes('pregnant')) return 'baby_news';
  if (keyword.includes('retired')) return 'retirement';
  if (keyword.includes('graduated')) return 'graduation';
  if (keyword.includes('paid off')) return 'paid_off_debt';
  return 'general_good_news';
}

/**
 * Map condolence keyword to situation type
 */
function getCondolenceSituation(keyword: string): string {
  if (keyword.includes('died') || keyword.includes('passed')) return 'death_family_member';
  if (keyword.includes('cancer')) return 'health_diagnosis';
  if (keyword.includes('divorce')) return 'divorce_breakup';
  if (keyword.includes('laid off') || keyword.includes('fired')) return 'job_loss';
  return 'general_loss';
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Process bundle runtime behaviors (modes, situations, pushback)
 */
export function processBundleRuntime(
  ctx: TurnContext,
  analysisResult: TurnAnalysisResult
): BundleRuntimeContext | undefined {
  const { bundleRuntime, userData, userText } = ctx;
  const { analysis } = analysisResult;

  if (!bundleRuntime) return undefined;

  // Increment turn
  bundleRuntime.incrementTurn();

  // Detect mode
  const previousMode = bundleRuntime.getState().currentMode;
  const newMode = bundleRuntime.detectAndSetMode(
    userText,
    analysis.emotion.distressLevel > 0.6
      ? 'high_distress'
      : analysis.emotion.primary === 'joy'
        ? 'high_energy_positive'
        : undefined
  );

  const result: BundleRuntimeContext = {
    currentMode: newMode,
    previousMode: newMode !== previousMode ? previousMode : undefined,
  };

  // Mode transition
  if (newMode !== previousMode) {
    result.modeTransitionPhrase =
      bundleRuntime.getModeTransitionPhrase(previousMode, newMode) || undefined;

    // Sync to userData
    if (userData?.bundleRuntimeState) {
      userData.bundleRuntimeState.currentMode = newMode;
      userData.bundleRuntimeState.lastModeTransition = `${previousMode}_to_${newMode}`;
    }
  }

  // Check situational responses
  const lowerText = userText.toLowerCase();

  // Check celebrations
  for (const keyword of CELEBRATION_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      const situation = getCelebrationSituation(keyword);
      const response = bundleRuntime.getSituationalResponse('celebrations', situation);
      if (response) {
        result.situationalResponse = {
          type: 'celebration',
          situation,
          response: response.immediate,
        };
        bundleRuntime.applyProgressionTrigger('celebrated_together');
      }
      break;
    }
  }

  // Check condolences (only if no celebration found)
  if (!result.situationalResponse) {
    for (const keyword of CONDOLENCE_KEYWORDS) {
      if (lowerText.includes(keyword)) {
        const situation = getCondolenceSituation(keyword);
        const response = bundleRuntime.getSituationalResponse('condolences', situation);
        if (response) {
          result.situationalResponse = {
            type: 'condolence',
            situation,
            response: response.immediate,
            avoidPhrases: response.dontSay,
          };
          bundleRuntime.applyProgressionTrigger('shared_vulnerability');
        }
        break;
      }
    }
  }

  // Check pushback
  const pushback = bundleRuntime.detectPushback(userText);
  if (pushback) {
    result.pushbackDetected = {
      type: pushback.type,
      response: pushback.response,
    };
  }

  return result;
}
