import Foundation
import Combine

// MARK: - System Intelligence Manager
/// Aggregates all system intelligence services and provides unified context
/// This is the single source of truth for macOS-native capabilities

class SystemIntelligenceManager: ObservableObject {

    // MARK: - Singleton

    static let shared = SystemIntelligenceManager()

    // MARK: - Services

    let contextService: ContextAwarenessService
    let calendarService: CalendarService
    let focusModeService: FocusModeService
    let shortcutsService: ShortcutsService
    let contactsService: ContactsService
    let locationService: LocationService
    let screenTimeService: ScreenTimeService
    let notificationService: NotificationService
    let handoffService: HandoffService

    // Lazy services (require user action or macOS 12.3+)
    private var _visionService: Any?
    @available(macOS 12.3, *)
    var visionService: VisionService {
        if _visionService == nil {
            _visionService = VisionService()
        }
        return _visionService as! VisionService
    }

    let naturalLanguageService = NaturalLanguageService.shared

    // MARK: - Published State

    /// Combined context summary for display
    @Published private(set) var contextSummary: String = ""

    /// All active insights
    @Published private(set) var activeInsights: [SystemInsight] = []

    /// Whether any service needs permission
    @Published private(set) var needsPermissions: Bool = false

    /// Aggregated context for sending to agent
    @Published private(set) var aggregatedContext: MacOSContext?

    /// Last captured context snapshot
    @Published private(set) var lastContextSnapshot: ContextSnapshot?

    /// Upcoming birthdays
    @Published private(set) var upcomingBirthdays: [ContactInfo] = []

    /// Current location/place
    @Published private(set) var currentPlace: String?

    /// Whether user needs a break
    @Published private(set) var needsBreak: Bool = false

    // MARK: - Private Properties

    private var cancellables = Set<AnyCancellable>()
    private var contextUpdateTimer: Timer?

    // MARK: - Initialization

    private init() {
        self.contextService = ContextAwarenessService()
        self.calendarService = CalendarService()
        self.focusModeService = FocusModeService()
        self.shortcutsService = ShortcutsService()
        self.contactsService = ContactsService()
        self.locationService = LocationService()
        self.screenTimeService = ScreenTimeService()
        self.notificationService = NotificationService.shared
        self.handoffService = HandoffService.shared

        setupBindings()
        startContextUpdates()
        setupNotificationHandlers()
    }

    /// For testing with injected services
    init(
        context: ContextAwarenessService,
        calendar: CalendarService,
        focus: FocusModeService,
        shortcuts: ShortcutsService,
        contacts: ContactsService? = nil,
        location: LocationService? = nil,
        screenTime: ScreenTimeService? = nil
    ) {
        self.contextService = context
        self.calendarService = calendar
        self.focusModeService = focus
        self.shortcutsService = shortcuts
        self.contactsService = contacts ?? ContactsService()
        self.locationService = location ?? LocationService()
        self.screenTimeService = screenTime ?? ScreenTimeService()
        self.notificationService = NotificationService.shared
        self.handoffService = HandoffService.shared

        setupBindings()
        startContextUpdates()
    }

    deinit {
        contextUpdateTimer?.invalidate()
    }

    // MARK: - Setup

    private func setupBindings() {
        // Watch for context changes
        contextService.$activeApp
            .combineLatest(contextService.$activeWindowTitle)
            .sink { [weak self] _, _ in
                self?.updateAggregatedContext()
                self?.lastContextSnapshot = self?.contextService.captureContextSnapshot()
            }
            .store(in: &cancellables)

        // Watch for calendar changes
        calendarService.$upcomingEvent
            .combineLatest(calendarService.$isInMeeting)
            .sink { [weak self] _, _ in
                self?.updateAggregatedContext()
                self?.checkForInsights()
            }
            .store(in: &cancellables)

        // Watch for focus changes
        focusModeService.$isFocused
            .sink { [weak self] _ in
                self?.updateAggregatedContext()
            }
            .store(in: &cancellables)

        // Watch for contacts changes (birthdays)
        contactsService.$upcomingBirthdays
            .sink { [weak self] birthdays in
                self?.upcomingBirthdays = birthdays
                self?.checkForBirthdayInsights()
            }
            .store(in: &cancellables)

        // Watch for location changes
        locationService.$currentPlace
            .sink { [weak self] place in
                self?.currentPlace = place
                self?.updateAggregatedContext()
            }
            .store(in: &cancellables)

        // Watch for screen time break needs
        screenTimeService.$needsBreak
            .sink { [weak self] needs in
                self?.needsBreak = needs
                if needs {
                    self?.sendBreakReminder()
                }
            }
            .store(in: &cancellables)

        // Check permissions status
        Publishers.CombineLatest4(
            contextService.$hasAccessibilityPermission,
            calendarService.$hasAccess,
            contactsService.$hasAccess,
            locationService.$hasAccess
        )
        .map { accessibility, calendar, contacts, location in
            !accessibility || !calendar  // Core permissions
        }
        .assign(to: &$needsPermissions)
    }

