/**
 * Outreach History Domain Hooks
 *
 * Auto-indexing hooks for tracking all outreach attempts and responses.
 * Critical for learning optimal outreach patterns - what works, what doesn't.
 *
 * @module services/data-layer/hooks/outreach-history-hooks
 */
import type { OutreachAttemptEntity, OutreachResponseEntity, OutreachPreferenceEntity } from '../types.js';
/**
 * Called when any outreach is sent
 * Track every attempt so we can learn from patterns
 */
export declare const onOutreachAttemptChange: import("../hook-generator.js").DomainHook<OutreachAttemptEntity>;
/**
 * Called when user responds to outreach
 * This is how we learn what outreach works
 */
export declare const onOutreachResponseChange: import("../hook-generator.js").DomainHook<OutreachResponseEntity>;
/**
 * Called when user outreach preferences are updated
 */
export declare const onOutreachPreferenceChange: import("../hook-generator.js").DomainHook<OutreachPreferenceEntity>;
//# sourceMappingURL=outreach-history-hooks.d.ts.map