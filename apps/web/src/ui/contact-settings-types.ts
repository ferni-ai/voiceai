/**
 * State types shared by the contact settings modal and its phone module, kept apart so
 * neither imports the other's types (no import cycle).
 *
 * @module ui/contact-settings-types
 */

/** What the user typed, kept across re-renders. Undefined = untouched, show the stored value. */
export interface Drafts {
  phone?: string;
  email?: string;
  preferredName?: string;
}

export interface ContactInfo {
  phone?: string;
  email?: string;
  phoneVerified?: boolean;
  emailVerified?: boolean;
  preferredName?: string;
  timezone?: string;
  quietHoursStart?: string; // "22:00"
  quietHoursEnd?: string; // "08:00"
  quietHoursEnabled?: boolean;
}

export interface ContactSettingsState {
  isOpen: boolean;
  isLoading: boolean;
  isSaving: boolean;
  isVerifying: boolean;
  verificationCode: string;
  pendingPhone: string;
  contactInfo: ContactInfo;
  drafts: Drafts;
  phoneInvalid: boolean;
  channels: string[]; // check-in channels besides in-app: 'sms' | 'call' | 'email'
  /** The server's outreach on/off (outreachEnabled); undefined until it answers. */
  reachOn?: boolean;
  error?: string;
  success?: string;
}
