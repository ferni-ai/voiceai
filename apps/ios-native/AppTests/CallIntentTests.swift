import XCTest
@testable import Ferni

/// The Lock Screen's buttons reach the call (gap 6): End and Mute run in the
/// app through the handlers it installs at launch.
@MainActor
final class CallIntentTests: XCTestCase {
    func testMuteFromTheLockScreenTogglesTheCall() async throws {
        var toggles = 0
        let before = MuteCallIntent.toggle
        defer { MuteCallIntent.toggle = before }
        MuteCallIntent.toggle = { toggles += 1 }
        _ = try await MuteCallIntent().perform()
        XCTAssertEqual(toggles, 1)
    }

    func testTheAppInstallsBothHandlers() {
        XCTAssertNotNil(EndCallIntent.end, "End always reaches the call")
        XCTAssertNotNil(MuteCallIntent.toggle)
    }
}
