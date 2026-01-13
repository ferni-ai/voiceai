/**
 * Appointment & Reservation Tools
 *
 * LLM-callable tools for scheduling appointments and reservations.
 *
 * @module scheduling/appointments-tools
 */
import { llm } from '@livekit/agents';
export declare function createAppointmentTools(): {
    makeReservation: llm.FunctionTool<{
        restaurantName: string;
        dateTime: string;
        partySize: number;
        restaurantPhone?: string | undefined;
        location?: string | undefined;
        guestName?: string | undefined;
        guestPhone?: string | undefined;
        guestEmail?: string | undefined;
        specialRequests?: string | undefined;
    }, unknown, string>;
    searchRestaurantsNearby: llm.FunctionTool<{
        query: string;
        location: string;
        date: string;
        partySize: number;
    }, unknown, string>;
    scheduleAppointment: llm.FunctionTool<{
        appointmentType: "service" | "other" | "doctor" | "dentist" | "salon" | "spa" | "vet" | "consultation";
        businessName: string;
        dateTime: string;
        businessPhone?: string | undefined;
        forPerson?: string | undefined;
        reason?: string | undefined;
        specialRequests?: string | undefined;
    }, unknown, string>;
    checkAvailability: llm.FunctionTool<{
        businessName: string;
        businessPhone: string;
        dateTime: string;
        serviceType?: string | undefined;
    }, unknown, string>;
    confirmAppointment: llm.FunctionTool<{
        businessName: string;
        businessPhone: string;
        dateTime: string;
        appointmentId?: string | undefined;
        personName?: string | undefined;
    }, unknown, string>;
    cancelAppointment: llm.FunctionTool<{
        businessName: string;
        businessPhone: string;
        dateTime: string;
        reason?: string | undefined;
    }, unknown, string>;
    getAppointmentStatus: llm.FunctionTool<{
        includeCompleted: boolean;
    }, unknown, string>;
    scheduleLifeEventAppointment: llm.FunctionTool<{
        eventName: string;
        appointmentType: string;
        businessName: string;
        preferredDate: string;
        milestoneId?: string | undefined;
        businessPhone?: string | undefined;
        specialRequests?: string | undefined;
    }, unknown, string>;
    quickCall: llm.FunctionTool<{
        phoneNumber: string;
        purpose: string;
        businessName?: string | undefined;
    }, unknown, string>;
    markAppointmentConfirmed: llm.FunctionTool<{
        businessName: string;
        confirmationNumber?: string | undefined;
        confirmedTime?: string | undefined;
        notes?: string | undefined;
    }, unknown, string>;
    retryAppointmentCall: llm.FunctionTool<{
        businessName: string;
    }, unknown, string>;
    getFollowUpStatus: llm.FunctionTool<Record<string, never>, unknown, string>;
    setAppointmentReminder: llm.FunctionTool<{
        appointmentDescription: string;
        appointmentDateTime: string;
        reminderTime: string;
        deliveryMethod: "email" | "sms" | "call";
        contact?: string | undefined;
    }, unknown, string>;
};
//# sourceMappingURL=appointments-tools.d.ts.map