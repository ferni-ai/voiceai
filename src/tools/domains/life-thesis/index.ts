/**
 * Life Thesis Tool Domain
 *
 * Universal tools for saving and recalling life "whys" - available to ALL personas.
 */

import type { ToolDefinition } from '../../registry/types.js';

export { createThesisTools, thesisTools } from './thesis-tools.js';
export { thesisTools as lifeThesisTools } from './thesis-tools.js';

// Standard domain export
export async function getToolDefinitions(): Promise<ToolDefinition[]> {
  const { thesisTools } = await import('./thesis-tools.js');
  return thesisTools;
}
