/**
 * SMS delivery types. Extracted from sms-delivery.ts.
 */

export interface SMSDeliveryConfig {
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioPhoneNumber: string;
  statusCallbackUrl?: string;
  trackingDomain?: string;
}

export interface SMSMessage {
  to: string;
  body: string;
  personaId: string;
  userId: string;
  outreachId: string;
  mediaUrl?: string;
  scheduleSend?: Date;
}

export interface SMSDeliveryResult {
  success: boolean;
  messageSid?: string;
  status?: string;
  error?: string;
  segments?: number;
  price?: number;
}

export interface DeliveryRecord {
  messageSid: string;
  userId: string;
  outreachId: string;
  personaId: string;
  to: string;
  status: 'queued' | 'sending' | 'sent' | 'delivered' | 'failed' | 'undelivered';
  statusDetails?: string;
  sentAt: Date;
  deliveredAt?: Date;
  errorCode?: string;
  errorMessage?: string;
  price?: number;
  segments: number;
  retryCount: number;
}
