import XCTest

/// Critic M8: only audio keeps a call going in the background. No PushKit,
/// so no VoIP mode (guideline 2.5.4); a locked call runs on audio (verified
/// on device: docs/ios/device-test-checklist.md step 5).
final class BackgroundModeTests: XCTestCase {
    func testOnlyAudioRunsInTheBackground() {
        XCTAssertEqual(Bundle.main.object(forInfoDictionaryKey: "UIBackgroundModes") as? [String], ["audio"])
    }
}
