/**
 * Unsubscribe Detector
 *
 * Finds and processes unsubscribe links in emails:
 * - Detect unsubscribe links in headers and body
 * - Track newsletter subscriptions
 * - One-click unsubscribe support
 * - Unsubscribe history
 *
 * @module services/email/unsubscribe-detector
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'unsubscribe-detector' });
// ============================================================================
// CONSTANTS
// ============================================================================
const UNSUBSCRIBE_PATTERNS = [
    /unsubscribe/i,
    /opt.?out/i,
    /remove.*from.*list/i,
    /stop.*receiving/i,
    /manage.*preferences/i,
    /email.*preferences/i,
    /subscription.*settings/i,
];
const LIST_UNSUBSCRIBE_HEADER = 'list-unsubscribe';
const LIST_UNSUBSCRIBE_POST_HEADER = 'list-unsubscribe-post';
// ============================================================================
// UNSUBSCRIBE DETECTOR CLASS
// ============================================================================
export class UnsubscribeDetector {
    subscriptions = new Map();
    unsubscribeRequests = new Map();
    userId;
    constructor(userId) {
        this.userId = userId;
        log.info({ userId }, 'Unsubscribe detector initialized');
    }
    // ==========================================================================
    // DETECTION
    // ==========================================================================
    /**
     * Detect unsubscribe links from email headers
     */
    detectFromHeaders(emailId, headers, fromEmail, fromName) {
        const listUnsubscribe = headers.find((h) => h.name.toLowerCase() === LIST_UNSUBSCRIBE_HEADER)?.value;
        if (!listUnsubscribe) {
            return null;
        }
        const listUnsubscribePost = headers.find((h) => h.name.toLowerCase() === LIST_UNSUBSCRIBE_POST_HEADER)?.value;
        // Parse List-Unsubscribe header
        // Can contain: <mailto:...>, <https://...>, or both
        const urlMatch = listUnsubscribe.match(/<(https?:\/\/[^>]+)>/);
        const emailMatch = listUnsubscribe.match(/<mailto:([^>]+)>/);
        const isOneClick = !!listUnsubscribePost?.includes('List-Unsubscribe=One-Click');
        const link = {
            emailId,
            senderEmail: fromEmail,
            senderName: fromName,
            senderDomain: fromEmail.split('@')[1] || '',
            method: urlMatch ? 'list_unsubscribe' : emailMatch ? 'email' : 'unknown',
            url: urlMatch?.[1],
            email: emailMatch?.[1],
            isOneClick,
            detectedAt: new Date(),
        };
        // Update subscription record
        this.updateSubscription(fromEmail, fromName, link);
        return link;
    }
    /**
     * Detect unsubscribe links from email body
     */
    detectFromBody(emailId, htmlBody, textBody, fromEmail, fromName) {
        // Try HTML first
        if (htmlBody) {
            const link = this.extractLinkFromHtml(emailId, htmlBody, fromEmail, fromName);
            if (link)
                return link;
        }
        // Fall back to text
        if (textBody) {
            const link = this.extractLinkFromText(emailId, textBody, fromEmail, fromName);
            if (link)
                return link;
        }
        return null;
    }
    extractLinkFromHtml(emailId, html, fromEmail, fromName) {
        // Look for anchor tags with unsubscribe text
        const anchorPattern = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*unsubscribe[^<]*)<\/a>/gi;
        const match = anchorPattern.exec(html);
        if (match) {
            const link = {
                emailId,
                senderEmail: fromEmail,
                senderName: fromName,
                senderDomain: fromEmail.split('@')[1] || '',
                method: 'link',
                url: match[1],
                isOneClick: false,
                detectedAt: new Date(),
            };
            this.updateSubscription(fromEmail, fromName, link);
            return link;
        }
        // Look for links near unsubscribe text
        for (const pattern of UNSUBSCRIBE_PATTERNS) {
            const textMatch = html.match(new RegExp(`<a[^>]+href=["']([^"']+)["'][^>]*>[^<]*${pattern.source}[^<]*<\/a>`, 'i'));
            if (textMatch) {
                const link = {
                    emailId,
                    senderEmail: fromEmail,
                    senderName: fromName,
                    senderDomain: fromEmail.split('@')[1] || '',
                    method: 'link',
                    url: textMatch[1],
                    isOneClick: false,
                    detectedAt: new Date(),
                };
                this.updateSubscription(fromEmail, fromName, link);
                return link;
            }
        }
        return null;
    }
    extractLinkFromText(emailId, text, fromEmail, fromName) {
        // Look for URLs near unsubscribe text
        const lines = text.split('\n');
        for (const line of lines) {
            const lowerLine = line.toLowerCase();
            for (const pattern of UNSUBSCRIBE_PATTERNS) {
                if (pattern.test(lowerLine)) {
                    // Found unsubscribe text, look for URL on same or next line
                    const urlMatch = line.match(/(https?:\/\/[^\s]+)/);
                    if (urlMatch) {
                        const link = {
                            emailId,
                            senderEmail: fromEmail,
                            senderName: fromName,
                            senderDomain: fromEmail.split('@')[1] || '',
                            method: 'link',
                            url: urlMatch[1],
                            isOneClick: false,
                            detectedAt: new Date(),
                        };
                        this.updateSubscription(fromEmail, fromName, link);
                        return link;
                    }
                }
            }
        }
        return null;
    }
    // ==========================================================================
    // SUBSCRIPTIONS
    // ==========================================================================
    /**
     * Update or create subscription record
     */
    updateSubscription(senderEmail, senderName, link) {
        const key = senderEmail.toLowerCase();
        const existing = this.subscriptions.get(key);
        if (existing) {
            existing.emailCount++;
            existing.lastSeenAt = new Date();
            if (senderName)
                existing.senderName = senderName;
            if (link) {
                existing.unsubscribeMethod = link.method;
                existing.unsubscribeUrl = link.url;
                existing.unsubscribeEmail = link.email;
            }
        }
        else {
            this.subscriptions.set(key, {
                senderEmail,
                senderName,
                senderDomain: senderEmail.split('@')[1] || '',
                emailCount: 1,
                firstSeenAt: new Date(),
                lastSeenAt: new Date(),
                wantToKeep: false,
                unsubscribeRequested: false,
                unsubscribeMethod: link?.method,
                unsubscribeUrl: link?.url,
                unsubscribeEmail: link?.email,
            });
        }
    }
    /**
     * Get all tracked newsletters
     */
    getNewsletters() {
        return Array.from(this.subscriptions.values())
            .sort((a, b) => b.emailCount - a.emailCount);
    }
    /**
     * Get newsletters with unsubscribe capability
     */
    getUnsubscribableNewsletters() {
        return this.getNewsletters().filter((n) => n.unsubscribeUrl || n.unsubscribeEmail);
    }
    /**
     * Get newsletters marked for unsubscribe
     */
    getPendingUnsubscribes() {
        return this.getNewsletters().filter((n) => n.unsubscribeRequested && !n.unsubscribedAt);
    }
    /**
     * Mark newsletter to keep
     */
    markAsWantToKeep(senderEmail) {
        const sub = this.subscriptions.get(senderEmail.toLowerCase());
        if (sub) {
            sub.wantToKeep = true;
            sub.unsubscribeRequested = false;
        }
    }
    /**
     * Request unsubscribe from newsletter
     */
    requestUnsubscribe(senderEmail) {
        const sub = this.subscriptions.get(senderEmail.toLowerCase());
        if (!sub) {
            return null;
        }
        if (!sub.unsubscribeUrl && !sub.unsubscribeEmail) {
            log.warn({ senderEmail }, 'No unsubscribe method available');
            return null;
        }
        const request = {
            id: `unsub_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            userId: this.userId,
            link: {
                emailId: '',
                senderEmail: sub.senderEmail,
                senderName: sub.senderName,
                senderDomain: sub.senderDomain,
                method: sub.unsubscribeMethod || 'unknown',
                url: sub.unsubscribeUrl,
                email: sub.unsubscribeEmail,
                isOneClick: false,
                detectedAt: new Date(),
            },
            status: 'pending',
            requestedAt: new Date(),
        };
        this.unsubscribeRequests.set(request.id, request);
        sub.unsubscribeRequested = true;
        log.info({ requestId: request.id, senderEmail }, 'Unsubscribe requested');
        return request;
    }
    // ==========================================================================
    // UNSUBSCRIBE EXECUTION
    // ==========================================================================
    /**
     * Execute one-click unsubscribe (RFC 8058)
     */
    async executeOneClickUnsubscribe(requestId) {
        const request = this.unsubscribeRequests.get(requestId);
        if (!request || !request.link.url || !request.link.isOneClick) {
            return false;
        }
        try {
            const response = await fetch(request.link.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: 'List-Unsubscribe=One-Click',
            });
            if (response.ok) {
                request.status = 'completed';
                request.completedAt = new Date();
                // Update subscription
                const sub = this.subscriptions.get(request.link.senderEmail.toLowerCase());
                if (sub) {
                    sub.unsubscribedAt = new Date();
                }
                log.info({ requestId }, 'One-click unsubscribe completed');
                return true;
            }
            else {
                request.status = 'failed';
                request.error = `HTTP ${response.status}`;
                return false;
            }
        }
        catch (error) {
            request.status = 'failed';
            request.error = String(error);
            log.error({ error: String(error), requestId }, 'One-click unsubscribe failed');
            return false;
        }
    }
    /**
     * Get unsubscribe URL for manual unsubscribe
     */
    getUnsubscribeUrl(senderEmail) {
        const sub = this.subscriptions.get(senderEmail.toLowerCase());
        return sub?.unsubscribeUrl || null;
    }
    /**
     * Mark unsubscribe as completed (for manual unsubscribes)
     */
    markUnsubscribeComplete(requestId) {
        const request = this.unsubscribeRequests.get(requestId);
        if (request) {
            request.status = 'completed';
            request.completedAt = new Date();
            const sub = this.subscriptions.get(request.link.senderEmail.toLowerCase());
            if (sub) {
                sub.unsubscribedAt = new Date();
            }
        }
    }
    // ==========================================================================
    // STATISTICS
    // ==========================================================================
    /**
     * Get unsubscribe statistics
     */
    getStats() {
        const newsletters = this.getNewsletters();
        const unsubscribable = newsletters.filter((n) => n.unsubscribeUrl || n.unsubscribeEmail);
        const pending = newsletters.filter((n) => n.unsubscribeRequested && !n.unsubscribedAt);
        const completed = newsletters.filter((n) => n.unsubscribedAt);
        const keepList = newsletters.filter((n) => n.wantToKeep);
        return {
            totalNewsletters: newsletters.length,
            unsubscribable: unsubscribable.length,
            pendingUnsubscribes: pending.length,
            completedUnsubscribes: completed.length,
            wantToKeep: keepList.length,
            topSenders: newsletters.slice(0, 10).map((n) => ({
                email: n.senderEmail,
                count: n.emailCount,
            })),
        };
    }
    /**
     * Estimate email reduction from unsubscribing
     */
    estimateEmailReduction() {
        const newsletters = this.getNewsletters()
            .filter((n) => !n.wantToKeep && !n.unsubscribedAt);
        // Estimate frequency based on email count and date range
        const now = new Date();
        const monthlyEstimates = newsletters.map((n) => {
            const daysSinceFirst = Math.max(1, (now.getTime() - n.firstSeenAt.getTime()) / (1000 * 60 * 60 * 24));
            const dailyRate = n.emailCount / daysSinceFirst;
            const monthlyRate = dailyRate * 30;
            return { email: n.senderEmail, monthlyEmails: Math.round(monthlyRate * 10) / 10 };
        });
        const totalMonthly = monthlyEstimates.reduce((sum, e) => sum + e.monthlyEmails, 0);
        return {
            monthlyEstimate: Math.round(totalMonthly),
            yearlyEstimate: Math.round(totalMonthly * 12),
            topCandidates: monthlyEstimates
                .sort((a, b) => b.monthlyEmails - a.monthlyEmails)
                .slice(0, 10),
        };
    }
}
// ============================================================================
// FACTORY
// ============================================================================
const instances = new Map();
export function getUnsubscribeDetector(userId) {
    let instance = instances.get(userId);
    if (!instance) {
        instance = new UnsubscribeDetector(userId);
        instances.set(userId, instance);
    }
    return instance;
}
export function resetUnsubscribeDetector(userId) {
    instances.delete(userId);
}
//# sourceMappingURL=unsubscribe-detector.js.map