    private func setupNotificationHandlers() {
        // Wire up notification callbacks
        notificationService.onStartChat = { [weak self] in
            // Trigger voice session start
            NotificationCenter.default.post(name: .startFerniSession, object: nil)
        }

        notificationService.onTakeBreak = { [weak self] in
            // Could show a break activity
            print("[Intelligence] User taking break")
        }

        // Location arrival notifications
        NotificationCenter.default.addObserver(
            forName: .didEnterPlace,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            if let place = notification.userInfo?["place"] as? String {
                self?.notificationService.sendLocationArrival(place: place)
            }
        }
    }

    private func checkForBirthdayInsights() {
        for contact in upcomingBirthdays.prefix(3) {
            if contact.daysUntilBirthday == 0 || contact.daysUntilBirthday == 1 {
                activeInsights.append(SystemInsight(
                    type: .birthdayToday,
                    priority: contact.daysUntilBirthday == 0 ? .high : .normal,
                    title: contact.daysUntilBirthday == 0 ? "Birthday Today!" : "Birthday Tomorrow",
                    message: "\(contact.name)'s birthday",
                    actionable: true
                ))

                // Send notification
                notificationService.sendBirthdayReminder(
                    name: contact.name,
                    daysUntil: contact.daysUntilBirthday ?? 0
                )
            }
        }
    }

    private func sendBreakReminder() {
        guard focusModeService.shouldInterrupt(for: .normal) else { return }
        notificationService.sendBreakReminder(
            afterMinutes: screenTimeService.currentAppSessionMinutes,
            currentApp: screenTimeService.currentApp
        )
    }

    private func startContextUpdates() {
        // Update context summary every 5 seconds
        contextUpdateTimer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
            self?.updateContextSummary()
            self?.updateAggregatedContext()
        }

