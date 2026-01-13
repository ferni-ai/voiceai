/**
 * Speech insights integration helpers.
 *
 * This is intentionally separate from ContextManager to keep the core context
 * assembly readable and to make speech logic easier to test.
 */
import type { SpeedControlResult } from '../speech/adaptive-ssml/dynamic-speed-control.js';
import type { EmotionalMomentum, ProsodyContinuityHints } from '../speech/emotional-contagion.js';
import type { HumanListeningResult } from '../speech/human-listening-pipeline/types.js';
import type { SpeechInsightsContext } from './types.js';
export interface BuildSpeechInsightsOptions {
    humanListeningResult?: HumanListeningResult;
    emotionalMomentum?: EmotionalMomentum;
    prosodyContinuityHints?: ProsodyContinuityHints;
    speedControl?: SpeedControlResult;
}
export declare function buildSpeechInsightsContext(options: BuildSpeechInsightsOptions): SpeechInsightsContext;
export declare function formatSpeechInsightsForPrompt(insights: SpeechInsightsContext): string;
//# sourceMappingURL=speech-insights.d.ts.map