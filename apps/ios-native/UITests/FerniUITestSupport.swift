import XCTest

/// Launches Ferni into one screen of `UITestScenario` (App/UITestScenario.swift):
/// no network, no account, no microphone, no sound.
enum Screen: String, CaseIterable {
    case home, consent, settings, call
    /// The system never starts the call's audio (App Review, January 2026).
    case silentAudio

    /// Something that's only there once the screen is ready.
    func ready(in app: XCUIApplication) -> XCUIElement {
        switch self {
        case .home: app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Talk'")).firstMatch
        case .consent: app.buttons["Not now"]
        case .settings: app.navigationBars["Settings"]
        case .call: app.buttons["End call"]
        case .silentAudio: app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Try again'")).firstMatch
        }
    }
}

enum TextSize: String {
    case standard = "UICTContentSizeCategoryL"
    /// AX5, the largest accessibility size.
    case ax5 = "UICTContentSizeCategoryAccessibilityXXXL"
}

@MainActor
extension XCUIApplication {
    static func ferni(
        _ screen: Screen, size: TextSize = .standard, reduceMotion: Bool = false, reduceTransparency: Bool = false,
        account: String? = nil
    ) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = [
            "-FerniUITest", screen.rawValue,
            "-UIPreferredContentSizeCategoryName", size.rawValue,
            "-FerniReduceMotion", reduceMotion ? "YES" : "NO",
            "-FerniReduceTransparency", reduceTransparency ? "YES" : "NO",
        ] + (account.map { ["-FerniAccount", $0] } ?? [])
        // Launch only once the last Ferni is gone (a test that didn't quit
        // leaves one running). On a loaded CI simulator a launch that lands
        // while the previous process is still exiting can wait ~70 s for a
        // process that never starts, then fail with "does not have a process
        // ID" (runs 42312989417 and 42386078903, #3334).
        app.quit()
        app.launch()
        return app
    }

    /// Ends this launch and waits for the process to exit, so the next
    /// `ferni(_:)` starts clean. Use it instead of `terminate()`.
    func quit() {
        terminate()
        waitUntilGone()
    }

    fileprivate func waitUntilGone() {
        guard state != .notRunning else { return }
        if !wait(for: .notRunning, timeout: 15) {
            XCTFail("Ferni was still running 15 s after it was told to quit (state \(state.rawValue))")
        }
    }

    /// What the views received (UITestEnvironmentProbe).
    var receivedSettings: String {
        otherElements["uitest.environment"].firstMatch.value as? String
            ?? descendants(matching: .any)["uitest.environment"].firstMatch.value as? String ?? "missing"
    }
}

extension XCTestCase {
    func attachScreenshot(_ name: String) {
        let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }
}
