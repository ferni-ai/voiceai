import XCTest

/// Launches Ferni into one screen of `UITestScenario` (App/UITestScenario.swift):
/// no network, no account, no microphone, no sound.
enum Screen: String, CaseIterable {
    case home, consent, settings, call, waitlist
    /// The call's other states (design audit P2 #20).
    case connecting, reconnecting, onHold, failed

    /// Something that's only there once the screen is ready.
    func ready(in app: XCUIApplication) -> XCUIElement {
        switch self {
        case .home: app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Talk'")).firstMatch
        case .consent: app.buttons["Not now"]
        case .settings: app.navigationBars["Settings"]
        case .call: app.buttons["End call"]
        case .waitlist: app.staticTexts["You’re on the list"]
        case .connecting: app.buttons["Cancel"]
        case .reconnecting: app.staticTexts.matching(NSPredicate(format: "label == 'Reconnecting…'")).firstMatch
        case .onHold: app.buttons["Resume call"]
        case .failed: app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Try again'")).firstMatch
        }
    }
}

enum TextSize: String {
    case standard = "UICTContentSizeCategoryL"
    /// AX5, the largest accessibility size.
    case ax5 = "UICTContentSizeCategoryAccessibilityXXXL"
}

extension XCUIApplication {
    static func ferni(
        _ screen: Screen, size: TextSize = .standard, reduceMotion: Bool = false, reduceTransparency: Bool = false,
        account: String? = nil, hour: Int? = nil, sounds: Bool = false, extra: [String] = []
    ) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = [
            "-FerniUITest", screen.rawValue,
            "-UIPreferredContentSizeCategoryName", size.rawValue,
            "-FerniReduceMotion", reduceMotion ? "YES" : "NO",
            "-FerniReduceTransparency", reduceTransparency ? "YES" : "NO",
            "-FerniSounds", sounds ? "YES" : "NO",
        ] + (account.map { ["-FerniAccount", $0] } ?? []) + (hour.map { ["-FerniHour", String($0)] } ?? []) + extra
        app.launch()
        return app
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

extension XCUIApplication {
    /// Settings' "What Ferni remembers" link, not Home's button of the same name
    /// behind the Settings sheet (award upgrade 7).
    var memoryLink: XCUIElement {
        buttons.matching(NSPredicate(format: "label == 'What Ferni remembers' AND identifier != 'home.memory'")).firstMatch
    }
}
