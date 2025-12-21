import Foundation
import AppKit
import ApplicationServices
import Combine

// MARK: - Context Awareness Service
/// Provides superhuman awareness of what the user is working on
/// Uses macOS Accessibility APIs for selected text, window titles, and app awareness

class ContextAwarenessService: ObservableObject {

    // MARK: - Published State

    /// Currently focused application name
    @Published private(set) var activeApp: String = ""

    /// Title of the active window
    @Published private(set) var activeWindowTitle: String = ""

    /// Currently selected text (if any)
    @Published private(set) var selectedText: String?

    /// Bundle identifier of active app
    @Published private(set) var activeAppBundleId: String = ""

    /// Whether accessibility permissions are granted
    @Published private(set) var hasAccessibilityPermission: Bool = false

    /// Last update timestamp
    @Published private(set) var lastUpdate: Date = Date()

    // MARK: - Private Properties

    private var workspaceObserver: NSObjectProtocol?
    private var updateTimer: Timer?

    // MARK: - Initialization

    init() {
        checkAccessibilityPermission()
        startObserving()
    }

    deinit {
        stopObserving()
    }

    // MARK: - Permission Checking

    /// Check if app has accessibility permission
    func checkAccessibilityPermission() {
        // Check if we have accessibility permission
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: false] as CFDictionary
        hasAccessibilityPermission = AXIsProcessTrustedWithOptions(options)
    }

    /// Request accessibility permission (shows system dialog)
    func requestAccessibilityPermission() {
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
        _ = AXIsProcessTrustedWithOptions(options)

        // Re-check after a delay (user needs time to grant)
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
            self?.checkAccessibilityPermission()
        }
    }

    /// Open System Settings to Accessibility section
    func openAccessibilitySettings() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility") {
            NSWorkspace.shared.open(url)
        }
    }

    // MARK: - Context Updates

    /// Start observing workspace changes
    private func startObserving() {
        // Observe app activation changes
        workspaceObserver = NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didActivateApplicationNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            self?.updateContext()
        }

        // Periodic update for window title changes (every 500ms)
        updateTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            self?.updateActiveWindowTitle()
        }

        // Initial update
        updateContext()
    }

    /// Stop observing
    private func stopObserving() {
        if let observer = workspaceObserver {
            NSWorkspace.shared.notificationCenter.removeObserver(observer)
        }
        updateTimer?.invalidate()
    }

    /// Update all context information
    func updateContext() {
        updateActiveApp()
        updateActiveWindowTitle()
        lastUpdate = Date()
    }

    /// Update the currently active application
    private func updateActiveApp() {
        guard let app = NSWorkspace.shared.frontmostApplication else {
            activeApp = ""
            activeAppBundleId = ""
            return
        }

        activeApp = app.localizedName ?? "Unknown"
        activeAppBundleId = app.bundleIdentifier ?? ""
    }

    /// Update the active window title using Accessibility API
    private func updateActiveWindowTitle() {
        guard hasAccessibilityPermission else {
            activeWindowTitle = ""
            return
        }

        guard let app = NSWorkspace.shared.frontmostApplication else {
            activeWindowTitle = ""
            return
        }

        let appElement = AXUIElementCreateApplication(app.processIdentifier)

        var focusedWindow: AnyObject?
        let result = AXUIElementCopyAttributeValue(appElement, kAXFocusedWindowAttribute as CFString, &focusedWindow)

        guard result == .success, let windowElement = focusedWindow else {
            activeWindowTitle = ""
            return
        }

        var title: AnyObject?
        let titleResult = AXUIElementCopyAttributeValue(windowElement as! AXUIElement, kAXTitleAttribute as CFString, &title)

        if titleResult == .success, let windowTitle = title as? String {
            activeWindowTitle = windowTitle
        } else {
            activeWindowTitle = ""
        }
    }

    // MARK: - Selected Text

    /// Get the currently selected text from the focused application
    /// Returns nil if no text is selected or permission is denied
    func getSelectedText() -> String? {
        guard hasAccessibilityPermission else {
            print("[ContextAwareness] No accessibility permission for selected text")
            return nil
        }

        // Get the system-wide accessibility element
        let systemWide = AXUIElementCreateSystemWide()

        // Get the focused UI element
        var focusedElement: AnyObject?
        let focusResult = AXUIElementCopyAttributeValue(
            systemWide,
            kAXFocusedUIElementAttribute as CFString,
            &focusedElement
        )

        guard focusResult == .success, let element = focusedElement else {
            return nil
        }

        // Try to get selected text
        var selectedTextValue: AnyObject?
        let textResult = AXUIElementCopyAttributeValue(
            element as! AXUIElement,
            kAXSelectedTextAttribute as CFString,
            &selectedTextValue
        )

        if textResult == .success, let text = selectedTextValue as? String, !text.isEmpty {
            selectedText = text
            return text
        }

        // Fallback: Try getting selected text range and value
        var valueResult: AnyObject?
        let hasValue = AXUIElementCopyAttributeValue(
            element as! AXUIElement,
            kAXValueAttribute as CFString,
            &valueResult
        )

        if hasValue == .success, let fullText = valueResult as? String {
            var rangeValue: AnyObject?
            let hasRange = AXUIElementCopyAttributeValue(
                element as! AXUIElement,
                kAXSelectedTextRangeAttribute as CFString,
                &rangeValue
            )

            if hasRange == .success, let range = rangeValue {
                var cfRange = CFRange(location: 0, length: 0)
                if AXValueGetValue(range as! AXValue, .cfRange, &cfRange) {
                    let start = cfRange.location
                    let length = cfRange.length
                    if length > 0 && start >= 0 && start + length <= fullText.count {
                        let startIndex = fullText.index(fullText.startIndex, offsetBy: start)
                        let endIndex = fullText.index(startIndex, offsetBy: length)
                        let extracted = String(fullText[startIndex..<endIndex])
                        selectedText = extracted
                        return extracted
                    }
                }
            }
        }

        selectedText = nil
        return nil
    }

    /// Capture current context snapshot for "Help me with this" feature
    func captureContextSnapshot() -> ContextSnapshot {
        // Force refresh selected text
        let text = getSelectedText()

        return ContextSnapshot(
            activeApp: activeApp,
            activeAppBundleId: activeAppBundleId,
            windowTitle: activeWindowTitle,
            selectedText: text,
            timestamp: Date()
        )
    }

    // MARK: - Context Analysis

    /// Determine the type of work context based on active app
    func getWorkContext() -> WorkContext {
        switch activeAppBundleId {
        // Communication
        case let id where id.contains("slack") || id.contains("discord") || id.contains("teams"):
            return .communication(app: activeApp)
        case let id where id.contains("mail") || id.contains("gmail"):
            return .email(app: activeApp)

        // Development
        case let id where id.contains("xcode") || id.contains("vscode") || id.contains("cursor") || id.contains("android-studio"):
            return .coding(app: activeApp)
        case let id where id.contains("terminal") || id.contains("iterm") || id.contains("warp"):
            return .terminal(app: activeApp)

        // Productivity
        case let id where id.contains("notion") || id.contains("obsidian") || id.contains("bear"):
            return .notes(app: activeApp)
        case let id where id.contains("pages") || id.contains("docs") || id.contains("word"):
            return .documents(app: activeApp)
        case let id where id.contains("numbers") || id.contains("sheets") || id.contains("excel"):
            return .spreadsheet(app: activeApp)
        case let id where id.contains("keynote") || id.contains("slides") || id.contains("powerpoint"):
            return .presentation(app: activeApp)

        // Browsing
        case let id where id.contains("safari") || id.contains("chrome") || id.contains("firefox") || id.contains("arc"):
            return .browsing(app: activeApp, url: extractBrowserURL())

        // Creative
        case let id where id.contains("figma") || id.contains("sketch") || id.contains("photoshop"):
            return .design(app: activeApp)

        // Media
        case let id where id.contains("spotify") || id.contains("music") || id.contains("podcasts"):
            return .media(app: activeApp)

        default:
            return .other(app: activeApp)
        }
    }

    /// Try to extract URL from browser window title
    private func extractBrowserURL() -> String? {
        // Many browsers include URL or domain in window title
        // This is a heuristic - not always accurate
        if activeWindowTitle.contains("http") || activeWindowTitle.contains(".com") || activeWindowTitle.contains(".io") {
            return activeWindowTitle
        }
        return nil
    }
}

