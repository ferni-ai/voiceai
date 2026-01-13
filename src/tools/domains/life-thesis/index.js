/**
 * Life Thesis Tool Domain
 *
 * Universal tools for saving and recalling life "whys" - available to ALL personas.
 */
export { createThesisTools, thesisTools } from './thesis-tools.js';
export { thesisTools as lifeThesisTools } from './thesis-tools.js';
// Standard domain export
export async function getToolDefinitions() {
    const { thesisTools } = await import('./thesis-tools.js');
    return thesisTools;
}
//# sourceMappingURL=index.js.map