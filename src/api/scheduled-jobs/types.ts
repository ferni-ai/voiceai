/**
 * Shared types for scheduled job handlers.
 *
 * @module api/scheduled-jobs/types
 */

export interface BrandAward {
  id: string;
  name: string;
  deadline: string;
  status: string;
  fee?: number;
}

export interface BrandWorkstream {
  id: string;
  name: string;
  status: string;
  updatedAt?: string;
  tasks: Array<{ id: string; completed: boolean }>;
}

export interface BrandMilestone {
  id: string;
  name: string;
  date: string;
  celebrated?: boolean;
  description?: string;
}

export interface BrandAmbassador {
  id: string;
  name: string;
  email?: string;
  lastActivityAt?: string;
}

export interface UserStory {
  id: string;
  approved?: boolean;
}

export interface UserStoryDoc {
  id: string;
  userName: string;
  story: string;
  quote?: string;
  approved?: boolean;
  publishedToSocial?: boolean;
  source?: string;
  createdAt?: string;
}
