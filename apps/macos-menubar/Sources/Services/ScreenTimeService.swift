import Foundation
import AppKit
import Combine

// MARK: - Screen Time Service
/// Tracks app usage patterns on macOS
/// Detects excessive usage and suggests breaks

class ScreenTimeService: ObservableObject {

    // MARK: - Published State

    /// App usage for today (app name -> minutes)
    @Published private(set) var appUsageToday: [String: TimeInterval] = [:]

    /// Top apps by usage today
    @Published private(set) var topApps: [(app: String, minutes: Int)] = []

    /// Currently focused app
    @Published private(set) var currentApp: String = ""

    /// Time spent in current app this session
    @Published private(set) var currentAppSessionMinutes: Int = 0

    /// Total screen time today (minutes)
    @Published private(set) var totalScreenTimeMinutes: Int = 0

    /// Whether user has been at screen for extended period
    @Published private(set) var needsBreak: Bool = false

    // MARK: - Private Properties

    private var currentAppStartTime: Date?
    private var lastSaveTime: Date = Date()
    private var workspaceObserver: NSObjectProtocol?
    private var updateTimer: Timer?
    private var cancellables = Set<AnyCancellable>()

    // Configuration
    private let breakSuggestionMinutes: Int = 90  // Suggest break after 90 min
    private let saveInterval: TimeInterval = 60   // Save every minute

    // MARK: - Initialization

    init() {
        loadTodayData()
        startTracking()
    }

    deinit {
        stopTracking()
    }

    // MARK: - Tracking

    private func startTracking() {
        // Track app activations
        workspaceObserver = NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didActivateApplicationNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            self?.handleAppActivation(notification)
        }

