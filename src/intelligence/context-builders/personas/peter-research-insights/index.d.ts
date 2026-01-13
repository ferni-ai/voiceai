/**
 * Peter's Research Insights Context Builder
 *
 * > "The skill was never about stocks. It was about seeing patterns nobody else sees."
 *
 * This builder loads Peter with deep research insights when:
 * 1. A user transfers TO Peter from another persona
 * 2. A user starts talking directly with Peter
 *
 * @module intelligence/context-builders/personas/peter-research-insights
 */
import { type ContextBuilderInput, type ContextInjection } from '../../index.js';
import { clearPeterResearchSession } from './session.js';
export { clearPeterResearchSession };
declare function buildPeterResearchInsightsContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
export { buildPeterResearchInsightsContext };
//# sourceMappingURL=index.d.ts.map