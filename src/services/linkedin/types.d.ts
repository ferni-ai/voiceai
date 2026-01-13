/**
 * LinkedIn Integration Types
 *
 * Type definitions for LinkedIn OAuth and profile data.
 *
 * @module services/linkedin/types
 */
export interface LinkedInTokens {
    accessToken: string;
    refreshToken?: string;
    expiresAt: Date;
    scope: string[];
}
export interface PersistedLinkedInTokens {
    accessToken: string;
    refreshToken?: string;
    expiresAt: string;
    scope: string[];
    lastSync: string;
}
export interface LinkedInProfile {
    id: string;
    firstName: string;
    lastName: string;
    headline?: string;
    profilePicture?: string;
    email?: string;
    location?: {
        country?: string;
        city?: string;
    };
    industry?: string;
    vanityName?: string;
}
export interface LinkedInPosition {
    id: string;
    title: string;
    companyName: string;
    companyLogo?: string;
    startDate: {
        month?: number;
        year: number;
    };
    endDate?: {
        month?: number;
        year: number;
    };
    isCurrent: boolean;
    description?: string;
    location?: string;
}
export interface LinkedInEducation {
    id: string;
    schoolName: string;
    degree?: string;
    fieldOfStudy?: string;
    startYear?: number;
    endYear?: number;
}
export interface LinkedInCertification {
    id: string;
    name: string;
    authority: string;
    issueDate?: {
        month?: number;
        year: number;
    };
    expirationDate?: {
        month?: number;
        year: number;
    };
}
export interface CareerMilestone {
    type: 'work_anniversary' | 'new_position' | 'promotion' | 'company_milestone' | 'connection_milestone';
    title: string;
    description: string;
    date: Date;
    metadata?: Record<string, unknown>;
}
export interface ConnectionUpdate {
    type: 'new_job' | 'work_anniversary' | 'birthday' | 'profile_update';
    connectionName: string;
    connectionHeadline?: string;
    details: string;
    date: Date;
}
export interface LinkedInUserData {
    userId: string;
    tokens: LinkedInTokens;
    profile: LinkedInProfile | null;
    positions: LinkedInPosition[];
    education: LinkedInEducation[];
    certifications: LinkedInCertification[];
    upcomingMilestones: CareerMilestone[];
    connectionUpdates: ConnectionUpdate[];
    lastSync: Date;
}
export interface LinkedInInsight {
    type: 'milestone' | 'opportunity' | 'connection' | 'career_tip';
    title: string;
    message: string;
    priority: 'high' | 'normal' | 'low';
    actionable?: boolean;
    metadata?: Record<string, unknown>;
}
//# sourceMappingURL=types.d.ts.map