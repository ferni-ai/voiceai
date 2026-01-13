/**
 * Vehicle Tools
 *
 * Vehicle management and maintenance tracking:
 * - Vehicle registration
 * - Maintenance schedules
 * - Service history
 * - Registration/insurance alerts
 *
 * DOMAIN: vehicle
 */
import { z } from 'zod';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
const log = getLogger();
// Standard maintenance intervals
const MAINTENANCE_INTERVALS = [
    { type: 'Oil Change', intervalMiles: 5000, intervalMonths: 6 },
    { type: 'Tire Rotation', intervalMiles: 7500, intervalMonths: 6 },
    { type: 'Air Filter', intervalMiles: 15000, intervalMonths: 12 },
    { type: 'Brake Inspection', intervalMiles: 12000, intervalMonths: 12 },
    { type: 'Transmission Fluid', intervalMiles: 30000, intervalMonths: 24 },
    { type: 'Coolant Flush', intervalMiles: 30000, intervalMonths: 24 },
    { type: 'Spark Plugs', intervalMiles: 60000, intervalMonths: 48 },
    { type: 'Timing Belt', intervalMiles: 60000, intervalMonths: 60 },
];
// Simple in-memory storage
const vehicleStore = new Map();
function getUserVehicles(userId) {
    return vehicleStore.get(userId) || [];
}
function saveUserVehicles(userId, vehicles) {
    vehicleStore.set(userId, vehicles);
}
// ============================================================================
// TOOL DEFINITIONS
// ============================================================================
export function getVehicleToolDefinitions() {
    return [
        // =========================================================================
        // addVehicle - Register car
        // =========================================================================
        {
            id: 'addVehicle',
            name: 'Add Vehicle',
            description: 'Add a vehicle to track maintenance and registrations.',
            domain: 'vehicle',
            tags: ['vehicle', 'car', 'add', 'register'],
            create: (ctx) => {
                return llm.tool({
                    description: 'Add a vehicle to track maintenance and registrations.',
                    parameters: z.object({
                        year: z.number().describe('Vehicle year'),
                        make: z.string().describe('Vehicle make (e.g., Toyota, Honda)'),
                        model: z.string().describe('Vehicle model (e.g., Camry, Civic)'),
                        mileage: z.number().describe('Current mileage'),
                        licensePlate: z.string().optional().describe('License plate number'),
                    }),
                    execute: async (params) => {
                        const userId = ctx.userId;
                        if (!userId) {
                            return 'I need to know who you are to add a vehicle.';
                        }
                        const vehicles = getUserVehicles(userId);
                        const now = new Date().toISOString();
                        const vehicle = {
                            id: `veh_${Date.now()}`,
                            userId,
                            year: params.year,
                            make: params.make,
                            model: params.model,
                            currentMileage: params.mileage,
                            lastMileageUpdate: now,
                            licensePlate: params.licensePlate,
                            maintenanceRecords: [],
                            upcomingMaintenance: MAINTENANCE_INTERVALS.map((item) => ({
                                ...item,
                                dueMileage: params.mileage + (item.intervalMiles || 0),
                            })),
                            createdAt: now,
                            updatedAt: now,
                        };
                        vehicles.push(vehicle);
                        saveUserVehicles(userId, vehicles);
                        return `🚗 Vehicle added: **${params.year} ${params.make} ${params.model}**\n` +
                            `Current mileage: ${params.mileage.toLocaleString()} miles\n\n` +
                            `I've set up standard maintenance tracking. ` +
                            `Say "what maintenance is due" to see your schedule.`;
                    },
                });
            },
        },
        // =========================================================================
        // logMileage - Update odometer
        // =========================================================================
        {
            id: 'logMileage',
            name: 'Log Mileage',
            description: 'Update your vehicle\'s current mileage.',
            domain: 'vehicle',
            tags: ['vehicle', 'mileage', 'update'],
            create: (ctx) => {
                return llm.tool({
                    description: 'Update your vehicle\'s current mileage.',
                    parameters: z.object({
                        mileage: z.number().describe('Current odometer reading'),
                        vehicle: z.string().optional().describe('Which vehicle (if you have multiple)'),
                    }),
                    execute: async (params) => {
                        const userId = ctx.userId;
                        if (!userId) {
                            return 'I need to know who you are to log mileage.';
                        }
                        const vehicles = getUserVehicles(userId);
                        if (vehicles.length === 0) {
                            return "You don't have any vehicles registered. " +
                                "Add one with \"add my [year] [make] [model]\".";
                        }
                        let vehicle = vehicles[0];
                        if (params.vehicle) {
                            const found = vehicles.find((v) => `${v.year} ${v.make} ${v.model}`.toLowerCase().includes(params.vehicle.toLowerCase()));
                            if (found)
                                vehicle = found;
                        }
                        const previousMileage = vehicle.currentMileage;
                        vehicle.currentMileage = params.mileage;
                        vehicle.lastMileageUpdate = new Date().toISOString();
                        vehicle.updatedAt = vehicle.lastMileageUpdate;
                        // Update maintenance due dates
                        for (const item of vehicle.upcomingMaintenance) {
                            if (item.lastDone && item.intervalMiles) {
                                item.dueMileage = item.lastDone.mileage + item.intervalMiles;
                            }
                        }
                        saveUserVehicles(userId, vehicles);
                        const milesDriven = params.mileage - previousMileage;
                        let response = `✅ Mileage updated: ${params.mileage.toLocaleString()} miles\n`;
                        if (milesDriven > 0) {
                            response += `(+${milesDriven.toLocaleString()} miles since last update)\n`;
                        }
                        // Check for upcoming maintenance
                        const dueSoon = vehicle.upcomingMaintenance.filter((m) => m.dueMileage && m.dueMileage <= params.mileage + 1000);
                        if (dueSoon.length > 0) {
                            response += `\n⚠️ **Maintenance due soon:**\n`;
                            for (const item of dueSoon) {
                                response += `- ${item.type} (due at ${item.dueMileage?.toLocaleString()} miles)\n`;
                            }
                        }
                        return response;
                    },
                });
            },
        },
        // =========================================================================
        // getMaintenanceSchedule - Based on mileage and time
        // =========================================================================
        {
            id: 'getMaintenanceSchedule',
            name: 'Get Maintenance Schedule',
            description: 'See upcoming maintenance based on mileage and time.',
            domain: 'vehicle',
            tags: ['vehicle', 'maintenance', 'schedule'],
            create: (ctx) => {
                return llm.tool({
                    description: 'See upcoming maintenance based on mileage and time.',
                    parameters: z.object({}),
                    execute: async () => {
                        const userId = ctx.userId;
                        if (!userId) {
                            return 'I need to know who you are to show maintenance.';
                        }
                        const vehicles = getUserVehicles(userId);
                        if (vehicles.length === 0) {
                            return "You don't have any vehicles registered yet.";
                        }
                        let response = '';
                        for (const vehicle of vehicles) {
                            response += `🚗 **${vehicle.year} ${vehicle.make} ${vehicle.model}**\n`;
                            response += `Current: ${vehicle.currentMileage.toLocaleString()} miles\n\n`;
                            const sorted = [...vehicle.upcomingMaintenance]
                                .filter((m) => m.dueMileage)
                                .sort((a, b) => (a.dueMileage || 0) - (b.dueMileage || 0));
                            response += `**Upcoming Maintenance:**\n`;
                            for (const item of sorted.slice(0, 5)) {
                                const milesUntil = (item.dueMileage || 0) - vehicle.currentMileage;
                                const status = milesUntil <= 0 ? '🔴 OVERDUE' : milesUntil <= 500 ? '🟡 Soon' : '🟢';
                                response += `${status} ${item.type} - ${milesUntil <= 0 ? 'overdue' : `in ${milesUntil.toLocaleString()} miles`}\n`;
                            }
                            response += '\n';
                        }
                        return response;
                    },
                });
            },
        },
        // =========================================================================
        // trackServiceHistory - Record oil changes, repairs
        // =========================================================================
        {
            id: 'trackServiceHistory',
            name: 'Track Service',
            description: 'Record a maintenance service or repair.',
            domain: 'vehicle',
            tags: ['vehicle', 'maintenance', 'service', 'record'],
            create: (ctx) => {
                return llm.tool({
                    description: 'Record a maintenance service or repair.',
                    parameters: z.object({
                        service: z.string().describe('Type of service (e.g., "oil change", "brake pads")'),
                        mileage: z.number().optional().describe('Mileage at service'),
                        cost: z.number().optional().describe('Cost of service'),
                        shop: z.string().optional().describe('Where it was done'),
                    }),
                    execute: async (params) => {
                        const userId = ctx.userId;
                        if (!userId) {
                            return 'I need to know who you are to track service.';
                        }
                        const vehicles = getUserVehicles(userId);
                        if (vehicles.length === 0) {
                            return "You don't have any vehicles registered.";
                        }
                        const vehicle = vehicles[0];
                        const now = new Date().toISOString();
                        const mileage = params.mileage || vehicle.currentMileage;
                        const record = {
                            id: `rec_${Date.now()}`,
                            date: now.split('T')[0],
                            mileage,
                            type: params.service,
                            description: params.service,
                            cost: params.cost,
                            shop: params.shop,
                        };
                        vehicle.maintenanceRecords.push(record);
                        // Update next due date for this maintenance type
                        const maintenanceItem = vehicle.upcomingMaintenance.find((m) => m.type.toLowerCase().includes(params.service.toLowerCase()) ||
                            params.service.toLowerCase().includes(m.type.toLowerCase()));
                        if (maintenanceItem) {
                            maintenanceItem.lastDone = { date: record.date, mileage };
                            if (maintenanceItem.intervalMiles) {
                                maintenanceItem.dueMileage = mileage + maintenanceItem.intervalMiles;
                            }
                        }
                        if (params.mileage) {
                            vehicle.currentMileage = params.mileage;
                            vehicle.lastMileageUpdate = now;
                        }
                        vehicle.updatedAt = now;
                        saveUserVehicles(userId, vehicles);
                        let response = `✅ Service recorded: **${params.service}**\n`;
                        response += `Mileage: ${mileage.toLocaleString()}\n`;
                        if (params.cost)
                            response += `Cost: $${params.cost}\n`;
                        if (maintenanceItem?.dueMileage) {
                            response += `Next due: ${maintenanceItem.dueMileage.toLocaleString()} miles`;
                        }
                        return response;
                    },
                });
            },
        },
        // =========================================================================
        // alertRegistrationExpiry - DMV reminders
        // =========================================================================
        {
            id: 'setRegistrationExpiry',
            name: 'Set Registration Expiry',
            description: 'Set when your vehicle registration expires.',
            domain: 'vehicle',
            tags: ['vehicle', 'registration', 'expiry', 'dmv'],
            create: (ctx) => {
                return llm.tool({
                    description: 'Set when your vehicle registration expires.',
                    parameters: z.object({
                        expiryDate: z.string().describe('Registration expiry date'),
                    }),
                    execute: async (params) => {
                        const userId = ctx.userId;
                        if (!userId) {
                            return 'I need to know who you are to track registration.';
                        }
                        const vehicles = getUserVehicles(userId);
                        if (vehicles.length === 0) {
                            return "You don't have any vehicles registered.";
                        }
                        const vehicle = vehicles[0];
                        vehicle.registrationExpiry = params.expiryDate;
                        vehicle.updatedAt = new Date().toISOString();
                        saveUserVehicles(userId, vehicles);
                        return `✅ Registration expiry set: **${params.expiryDate}**\n` +
                            `I'll remind you 30 days before it expires.`;
                    },
                });
            },
        },
        // =========================================================================
        // setInsuranceRenewal - Insurance tracking
        // =========================================================================
        {
            id: 'setInsuranceRenewal',
            name: 'Set Insurance Renewal',
            description: 'Set when your car insurance renews.',
            domain: 'vehicle',
            tags: ['vehicle', 'insurance', 'renewal'],
            create: (ctx) => {
                return llm.tool({
                    description: 'Set when your car insurance renews.',
                    parameters: z.object({
                        renewalDate: z.string().describe('Insurance renewal date'),
                        provider: z.string().optional().describe('Insurance provider name'),
                    }),
                    execute: async (params) => {
                        const userId = ctx.userId;
                        if (!userId) {
                            return 'I need to know who you are to track insurance.';
                        }
                        const vehicles = getUserVehicles(userId);
                        if (vehicles.length === 0) {
                            return "You don't have any vehicles registered.";
                        }
                        const vehicle = vehicles[0];
                        vehicle.insuranceExpiry = params.renewalDate;
                        if (params.provider)
                            vehicle.insuranceProvider = params.provider;
                        vehicle.updatedAt = new Date().toISOString();
                        saveUserVehicles(userId, vehicles);
                        let response = `✅ Insurance renewal set: **${params.renewalDate}**`;
                        if (params.provider)
                            response += `\nProvider: ${params.provider}`;
                        response += `\nI'll remind you 30 days before it renews.`;
                        return response;
                    },
                });
            },
        },
    ];
}
// ============================================================================
// DOMAIN EXPORT
// ============================================================================
export function getToolDefinitions() {
    return getVehicleToolDefinitions();
}
export const definitions = getVehicleToolDefinitions();
//# sourceMappingURL=index.js.map