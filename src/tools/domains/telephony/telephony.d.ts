/**
 * LiveKit Telephony Tools
 *
 * Allows Jack to make outbound phone calls to users!
 *
 * Uses LiveKit's SIP integration for outbound calling.
 * Requires:
 * - LiveKit server with SIP Trunk configured
 * - SIP provider (Twilio, etc.) for PSTN connectivity
 *
 * @see https://docs.livekit.io/agents/quickstarts/outbound-calls/
 */
import { llm } from '@livekit/agents';
export declare function createTelephonyTools(): {
    callUser: llm.FunctionTool<{
        phoneNumber: string;
        reason: "reminder" | "checkIn" | "marketAlert" | "peterHandoff";
        customMessage?: string | undefined;
    }, unknown, string>;
    scheduleCallback: llm.FunctionTool<{
        phoneNumber: string;
        when: string;
        reason: string;
    }, unknown, string>;
};
export default createTelephonyTools;
//# sourceMappingURL=telephony.d.ts.map