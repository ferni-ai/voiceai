import Foundation
import UserNotifications
import AppKit

// MARK: - Notification Service
/// Rich actionable notifications for Ferni
/// Supports check-ins, insights, meeting prep, and quick replies

class NotificationService: NSObject, ObservableObject {

    // MARK: - Singleton

    static let shared = NotificationService()

    // MARK: - Published State

    /// Whether notifications are enabled
    @Published private(set) var isAuthorized: Bool = false

    /// Pending notifications
    @Published private(set) var pendingCount: Int = 0

    // MARK: - Notification Categories

    static let categoryCheckIn = "FERNI_CHECKIN"
    static let categoryInsight = "FERNI_INSIGHT"
    static let categoryMeetingPrep = "FERNI_MEETING"
    static let categoryReminder = "FERNI_REMINDER"
    static let categoryBreak = "FERNI_BREAK"

    // MARK: - Actions

    static let actionStartChat = "START_CHAT"
    static let actionRemindLater = "REMIND_LATER"
    static let actionDismiss = "DISMISS"
    static let actionTellMore = "TELL_MORE"
    static let actionThanks = "THANKS"
    static let actionQuickPrep = "QUICK_PREP"
    static let actionSkip = "SKIP"
    static let actionTakeBreak = "TAKE_BREAK"

    // MARK: - Callbacks

    var onStartChat: (() -> Void)?
    var onTellMore: ((String) -> Void)?  // Passes insight ID
    var onQuickPrep: ((String) -> Void)?  // Passes meeting ID
    var onTakeBreak: (() -> Void)?

    // MARK: - Initialization

    private override init() {
        super.init()
        setupNotificationCategories()
        checkAuthorization()
    }

    // MARK: - Setup

    private func setupNotificationCategories() {
        let center = UNUserNotificationCenter.current()
        center.delegate = self

        // Check-in category
        let checkInActions = [
            UNNotificationAction(
                identifier: Self.actionStartChat,
                title: "Start Chat",
                options: [.foreground]
            ),
            UNNotificationAction(
                identifier: Self.actionRemindLater,
                title: "Remind Later",
                options: []
            ),
            UNNotificationAction(
                identifier: Self.actionDismiss,
                title: "Not Today",
                options: [.destructive]
            )
        ]

        let checkInCategory = UNNotificationCategory(
            identifier: Self.categoryCheckIn,
            actions: checkInActions,
            intentIdentifiers: [],
            options: []
        )

        // Insight category
        let insightActions = [
            UNNotificationAction(
                identifier: Self.actionTellMore,
                title: "Tell Me More",
                options: [.foreground]
            ),
            UNNotificationAction(
                identifier: Self.actionThanks,
                title: "Thanks!",
                options: []
            )
        ]

        let insightCategory = UNNotificationCategory(
            identifier: Self.categoryInsight,
            actions: insightActions,
            intentIdentifiers: [],
            options: []
        )

        // Meeting prep category
        let meetingActions = [
            UNNotificationAction(
                identifier: Self.actionQuickPrep,
                title: "Quick Prep",
                options: [.foreground]
            ),
            UNNotificationAction(
                identifier: Self.actionSkip,
                title: "Skip",
                options: []
            )
        ]

        let meetingCategory = UNNotificationCategory(
            identifier: Self.categoryMeetingPrep,
            actions: meetingActions,
            intentIdentifiers: [],
            options: []
        )

        // Break reminder category
        let breakActions = [
            UNNotificationAction(
                identifier: Self.actionTakeBreak,
                title: "Take Break",
                options: [.foreground]
            ),
            UNNotificationAction(
                identifier: Self.actionRemindLater,
                title: "5 More Minutes",
                options: []
            )
        ]

        let breakCategory = UNNotificationCategory(
            identifier: Self.categoryBreak,
            actions: breakActions,
            intentIdentifiers: [],
            options: []
        )

        // Simple reminder category
        let reminderActions = [
            UNNotificationAction(
                identifier: Self.actionDismiss,
                title: "Got It",
                options: []
            ),
            UNNotificationAction(
                identifier: Self.actionRemindLater,
                title: "Remind Later",
                options: []
            )
        ]

        let reminderCategory = UNNotificationCategory(
            identifier: Self.categoryReminder,
            actions: reminderActions,
            intentIdentifiers: [],
            options: []
        )

        center.setNotificationCategories([
            checkInCategory,
            insightCategory,
            meetingCategory,
            breakCategory,
            reminderCategory
        ])
    }

    // MARK: - Authorization

    func checkAuthorization() {
        UNUserNotificationCenter.current().getNotificationSettings { [weak self] settings in
            DispatchQueue.main.async {
                self?.isAuthorized = settings.authorizationStatus == .authorized
            }
        }
    }

