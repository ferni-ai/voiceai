import Foundation
import Intents
import Combine

// MARK: - Focus Mode Service
/// Detects and respects the user's Focus Mode settings
/// Adjusts Ferni's behavior to be less intrusive during focus time

class FocusModeService: ObservableObject {

    // MARK: - Published State

    /// Whether the user currently has a Focus Mode active
    @Published private(set) var isFocused: Bool = false

    /// Name of the current focus mode (if determinable)
    @Published private(set) var focusModeName: String?

    /// Whether we have permission to check focus status
    @Published private(set) var hasPermission: Bool = false

    /// Last check timestamp
    @Published private(set) var lastCheck: Date = Date()

    // MARK: - Private Properties

    private var checkTimer: Timer?
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Initialization

    init() {
        checkPermission()
        startMonitoring()
    }

    deinit {
        checkTimer?.invalidate()
    }

    // MARK: - Permission

    /// Check if we have focus status permission
    func checkPermission() {
        // Focus status is available without explicit permission in most cases
        // The system may prompt the user if needed
        hasPermission = true
    }

    /// Request focus status authorization
    func requestAuthorization() async {
        // INFocusStatusCenter doesn't require explicit authorization request
        // but we can check the status to trigger any needed prompts
        checkFocusStatus()
    }

    // MARK: - Monitoring

    /// Start monitoring focus status changes
    private func startMonitoring() {
        // Check every 10 seconds (Focus doesn't have a notification API)
        checkTimer = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in
            self?.checkFocusStatus()
        }

        // Initial check
        checkFocusStatus()
    }

    /// Check the current focus status
    func checkFocusStatus() {
        let center = INFocusStatusCenter.default

        // Request authorization if needed (this is a no-op if already authorized)
        center.requestAuthorization { [weak self] status in
            DispatchQueue.main.async {
                self?.hasPermission = (status == .authorized)
                self?.updateFocusStatus()
            }
        }
    }

    /// Update the focus status from the system
    private func updateFocusStatus() {
        let status = INFocusStatusCenter.default.focusStatus

        isFocused = status.isFocused ?? false
        lastCheck = Date()

        // Try to determine the focus mode name
        // Note: The system doesn't expose the focus mode name directly
        // We can only know if ANY focus is active
        if isFocused {
            focusModeName = determineFocusModeName()
        } else {
            focusModeName = nil
        }
    }

    /// Try to determine the focus mode name (heuristic)
    private func determineFocusModeName() -> String? {
        // Unfortunately, Apple doesn't expose the focus mode name
        // We can make educated guesses based on time of day
        let hour = Calendar.current.component(.hour, from: Date())

        switch hour {
        case 0...5:
            return "Sleep"
        case 6...8:
            return "Morning"
        case 9...17:
            return "Work"
        case 18...21:
            return "Personal"
        case 22...23:
            return "Wind Down"
        default:
            return "Focus"
        }
    }

    // MARK: - Behavior Adjustments

    /// Get recommended behavior adjustments based on focus state
    func getBehaviorAdjustments() -> FocusBehavior {
        if isFocused {
            return FocusBehavior(
                shouldReduceNotifications: true,
                shouldSpeakQuietly: true,
                shouldDeferInsights: true,
                notificationPriority: .timeSensitive,
                volumeMultiplier: 0.7
            )
        } else {
            return FocusBehavior(
                shouldReduceNotifications: false,
                shouldSpeakQuietly: false,
                shouldDeferInsights: false,
                notificationPriority: .normal,
                volumeMultiplier: 1.0
            )
        }
    }

    /// Check if we should interrupt the user
    func shouldInterrupt(for priority: InsightPriority) -> Bool {
        if !isFocused {
            return true  // Always allow when not focused
        }

        // During focus, only allow high priority
        switch priority {
        case .high, .urgent:
            return true
        case .normal, .low:
            return false
        }
    }

    // MARK: - Context Generation

    /// Generate context string for the agent
    func generateContextString() -> String {
        if isFocused {
            if let name = focusModeName {
                return "Focus Mode: \(name) (active)"
            } else {
                return "Focus Mode: Active"
            }
        }
        return ""
    }

    /// Get focus context for data channel
    func getFocusContext() -> [String: Any] {
        return [
            "isFocused": isFocused,
            "focusMode": focusModeName as Any
        ]
    }
}

// MARK: - Focus Behavior

struct FocusBehavior {
    /// Whether to reduce non-urgent notifications
    let shouldReduceNotifications: Bool

    /// Whether Ferni should speak more quietly
    let shouldSpeakQuietly: Bool

    /// Whether to defer non-urgent insights
    let shouldDeferInsights: Bool

    /// Notification priority level to use
    let notificationPriority: NotificationPriority

    /// Volume multiplier (0.0 - 1.0)
    let volumeMultiplier: Double
}

// MARK: - Notification Priority

enum NotificationPriority {
    case normal
    case timeSensitive
    case passive
}

// MARK: - Insight Priority

enum InsightPriority {
    case low       // Nice to know, can wait
    case normal    // Helpful, but not urgent
    case high      // Important, should see soon
    case urgent    // Critical, interrupt if needed
}
