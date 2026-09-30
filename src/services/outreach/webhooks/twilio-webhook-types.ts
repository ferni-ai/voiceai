/**
 * Twilio webhook payload and inbound message types.
 * Extracted from twilio-webhooks.ts.
 */

export interface TwilioSMSStatusPayload {
  MessageSid: string;
  MessageStatus: string;
  To: string;
  From: string;
  ErrorCode?: string;
  ErrorMessage?: string;
  AccountSid: string;
}

export interface TwilioInboundSMSPayload {
  MessageSid: string;
  Body: string;
  From: string;
  To: string;
  NumMedia: string;
  MediaUrl0?: string;
  MediaContentType0?: string;
  AccountSid: string;
}

export interface TwilioCallStatusPayload {
  CallSid: string;
  CallStatus: string;
  To: string;
  From: string;
  Direction: string;
  CallDuration?: string;
  AnsweredBy?: string; // 'human', 'machine_start', 'machine_end_beep', 'machine_end_silence', 'machine_end_other', 'fax', 'unknown'
  AccountSid: string;
}

export interface InboundMessage {
  id: string;
  from: string;
  body: string;
  receivedAt: Date;
  mediaUrls?: string[];
  userId?: string;
  conversationId?: string;
}

export type InboundMessageHandler = (message: InboundMessage) => Promise<void>;
