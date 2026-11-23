/**
 * The guards every tool definition gets, composed in one place. Both ways a tool is built call
 * this module, so a guard added here reaches both:
 *
 * - ToolRegistry.register() (registry/index.ts): the outbound gate (./outbound-gate.ts: calls,
 *   texts and emails wait for the caller's yes), then the user-id guard (./user-id-guard.ts: the
 *   session's user id wins over a model-supplied `userId`).
 * - createDomainExport (registry/loader.ts), for code that builds tools straight from a domain's
 *   definitions (the voice session's music-tool recovery, the domain tool executors): the outbound
 *   gate, as on main. DOMAIN_EXPORT_USER_ID_GUARD=on adds the user-id guard too (#4251); off, the
 *   exported definition is the very object main exports.
 *
 * Both wrappers are idempotent, so a domain-exported definition that is later registered gets no
 * second layer.
 *
 * @module tools/registry/tool-guards
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import { gateOutboundTool } from './outbound-gate.js';
import type { ToolDefinition } from './types.js';
import { wrapCreateWithUserIdGuard } from './user-id-guard.js';

/** register(): the outbound gate, then the user-id guard. The one place their order is set. */
export function guardedCreate(definition: ToolDefinition): ToolDefinition['create'] {
  return wrapCreateWithUserIdGuard(gateOutboundTool(definition));
}

/**
 * createDomainExport: the outbound gate always; with DOMAIN_EXPORT_USER_ID_GUARD on (read when
 * the domain is exported), every guard register() applies. Off, it returns the gated definition
 * itself, so a domain that filters its exports by identity sees the objects main gives it.
 */
export function guardDomainExport(definition: ToolDefinition, env?: Env): ToolDefinition {
  const gated = gateOutboundTool(definition);
  if (!flagOn('DOMAIN_EXPORT_USER_ID_GUARD', env)) return gated;
  return { ...gated, create: guardedCreate(gated) }; // marked: register() adds no second layer
}