        // Initial update
        updateContextSummary()
        updateAggregatedContext()
    }

    // MARK: - Context Aggregation

    /// Update the human-readable context summary
    private func updateContextSummary() {
        var parts: [String] = []

        // Context awareness
        if !contextService.activeApp.isEmpty {
            parts.append("App: \(contextService.activeApp)")
        }

        // Calendar
        if let upcoming = calendarService.upcomingEvent {
            let mins = upcoming.minutesUntilStart
            parts.append("Next: \(upcoming.title) in \(mins)m")
        }

        // Focus
        if focusModeService.isFocused {
            parts.append("Focus: \(focusModeService.focusModeName ?? "Active")")
        }

        // Location
        if let place = currentPlace {
            parts.append("At: \(place)")
        }

        // Screen time
        if needsBreak {
            parts.append("Break suggested")
        }

        // Birthdays
        if let birthday = upcomingBirthdays.first, birthday.daysUntilBirthday == 0 {
            parts.append("🎂 \(birthday.name)'s birthday!")
        }

        contextSummary = parts.joined(separator: " | ")
    }

    /// Update the aggregated context for agent transmission
    private func updateAggregatedContext() {
        let snapshot = contextService.captureContextSnapshot()
        lastContextSnapshot = snapshot

        var macOSContext = MacOSContext(
            activeApp: snapshot.activeApp,
            windowTitle: snapshot.windowTitle,
            selectedText: snapshot.selectedText,
            todaysEventCount: calendarService.todaysEventCount,
            isFocused: focusModeService.isFocused,
            focusMode: focusModeService.focusModeName,
            timestamp: Date()
        )

        // Add upcoming event if present
        if let upcoming = calendarService.upcomingEvent {
            macOSContext.upcomingEvent = MacOSContext.UpcomingEvent(
                title: upcoming.title,
                inMinutes: upcoming.minutesUntilStart,
                attendees: upcoming.attendees,
                notes: upcoming.notes
            )
        }

        // Add location if available
        if let place = currentPlace {
            macOSContext.location = place
        }

        // Add top app from screen time
        if let topApp = screenTimeService.topApps.first {
            macOSContext.topApp = MacOSContext.TopApp(
                name: topApp.app,
                minutesToday: topApp.minutes
            )
        }

        aggregatedContext = macOSContext
    }

    // MARK: - Insights

    private func checkForInsights() {
        var insights: [SystemInsight] = []

        // Meeting approaching
        if let upcoming = calendarService.upcomingEvent {
            let mins = upcoming.minutesUntilStart
            if mins <= 15 && mins > 0 {
                insights.append(SystemInsight(
                    type: .meetingApproaching,
                    priority: mins <= 5 ? .high : .normal,
                    title: "Meeting in \(mins) minutes",
                    message: "\"\(upcoming.title)\" starts soon",
                    actionable: true
                ))

                // Also send a notification
                notificationService.sendMeetingPrep(
                    meetingTitle: upcoming.title,
                    inMinutes: mins,
                    meetingId: upcoming.id,
                    attendees: upcoming.attendees
                )
            }
        }

        // Currently in meeting
        if calendarService.isInMeeting, let current = calendarService.currentMeeting {
            insights.append(SystemInsight(
                type: .inMeeting,
                priority: .low,
                title: "In meeting",
                message: current.title,
                actionable: false
            ))
        }

        // Combine with existing insights (birthdays, etc.)
        let nonMeetingInsights = activeInsights.filter {
            $0.type != .meetingApproaching && $0.type != .inMeeting
        }
        activeInsights = insights + nonMeetingInsights
    }

    // MARK: - Permission Requests

    /// Request all permissions at once
    @MainActor
    func requestAllPermissions() async {
        // Request accessibility
        if !contextService.hasAccessibilityPermission {
            contextService.requestAccessibilityPermission()
        }

        // Request calendar
        if !calendarService.hasAccess {
            _ = await calendarService.requestAccess()
        }

        // Request contacts
        if !contactsService.hasAccess {
            _ = await contactsService.requestAccess()
        }

        // Request notifications
        if !notificationService.isAuthorized {
            _ = await notificationService.requestAuthorization()
        }

        // Location - only request when needed
        if !locationService.hasAccess {
            locationService.requestAccess()
        }

        // Focus doesn't require explicit permission
    }

    /// Get a summary of permission statuses
    func getPermissionStatus() -> PermissionStatus {
        return PermissionStatus(
            accessibility: contextService.hasAccessibilityPermission,
            calendar: calendarService.hasAccess,
            focus: focusModeService.hasPermission,
            contacts: contactsService.hasAccess,
            location: locationService.hasAccess,
            notifications: notificationService.isAuthorized
        )
    }

    // MARK: - Context Export

    /// Get the full context as a dictionary for data channel
    func getContextDictionary() -> [String: Any] {
        var dict: [String: Any] = [:]

        // Context awareness
        dict["activeApp"] = contextService.activeApp
        dict["windowTitle"] = contextService.activeWindowTitle
        if let text = contextService.selectedText {
            dict["selectedText"] = text
        }

        // Calendar
        dict["todaysEventCount"] = calendarService.todaysEventCount
        dict["isInMeeting"] = calendarService.isInMeeting
        if let upcoming = calendarService.upcomingEvent {
            dict["upcomingEvent"] = [
                "title": upcoming.title,
                "inMinutes": upcoming.minutesUntilStart,
                "attendees": upcoming.attendees ?? []
            ]
        }

        // Focus
        dict["isFocused"] = focusModeService.isFocused
        if let focusMode = focusModeService.focusModeName {
            dict["focusMode"] = focusMode
        }

        // Contacts (birthdays)
        if !upcomingBirthdays.isEmpty {
            dict["upcomingBirthdays"] = upcomingBirthdays.prefix(5).map { [
                "name": $0.name,
                "daysUntil": $0.daysUntilBirthday ?? 0
            ] }
        }

        // Location
        if let place = currentPlace {
            dict["location"] = place
        }

        // Screen time
        dict["totalMinutesToday"] = screenTimeService.totalScreenTimeMinutes
        if let topApp = screenTimeService.topApps.first {
            dict["topApp"] = [
                "name": topApp.app,
                "minutesToday": topApp.minutes
            ]
        }
        if needsBreak {
            dict["needsBreak"] = true
            dict["currentSessionMinutes"] = screenTimeService.currentAppSessionMinutes
        }

        dict["timestamp"] = Date().timeIntervalSince1970

        return dict
    }

    /// Get context as JSON data for transmission
    func getContextJSON() -> Data? {
        guard let context = aggregatedContext else { return nil }
        return try? JSONEncoder().encode(context)
    }

    /// Generate human-readable context for the agent
    func generateAgentContext() -> String {
        var parts: [String] = []

        // Context
        let contextString = contextService.captureContextSnapshot().toContextString()
        if !contextString.isEmpty {
            parts.append(contextString)
        }

        // Calendar
        let calendarString = calendarService.generateContextString()
        if !calendarString.isEmpty {
            parts.append(calendarString)
        }

        // Focus
        let focusString = focusModeService.generateContextString()
        if !focusString.isEmpty {
            parts.append(focusString)
        }

        // Contacts
        let contactsString = contactsService.generateContextString()
        if !contactsString.isEmpty {
            parts.append(contactsString)
        }

        // Location
        let locationString = locationService.generateContextString()
        if !locationString.isEmpty {
            parts.append(locationString)
        }

        // Screen time
        let screenTimeString = screenTimeService.generateContextString()
        if !screenTimeString.isEmpty {
            parts.append(screenTimeString)
        }

        return parts.joined(separator: "\n\n")
    }

    // MARK: - Shortcut Handlers

    /// Set up shortcut handlers with callbacks
    func setupShortcutHandlers(
        onStart: @escaping (String) -> Void,
        onEnd: @escaping () -> Void,
        onSwitch: @escaping (String) -> Void,
        onHelpMe: @escaping () -> Void
    ) {
        shortcutsService.onStartSession = onStart
        shortcutsService.onEndSession = onEnd
        shortcutsService.onSwitchPersona = onSwitch
        shortcutsService.onHelpMeWithThis = onHelpMe
    }

    // MARK: - Handoff Support

    /// Advertise current conversation for handoff
    func advertiseConversation(personaId: String, personaName: String, conversationId: String? = nil) {
        handoffService.advertiseConversation(
            personaId: personaId,
            personaName: personaName,
            conversationId: conversationId
        )
    }

    /// Stop advertising activities
    func stopAdvertising() {
        handoffService.stopAdvertising()
    }
}

