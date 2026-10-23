/**
 * What callUser needs from outreach, as a port: tools (L3) may not import
 * services/outreach (L4), so the call session installs the adapter
 * (services/outreach/call-user-adapter.ts) and callUser reads it here.
 * Not installed (no live call in this process), callUser places no call.
 *
 * @module tools/domains/proactive/outreach/call-user-port
 */

export interface CallUserRequest {
  userId: string;
  /** The verified phone from verifiedPhone(), never a number from the model */
  phoneNumber: string;
  message: string;
  personaId: string;
}

export interface CallUserResult {
  success: boolean;
  /** 'scheduled': outside the user's calling hours, it rings once they open */
  status?: string;
  /** The persona's live agent is ringing them; otherwise a recorded voice message */
  live?: boolean;
  error?: string;
}

/** How a guarded text to the owner went; `reason` is said to them when it wasn't sent. */
export interface TextOwnerResult {
  sent: boolean;
  reason?: string;
}

export interface CallUserPort {
  /** The verified phone on the account, or undefined; never the model-written profile phone */
  verifiedPhone(userId: string): Promise<string | undefined>;
  /** The account's verified email (Firebase Auth), or undefined; never the model-saved address */
  verifiedEmail?(userId: string): Promise<string | undefined>;
  /**
   * Text the owner at the verified phone through the guarded sender (STOP, texts off,
   * quiet hours unless they just asked for it). Not installed: nothing is sent.
   */
  textOwner?(userId: string, body: string, opts: { askedNow: boolean }): Promise<TextOwnerResult>;
  /** Ring that phone with the message, through calling hours and quiet hours */
  call(request: CallUserRequest): Promise<CallUserResult>;
}

let port: CallUserPort | undefined;

export function setCallUserPort(next: CallUserPort | undefined): void {
  port = next;
}

export function getCallUserPort(): CallUserPort | undefined {
  return port;
}
