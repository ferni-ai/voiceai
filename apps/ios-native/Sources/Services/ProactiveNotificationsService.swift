import Foundation
import UserNotifications
import os

/// Proactive Notifications Service for thoughtful, human-like check-ins
/// "Better Than Human" - notices patterns and reaches out at the right moments
@MainActor
final class ProactiveNotificationsService: NSObject, ObservableObject {
    static let shared = ProactiveNotificationsService()

    // MARK: - Published State

    @Published private(set) var isAuthorized: Bool = false
    @Published private(set) var lastCheckIn: Date?
    @Published private(set) var quietDays: Int = 0

    // MARK: - Notification Types

    enum NotificationType: String, CaseIterable {
        case morningCheckIn = "morning_checkin"
        case eveningReflection = "evening_reflection"
        case quietDayReachOut = "quiet_day"
        case stressDetected = "stress_detected"
        case celebrateMilestone = "milestone"
        case weeklyInsight = "weekly_insight"
        case gentleReminder = "gentle_reminder"
        case thinkingOfYou = "thinking_of_you"

        var category: String {
            switch self {
            case .morningCheckIn, .eveningReflection:
                return "ROUTINE"
            case .quietDayReachOut, .thinkingOfYou:
                return "CARE"
            case .stressDetected:
                return "SUPPORT"
            case .celebrateMilestone:
                return "CELEBRATE"
            case .weeklyInsight:
                return "INSIGHT"
            case .gentleReminder:
                return "REMINDER"
            }
        }
    }

    // MARK: - Message Templates (Warm, Human, Never Corporate)

    private let morningMessages = [
        "Good morning! How are you feeling today?",
        "Hey there. Ready to start the day?",
        "Morning! What's on your mind?",
        "Rise and shine. How'd you sleep?",
        "Good morning! Anything you want to talk through today?"
    ]

    private let eveningMessages = [
        "How was your day?",
        "Evening check-in: how are you doing?",
        "Winding down? I'm here if you want to chat.",
        "How are you feeling tonight?",
        "Anything on your mind before bed?"
    ]

    private let quietDayMessages = [
        "Hey, I noticed it's been a few days. Just checking in.",
        "Haven't heard from you in a bit. Everything okay?",
        "Just thinking of you. I'm here when you need me.",
        "It's been quiet lately. How are you doing?",
        "Checking in. No pressure, just wanted you to know I'm here."
    ]

    private let thinkingOfYouMessages = [
        "Just thinking of you today.",
        "Hey, you crossed my mind. Hope you're doing well.",
        "Random check-in: how are you?",
        "Sending a little hello your way.",
        "Hope your day is going okay."
    ]

    // MARK: - Private

    private let logger = Logger(subsystem: "com.ferni.FerniVoice", category: "Notifications")
    private let center = UNUserNotificationCenter.current()
    private let defaults = UserDefaults.standard

    // Keys for tracking
    private let lastOpenKey = "ferni_last_app_open"
    private let lastNotificationKey = "ferni_last_notification"
    private let morningEnabledKey = "ferni_morning_enabled"
    private let eveningEnabledKey = "ferni_evening_enabled"

    // MARK: - Initialization

    private override init() {
        super.init()
        center.delegate = self
        Task {
            await checkAuthorization()
            await updateQuietDays()
        }
    }

    // MARK: - Authorization

    func requestAuthorization() async -> Bool {
        do {
            let options: UNAuthorizationOptions = [.alert, .sound, .badge, .provisional]
            let granted = try await center.requestAuthorization(options: options)
            isAuthorized = granted

            if granted {
                logger.info("Notification authorization granted")
                await registerCategories()
                await scheduleRoutineNotifications()
            }

            return granted
        } catch {
            logger.error("Notification authorization failed: \(error.localizedDescription)")
            return false
        }
    }

    func checkAuthorization() async {
        let settings = await center.notificationSettings()
        isAuthorized = settings.authorizationStatus == .authorized ||
                       settings.authorizationStatus == .provisional
    }

    // MARK: - Notification Categories (Actions)

