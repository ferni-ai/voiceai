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
  error?: string;
}

export interface CallUserPort {
  /** The verified phone on the account, or undefined; never the model-written profile phone */
  verifiedPhone(userId: string): Promise<string | undefined>;
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
