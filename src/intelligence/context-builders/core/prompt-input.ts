/**
 * The input every registered context builder gets: the turn's input with the
 * caller's profile and this call's userData as filtered views
 * (memory/recall/prompt-view.ts, FORGET_EVERY_READER). The builder runners
 * (index.ts, tiered-execution.ts) make one per turn; ContextBuilder.build
 * takes only a PromptInput, so no runner can hand a builder the raw session.
 * Flag off: the input itself.
 *
 * @module intelligence/context-builders/core/prompt-input
 */
import { promptCheck, promptProfile, promptUserData, servicesView } from '../../../memory/index.js';
import type { ContextBuilderInput, PromptInput } from './types.js';

export async function promptInput(input: ContextBuilderInput): Promise<PromptInput> {
  const check = await promptCheck(input.services?.userId, 'context-builders');
  if (!check) return input as PromptInput;
  return {
    ...input,
    services: input.services && servicesView(input.services, check),
    userData: input.userData && promptUserData(input.userData, check),
    userProfile: promptProfile(input.userProfile, check),
  } as PromptInput;
}
