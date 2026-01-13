/**
 * Package Tracking Tool
 *
 * Track shipments and deliveries across carriers.
 *
 * Features:
 * - Multi-carrier support (UPS, FedEx, USPS, Amazon)
 * - Delivery notifications
 * - Expected delivery tracking
 * - Package history
 */
import { llm } from '@livekit/agents';
export type Carrier = 'ups' | 'fedex' | 'usps' | 'amazon' | 'dhl' | 'other';
export type PackageStatus = 'label_created' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception' | 'returned';
export interface TrackingEvent {
    timestamp: Date;
    status: PackageStatus;
    location?: string;
    description: string;
}
export interface Package {
    id: string;
    userId: string;
    trackingNumber: string;
    carrier: Carrier;
    description: string;
    sender?: string;
    status: PackageStatus;
    expectedDelivery?: Date;
    deliveredAt?: Date;
    events: TrackingEvent[];
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
/**
 * Check if real tracking APIs are configured
 */
export declare function isTrackingApiConfigured(): boolean;
export declare function addPackage(params: {
    userId: string;
    trackingNumber: string;
    description: string;
    carrier?: Carrier;
    sender?: string;
}): Promise<Package>;
export declare function refreshPackage(pkgId: string): Promise<Package | null>;
export declare function markDelivered(pkgId: string): Package | null;
export declare function archivePackage(pkgId: string): boolean;
export declare function createPackageTools(): {
    trackPackage: llm.FunctionTool<{
        trackingNumber: string;
        description: string;
        carrier?: "other" | "amazon" | "ups" | "fedex" | "usps" | "dhl" | undefined;
        sender?: string | undefined;
    }, unknown, string>;
    getPackages: llm.FunctionTool<{
        includeDelivered: boolean;
    }, unknown, string>;
    checkPackageStatus: llm.FunctionTool<{
        packageDescription: string;
    }, unknown, string>;
    markPackageDelivered: llm.FunctionTool<{
        packageDescription: string;
    }, unknown, string>;
    removePackage: llm.FunctionTool<{
        packageDescription: string;
    }, unknown, string>;
    getDeliveryExpectations: llm.FunctionTool<Record<string, never>, unknown, string>;
};
export default createPackageTools;
//# sourceMappingURL=packages.d.ts.map