        // Update timer for current session tracking
        updateTimer = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in
            self?.updateCurrentSession()
        }

        // Initial app
        if let app = NSWorkspace.shared.frontmostApplication {
            switchToApp(app.localizedName ?? "Unknown")
        }
    }

    private func stopTracking() {
        if let observer = workspaceObserver {
            NSWorkspace.shared.notificationCenter.removeObserver(observer)
        }
        updateTimer?.invalidate()
        saveData()
    }

    private func handleAppActivation(_ notification: Notification) {
        guard let app = notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication,
              let appName = app.localizedName else { return }

        switchToApp(appName)
    }

    private func switchToApp(_ newApp: String) {
        let now = Date()

        // Record time in previous app
        if !currentApp.isEmpty, let startTime = currentAppStartTime {
            let duration = now.timeIntervalSince(startTime)
            addUsage(for: currentApp, duration: duration)
        }

        // Start tracking new app
        currentApp = newApp
        currentAppStartTime = now
        currentAppSessionMinutes = 0
    }

    private func updateCurrentSession() {
        guard let startTime = currentAppStartTime else { return }

        let sessionDuration = Date().timeIntervalSince(startTime)
        currentAppSessionMinutes = Int(sessionDuration / 60)

        // Check if break is needed
        needsBreak = currentAppSessionMinutes >= breakSuggestionMinutes

        // Periodic save
        if Date().timeIntervalSince(lastSaveTime) >= saveInterval {
            // Add current session to totals
            addUsage(for: currentApp, duration: sessionDuration)
            currentAppStartTime = Date()  // Reset for next interval
            lastSaveTime = Date()
            saveData()
        }

        updateTopApps()
        updateTotalScreenTime()
    }

    // MARK: - Usage Tracking

    private func addUsage(for app: String, duration: TimeInterval) {
        let minutes = duration / 60
        appUsageToday[app, default: 0] += minutes
    }

    private func updateTopApps() {
        topApps = appUsageToday
            .map { (app: $0.key, minutes: Int($0.value)) }
            .sorted { $0.minutes > $1.minutes }
            .prefix(5)
            .map { $0 }
    }

    private func updateTotalScreenTime() {
        totalScreenTimeMinutes = Int(appUsageToday.values.reduce(0, +))
    }

    // MARK: - Persistence

    private func loadTodayData() {
        let todayKey = todayStorageKey()

        if let data = UserDefaults.standard.dictionary(forKey: todayKey) as? [String: TimeInterval] {
            appUsageToday = data
        } else {
            appUsageToday = [:]
        }

        updateTopApps()
        updateTotalScreenTime()

        // Clean up old data (keep only last 7 days)
        cleanupOldData()
    }

    private func saveData() {
        let todayKey = todayStorageKey()
        UserDefaults.standard.set(appUsageToday, forKey: todayKey)
    }

    private func todayStorageKey() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return "screenTime_\(formatter.string(from: Date()))"
    }

    private func cleanupOldData() {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"

        let calendar = Calendar.current
        let today = Date()

        // Remove data older than 7 days
        for i in 8...30 {
            if let oldDate = calendar.date(byAdding: .day, value: -i, to: today) {
                let key = "screenTime_\(formatter.string(from: oldDate))"
                UserDefaults.standard.removeObject(forKey: key)
            }
        }
    }

    // MARK: - Analytics

    /// Get usage for a specific app today
    func getUsage(for app: String) -> Int {
        Int(appUsageToday[app] ?? 0)
    }

    /// Get average daily usage for an app (last 7 days)
    func getAverageUsage(for app: String) -> Int {
        // For simplicity, just return today's usage
        // Could be extended to calculate actual average
        getUsage(for: app)
    }

    /// Check if user is spending more time than usual on an app
    func isAboveAverageUsage(for app: String) -> Bool {
        let usage = getUsage(for: app)
        let average = getAverageUsage(for: app)
        return usage > average * 2 && usage > 30  // More than 2x average and at least 30 min
    }

    /// Get category for an app
    func getAppCategory(_ app: String) -> AppCategory {
        let lowercased = app.lowercased()

        if lowercased.contains("slack") || lowercased.contains("discord") ||
           lowercased.contains("teams") || lowercased.contains("zoom") {
            return .communication
        }

        if lowercased.contains("safari") || lowercased.contains("chrome") ||
           lowercased.contains("firefox") || lowercased.contains("arc") {
            return .browsing
        }

        if lowercased.contains("code") || lowercased.contains("xcode") ||
           lowercased.contains("cursor") || lowercased.contains("terminal") {
            return .development
        }

        if lowercased.contains("mail") || lowercased.contains("outlook") {
            return .email
        }

        if lowercased.contains("spotify") || lowercased.contains("music") ||
           lowercased.contains("youtube") || lowercased.contains("netflix") {
            return .entertainment
        }

        if lowercased.contains("twitter") || lowercased.contains("facebook") ||
           lowercased.contains("instagram") || lowercased.contains("reddit") {
            return .socialMedia
        }

        return .other
    }

    /// Get total time by category
    func getUsageByCategory() -> [AppCategory: Int] {
        var categoryUsage: [AppCategory: Int] = [:]

        for (app, minutes) in appUsageToday {
            let category = getAppCategory(app)
            categoryUsage[category, default: 0] += Int(minutes)
        }

        return categoryUsage
    }

    // MARK: - Context Generation

    /// Generate context string for the agent
    func generateContextString() -> String {
        var parts: [String] = []

        if totalScreenTimeMinutes > 0 {
            let hours = totalScreenTimeMinutes / 60
            let mins = totalScreenTimeMinutes % 60
            if hours > 0 {
                parts.append("Screen time today: \(hours)h \(mins)m")
            } else {
                parts.append("Screen time today: \(mins) minutes")
            }
        }

        if let topApp = topApps.first, topApp.minutes > 60 {
            parts.append("Most used: \(topApp.app) (\(topApp.minutes) min)")
        }

        if needsBreak {
            parts.append("Extended session in \(currentApp) - consider a break")
        }

        return parts.joined(separator: "\n")
    }

    /// Get screen time context for data channel
    func getScreenTimeContext() -> [String: Any] {
        var context: [String: Any] = [
            "totalMinutesToday": totalScreenTimeMinutes
        ]

        if let topApp = topApps.first {
            context["topApp"] = [
                "name": topApp.app,
                "minutesToday": topApp.minutes
            ]
        }

        if needsBreak {
            context["needsBreak"] = true
            context["currentSessionMinutes"] = currentAppSessionMinutes
        }

        return context
    }
}

// MARK: - App Category

enum AppCategory: String, CaseIterable {
    case communication = "Communication"
    case browsing = "Browsing"
    case development = "Development"
    case email = "Email"
    case entertainment = "Entertainment"
    case socialMedia = "Social Media"
    case productivity = "Productivity"
    case other = "Other"
}
