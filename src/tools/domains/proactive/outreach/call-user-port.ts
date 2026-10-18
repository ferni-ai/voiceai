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

/** How a guarded text to the owner went; `reason` is said to them when it wasn't sent. */
export interface TextOwnerResult {
  sent: boolean;
  reason?: string;
  /** Not sent until Ferni says this out loud and they agree (no texting consent yet). */
  disclose?: string;
}

export interface TextOwnerOptions {
  askedNow: boolean;
  /** The user asked for this text on the call (not Ferni reaching out). */
  requested?: boolean;
  /** The live call: its own transcript proves the disclosure was spoken and agreed to. */
  sessionId?: string;
}

/** What a texting tool tells Ferni when the text waits on the disclosure (TextOwnerResult.disclose). */
export const disclosureFirst = (line: string): string =>
  `Not sent yet. Say this to them first, word for word: "${line}" If they say yes, send it again. If they don't, don't.`;

export interface CallUserPort {
  /** The verified phone on the account, or undefined; never the model-written profile phone */
  verifiedPhone(userId: string): Promise<string | undefined>;
  /** The account's verified email (Firebase Auth), or undefined; never the model-saved address */
  verifiedEmail?(userId: string): Promise<string | undefined>;
  /**
   * Text the owner at the verified phone through the guarded sender (STOP, texts off,
   * quiet hours unless they just asked for it). Not installed: nothing is sent.
   */
  textOwner?(userId: string, body: string, opts: TextOwnerOptions): Promise<TextOwnerResult>;
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