    @MainActor
    func requestAuthorization() async -> Bool {
        do {
            let granted = try await UNUserNotificationCenter.current().requestAuthorization(
                options: [.alert, .sound, .badge]
            )
            isAuthorized = granted
            return granted
        } catch {
            print("[Notifications] Authorization error: \(error)")
            return false
        }
    }

    func openNotificationSettings() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.notifications") {
            NSWorkspace.shared.open(url)
        }
    }

    // MARK: - Check-in Notifications

    /// Schedule a check-in prompt
    func scheduleCheckIn(at date: Date, message: String? = nil) {
        guard isAuthorized else { return }

        let content = UNMutableNotificationContent()
        content.title = "Ferni"
        content.body = message ?? "Hey! How are you doing today?"
        content.sound = .default
        content.categoryIdentifier = Self.categoryCheckIn

        let components = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: date)
        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)

        let request = UNNotificationRequest(
            identifier: "checkin-\(date.timeIntervalSince1970)",
            content: content,
            trigger: trigger
        )

        UNUserNotificationCenter.current().add(request) { error in
            if let error = error {
                print("[Notifications] Failed to schedule check-in: \(error)")
            }
        }
    }

    /// Send an immediate check-in prompt
    func sendCheckInNow(message: String? = nil) {
        guard isAuthorized else { return }

        let content = UNMutableNotificationContent()
        content.title = "Ferni"
        content.body = message ?? "Got a minute? I'd love to catch up."
        content.sound = .default
        content.categoryIdentifier = Self.categoryCheckIn

        let request = UNNotificationRequest(
            identifier: "checkin-now-\(Date().timeIntervalSince1970)",
            content: content,
            trigger: nil  // Immediate
        )

        UNUserNotificationCenter.current().add(request)
    }

    // MARK: - Insight Notifications

    /// Send a proactive insight notification
    func sendInsight(_ insight: String, id: String = UUID().uuidString, title: String = "Ferni noticed something") {
        guard isAuthorized else { return }

        let content = UNMutableNotificationContent()
        content.title = title
        content.body = insight
        content.sound = .default
        content.categoryIdentifier = Self.categoryInsight
        content.userInfo = ["insightId": id]

        let request = UNNotificationRequest(
            identifier: "insight-\(id)",
            content: content,
            trigger: nil
        )

        UNUserNotificationCenter.current().add(request)
    }

    /// Send time-sensitive notification (breaks through Focus)
    func sendTimeSensitive(_ title: String, body: String) {
        guard isAuthorized else { return }

        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.interruptionLevel = .timeSensitive

        let request = UNNotificationRequest(
            identifier: "urgent-\(Date().timeIntervalSince1970)",
            content: content,
            trigger: nil
        )

        UNUserNotificationCenter.current().add(request)
    }

    // MARK: - Meeting Prep Notifications

    /// Notify about upcoming meeting with prep option
    func sendMeetingPrep(
        meetingTitle: String,
        inMinutes: Int,
        meetingId: String,
        attendees: [String]? = nil
    ) {
        guard isAuthorized else { return }

        let content = UNMutableNotificationContent()
        content.title = "Meeting in \(inMinutes) min"

        var body = meetingTitle
        if let attendees = attendees, !attendees.isEmpty {
            let names = attendees.prefix(2).joined(separator: ", ")
            let more = attendees.count > 2 ? " + \(attendees.count - 2) more" : ""
            body += "\nWith \(names)\(more)"
        }
        content.body = body
        content.sound = .default
        content.categoryIdentifier = Self.categoryMeetingPrep
        content.userInfo = ["meetingId": meetingId]

        // Schedule for the right time before meeting
        let trigger = UNTimeIntervalNotificationTrigger(
            timeInterval: TimeInterval(max(1, (inMinutes - 15) * 60)),
            repeats: false
        )

        let request = UNNotificationRequest(
            identifier: "meeting-\(meetingId)",
            content: content,
            trigger: inMinutes <= 15 ? nil : trigger  // Immediate if <= 15 min
        )

        UNUserNotificationCenter.current().add(request)
    }

    // MARK: - Break Reminders

    /// Remind user to take a break
    func sendBreakReminder(afterMinutes: Int, currentApp: String? = nil) {
        guard isAuthorized else { return }

        let content = UNMutableNotificationContent()
        content.title = "Time for a break?"

        if let app = currentApp {
            content.body = "You've been in \(app) for \(afterMinutes) minutes. A quick stretch might help!"
        } else {
            content.body = "You've been at the screen for a while. How about a short break?"
        }
        content.sound = .default
        content.categoryIdentifier = Self.categoryBreak

        let request = UNNotificationRequest(
            identifier: "break-\(Date().timeIntervalSince1970)",
            content: content,
            trigger: nil
        )

        UNUserNotificationCenter.current().add(request)
    }

    // MARK: - General Reminders

    /// Send a simple reminder
    func sendReminder(_ message: String, at date: Date? = nil, id: String = UUID().uuidString) {
        guard isAuthorized else { return }

        let content = UNMutableNotificationContent()
        content.title = "Reminder"
        content.body = message
        content.sound = .default
        content.categoryIdentifier = Self.categoryReminder

        var trigger: UNNotificationTrigger? = nil
        if let date = date {
            let components = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: date)
            trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
        }

        let request = UNNotificationRequest(
            identifier: "reminder-\(id)",
            content: content,
            trigger: trigger
        )

        UNUserNotificationCenter.current().add(request)
    }

    // MARK: - Birthday Notifications

    /// Notify about upcoming birthday
    func sendBirthdayReminder(name: String, daysUntil: Int) {
        guard isAuthorized else { return }

        let content = UNMutableNotificationContent()

        if daysUntil == 0 {
            content.title = "Birthday Today! 🎂"
            content.body = "It's \(name)'s birthday! Want to send a message?"
        } else if daysUntil == 1 {
            content.title = "Birthday Tomorrow"
            content.body = "\(name)'s birthday is tomorrow. Time to plan something?"
        } else {
            content.title = "Upcoming Birthday"
            content.body = "\(name)'s birthday is in \(daysUntil) days"
        }

        content.sound = .default
        content.categoryIdentifier = Self.categoryInsight
        content.interruptionLevel = daysUntil == 0 ? .timeSensitive : .active

        let request = UNNotificationRequest(
            identifier: "birthday-\(name)-\(daysUntil)",
            content: content,
            trigger: nil
        )

        UNUserNotificationCenter.current().add(request)
    }

    // MARK: - Location Notifications

    /// Notify when arriving at a location
    func sendLocationArrival(place: String) {
        guard isAuthorized else { return }

        let content = UNMutableNotificationContent()
        content.title = "Welcome to \(place)"
        content.body = "Need anything while you're here?"
        content.sound = .default
        content.categoryIdentifier = Self.categoryCheckIn

        let request = UNNotificationRequest(
            identifier: "location-\(place)-\(Date().timeIntervalSince1970)",
            content: content,
            trigger: nil
        )

        UNUserNotificationCenter.current().add(request)
    }

    // MARK: - Grouped Summary

    /// Send a grouped summary of insights
    func sendGroupedSummary(_ insights: [String], title: String = "Today's Insights") {
        guard isAuthorized, !insights.isEmpty else { return }

        let content = UNMutableNotificationContent()
        content.title = title
        content.body = insights.count == 1 ? insights[0] : "\(insights.count) insights ready"
        content.sound = .default
        content.categoryIdentifier = Self.categoryInsight
        content.threadIdentifier = "daily-summary"

        let request = UNNotificationRequest(
            identifier: "summary-\(Date().timeIntervalSince1970)",
            content: content,
            trigger: nil
        )

        UNUserNotificationCenter.current().add(request)
    }

    // MARK: - Management

    /// Cancel a scheduled notification
    func cancelNotification(identifier: String) {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [identifier])
    }

    /// Cancel all pending notifications
    func cancelAllPending() {
        UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
    }

    /// Update pending count
    func updatePendingCount() {
        UNUserNotificationCenter.current().getPendingNotificationRequests { [weak self] requests in
            DispatchQueue.main.async {
                self?.pendingCount = requests.count
            }
        }
    }
}

