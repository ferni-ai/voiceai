/**
 * Ride links (RIDE_LINKS): one tool, openRideLink, that hands the caller an
 * Uber link with the trip filled in (ride-link.ts). Its own domain, so ride
 * words load only this and never `transportation`, whose ride tools act on a
 * linked account. Flag off: no tools.
 *
 * DOMAIN: ride-links
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { flagOn } from '../../../config/env-flag.js';
import { createDomainExport } from '../../registry/loader.js';
import type { Tool, ToolDefinition } from '../../registry/types.js';
import { openRideLink } from './ride-link.js';

const openRideLinkDef: ToolDefinition = {
  id: 'openRideLink',
  name: 'Open Ride Link',
  description: 'A link that opens Uber with pickup and drop-off filled in. Books nothing.',
  domain: 'ride-links',
  tags: ['ride', 'uber', 'taxi', 'link'],
  create: (): Tool =>
    llm.tool({
      description:
        'The caller wants a ride (Uber, taxi, cab, a car somewhere). Makes a link that opens Uber with ' +
        "pickup and drop-off filled in; it books nothing, so never say a ride is booked or on its way. Say the result's `say`; never read the link aloud. " +
        'On a phone call, set sendText only after the caller says yes to a text.',
      parameters: z.object({
        destination: z.string().describe("Where they're going, in their words"),
        pickup: z
          .string()
          .optional()
          .describe(
            'Where to pick them up: an address or place they named. Leave out if they did not say.'
          ),
        sendText: z
          .boolean()
          .optional()
          .describe('True only after the caller said yes to having the link texted to them'),
      }),
      execute: async (args, opts: unknown) => openRideLink(args, opts),
    }),
};

const rideLinks = createDomainExport('ride-links', [openRideLinkDef]);

/** Read when the domain loads: the tool only while RIDE_LINKS is on. */
export const getToolDefinitions = async (): Promise<ToolDefinition[]> =>
  flagOn('RIDE_LINKS') ? rideLinks.definitions : [];
export const { domain } = rideLinks;

export default getToolDefinitions;
