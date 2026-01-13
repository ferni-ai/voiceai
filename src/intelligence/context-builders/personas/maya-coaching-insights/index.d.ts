/**
 * Maya's Coaching Insights Context Builder
 *
 * > "Progress isn't linear. Setbacks are data, not failure."
 *
 * This builder loads Maya with DEEP coaching intelligence when:
 * 1. A user transfers TO Maya from another persona
 * 2. A user starts talking directly with Maya
 *
 * @module intelligence/context-builders/personas/maya-coaching-insights
 */
import { type ContextBuilderInput, type ContextInjection } from '../../index.js';
import { clearMayaCoachingSession } from './session.js';
export { clearMayaCoachingSession };
declare function buildMayaCoachingInsightsContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
export { buildMayaCoachingInsightsContext };
//# sourceMappingURL=index.d.ts.map