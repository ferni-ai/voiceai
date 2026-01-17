import Foundation
import EventKit
import Combine

// MARK: - Calendar Service
/// Provides superhuman calendar awareness - knows your schedule before you do
/// Uses EventKit for calendar access

class CalendarService: ObservableObject {

    // MARK: - Published State

    /// Today's events
    @Published private(set) var todaysEvents: [CalendarEvent] = []

    /// Next upcoming event (within configurable window)
    @Published private(set) var upcomingEvent: CalendarEvent?

    /// Whether user is currently in a meeting
    @Published private(set) var isInMeeting: Bool = false

    /// Current meeting (if in one)
    @Published private(set) var currentMeeting: CalendarEvent?

    /// Number of events today
    @Published private(set) var todaysEventCount: Int = 0

    /// Calendar access status
    @Published private(set) var authorizationStatus: EKAuthorizationStatus = .notDetermined

    /// Whether calendar access is granted
    @Published private(set) var hasAccess: Bool = false

    // MARK: - Private Properties

    private let eventStore = EKEventStore()
    private var refreshTimer: Timer?
    private var cancellables = Set<AnyCancellable>()

    /// How far ahead to look for "upcoming" events (in minutes)
    private let upcomingWindowMinutes: Int = 60

    // MARK: - Initialization

    init() {
        checkAuthorizationStatus()
        startRefreshTimer()
    }

    deinit {
        refreshTimer?.invalidate()
    }

    // MARK: - Authorization

    /// Check current authorization status
    func checkAuthorizationStatus() {
        authorizationStatus = EKEventStore.authorizationStatus(for: .event)

        if #available(macOS 14.0, *) {
            hasAccess = authorizationStatus == .fullAccess || authorizationStatus == .authorized
        } else {
            hasAccess = authorizationStatus == .authorized
        }
    }

    /// Request calendar access
    @MainActor
    func requestAccess() async -> Bool {
        do {
            if #available(macOS 14.0, *) {
                let granted = try await eventStore.requestFullAccessToEvents()
                hasAccess = granted
                if granted {
                    await refreshEvents()
                }
                return granted
            } else {
                let granted = try await eventStore.requestAccess(to: .event)
                hasAccess = granted
                if granted {
                    await refreshEvents()
                }
                return granted
            }
        } catch {
            print("[Calendar] Access request error: \(error)")
            return false
        }
    }

    /// Open System Settings to Calendar section
    func openCalendarSettings() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars") {
            NSWorkspace.shared.open(url)
        }
    }

    // MARK: - Event Fetching

    /// Start periodic refresh (every 30 seconds)
    private func startRefreshTimer() {
        refreshTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            Task { @MainActor in
                await self?.refreshEvents()
            }
        }

        // Initial refresh
        Task { @MainActor in
            await refreshEvents()
        }
    }

    /// Refresh all event data
    @MainActor
    func refreshEvents() async {
        guard hasAccess else { return }

        // Get today's events
        let today = Calendar.current.startOfDay(for: Date())
        let tomorrow = Calendar.current.date(byAdding: .day, value: 1, to: today)!

        let predicate = eventStore.predicateForEvents(
            withStart: today,
            end: tomorrow,
            calendars: nil  // All calendars
        )

        let ekEvents = eventStore.events(matching: predicate)
        todaysEvents = ekEvents.map { CalendarEvent(from: $0) }
        todaysEventCount = todaysEvents.count

        // Update upcoming event
        updateUpcomingEvent()

        // Check if currently in a meeting
        updateMeetingStatus()
    }

    /// Update the next upcoming event
    private func updateUpcomingEvent() {
        let now = Date()
        let windowEnd = Calendar.current.date(
            byAdding: .minute,
            value: upcomingWindowMinutes,
            to: now
        )!

        // Find the next event that starts within the window
        upcomingEvent = todaysEvents
            .filter { $0.startDate > now && $0.startDate <= windowEnd }
            .sorted { $0.startDate < $1.startDate }
            .first
    }

    /// Update whether user is currently in a meeting
    private func updateMeetingStatus() {
        let now = Date()

        // Find any event that's currently happening
        currentMeeting = todaysEvents.first { event in
            event.startDate <= now && event.endDate > now
        }

        isInMeeting = currentMeeting != nil
    }

    // MARK: - Event Creation

    /// Create a new calendar event
    @MainActor
    func createEvent(
        title: String,
        startDate: Date,
        endDate: Date,
        notes: String? = nil,
        calendarIdentifier: String? = nil
    ) async -> Result<CalendarEvent, CalendarError> {
        guard hasAccess else {
            return .failure(.notAuthorized)
        }

        let event = EKEvent(eventStore: eventStore)
        event.title = title
        event.startDate = startDate
        event.endDate = endDate
        event.notes = notes

        // Use specified calendar or default
        if let calId = calendarIdentifier,
           let calendar = eventStore.calendar(withIdentifier: calId) {
            event.calendar = calendar
        } else {
            event.calendar = eventStore.defaultCalendarForNewEvents
        }

        do {
            try eventStore.save(event, span: .thisEvent)
            await refreshEvents()
            return .success(CalendarEvent(from: event))
        } catch {
            print("[Calendar] Failed to create event: \(error)")
            return .failure(.saveFailed(error.localizedDescription))
        }
    }

    // MARK: - Queries

    /// Get events for a specific date range
    func getEvents(from startDate: Date, to endDate: Date) -> [CalendarEvent] {
        guard hasAccess else { return [] }

        let predicate = eventStore.predicateForEvents(
            withStart: startDate,
            end: endDate,
            calendars: nil
        )

        return eventStore.events(matching: predicate).map { CalendarEvent(from: $0) }
    }

    /// Get events for the next N days
    func getEventsForNextDays(_ days: Int) -> [CalendarEvent] {
        let now = Date()
        let endDate = Calendar.current.date(byAdding: .day, value: days, to: now)!
        return getEvents(from: now, to: endDate)
    }

    /// Get free time slots today (simplified)
    func getFreeTimeToday() -> [DateInterval] {
        let now = Date()
        let endOfDay = Calendar.current.date(bySettingHour: 23, minute: 59, second: 59, of: now)!

        var freeSlots: [DateInterval] = []
        var lastEnd = now

        for event in todaysEvents.filter({ $0.startDate > now }).sorted(by: { $0.startDate < $1.startDate }) {
            if event.startDate > lastEnd {
                // There's a gap
                freeSlots.append(DateInterval(start: lastEnd, end: event.startDate))
            }
            lastEnd = max(lastEnd, event.endDate)
        }

        // Add remaining time until end of day
        if lastEnd < endOfDay {
            freeSlots.append(DateInterval(start: lastEnd, end: endOfDay))
        }

        return freeSlots
    }

    // MARK: - Context Generation

    /// Generate context string for the agent
    func generateContextString() -> String {
        var parts: [String] = []

        if todaysEventCount > 0 {
            parts.append("Today's calendar: \(todaysEventCount) events")
        }

        if let current = currentMeeting {
            let remaining = current.endDate.timeIntervalSince(Date()) / 60
            parts.append("Currently in: \"\(current.title)\" (\(Int(remaining)) min remaining)")
        }

        if let upcoming = upcomingEvent {
            let minutesUntil = Int(upcoming.startDate.timeIntervalSince(Date()) / 60)
            parts.append("Upcoming: \"\(upcoming.title)\" in \(minutesUntil) minutes")

            if let attendees = upcoming.attendees, !attendees.isEmpty {
                parts.append("Attendees: \(attendees.joined(separator: ", "))")
            }
        }

        return parts.joined(separator: "\n")
    }

    /// Get calendar context for data channel
    func getCalendarContext() -> [String: Any] {
        var context: [String: Any] = [
            "todaysEventCount": todaysEventCount,
            "isInMeeting": isInMeeting
        ]

        if let upcoming = upcomingEvent {
            let minutesUntil = Int(upcoming.startDate.timeIntervalSince(Date()) / 60)
            var upcomingDict: [String: Any] = [
                "title": upcoming.title,
                "inMinutes": minutesUntil
            ]
            if let attendees = upcoming.attendees {
                upcomingDict["attendees"] = attendees
            }
            if let notes = upcoming.notes {
                upcomingDict["notes"] = notes
            }
            context["upcomingEvent"] = upcomingDict
        }

        if let current = currentMeeting {
            context["currentMeeting"] = [
                "title": current.title,
                "remainingMinutes": Int(current.endDate.timeIntervalSince(Date()) / 60)
            ]
        }

        return context
    }
}

