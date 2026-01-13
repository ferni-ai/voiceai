/**
 * Scheduling Domain Tools
 *
 * Voice-accessible tools for scheduling messages, calls, and emails.
 * Bridges the proactive outreach system to the voice agent.
 *
 * DOMAIN: scheduling
 * TOOLS:
 *   scheduleMessage - Schedule a text message for later
 *   scheduleCall - Schedule a phone call for later
 *   scheduleEmail - Schedule an email for later
 *   sendMessageNow - Send an immediate text message
 *   listScheduled - View pending scheduled actions
 *   cancelScheduled - Cancel a scheduled action
 *   getOptimalSendTime - Get ML-recommended best time to reach someone
 *   scheduleAtBestTime - Schedule using intelligent timing
 *
 * USAGE:
 *   "Text John tomorrow at 9am saying I'll be late"
 *   "Call my doctor's office at 2pm"
 *   "Send an email to the team Friday morning about the project"
 *   "What messages do I have scheduled?"
 *   "When's the best time to reach Sarah?"
 *   "Schedule this text for the best time"
 *
 * INTELLIGENT SCHEDULING:
 *   Uses Thompson Sampling ML to learn when each contact is most responsive.
 *   Learns from response rates, engagement quality, and timing patterns.
 */
import type { ToolDefinition } from '../../registry/types.js';
import { getUnifiedScheduleDef, checkScheduleConflictsDef } from './unified-schedule-view.js';
export declare const getToolDefinitions: () => Promise<ToolDefinition[]>, domain: import("../../registry/types.js").ToolDomain, definitions: ToolDefinition[];
export { getUnifiedScheduleDef, checkScheduleConflictsDef };
export default getToolDefinitions;
//# sourceMappingURL=index.d.ts.map