    private func registerCategories() async {
        // "Talk" action - opens the app to conversation
        let talkAction = UNNotificationAction(
            identifier: "TALK",
            title: "Talk to Ferni",
            options: [.foreground]
        )

        // "Later" action - snooze for 2 hours
        let laterAction = UNNotificationAction(
            identifier: "LATER",
            title: "Later",
            options: []
        )

        // "I'm okay" action - dismisses with acknowledgment
        let okayAction = UNNotificationAction(
            identifier: "OKAY",
            title: "I'm okay",
            options: []
        )

        // Categories
        let routineCategory = UNNotificationCategory(
            identifier: "ROUTINE",
            actions: [talkAction, laterAction],
            intentIdentifiers: []
        )

        let careCategory = UNNotificationCategory(
            identifier: "CARE",
            actions: [talkAction, okayAction],
            intentIdentifiers: []
        )

        let supportCategory = UNNotificationCategory(
            identifier: "SUPPORT",
            actions: [talkAction, okayAction],
            intentIdentifiers: []
        )

        let celebrateCategory = UNNotificationCategory(
            identifier: "CELEBRATE",
            actions: [talkAction],
            intentIdentifiers: []
        )

        center.setNotificationCategories([
            routineCategory, careCategory, supportCategory, celebrateCategory
        ])
    }

    // MARK: - Schedule Routine Notifications

    func scheduleRoutineNotifications() async {
        guard isAuthorized else { return }

        // Morning check-in (9 AM)
        if defaults.bool(forKey: morningEnabledKey) != false {  // Default true
            await scheduleMorningCheckIn()
        }

        // Evening reflection (8 PM)
        if defaults.bool(forKey: eveningEnabledKey) != false {  // Default true
            await scheduleEveningReflection()
        }
    }

    private func scheduleMorningCheckIn() async {
        let content = UNMutableNotificationContent()
        content.title = "Ferni"
        content.body = morningMessages.randomElement()!
        content.sound = .default
        content.categoryIdentifier = "ROUTINE"

        var dateComponents = DateComponents()
        dateComponents.hour = 9
        dateComponents.minute = 0

        let trigger = UNCalendarNotificationTrigger(dateMatching: dateComponents, repeats: true)
        let request = UNNotificationRequest(
            identifier: NotificationType.morningCheckIn.rawValue,
            content: content,
            trigger: trigger
        )

        do {
            try await center.add(request)
            logger.info("Scheduled morning check-in")
        } catch {
            logger.error("Failed to schedule morning: \(error.localizedDescription)")
        }
    }

    private func scheduleEveningReflection() async {
        let content = UNMutableNotificationContent()
        content.title = "Ferni"
        content.body = eveningMessages.randomElement()!
        content.sound = .default
        content.categoryIdentifier = "ROUTINE"

        var dateComponents = DateComponents()
        dateComponents.hour = 20
        dateComponents.minute = 0

        let trigger = UNCalendarNotificationTrigger(dateMatching: dateComponents, repeats: true)
        let request = UNNotificationRequest(
            identifier: NotificationType.eveningReflection.rawValue,
            content: content,
            trigger: trigger
        )

        do {
            try await center.add(request)
            logger.info("Scheduled evening reflection")
        } catch {
            logger.error("Failed to schedule evening: \(error.localizedDescription)")
        }
    }

    // MARK: - Proactive Notifications (Better Than Human)

    /// Check if we should send a "thinking of you" notification
    /// Called periodically or on background refresh
    func checkForProactiveNotification() async {
        await updateQuietDays()

        // Don't send too many notifications
        if let lastNotification = defaults.object(forKey: lastNotificationKey) as? Date {
            let hoursSinceLast = Date().timeIntervalSince(lastNotification) / 3600
            if hoursSinceLast < 12 {
                return  // Wait at least 12 hours between proactive notifications
            }
        }

        // Send "quiet day" notification after 2+ days of silence
        if quietDays >= 2 {
            await sendQuietDayNotification()
        }
    }

    private func sendQuietDayNotification() async {
        let content = UNMutableNotificationContent()
        content.title = "Ferni"
        content.body = quietDayMessages.randomElement()!
        content.sound = .default
        content.categoryIdentifier = "CARE"

        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
        let request = UNNotificationRequest(
            identifier: "\(NotificationType.quietDayReachOut.rawValue)_\(Date().timeIntervalSince1970)",
            content: content,
            trigger: trigger
        )

        do {
            try await center.add(request)
            defaults.set(Date(), forKey: lastNotificationKey)
            logger.info("Sent quiet day notification")
        } catch {
            logger.error("Failed to send quiet day notification: \(error.localizedDescription)")
        }
    }