// MARK: - Calendar Event Model

struct CalendarEvent: Identifiable, Codable {
    let id: String
    let title: String
    let startDate: Date
    let endDate: Date
    let isAllDay: Bool
    let location: String?
    let notes: String?
    let attendees: [String]?
    let calendarTitle: String?
    let calendarColor: String?

    init(from ekEvent: EKEvent) {
        self.id = ekEvent.eventIdentifier ?? UUID().uuidString
        self.title = ekEvent.title ?? "Untitled"
        self.startDate = ekEvent.startDate
        self.endDate = ekEvent.endDate
        self.isAllDay = ekEvent.isAllDay
        self.location = ekEvent.location
        self.notes = ekEvent.notes
        self.attendees = ekEvent.attendees?.compactMap { $0.name ?? $0.url.absoluteString }
        self.calendarTitle = ekEvent.calendar?.title
        self.calendarColor = ekEvent.calendar?.cgColor?.hexString
    }

    /// Duration in minutes
    var durationMinutes: Int {
        Int(endDate.timeIntervalSince(startDate) / 60)
    }

    /// Time until event starts (negative if already started)
    var minutesUntilStart: Int {
        Int(startDate.timeIntervalSince(Date()) / 60)
    }

    /// Whether the event is happening now
    var isNow: Bool {
        let now = Date()
        return startDate <= now && endDate > now
    }

    /// Human-readable time range
    var timeRange: String {
        let formatter = DateFormatter()
        formatter.dateStyle = .none
        formatter.timeStyle = .short
        return "\(formatter.string(from: startDate)) - \(formatter.string(from: endDate))"
    }
}

// MARK: - Calendar Error

enum CalendarError: Error, LocalizedError {
    case notAuthorized
    case saveFailed(String)
    case notFound

    var errorDescription: String? {
        switch self {
        case .notAuthorized:
            return "Calendar access not authorized"
        case .saveFailed(let reason):
            return "Failed to save event: \(reason)"
        case .notFound:
            return "Event not found"
        }
    }
}

// MARK: - CGColor Extension

extension CGColor {
    var hexString: String? {
        guard let components = components, components.count >= 3 else { return nil }
        let r = Int(components[0] * 255)
        let g = Int(components[1] * 255)
        let b = Int(components[2] * 255)
        return String(format: "#%02X%02X%02X", r, g, b)
    }
}

// MARK: - NSWorkspace Import

import AppKit
