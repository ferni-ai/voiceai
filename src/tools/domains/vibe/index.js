/**
 * Vibe Control Tools Domain
 *
 * Unified environment control - Music, Lights, Temperature
 */
import { createDomainExport } from '../../registry/loader.js';
import { vibeTools } from './vibe-tools.js';
export const { getToolDefinitions, domain, definitions } = createDomainExport('vibe', vibeTools);
export { vibeTools } from './vibe-tools.js';
export default getToolDefinitions;
//# sourceMappingURL=index.js.map