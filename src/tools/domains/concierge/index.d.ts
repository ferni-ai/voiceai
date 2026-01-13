/**
 * Concierge Domain Tools - Business & Vendor Outreach
 *
 * AI-powered outreach to BUSINESSES on behalf of users - calling hotels,
 * restaurants, service providers to get quotes, make reservations, and schedule appointments.
 *
 * DOMAIN: concierge
 * TOOLS:
 *   requestHotelQuotes - Call multiple hotels to compare rates
 *   makeRestaurantReservation - Book restaurant tables
 *   scheduleAppointment - Schedule healthcare appointments
 *   getServiceQuotes - Get quotes from local service providers
 *   checkConciergeStatus - Check status of an outreach request
 *
 * "Better Than Human" - doing what no friend has time to do consistently.
 *
 * RELATED DOMAINS (distinct functionality):
 *   - communication/outreach/ - User → Personal Contact (mom, friends) - emotional/personalized
 *   - proactive/outreach/ - Agent → User (reminders, check-ins) - accountability
 *   - concierge/ - Agent → Business (hotels, plumbers) - transactional
 *
 * USAGE:
 *   "Find me hotels in Miami next weekend and get the best rates"
 *   "Make a reservation at Nobu for 4 people Saturday night"
 *   "Schedule a dentist appointment for me, nothing urgent"
 *   "Get me quotes from plumbers for a leaky faucet"
 */
import type { ToolDefinition } from '../../registry/types.js';
export declare const getToolDefinitions: () => Promise<ToolDefinition[]>, domain: import("../../registry/types.js").ToolDomain, definitions: ToolDefinition[];
export default getToolDefinitions;
//# sourceMappingURL=index.d.ts.map