// MARK: - Context Snapshot

struct ContextSnapshot: Codable {
    let activeApp: String
    let activeAppBundleId: String
    let windowTitle: String
    let selectedText: String?
    let timestamp: Date

    /// Convert to dictionary for data channel transmission
    func toDictionary() -> [String: Any] {
        var dict: [String: Any] = [
            "activeApp": activeApp,
            "activeAppBundleId": activeAppBundleId,
            "windowTitle": windowTitle,
            "timestamp": timestamp.timeIntervalSince1970
        ]
        if let text = selectedText {
            dict["selectedText"] = text
        }
        return dict
    }

    /// Human-readable summary for the agent
    func toContextString() -> String {
        var parts: [String] = []

        if !activeApp.isEmpty {
            parts.append("User is in \(activeApp)")
            if !windowTitle.isEmpty {
                parts.append("Window: \"\(windowTitle)\"")
            }
        }

        if let text = selectedText, !text.isEmpty {
            // Truncate if too long
            let truncated = text.count > 500 ? String(text.prefix(500)) + "..." : text
            parts.append("Selected text: \"\(truncated)\"")
        }

        return parts.joined(separator: "\n")
    }
}

// MARK: - Work Context

enum WorkContext {
    case communication(app: String)
    case email(app: String)
    case coding(app: String)
    case terminal(app: String)
    case notes(app: String)
    case documents(app: String)
    case spreadsheet(app: String)
    case presentation(app: String)
    case browsing(app: String, url: String?)
    case design(app: String)
    case media(app: String)
    case other(app: String)

    var category: String {
        switch self {
        case .communication: return "communication"
        case .email: return "email"
        case .coding: return "coding"
        case .terminal: return "terminal"
        case .notes: return "notes"
        case .documents: return "documents"
        case .spreadsheet: return "spreadsheet"
        case .presentation: return "presentation"
        case .browsing: return "browsing"
        case .design: return "design"
        case .media: return "media"
        case .other: return "other"
        }
    }

    var suggestedPersona: String? {
        switch self {
        case .communication, .email:
            return "alex"  // Communication specialist
        case .coding, .terminal:
            return nil  // User probably wants to stay focused
        case .notes, .documents:
            return nil  // General context
        case .spreadsheet:
            return "peter"  // Research/analysis
        case .presentation:
            return "jordan"  // Planning/organization
        case .browsing:
            return nil  // Depends on content
        case .design:
            return nil  // Creative work
        case .media:
            return nil  // Relaxation
        case .other:
            return nil
        }
    }
}
