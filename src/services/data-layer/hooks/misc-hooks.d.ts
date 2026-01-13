/**
 * Miscellaneous Domain Hooks
 *
 * Auto-indexing hooks for various data types that don't fit
 * cleanly into other domain categories.
 *
 * @module services/data-layer/hooks/misc-hooks
 */
import type { ConversationThreadEntity, VisualMemoryEntity, ReminderEntity, CallResultEntity, FollowUpActionEntity, ScheduledOutreachEntity } from '../types.js';
/**
 * Track conversation threads
 */
export declare const onConversationThreadChange: import("../hook-generator.js").DomainHook<ConversationThreadEntity>;
/**
 * Track visual memories (images, photos shared)
 */
export declare const onVisualMemoryChange: import("../hook-generator.js").DomainHook<VisualMemoryEntity>;
/**
 * Track scheduled reminders
 */
export declare const onReminderChange: import("../hook-generator.js").DomainHook<ReminderEntity>;
/**
 * Track call results from on-behalf calls
 */
export declare const onCallResultChange: import("../hook-generator.js").DomainHook<CallResultEntity>;
/**
 * Track follow-up actions from calls
 */
export declare const onFollowUpActionChange: import("../hook-generator.js").DomainHook<FollowUpActionEntity>;
/**
 * Track scheduled proactive outreach
 */
export declare const onScheduledOutreachChange: import("../hook-generator.js").DomainHook<ScheduledOutreachEntity>;
export declare const miscHooks: {
    onConversationThreadChange: import("../hook-generator.js").DomainHook<ConversationThreadEntity>;
    onVisualMemoryChange: import("../hook-generator.js").DomainHook<VisualMemoryEntity>;
    onReminderChange: import("../hook-generator.js").DomainHook<ReminderEntity>;
    onCallResultChange: import("../hook-generator.js").DomainHook<CallResultEntity>;
    onFollowUpActionChange: import("../hook-generator.js").DomainHook<FollowUpActionEntity>;
    onScheduledOutreachChange: import("../hook-generator.js").DomainHook<ScheduledOutreachEntity>;
};
export default miscHooks;
//# sourceMappingURL=misc-hooks.d.ts.map