    /// Send a stress-detected notification (called by HealthKit when HRV drops)
    func sendStressNotification() async {
        let content = UNMutableNotificationContent()
        content.title = "Ferni"
        content.body = "I noticed you might be stressed. Want to talk?"
        content.sound = .default
        content.categoryIdentifier = "SUPPORT"

        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
        let request = UNNotificationRequest(
            identifier: "\(NotificationType.stressDetected.rawValue)_\(Date().timeIntervalSince1970)",
            content: content,
            trigger: trigger
        )

        do {
            try await center.add(request)
            logger.info("Sent stress notification")
        } catch {
            logger.error("Failed to send stress notification: \(error.localizedDescription)")
        }
    }

    /// Send a milestone celebration notification
    func sendMilestoneNotification(milestone: String) async {
        let content = UNMutableNotificationContent()
        content.title = "Ferni"
        content.body = milestone
        content.sound = .default
        content.categoryIdentifier = "CELEBRATE"

        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
        let request = UNNotificationRequest(
            identifier: "\(NotificationType.celebrateMilestone.rawValue)_\(Date().timeIntervalSince1970)",
            content: content,
            trigger: trigger
        )

        do {
            try await center.add(request)
            logger.info("Sent milestone notification: \(milestone)")
        } catch {
            logger.error("Failed to send milestone notification: \(error.localizedDescription)")
        }
    }

    // MARK: - Tracking

    /// Call when app opens to track usage
    func trackAppOpen() {
        defaults.set(Date(), forKey: lastOpenKey)
        quietDays = 0
    }

    private func updateQuietDays() async {
        if let lastOpen = defaults.object(forKey: lastOpenKey) as? Date {
            let days = Calendar.current.dateComponents([.day], from: lastOpen, to: Date()).day ?? 0
            quietDays = days
        }
    }

    // MARK: - Settings

    func setMorningCheckInEnabled(_ enabled: Bool) async {
        defaults.set(enabled, forKey: morningEnabledKey)

        if enabled {
            await scheduleMorningCheckIn()
        } else {
            center.removePendingNotificationRequests(withIdentifiers: [NotificationType.morningCheckIn.rawValue])
        }
    }

    func setEveningReflectionEnabled(_ enabled: Bool) async {
        defaults.set(enabled, forKey: eveningEnabledKey)

        if enabled {
            await scheduleEveningReflection()
        } else {
            center.removePendingNotificationRequests(withIdentifiers: [NotificationType.eveningReflection.rawValue])
        }
    }

    var isMorningCheckInEnabled: Bool {
        defaults.bool(forKey: morningEnabledKey) != false  // Default true
    }

    var isEveningReflectionEnabled: Bool {
        defaults.bool(forKey: eveningEnabledKey) != false  // Default true
    }
}

// MARK: - UNUserNotificationCenterDelegate

extension ProactiveNotificationsService: UNUserNotificationCenterDelegate {
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        // Show notification even when app is in foreground
        return [.banner, .sound]
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        let actionIdentifier = response.actionIdentifier

        switch actionIdentifier {
        case "TALK":
            // App will open to conversation - handled by app delegate
            await MainActor.run {
                NotificationCenter.default.post(name: .startConversationFromNotification, object: nil)
            }

        case "LATER":
            // Snooze for 2 hours
            await snoozeNotification(response.notification)

        case "OKAY":
            // User said they're okay - just log it
            Task { @MainActor in
                self.logger.info("User responded 'I'm okay'")
            }

        default:
            break
        }
    }

    private func snoozeNotification(_ notification: UNNotification) async {
        let content = notification.request.content.mutableCopy() as! UNMutableNotificationContent

        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 7200, repeats: false)  // 2 hours
        let request = UNNotificationRequest(
            identifier: "snoozed_\(notification.request.identifier)",
            content: content,
            trigger: trigger
        )

        do {
            try await center.add(request)
        } catch {
            // Silently fail
        }
    }
}

// MARK: - Notification Names

extension Notification.Name {
    static let startConversationFromNotification = Notification.Name("startConversationFromNotification")
}
