import XCTest
@testable import Ferni

/// Critic L4: "Get help now" is one press on the Home Screen icon, even when
/// Ferni can't connect (a static quick action), and it opens Help.
@MainActor
final class HelpShortcutTests: XCTestCase {
    func testTheQuickActionOpensHelp() {
        let model = AppModel(config: .production, firebaseReady: false)
        model.performShortcut("com.sethdford.ferni.unknown")
        XCTAssertFalse(model.isShowingHelp)
        model.performShortcut(AppModel.helpShortcut)
        XCTAssertTrue(model.isShowingHelp)
        XCTAssertFalse(model.call.isActive, "help never starts a call")
    }

    /// Static, in the app's Info.plist: there before the app has ever run.
    func testTheQuickActionIsDeclared() throws {
        let items = try XCTUnwrap(Bundle.main.object(forInfoDictionaryKey: "UIApplicationShortcutItems") as? [[String: Any]])
        let help = try XCTUnwrap(items.first { $0["UIApplicationShortcutItemType"] as? String == AppModel.helpShortcut })
        XCTAssertEqual(help["UIApplicationShortcutItemTitle"] as? String, "Get help now")
    }
}
