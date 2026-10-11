/**
 * CONTEXT_PACKET: one labelled, budgeted context packet per turn
 * (agents/personas/context-packet/).
 *
 * Off (the default): every injector adds its own text to the request, as before.
 * On: memory recall stops adding its note to the chat, and the per-turn reminder
 * becomes the packet (turn-request.ts). Read only where the request is assembled
 * (turn-request.ts) and where recall is wired (multi-agent/agent-setup.ts).
 *
 * Set with `lk agent update-secrets --secrets "CONTEXT_PACKET=on"`.
 *
 * @module config/context-packet-flag
 */

export function contextPacketEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.CONTEXT_PACKET?.trim().toLowerCase() === 'on';
}
