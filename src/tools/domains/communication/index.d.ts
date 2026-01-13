/**
 * Communication Domain Tools - Rationalized Architecture
 *
 * STRUCTURE:
 * ├── outreach/                    # All reaching-out in ONE place
 * │   ├── unified-outreach.ts      # THE tool: reachOut (call, text, email, conversation)
 * │   ├── batch-outreach.ts        # Group & seasonal messaging
 * │   └── message-crafting.ts      # LLM-powered personalization
 * │
 * ├── communication-coaching.ts    # Draft difficult messages, role-play (DISTINCT)
 * ├── contact-relationship-tools.ts # Contact CRUD (DISTINCT)
 * ├── gmail-tools.ts               # Gmail integration (DISTINCT)
 * └── message-validation-tools.ts  # "Sleep on it" validation (DISTINCT)
 *
 * DEPRECATED (use outreach/ instead):
 * - enhanced-outreach-tools.ts → outreach/unified-outreach.ts
 * - personalized-outreach-tools.ts → outreach/batch-outreach.ts
 * - communication-tools.ts → outreach/unified-outreach.ts
 * - unified-outreach-tool.ts → outreach/unified-outreach.ts (moved)
 *
 * PRIMARY TOOLS:
 *   reachOut         - THE way to reach any contact (auto-picks channel, timing, message)
 *   previewBatch     - Preview personalized messages for groups
 *   sendBatch        - Send batch messages after preview
 *   getOutreachSuggestions - Who should you reach out to?
 *
 * DISTINCT TOOLS (kept separate):
 *   Coaching: draftMessage, rolePlayConversation, analyzeMessage, communicationStrategy
 *   Gmail: readGmail, searchGmail, sendGmail
 *   Contacts: addContact, updateContact, searchContacts
 *   Validation: sleepOnIt, reviewAndSend
 */
import type { ToolDefinition } from '../../registry/types.js';
import { getOutreachToolDefinitions } from './outreach/index.js';
import { getGmailToolDefinitions } from './gmail-tools.js';
import { getContactRelationshipToolDefinitions } from './contact-relationship-tools.js';
import { getMessageValidationToolDefinitions } from './message-validation-tools.js';
declare function getSchedulingToolDefinitions(): ToolDefinition[];
declare function getCoachingToolDefinitions(): ToolDefinition[];
export declare const getToolDefinitions: () => Promise<ToolDefinition[]>, domain: import("../../registry/types.js").ToolDomain, definitions: ToolDefinition[];
export { getOutreachToolDefinitions, getSchedulingToolDefinitions, getCoachingToolDefinitions, getGmailToolDefinitions, getContactRelationshipToolDefinitions, getMessageValidationToolDefinitions, };
export { createUnifiedOutreachTool, getUnifiedOutreachDefinition, createMultiOutreachTool, getMultiOutreachDefinition, craftPersonalizedMessage, craftConversationOpener, getBatchOutreachDefinitions, } from './outreach/index.js';
export { createCommunicationCoachingTools } from './communication-coaching.js';
export { createCommunicationTools as createCommunicationSpecialistTools, parseScheduleTime, createCommunicationTools, } from './communication-tools.js';
export default getToolDefinitions;
//# sourceMappingURL=index.d.ts.map