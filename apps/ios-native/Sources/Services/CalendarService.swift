import EventKit
import Foundation
import os

/// Calendar Service for schedule awareness using EventKit
/// "Better Than Human" - knows about upcoming stressful meetings and life events
@MainActor
final class CalendarService: ObservableObject {
    static let shared = CalendarService()

    // MARK: - Published State

    @Published private(set) var isAuthorized: Bool = false
    @Published private(set) var todaysEvents: [EKEvent] = []
    @Published private(set) var upcomingEvents: [EKEvent] = []
    @Published private(set) var hasStressfulEventToday: Bool = false
    @Published private(set) var nextEvent: EKEvent?

    // MARK: - Event Categories

    enum EventCategory {
        case meeting
        case appointment
        case deadline
        case social
        case personal
        case travel
        case unknown

        var stressLevel: Int {
            switch self {
            case .deadline: return 3
            case .meeting: return 2
            case .appointment: return 2
            case .travel: return 1
            case .social: return 0
            case .personal: return 0
            case .unknown: return 1
            }
        }
    }

    // MARK: - Private

    private let eventStore = EKEventStore()
    private let logger = Logger(subsystem: "com.ferni.FerniVoice", category: "Calendar")

    // Keywords for categorization
    private let meetingKeywords = ["meeting", "call", "sync", "standup", "1:1", "review", "interview"]
    private let deadlineKeywords = ["deadline", "due", "submit", "deliver", "launch"]
    private let appointmentKeywords = ["doctor", "dentist", "therapy", "appointment", "checkup"]
    private let socialKeywords = ["dinner", "lunch", "party", "birthday", "drinks", "hangout"]
    private let travelKeywords = ["flight", "travel", "trip", "vacation"]

    // MARK: - Initialization

    private init() {
        Task {
            await checkAuthorization()
        }
    }

    // MARK: - Authorization

