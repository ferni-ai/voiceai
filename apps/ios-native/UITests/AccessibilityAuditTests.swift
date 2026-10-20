import XCTest

/// Item 8: Apple's accessibility audit on every main screen, at the default
/// text size and at AX5, and the Reduce Motion and Reduce Transparency paths.
@MainActor
final class AccessibilityAuditTests: XCTestCase {
    override func setUp() { continueAfterFailure = true }

    private func audit(_ screen: Screen, size: TextSize, hour: Int? = nil) throws {
        let app = XCUIApplication.ferni(screen, size: size, hour: hour)
        XCTAssertTrue(screen.ready(in: app).waitForExistence(timeout: 20), "\(screen) never appeared")
        let name = "\(screen) \(size)" + (hour.map { " \($0)h" } ?? "")
        try XCTContext.runActivity(named: name) { _ in
            try app.performAccessibilityAudit(for: .all) { Self.handle($0, on: name) }
        }
        app.terminate()
    }

    /// Audit findings checked by hand and found not to be problems, each for one
    /// element on one screen, so anything else on that element still fails.
    nonisolated static let accepted: [(screen: String, type: XCUIAccessibilityAuditType, label: String, why: String)] = [
        ("consent", .textClipped, "When you talk with Ferni",
         "Two paragraphs in one Text; the screenshot at the default size shows every line in full (2026-10-19)."),
        ("settings", .dynamicType, "Done",
         "A system toolbar button: bar buttons stop growing by design and show the Large Content Viewer instead."),
        ("settings", .dynamicType, "Privacy",
         "Same SettingsHeader as Account, which the AX5 screenshot shows at full size."),
        ("settings", .dynamicType, "Lock what Ferni remembers",
         "A system Toggle row, like Call sounds, which the AX5 screenshot shows at full size."),
        ("settings", .dynamicType, "You haven't agreed",
         "A plain Text row, like the account message the AX5 screenshot shows at full size."),
        // iPad (2026-10-19), measured from the screenshot pixels with WCAG luminance. The sidebar
        // rows' contrast findings (and the unnamed ones, two to four a launch) went away when the
        // sidebar got an opaque background (2026-10-20); none are accepted any more.
        ("call", .contrast, "Ferni · ", "Name chip: #5c544a on #f7f5ee, 6.8:1 (caption text needs 4.5)."),
        ("home|call", .textClipped, "Talk", "iPad sidebar row: the AX5 screenshot shows the full word."),
        ("home|call", .textClipped, "What Ferni remembers", "iPad sidebar row: wraps to three full lines at AX5 (screenshot)."),
        ("settings", .dynamicType, "Try again", "A system List button row; it scales at AX5 like the other rows."),
        ("settings", .dynamicType, "Get help with your account",
         "Account footer link; HelpLinksUITests.testAccountHelpGrowsWithTextSize proves it grows at AX5 (pinned, it stays 34 pt and fails)."),
    ]

    /// Every issue fails the test, named with its element so the log says what
    /// to fix. The 1-pt probe exists only in UI-test launches and is skipped.
    nonisolated static func handle(_ issue: XCUIAccessibilityAuditIssue, on screen: String) -> Bool {
        let element = issue.element
        if element?.identifier.hasPrefix("uitest.") == true { return true }
        if let label = element?.label, accepted.contains(where: {
            $0.screen.split(separator: "|").contains { screen.hasPrefix($0) } && issue.auditType == $0.type && label.hasPrefix($0.label)
        }) { return true }
        print("AUDIT [\(screen)] \(issue.compactDescription): \(element.map { "\($0.elementType.rawValue) '\($0.label)' id='\($0.identifier)' \($0.frame)" } ?? "no element") | \(issue.detailedDescription)")
        return false
    }

    /// Home's room is lit by the hour (RoomLight), so it's audited in every
    /// band, at a fixed hour each, instead of whenever the gate happens to run.
    static let roomLightBands = [("morning", 8), ("day", 14), ("evening", 20), ("night", 2)]

    func testHome() throws {
        for (_, hour) in Self.roomLightBands {
            try audit(.home, size: .standard, hour: hour)
            try audit(.home, size: .ax5, hour: hour)
        }
    }
    func testConsent() throws { try audit(.consent, size: .standard); try audit(.consent, size: .ax5) }
    func testSettings() throws { try audit(.settings, size: .standard); try audit(.settings, size: .ax5) }
    func testCall() throws { try audit(.call, size: .standard); try audit(.call, size: .ax5) }
    func testWaitlist() throws { try audit(.waitlist, size: .standard); try audit(.waitlist, size: .ax5) }

    /// The overrides reach the views (so the snapshots below show those paths),
    /// and an ordinary launch doesn't have them.
    func testReduceMotionAndTransparency() throws {
        let plain = XCUIApplication.ferni(.call)
        XCTAssertTrue(Screen.call.ready(in: plain).waitForExistence(timeout: 20))
        XCTAssertEqual(plain.receivedSettings, "reduceMotion=false reduceTransparency=false")
        plain.terminate()

        for (motion, transparency) in [(true, false), (false, true)] {
            for screen in [Screen.call, .home] {
                let app = XCUIApplication.ferni(screen, reduceMotion: motion, reduceTransparency: transparency, hour: 14)
                XCTAssertTrue(screen.ready(in: app).waitForExistence(timeout: 20), "\(screen)")
                XCTAssertEqual(app.receivedSettings, "reduceMotion=\(motion) reduceTransparency=\(transparency)")
                attachScreenshot("\(screen)-\(motion ? "reduce-motion" : "reduce-transparency")")
                try app.performAccessibilityAudit(for: .all) { Self.handle($0, on: "\(screen) motion=\(motion) transparency=\(transparency)") }
                app.terminate()
            }
        }
    }
}