// MARK: - Notification Name Extension

extension Notification.Name {
    static let startFerniSession = Notification.Name("com.ferni.voice.startSession")
}

// MARK: - MacOS Context (for JSON encoding)

struct MacOSContext: Codable {
    var activeApp: String
    var windowTitle: String
    var selectedText: String?
    var upcomingEvent: UpcomingEvent?
    var todaysEventCount: Int
    var isFocused: Bool
    var focusMode: String?
    var location: String?
    var topApp: TopApp?
    var timestamp: Date

    struct UpcomingEvent: Codable {
        let title: String
        let inMinutes: Int
        let attendees: [String]?
        let notes: String?
    }

    struct TopApp: Codable {
        let name: String
        let minutesToday: Int
    }

    /// Convert to data channel message format
    func toDataChannelMessage() -> [String: Any] {
        var payload: [String: Any] = [
            "activeApp": activeApp,
            "windowTitle": windowTitle,
            "todaysEventCount": todaysEventCount,
            "isFocused": isFocused
        ]

        if let text = selectedText {
            payload["selectedText"] = text
        }

        if let event = upcomingEvent {
            var eventDict: [String: Any] = [
                "title": event.title,
                "inMinutes": event.inMinutes
            ]
            if let attendees = event.attendees {
                eventDict["attendees"] = attendees
            }
            if let notes = event.notes {
                eventDict["notes"] = notes
            }
            payload["upcomingEvent"] = eventDict
        }

        if let mode = focusMode {
            payload["focusMode"] = mode
        }

        if let loc = location {
            payload["location"] = loc
        }

        if let top = topApp {
            payload["topApp"] = [
                "name": top.name,
                "minutesToday": top.minutesToday
            ]
        }

        return [
            "type": "macos_context",
            "payload": payload,
            "timestamp": timestamp.timeIntervalSince1970
        ]
    }
}

// MARK: - System Insight

struct SystemInsight: Identifiable {
    let id = UUID()
    let type: InsightType
    let priority: InsightPriority
    let title: String
    let message: String
    let actionable: Bool
    let timestamp: Date = Date()

    enum InsightType {
        case meetingApproaching
        case inMeeting
        case focusActive
        case patternDetected
        case reminderDue
        case birthdayToday
        case contextSwitch
    }
}

// MARK: - Permission Status

struct PermissionStatus {
    let accessibility: Bool
    let calendar: Bool
    let focus: Bool
    let contacts: Bool
    let location: Bool
    let notifications: Bool

    var allGranted: Bool {
        accessibility && calendar && focus && contacts && location && notifications
    }

    var coreGranted: Bool {
        accessibility && calendar
    }

    var grantedCount: Int {
        [accessibility, calendar, focus, contacts, location, notifications].filter { $0 }.count
    }

    var totalCount: Int { 6 }
}