// MARK: - UNUserNotificationCenterDelegate

extension NotificationService: UNUserNotificationCenterDelegate {

    /// Handle notification when app is in foreground
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        // Show notifications even when app is open (as banner)
        return [.banner, .sound]
    }

    /// Handle notification action
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        let actionId = response.actionIdentifier
        let userInfo = response.notification.request.content.userInfo

        switch actionId {
        case Self.actionStartChat, UNNotificationDefaultActionIdentifier:
            await MainActor.run {
                onStartChat?()
            }

        case Self.actionTellMore:
            if let insightId = userInfo["insightId"] as? String {
                await MainActor.run {
                    onTellMore?(insightId)
                }
            }

        case Self.actionQuickPrep:
            if let meetingId = userInfo["meetingId"] as? String {
                await MainActor.run {
                    onQuickPrep?(meetingId)
                }
            }

        case Self.actionTakeBreak:
            await MainActor.run {
                onTakeBreak?()
            }

        case Self.actionRemindLater:
            // Reschedule for 30 minutes later
            let content = response.notification.request.content
            let newContent = UNMutableNotificationContent()
            newContent.title = content.title
            newContent.body = content.body
            newContent.sound = content.sound
            newContent.categoryIdentifier = content.categoryIdentifier

            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 30 * 60, repeats: false)
            let request = UNNotificationRequest(
                identifier: response.notification.request.identifier + "-rescheduled",
                content: newContent,
                trigger: trigger
            )
            try? await center.add(request)

        case Self.actionDismiss, Self.actionSkip, Self.actionThanks:
            // Just dismiss, no action needed
            break

        default:
            break
        }
    }
}