    func requestAuthorization() async -> Bool {
        do {
            let granted: Bool
            if #available(iOS 17.0, *) {
                granted = try await eventStore.requestFullAccessToEvents()
            } else {
                // Fallback for iOS 16
                granted = try await eventStore.requestAccess(to: .event)
            }
            isAuthorized = granted

            if granted {
                logger.info("Calendar access granted")
                await refreshEvents()
            }

            return granted
        } catch {
            logger.error("Calendar authorization failed: \(error.localizedDescription)")
            return false
        }
    }

    func checkAuthorization() async {
        let status = EKEventStore.authorizationStatus(for: .event)
        if #available(iOS 17.0, *) {
            isAuthorized = status == .fullAccess || status == .authorized
        } else {
            isAuthorized = status == .authorized
        }
    }

    // MARK: - Event Fetching

    func refreshEvents() async {
        guard isAuthorized else { return }

        let calendar = Calendar.current
        let now = Date()
        let startOfToday = calendar.startOfDay(for: now)
        let endOfToday = calendar.date(byAdding: .day, value: 1, to: startOfToday)!
        let endOfWeek = calendar.date(byAdding: .day, value: 7, to: now)!

        // Fetch today's events
        todaysEvents = fetchEvents(from: startOfToday, to: endOfToday)

        // Fetch upcoming week
        upcomingEvents = fetchEvents(from: now, to: endOfWeek)

        // Analyze for stress
        analyzeStressLevel()

        // Find next event
        findNextEvent()
    }

    private func fetchEvents(from start: Date, to end: Date) -> [EKEvent] {
        let predicate = eventStore.predicateForEvents(withStart: start, end: end, calendars: nil)
        let events = eventStore.events(matching: predicate)
        return events.sorted { $0.startDate < $1.startDate }
    }

    // MARK: - Event Analysis

    private func analyzeStressLevel() {
        let now = Date()
        let stressfulEvents = todaysEvents.filter { event in
            // Only future events
            guard event.startDate > now else { return false }

            let category = categorize(event)
            return category.stressLevel >= 2
        }

        hasStressfulEventToday = !stressfulEvents.isEmpty
    }

    private func findNextEvent() {
        let now = Date()
        nextEvent = todaysEvents.first { $0.startDate > now }
    }

    func categorize(_ event: EKEvent) -> EventCategory {
        let title = event.title?.lowercased() ?? ""
        let notes = event.notes?.lowercased() ?? ""
        let combined = "\(title) \(notes)"

        if deadlineKeywords.contains(where: { combined.contains($0) }) {
            return .deadline
        }
        if meetingKeywords.contains(where: { combined.contains($0) }) {
            return .meeting
        }
        if appointmentKeywords.contains(where: { combined.contains($0) }) {
            return .appointment
        }
        if travelKeywords.contains(where: { combined.contains($0) }) {
            return .travel
        }
        if socialKeywords.contains(where: { combined.contains($0) }) {
            return .social
        }

        return .unknown
    }

    // MARK: - Time Until Event

    func timeUntilNextEvent() -> String? {
        guard let next = nextEvent else { return nil }

        let now = Date()
        let interval = next.startDate.timeIntervalSince(now)

        if interval < 0 {
            return "happening now"
        } else if interval < 60 {
            return "in less than a minute"
        } else if interval < 3600 {
            let minutes = Int(interval / 60)
            return "in \(minutes) minute\(minutes == 1 ? "" : "s")"
        } else {
            let hours = Int(interval / 3600)
            return "in \(hours) hour\(hours == 1 ? "" : "s")"
        }
    }

    // MARK: - Context for Voice Agent

    func getScheduleContext() -> [String: Any] {
        var context: [String: Any] = [
            "hasEventsToday": !todaysEvents.isEmpty,
            "eventCountToday": todaysEvents.count,
            "hasStressfulEvent": hasStressfulEventToday,
            "isCalendarAuthorized": isAuthorized
        ]

        if let next = nextEvent {
            context["nextEventTitle"] = next.title ?? "Unnamed event"
            context["nextEventTime"] = timeUntilNextEvent() ?? ""
            context["nextEventCategory"] = categorize(next)
        }

        return context
    }

    /// Get a proactive message based on schedule
    func getScheduleAwareMessage() -> String? {
        guard isAuthorized else { return nil }

        // Check for imminent stressful event
        if let next = nextEvent {
            let category = categorize(next)
            let interval = next.startDate.timeIntervalSince(Date())

            if interval > 0 && interval < 1800 && category.stressLevel >= 2 {
                // Less than 30 minutes to a stressful event
                return "I see you have \(next.title ?? "something") coming up. How are you feeling about it?"
            }
        }

        // Check for busy day
        let meetingCount = todaysEvents.filter { categorize($0) == .meeting }.count
        if meetingCount >= 4 {
            return "Looks like a busy day with \(meetingCount) meetings. Remember to take breaks."
        }

        return nil
    }

    // MARK: - Important Dates

    /// Get important upcoming dates (birthdays from calendar)
    func getUpcomingBirthdays(withinDays days: Int = 14) -> [EKEvent] {
        guard isAuthorized else { return [] }

        let now = Date()
        let future = Calendar.current.date(byAdding: .day, value: days, to: now)!

        // Look for birthday calendar events
        let predicate = eventStore.predicateForEvents(withStart: now, end: future, calendars: nil)
        let events = eventStore.events(matching: predicate)

        return events.filter { event in
            let title = event.title?.lowercased() ?? ""
            return title.contains("birthday") || event.birthdayContactIdentifier != nil
        }
    }

    /// Get today's important dates
    func getTodaysSpecialEvents() -> [EKEvent] {
        let specialKeywords = ["birthday", "anniversary", "graduation", "wedding"]

        return todaysEvents.filter { event in
            let title = event.title?.lowercased() ?? ""
            return specialKeywords.contains(where: { title.contains($0) })
        }
    }
}

// MARK: - Event Description Extension

extension CalendarService {
    func describeUpcomingDay() -> String {
        guard isAuthorized else {
            return "I don't have access to your calendar."
        }

        if todaysEvents.isEmpty {
            return "Your calendar is clear today."
        }

        let meetingCount = todaysEvents.filter { categorize($0) == .meeting }.count
        let totalCount = todaysEvents.count

        var description = "You have \(totalCount) event\(totalCount == 1 ? "" : "s") today"

        if meetingCount > 0 {
            description += ", including \(meetingCount) meeting\(meetingCount == 1 ? "" : "s")"
        }

        if let next = nextEvent, let timeUntil = timeUntilNextEvent() {
            description += ". Your next one is \(next.title ?? "an event") \(timeUntil)."
        } else {
            description += "."
        }

        return description
    }
}
