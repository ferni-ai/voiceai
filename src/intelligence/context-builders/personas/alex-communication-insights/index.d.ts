/**
 * Alex Communication Insights Context Builder
 *
 * > "Clear is kind. I'll help you say what needs to be said."
 *
 * This builder loads Alex with DEEP communication intelligence when:
 * 1. A user transfers TO Alex from another persona
 * 2. A user starts talking directly with Alex
 *
 * @module intelligence/context-builders/personas/alex-communication-insights
 */
import { type ContextBuilderInput, type ContextInjection } from '../../index.js';
import { clearAlexCommunicationSession } from './session.js';
export { clearAlexCommunicationSession };
declare function buildAlexCommunicationInsightsContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
export { buildAlexCommunicationInsightsContext };
//# sourceMappingURL=index.d.ts.map